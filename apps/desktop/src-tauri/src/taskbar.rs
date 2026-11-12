//! Windows taskbar thumbnail toolbar and optional CD cover thumbnail.
use crate::system_media::Metadata;
use discatelier_contracts::PlaybackSnapshot;
use serde::Serialize;
use std::sync::{Mutex, OnceLock};
use tauri::{Emitter, Manager};
use windows::{
    core::{GUID, PCWSTR},
    Win32::{
        Foundation::{HWND, LPARAM, LRESULT, WPARAM},
        Graphics::{Dwm::*, Gdi::*},
        System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED},
        UI::Shell::{
            DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass, ITaskbarList3, THB_FLAGS, THB_ICON, THB_TOOLTIP,
            THBF_DISABLED, THBF_ENABLED, THBF_HIDDEN, THBN_CLICKED, THUMBBUTTON,
        },
        UI::WindowsAndMessaging::{HICON, WM_COMMAND, WM_DWMSENDICONICLIVEPREVIEWBITMAP, WM_DWMSENDICONICTHUMBNAIL},
    },
};

const BUTTON_PREVIOUS: u32 = 1;
const BUTTON_TOGGLE: u32 = 2;
const BUTTON_NEXT: u32 = 3;
const TASKBAR_CLSID: GUID = GUID::from_u128(0x56FDF344_FD6D_11D0_958A_006097C9A090);
const COVER_SIZE: u32 = 200;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskbarCommand {
    session_id: String,
    action: &'static str,
}

struct Taskbar {
    hwnd: HWND,
    list: ITaskbarList3,
    icons: crate::taskbar_icons::Icons,
    buttons: [THUMBBUTTON; 3],
    cover: Option<HBITMAP>,
    cover_id: String,
    session_id: String,
    app: tauri::AppHandle,
}
// The HWND and GDI handles are only touched on the Tauri main thread.
struct SendTaskbar(Option<Taskbar>);
unsafe impl Send for SendTaskbar {}

static TASKBAR: OnceLock<Mutex<SendTaskbar>> = OnceLock::new();
static COVER_ID: OnceLock<Mutex<String>> = OnceLock::new();

fn taskbar() -> &'static Mutex<SendTaskbar> {
    TASKBAR.get_or_init(|| Mutex::new(SendTaskbar(None)))
}
fn cover_id() -> &'static Mutex<String> {
    COVER_ID.get_or_init(|| Mutex::new(String::new()))
}

fn tip(value: &str) -> [u16; 260] {
    let mut result = [0u16; 260];
    for (index, value) in value.encode_utf16().take(259).enumerate() {
        result[index] = value;
    }
    result
}

fn button(id: u32, icon: HICON, label: &str) -> THUMBBUTTON {
    THUMBBUTTON {
        dwMask: THB_ICON | THB_FLAGS | THB_TOOLTIP,
        iId: id,
        iBitmap: 0,
        hIcon: icon,
        szTip: tip(label),
        dwFlags: THBF_HIDDEN | THBF_DISABLED,
    }
}

fn set_button(button: &mut THUMBBUTTON, icon: HICON, enabled: bool, hidden: bool) {
    button.hIcon = icon;
    button.dwMask = THB_ICON | THB_FLAGS;
    button.dwFlags = if hidden {
        THBF_HIDDEN
    } else if enabled {
        THBF_ENABLED
    } else {
        THBF_DISABLED
    };
}

