//! Windows taskbar thumbnail toolbar and optional CD cover thumbnail.
use crate::system_media::Metadata;
use discatelier_contracts::PlaybackSnapshot;
use serde::Serialize;
use std::sync::{Mutex, OnceLock};
use tauri::{Emitter, Manager};
use windows::{
    core::{GUID, PCWSTR},
    Win32::{
        Foundation::{HINSTANCE, HWND, LPARAM, LRESULT, WPARAM},
        Graphics::{Dwm::*, Gdi::*},
        System::{
            Com::{CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED},
            LibraryLoader::GetModuleHandleW,
        },
        UI::Shell::{
            ExtractIconW, ITaskbarList3, THB_FLAGS, THB_ICON, THB_TOOLTIP, THBF_DISABLED, THBF_ENABLED, THBF_HIDDEN,
            THBN_CLICKED, THUMBBUTTON,
        },
        UI::WindowsAndMessaging::{
            CreateWindowExW, DefWindowProcW, DestroyIcon, DestroyWindow, HICON, ICON_BIG, ICON_SMALL,
            PostMessageW, RegisterClassW, SendMessageW, SetForegroundWindow, SetWindowTextW, ShowWindow, SC_CLOSE,
            SW_HIDE, SW_RESTORE, WM_ACTIVATE, WM_CLOSE, WM_COMMAND, WM_DWMSENDICONICLIVEPREVIEWBITMAP,
            WM_DWMSENDICONICTHUMBNAIL, WM_SETICON, WM_SYSCOMMAND, WNDCLASSW, WS_EX_TOOLWINDOW, WS_POPUP,
        },
    },
};

const BUTTON_PREVIOUS: u32 = 1;
const BUTTON_TOGGLE: u32 = 2;
const BUTTON_NEXT: u32 = 3;
const BUTTON_REPEAT: u32 = 4;
const TASKBAR_CLSID: GUID = GUID::from_u128(0x56FDF344_FD6D_11D0_958A_006097C9A090);
const COVER_SIZE: u32 = 200;
const HELPER_CLASS: windows::core::PCWSTR = windows::core::w!("DiscAtelierTaskbarThumb");

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskbarCommand {
    session_id: String,
    action: &'static str,
}

struct Taskbar {
    main: HWND,
    hwnd: HWND,
    list: ITaskbarList3,
    icons: crate::taskbar_icons::Icons,
    buttons: [THUMBBUTTON; 4],
    cover: Option<image::RgbaImage>,
    cover_id: String,
    session_id: String,
    app: tauri::AppHandle,
    app_icon: Option<HICON>,
    registered: bool,
    main_buttons_added: bool,
    helper_buttons_added: bool,
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
    button.dwMask = THB_ICON | THB_FLAGS | THB_TOOLTIP;
    button.dwFlags = if hidden {
        THBF_HIDDEN
    } else if enabled {
        THBF_ENABLED
    } else {
        THBF_DISABLED
    };
}

fn cover_image(bytes: &[u8]) -> Option<image::RgbaImage> {
    Some(image::load_from_memory(bytes).ok()?.resize_to_fill(COVER_SIZE, COVER_SIZE, image::imageops::FilterType::Lanczos3).to_rgba8())
}

