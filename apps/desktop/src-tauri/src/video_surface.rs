use discatelier_contracts::{AppError, VideoViewport};
use tauri::Manager;
use windows_sys::{
    core::w,
    Win32::{
        Foundation::{POINT, RECT},
        Graphics::Gdi::{
            CreateRectRgn, DeleteObject, GetStockObject, ScreenToClient, SetWindowRgn, BLACK_BRUSH,
        },
        System::LibraryLoader::GetModuleHandleW,
        UI::WindowsAndMessaging::*,
    },
};

/// HWNDs belong to the main window and are touched only on its UI thread.
#[derive(Clone, Copy)]
pub struct VideoSurface {
    pub(crate) owner: usize,
    pub(crate) host: usize,
}
impl VideoSurface {
    pub fn create(owner: usize) -> Result<Self, AppError> {
        unsafe {
            let instance = GetModuleHandleW(std::ptr::null());
            let class = WNDCLASSW {
                lpfnWndProc: Some(DefWindowProcW),
                hInstance: instance,
                hbrBackground: GetStockObject(BLACK_BRUSH) as _,
                lpszClassName: w!("DiscAtelierVideoSurface"),
                ..std::mem::zeroed()
            };
            if RegisterClassW(&class) == 0 {
                return Err(error());
            }
            let host = CreateWindowExW(
                0,
                class.lpszClassName,
                w!("DiscAtelierVideo"),
                WS_CHILD | WS_CLIPCHILDREN | WS_CLIPSIBLINGS | WS_DISABLED,
                0,
                0,
                1,
                1,
                owner as _,
                std::ptr::null_mut(),
                instance,
                std::ptr::null(),
            );
            if host.is_null() {
                return Err(error());
            }
            Ok(Self {
                owner,
                host: host as usize,
            })
        }
    }
    pub fn handle(&self) -> usize {
        self.host
    }
    fn place(&self, viewport: VideoViewport) -> Result<(), AppError> {
        unsafe {
            windows_sys::Win32::UI::Input::KeyboardAndMouse::EnableWindow(
                self.host as _,
                viewport.interactive.into(),
            );
            if !viewport.visible {
                ShowWindow(self.host as _, SW_HIDE);
                return Ok(());
            }
            let mut client: RECT = std::mem::zeroed();
            if GetClientRect(self.owner as _, &mut client) == 0 {
                return Err(error());
            }
            let x = viewport.x.clamp(0, client.right.max(0));
            let y = viewport.y.clamp(0, client.bottom.max(0));
            let width = viewport.width.clamp(0, (client.right - x).max(0));
            let height = viewport.height.clamp(0, (client.bottom - y).max(0));
            if width == 0 || height == 0 {
                ShowWindow(self.host as _, SW_HIDE);
            } else if SetWindowPos(
                self.host as _,
                HWND_TOP,
                x,
                y,
                width,
                height,
                SWP_NOACTIVATE | SWP_SHOWWINDOW,
            ) == 0
            {
                return Err(error());
            }
            if width > 0 && height > 0 {
                // Clip the video around floating controls without resizing its canvas.
                // Successful SetWindowRgn transfers the region's ownership to Windows.
                let top = viewport.clip_top.clamp(0, height);
                let bottom = viewport.clip_bottom.clamp(0, height - top);
                let region = CreateRectRgn(0, top, width, height - bottom);
                if region.is_null() {
                    return Err(error());
                }
                if SetWindowRgn(self.host as _, region, 1) == 0 {
                    DeleteObject(region);
                    return Err(error());
                }
            }
        }
        Ok(())
    }
}
fn error() -> AppError {
    AppError::new("player", "无法更新内置播放区域。")
}

#[tauri::command]
pub async fn playback_viewport(
    window: tauri::WebviewWindow,
    viewport: VideoViewport,
) -> Result<(), AppError> {
    let surface = *window.state::<VideoSurface>();
    let (send, receive) = std::sync::mpsc::channel();
    window
        .run_on_main_thread(move || {
            let _ = send.send(surface.place(viewport));
        })
        .map_err(|_| error())?;
    tauri::async_runtime::spawn_blocking(move || receive.recv().map_err(|_| error()))
        .await
        .map_err(|_| error())??
}

#[tauri::command]
pub fn playback_fullscreen(window: tauri::WebviewWindow, fullscreen: bool) -> Result<(), AppError> {
    window.set_fullscreen(fullscreen).map_err(|_| error())
}

/// Native video occupies its own child HWND, so DOM mousemove is insufficient.
/// Read only while the fullscreen player is active; never synthesize input.
#[tauri::command]
pub fn playback_pointer(window: tauri::WebviewWindow) -> Option<(i32, i32)> {
    let surface = window.state::<VideoSurface>();
    unsafe {
        if GetForegroundWindow() != surface.owner as _ {
            return None;
        }
        let mut point: POINT = std::mem::zeroed();
        let mut rect: RECT = std::mem::zeroed();
        if GetCursorPos(&mut point) == 0
            || ScreenToClient(surface.owner as _, &mut point) == 0
            || GetClientRect(surface.owner as _, &mut rect) == 0
        {
            return None;
        }
        (point.x >= 0 && point.y >= 0 && point.x < rect.right && point.y < rect.bottom)
            .then_some((point.x, point.y))
    }
}