fn cover_bitmap(bytes: &[u8]) -> Option<HBITMAP> {
    let image = image::load_from_memory(bytes).ok()?;
    let image = image.resize_to_fill(COVER_SIZE, COVER_SIZE, image::imageops::FilterType::Lanczos3).to_rgba8();
    let mut info = BITMAPINFO::default();
    info.bmiHeader = BITMAPINFOHEADER {
        biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
        biWidth: COVER_SIZE as i32,
        biHeight: -(COVER_SIZE as i32),
        biPlanes: 1,
        biBitCount: 32,
        biCompression: BI_RGB.0,
        ..Default::default()
    };
    let mut bits = std::ptr::null_mut();
    let bitmap = unsafe { CreateDIBSection(None, &info, DIB_RGB_COLORS, &mut bits, None, 0).ok()? };
    if bits.is_null() {
        let _ = unsafe { DeleteObject(bitmap.into()) };
        return None;
    }
    let target = unsafe { std::slice::from_raw_parts_mut(bits as *mut u8, (COVER_SIZE * COVER_SIZE * 4) as usize) };
    for (source, target) in image.pixels().zip(target.chunks_exact_mut(4)) {
        let [r, g, b, a] = source.0;
        let alpha = a as u32;
        target[0] = ((b as u32 * alpha) / 255) as u8;
        target[1] = ((g as u32 * alpha) / 255) as u8;
        target[2] = ((r as u32 * alpha) / 255) as u8;
        target[3] = a;
    }
    Some(bitmap)
}

impl Taskbar {
    fn update(&mut self, snapshot: Option<&PlaybackSnapshot>, metadata: &Metadata, cover: Option<(String, Option<Vec<u8>>)>) -> windows::core::Result<()> {
        let active = snapshot.is_some_and(|value| value.phase.active());
        let paused = snapshot.is_some_and(|value| value.paused);
        let previous = active && metadata.previous;
        let next = active && metadata.next;
        self.session_id = if active { metadata.session_id.clone() } else { String::new() };
        set_button(&mut self.buttons[0], self.icons.previous, previous, !active);
        set_button(&mut self.buttons[1], if paused { self.icons.play } else { self.icons.pause }, active, !active);
        set_button(&mut self.buttons[2], self.icons.next, next, !active);
        let tooltip = tip(if active { &metadata.title } else { "DiscAtelier" });
        unsafe {
            self.list.ThumbBarUpdateButtons(self.hwnd, &self.buttons)?;
            self.list.SetThumbnailTooltip(self.hwnd, PCWSTR::from_raw(tooltip.as_ptr()))?;
        }
        if !active && self.cover.is_some() {
            if let Some(old) = self.cover.take() {
                let _ = unsafe { DeleteObject(old.into()) };
            }
            self.cover_id.clear();
            if let Ok(mut current) = cover_id().lock() {
                current.clear();
            }
            unsafe { let _ = DwmInvalidateIconicBitmaps(self.hwnd); }
        }
        if let Some((id, bytes)) = cover {
            if let Some(old) = self.cover.take() {
                let _ = unsafe { DeleteObject(old.into()) };
            }
            self.cover = bytes.as_deref().and_then(cover_bitmap);
            self.cover_id = id;
            if let Ok(mut current) = cover_id().lock() {
                *current = self.cover_id.clone();
            }
            unsafe {
                let _ = DwmInvalidateIconicBitmaps(self.hwnd);
                if let Some(bitmap) = self.cover {
                    let _ = DwmSetIconicThumbnail(self.hwnd, bitmap, 0);
                }
            }
        }
        unsafe {
            let force = i32::from(self.cover.is_some());
            let _ = DwmSetWindowAttribute(
                self.hwnd,
                DWMWA_FORCE_ICONIC_REPRESENTATION,
                &force as *const _ as *const std::ffi::c_void,
                std::mem::size_of::<i32>() as u32,
            );
            if self.cover.is_some() {
                let _ = DwmSetWindowAttribute(
                    self.hwnd,
                    DWMWA_HAS_ICONIC_BITMAP,
                    &1i32 as *const _ as *const std::ffi::c_void,
                    std::mem::size_of::<i32>() as u32,
                );
            }
        }
        Ok(())
    }

    fn draw_cover(&self) {
        if let Some(bitmap) = self.cover {
            let _ = unsafe { DwmSetIconicThumbnail(self.hwnd, bitmap, DWM_SIT_DISPLAYFRAME) };
        }
    }

    fn live_preview(&self) {
        if let Some(bitmap) = self.cover {
            let _ = unsafe { DwmSetIconicLivePreviewBitmap(self.hwnd, bitmap, None, 0) };
        }
    }
}

