use discatelier_contracts::AppError;
use windows_sys::{
    core::w,
    Win32::{
        Graphics::Gdi::{GetStockObject, BLACK_BRUSH},
        System::LibraryLoader::GetModuleHandleW,
        UI::WindowsAndMessaging::*,
    },
};

/// A top-level, off-screen VLC target used only while recognizing a disc menu.
/// It stays out of the taskbar and never takes focus from the app.
pub struct MenuSurface {
    handle: usize,
}

impl MenuSurface {
    pub fn create() -> Result<Self, AppError> {
        unsafe {
            let instance = GetModuleHandleW(std::ptr::null());
            let class = WNDCLASSW {
                lpfnWndProc: Some(DefWindowProcW),
                hInstance: instance,
                hbrBackground: GetStockObject(BLACK_BRUSH) as _,
                lpszClassName: w!("DiscAtelierMenuCapture"),
                ..std::mem::zeroed()
            };
            if RegisterClassW(&class) == 0 {
                return Err(error());
            }
            let handle = CreateWindowExW(
                WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
                class.lpszClassName,
                w!("DiscAtelierMenuCapture"),
                WS_POPUP,
                -32000,
                -32000,
                1280,
                720,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                instance,
                std::ptr::null(),
            );
            if handle.is_null() {
                return Err(error());
            }
            ShowWindow(handle, SW_SHOWNOACTIVATE);
            SetWindowPos(
                handle,
                HWND_BOTTOM,
                -32000,
                -32000,
                1280,
                720,
                SWP_NOACTIVATE | SWP_SHOWWINDOW,
            );
            Ok(Self {
                handle: handle as usize,
            })
        }
    }

    pub fn handle(&self) -> usize {
        self.handle
    }
}

fn error() -> AppError {
    AppError::new("player", "无法创建静默菜单截图窗口。")
}
