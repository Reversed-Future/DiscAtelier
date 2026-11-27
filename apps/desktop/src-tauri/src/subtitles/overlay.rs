//! Per-pixel alpha child of the native video HWND. Ownership, clipping and
//! visibility follow the video even when the main window moves or minimizes.
mod bitmap;
use super::{appearance::Appearance, error};
use crate::video_surface::VideoSurface;
use discatelier_contracts::AppError;
use std::{cell::RefCell, ptr};
use tauri::Manager;
use windows_sys::{
    core::w,
    Win32::{
        Foundation::{HWND, POINT, SIZE},
        Graphics::Gdi::{AC_SRC_ALPHA, BLENDFUNCTION},
        UI::{HiDpi::GetDpiForWindow, WindowsAndMessaging::*},
    },
};

#[derive(Default)]
struct Layer {
    host: usize,
    hwnd: usize,
    width: i32,
    top: i32,
    bottom: i32,
    lines: Vec<String>,
    style: Appearance,
}
thread_local! { static LAYER: RefCell<Layer> = RefCell::default(); }

pub fn clear() {
    LAYER.with_borrow_mut(|layer| {
        layer.lines.clear();
        layer.hide();
    });
}
pub fn layout(host: usize, width: i32, top: i32, bottom: i32) {
    LAYER.with_borrow_mut(|layer| {
        if (layer.host, layer.width, layer.top, layer.bottom) != (host, width, top, bottom) {
            layer.host = host;
            layer.width = width;
            layer.top = top;
            layer.bottom = bottom;
            if layer.paint().is_err() {
                layer.hide();
            }
        }
    });
}

impl Layer {
    fn hide(&self) {
        if self.hwnd != 0 {
            unsafe {
                ShowWindow(self.hwnd as HWND, SW_HIDE);
            }
        }
    }
    fn paint(&mut self) -> Result<(), AppError> {
        if self.lines.iter().all(|line| line.trim().is_empty()) || self.width < 1 || self.bottom <= self.top {
            self.hide();
            return Ok(());
        }
        unsafe {
            let host = self.host as HWND;
            if self.hwnd == 0 {
                let hwnd = CreateWindowExW(
                    WS_EX_LAYERED | WS_EX_TRANSPARENT | WS_EX_NOACTIVATE,
                    w!("STATIC"),
                    w!("DiscAtelier AI subtitles"),
                    WS_CHILD | WS_DISABLED,
                    0,
                    0,
                    1,
                    1,
                    host,
                    ptr::null_mut(),
                    ptr::null_mut(),
                    ptr::null(),
                );
                if hwnd.is_null() {
                    return Err(error("无法创建视频字幕层。"));
                }
                self.hwnd = hwnd as usize;
            }
            let hwnd = self.hwnd as HWND;
            let dpi = GetDpiForWindow(host).max(96);
            let available_height = self.bottom - self.top;
            let bitmap = bitmap::Bitmap::render(
                &self.lines,
                self.style,
                dpi,
                (self.width, available_height),
            )?;
            let size = SIZE {
                cx: bitmap.width,
                cy: bitmap.height,
            };
            let origin = POINT { x: 0, y: 0 };
            let blend = BLENDFUNCTION {
                BlendOp: 0,
                BlendFlags: 0,
                SourceConstantAlpha: 255,
                AlphaFormat: AC_SRC_ALPHA as u8,
            };
            if UpdateLayeredWindow(
                hwnd,
                ptr::null_mut(),
                ptr::null(),
                &size,
                bitmap.dc,
                &origin,
                0,
                &blend,
                ULW_ALPHA,
            ) == 0
            {
                return Err(error("无法叠加视频字幕。"));
            }
            let space = available_height - bitmap.height;
            let inset = (available_height / 30).min(space / 2);
            let y = self.top
                + inset
                + (space - 2 * inset) * i32::from(self.style.vertical_position) / 100;
            if SetWindowPos(
                hwnd,
                HWND_TOP,
                (self.width - bitmap.width) / 2,
                y,
                0,
                0,
                SWP_NOACTIVATE | SWP_NOSIZE | SWP_SHOWWINDOW,
            ) == 0
            {
                return Err(error("无法定位视频字幕。"));
            }
            Ok(())
        }
    }
}

#[tauri::command]
pub async fn subtitle_overlay(
    window: tauri::WebviewWindow,
    lines: Vec<String>,
    appearance: Appearance,
) -> Result<(), AppError> {
    appearance.validate()?;
    if lines.len() > 4 || lines.iter().any(|s| s.len() > 32768) {
        return Err(error("字幕文本过长。"));
    }
    let surface = *window.state::<VideoSurface>();
    let (tx, rx) = tokio::sync::oneshot::channel();
    window
        .run_on_main_thread(move || {
            let result = LAYER.with_borrow_mut(|layer| {
                layer.host = surface.handle();
                layer.lines = lines;
                layer.style = appearance;
                layer.paint()
            });
            let _ = tx.send(result);
        })
        .map_err(|_| error("无法更新字幕层。"))?;
    rx.await.map_err(|_| error("字幕层已关闭。"))?
}