impl Drop for Taskbar {
    fn drop(&mut self) {
        unsafe {
            let _ = RemoveWindowSubclass(self.hwnd, Some(subclass), 1);
            if let Some(cover) = self.cover.take() {
                let _ = DeleteObject(cover.into());
            }
        }
        self.icons.destroy();
    }
}

unsafe extern "system" fn subclass(hwnd: HWND, message: u32, wparam: WPARAM, lparam: LPARAM, _id: usize, _data: usize) -> LRESULT {
    if message == WM_COMMAND && ((wparam.0 >> 16) as u32) == THBN_CLICKED {
        let id = (wparam.0 & 0xffff) as u32;
        let (action, session) = match id {
            BUTTON_PREVIOUS => ("previous", None),
            BUTTON_TOGGLE => ("toggle", None),
            BUTTON_NEXT => ("next", None),
            _ => ("", None),
        };
        if !action.is_empty() {
            if let Ok(current) = taskbar().lock() {
                if let Some(taskbar) = current.0.as_ref() {
                    if !taskbar.session_id.is_empty() {
                        let session = session.unwrap_or_else(|| taskbar.session_id.clone());
                        let _ = taskbar.app.emit_to("main", "taskbar-command", TaskbarCommand { session_id: session, action });
                    }
                }
            }
        }
        return LRESULT(0);
    }
    if message == WM_DWMSENDICONICTHUMBNAIL {
        if let Ok(current) = taskbar().lock() {
            if let Some(taskbar) = current.0.as_ref() {
                taskbar.draw_cover();
            }
        }
        return LRESULT(0);
    }
    if message == WM_DWMSENDICONICLIVEPREVIEWBITMAP {
        if let Ok(current) = taskbar().lock() {
            if let Some(taskbar) = current.0.as_ref() {
                taskbar.live_preview();
            }
        }
        return LRESULT(0);
    }
    unsafe { DefSubclassProc(hwnd, message, wparam, lparam) }
}

pub fn setup(app: &tauri::AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or_else(|| "主窗口不可用。".to_string())?;
    let hwnd = HWND(window.hwnd().map_err(|error| error.to_string())?.0);
    let _ = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
    let list: ITaskbarList3 = unsafe {
        CoCreateInstance(&TASKBAR_CLSID, None, CLSCTX_INPROC_SERVER).map_err(|error| error.to_string())?
    };
    unsafe { list.HrInit().map_err(|error| error.to_string())? };
    let icons = crate::taskbar_icons::Icons::create().map_err(|error| error.to_string())?;
    let buttons = [
        button(BUTTON_PREVIOUS, icons.previous, "上一首"),
        button(BUTTON_TOGGLE, icons.play, "播放"),
        button(BUTTON_NEXT, icons.next, "下一首"),
    ];
    unsafe {
        list.ThumbBarAddButtons(hwnd, &buttons).map_err(|error| error.to_string())?;
        if !SetWindowSubclass(hwnd, Some(subclass), 1, 0).as_bool() {
            return Err("无法安装任务栏消息处理。".into());
        }
    }
    *taskbar().lock().map_err(|_| "任务栏状态不可用。".to_string())? = SendTaskbar(Some(Taskbar {
        hwnd,
        list,
        icons,
        buttons,
        cover: None,
        cover_id: String::new(),
        session_id: String::new(),
        app: app.clone(),
    }));
    Ok(())
}

pub fn update(snapshot: Option<&PlaybackSnapshot>, metadata: &Metadata, cover: Option<(String, Option<Vec<u8>>)>) -> Result<(), String> {
    if let Ok(mut current) = taskbar().lock() {
        if let Some(taskbar) = current.0.as_mut() {
            taskbar.update(snapshot, metadata, cover).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

pub fn cover_needed(id: &str) -> bool {
    cover_id().lock().map(|current| current.as_str() != id).unwrap_or(true)
}

pub fn shutdown() {
    if let Ok(mut current) = taskbar().lock() {
        current.0.take();
    }
}