fn cover_bitmap(image: &image::RgbaImage, width: u32, height: u32) -> Option<HBITMAP> {
    let side = width.min(height).clamp(32, 1024);
    let image = image::imageops::resize(image, side, side, image::imageops::FilterType::Lanczos3);
    let mut info = BITMAPINFO::default();
    info.bmiHeader = BITMAPINFOHEADER {
        biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
        biWidth: side as i32,
        biHeight: -(side as i32),
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
    let target = unsafe { std::slice::from_raw_parts_mut(bits as *mut u8, (side * side * 4) as usize) };
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

fn load_app_icon() -> Option<HICON> {
    let path = std::env::current_exe().ok()?;
    let path = path.to_string_lossy().encode_utf16().chain(std::iter::once(0)).collect::<Vec<_>>();
    let icon = unsafe { ExtractIconW(None, PCWSTR::from_raw(path.as_ptr()), 0) };
    (!icon.0.is_null()).then_some(icon)
}

fn set_icon(main: HWND, helper: HWND, icon: HICON) {
    unsafe {
        let _ = SendMessageW(main, WM_SETICON, Some(WPARAM(ICON_BIG as usize)), Some(LPARAM(icon.0 as isize)));
        let _ = SendMessageW(main, WM_SETICON, Some(WPARAM(ICON_SMALL as usize)), Some(LPARAM(icon.0 as isize)));
        let _ = SendMessageW(helper, WM_SETICON, Some(WPARAM(ICON_BIG as usize)), Some(LPARAM(icon.0 as isize)));
        let _ = SendMessageW(helper, WM_SETICON, Some(WPARAM(ICON_SMALL as usize)), Some(LPARAM(icon.0 as isize)));
    }
}

impl Taskbar {
    fn hide_buttons_on(&self, host: HWND, added: bool) {
        if !added {
            return;
        }
        let mut hidden = self.buttons.clone();
        for button in &mut hidden {
            button.dwMask = THB_FLAGS;
            button.dwFlags = THBF_HIDDEN;
        }
        let _ = unsafe { self.list.ThumbBarUpdateButtons(host, &hidden) };
    }

    fn update(&mut self, snapshot: Option<&PlaybackSnapshot>, metadata: &Metadata, cover: Option<(String, Option<Vec<u8>>)>) -> windows::core::Result<()> {
        let active = snapshot.is_some_and(|value| value.phase.active());
        let paused = snapshot.is_some_and(|value| value.paused);
        let previous = active && metadata.previous;
        let next = active && metadata.next;
        self.session_id = if active { metadata.session_id.clone() } else { String::new() };
        let title = if active && !metadata.title.is_empty() { metadata.title.as_str() } else { "DiscAtelier" };
        let title = title.encode_utf16().chain(std::iter::once(0)).collect::<Vec<_>>();

        // Decide the button host from the cover before registering the hidden
        // tab. A session without artwork must stay on the real main-window
        // thumbnail; registering an empty helper tab makes the taskbar preview
        // blank.
        if !active {
            self.cover = None;
            self.cover_id.clear();
            if let Ok(mut current) = cover_id().lock() {
                current.clear();
            }
        }
        if let Some((id, bytes)) = cover {
            self.cover = bytes.as_deref().and_then(cover_image);
            self.cover_id = id;
            if let Ok(mut current) = cover_id().lock() {
                *current = self.cover_id.clone();
            }
        }
        let mut use_helper = active && self.cover.is_some();
        if use_helper {
            if !self.registered {
                if unsafe { self.list.RegisterTab(self.hwnd, self.main) }.is_ok() {
                    let _ = unsafe { self.list.SetTabOrder(self.hwnd, self.main) };
                    self.registered = true;
                }
            }
            if self.registered && !self.helper_buttons_added {
                if unsafe { self.list.ThumbBarAddButtons(self.hwnd, &self.buttons) }.is_ok() {
                    self.helper_buttons_added = true;
                }
            }
            // Never leave a cover tab without its controls: if the helper
            // could not be prepared, fall back to the real main window.
            if !self.registered || !self.helper_buttons_added {
                if self.registered {
                    let _ = unsafe { self.list.UnregisterTab(self.hwnd) };
                    self.registered = false;
                }
                use_helper = false;
            }
        } else if self.registered {
            let _ = unsafe { self.list.UnregisterTab(self.hwnd) };
            self.registered = false;
        }
        unsafe {
            let _ = SetWindowTextW(self.hwnd, PCWSTR::from_raw(title.as_ptr()));
        }
        set_button(&mut self.buttons[0], self.icons.previous, previous, !active);
        set_button(&mut self.buttons[1], if paused { self.icons.play } else { self.icons.pause }, active, !active);
        set_button(&mut self.buttons[2], self.icons.next, next, !active);
        set_button(&mut self.buttons[3], if metadata.repeat { self.icons.repeat_one } else { self.icons.repeat }, active, !active);
        self.buttons[3].szTip = tip(if metadata.repeat { "单曲循环" } else { "列表循环" });
        let tooltip = tip(if active { &metadata.title } else { "DiscAtelier" });

        if active {
            if !self.main_buttons_added {
                if unsafe { self.list.ThumbBarAddButtons(self.main, &self.buttons) }.is_ok() {
                    self.main_buttons_added = true;
                }
            }
            if use_helper && self.registered && self.helper_buttons_added {
                self.hide_buttons_on(self.main, self.main_buttons_added);
                unsafe {
                    self.list.ThumbBarUpdateButtons(self.hwnd, &self.buttons)?;
                    self.list.SetThumbnailTooltip(self.hwnd, PCWSTR::from_raw(tooltip.as_ptr()))?;
                }
            } else if self.main_buttons_added {
                self.hide_buttons_on(self.hwnd, self.helper_buttons_added);
                unsafe {
                    self.list.ThumbBarUpdateButtons(self.main, &self.buttons)?;
                    self.list.SetThumbnailTooltip(self.main, PCWSTR::from_raw(tooltip.as_ptr()))?;
                }
            }
        } else {
            self.hide_buttons_on(self.main, self.main_buttons_added);
            self.hide_buttons_on(self.hwnd, self.helper_buttons_added);
            if self.registered {
                let _ = unsafe { self.list.UnregisterTab(self.hwnd) };
                self.registered = false;
            }
        }
        unsafe {
            let has_cover = i32::from(self.cover.is_some());
            for attribute in [DWMWA_FORCE_ICONIC_REPRESENTATION, DWMWA_HAS_ICONIC_BITMAP] {
                let _ = DwmSetWindowAttribute(
                    self.hwnd,
                    attribute,
                    &has_cover as *const _ as *const std::ffi::c_void,
                    std::mem::size_of::<i32>() as u32,
                );
            }
            let _ = DwmInvalidateIconicBitmaps(self.hwnd);
        }
        Ok(())
    }

    fn draw_cover(&self, width: u32, height: u32) {
        let Some(image) = self.cover.as_ref() else { return };
        let Some(bitmap) = cover_bitmap(image, width, height) else { return };
        let _ = unsafe { DwmSetIconicThumbnail(self.hwnd, bitmap, 0) };
        let _ = unsafe { DeleteObject(bitmap.into()) };
    }

    fn live_preview(&self, width: u32, height: u32) {
        let Some(image) = self.cover.as_ref() else { return };
        let Some(bitmap) = cover_bitmap(image, width.max(128), height.max(128)) else { return };
        let _ = unsafe { DwmSetIconicLivePreviewBitmap(self.hwnd, bitmap, None, 0) };
        let _ = unsafe { DeleteObject(bitmap.into()) };
    }
}

impl Drop for Taskbar {
    fn drop(&mut self) {
        unsafe {
            if self.registered {
                let _ = self.list.UnregisterTab(self.hwnd);
            }
            let _ = DestroyWindow(self.hwnd);
            if let Some(icon) = self.app_icon.take() {
                let _ = DestroyIcon(icon);
            }
        }
        self.icons.destroy();
    }
}

unsafe extern "system" fn helper_proc(hwnd: HWND, message: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if message == WM_ACTIVATE && (wparam.0 & 0xffff) != 0 {
        if let Ok(current) = taskbar().lock() {
            if let Some(taskbar) = current.0.as_ref() {
                let _ = ShowWindow(taskbar.main, SW_RESTORE);
                let _ = SetForegroundWindow(taskbar.main);
                return LRESULT(0);
            }
        }
    }
    if message == WM_CLOSE || (message == WM_SYSCOMMAND && (wparam.0 & 0xfff0) as u32 == SC_CLOSE) {
        if let Ok(current) = taskbar().lock() {
            if let Some(taskbar) = current.0.as_ref() {
                let _ = PostMessageW(Some(taskbar.main), WM_CLOSE, WPARAM(0), LPARAM(0));
                return LRESULT(0);
            }
        }
    }
    if message == WM_COMMAND && ((wparam.0 >> 16) as u32) == THBN_CLICKED {
        let id = (wparam.0 & 0xffff) as u32;
        let (action, session) = match id {
            BUTTON_PREVIOUS => ("previous", None),
            BUTTON_TOGGLE => ("toggle", None),
            BUTTON_NEXT => ("next", None),
            BUTTON_REPEAT => ("repeat", None),
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
    if message == WM_DWMSENDICONICTHUMBNAIL || message == WM_DWMSENDICONICLIVEPREVIEWBITMAP {
        let width = ((lparam.0 as usize >> 16) & 0xffff) as u32;
        let height = ((lparam.0 as usize) & 0xffff) as u32;
        if let Ok(current) = taskbar().lock() {
            if let Some(taskbar) = current.0.as_ref() {
                if message == WM_DWMSENDICONICTHUMBNAIL {
                    taskbar.draw_cover(width, height);
                } else {
                    taskbar.live_preview(width, height);
                }
            }
        }
        return LRESULT(0);
    }
    unsafe { DefWindowProcW(hwnd, message, wparam, lparam) }
}

pub fn setup(app: &tauri::AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or_else(|| "主窗口不可用。".to_string())?;
    let hwnd = HWND(window.hwnd().map_err(|error| error.to_string())?.0);
    let _ = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
    let list: ITaskbarList3 = unsafe {
        CoCreateInstance(&TASKBAR_CLSID, None, CLSCTX_INPROC_SERVER).map_err(|error| error.to_string())?
    };
    unsafe { list.HrInit().map_err(|error| error.to_string())? };
    let instance = unsafe { GetModuleHandleW(None).map_err(|error| error.to_string())? };
    let app_icon = load_app_icon();
    let helper = unsafe {
        let class = WNDCLASSW {
            lpfnWndProc: Some(helper_proc),
            hInstance: HINSTANCE(instance.0),
            lpszClassName: HELPER_CLASS,
            ..Default::default()
        };
        if RegisterClassW(&class) == 0 {
            return Err("无法注册任务栏辅助窗口。".into());
        }
        let helper = CreateWindowExW(
            WS_EX_TOOLWINDOW,
            HELPER_CLASS,
            windows::core::w!("DiscAtelier"),
            WS_POPUP,
            0, 0, 320, 240,
            None,
            None,
            Some(HINSTANCE(instance.0)),
            None,
        ).map_err(|error| error.to_string())?;
        if helper.0.is_null() {
            return Err("无法创建任务栏辅助窗口。".into());
        }
        let _ = ShowWindow(helper, SW_HIDE);
        if let Some(icon) = app_icon {
            set_icon(hwnd, helper, icon);
        }
        helper
    };
    let icons = crate::taskbar_icons::Icons::create().map_err(|error| error.to_string())?;
    let buttons = [
        button(BUTTON_PREVIOUS, icons.previous, "上一首"),
        button(BUTTON_TOGGLE, icons.play, "播放"),
        button(BUTTON_NEXT, icons.next, "下一首"),
        button(BUTTON_REPEAT, icons.repeat, "列表循环"),
    ];
    *taskbar().lock().map_err(|_| "任务栏状态不可用。".to_string())? = SendTaskbar(Some(Taskbar {
        main: hwnd,
        hwnd: helper,
        list,
        icons,
        buttons,
        cover: None,
        cover_id: String::new(),
        session_id: String::new(),
        app: app.clone(),
        app_icon,
        registered: false,
        main_buttons_added: false,
        helper_buttons_added: false,
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
