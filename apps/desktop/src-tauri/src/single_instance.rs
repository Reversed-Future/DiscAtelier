//! One process per executable path. Preview and installed builds use different
//! paths, so they can coexist; two launches of the same executable cannot.
use sha2::{Digest, Sha256};
use std::sync::OnceLock;
use windows::{
    core::PCWSTR,
    Win32::{
        Foundation::{CloseHandle, GetLastError, ERROR_ALREADY_EXISTS},
        System::Threading::CreateMutexW,
        UI::WindowsAndMessaging::{
            FindWindowW, SetForegroundWindow, ShowWindow, SW_RESTORE, SW_SHOW,
        },
    },
};

static INSTANCE: OnceLock<isize> = OnceLock::new();

fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

fn focus_existing() {
    let title = wide("DiscAtelier");
    let hwnd = unsafe { FindWindowW(None, PCWSTR(title.as_ptr())) };
    if let Ok(hwnd) = hwnd {
        unsafe {
            let _ = ShowWindow(hwnd, SW_RESTORE);
            let _ = ShowWindow(hwnd, SW_SHOW);
            let _ = SetForegroundWindow(hwnd);
        }
    }
}

/// Returns false when another process already owns the same executable.
/// The second process must exit without constructing Tauri or creating a tray.
pub fn claim() -> bool {
    let executable = std::env::current_exe().unwrap_or_default();
    let digest = Sha256::digest(executable.to_string_lossy().as_bytes());
    let name = format!("Local\\DiscAtelier-{}", &format!("{digest:x}")[..24]);
    let name = wide(&name);
    let handle = match unsafe { CreateMutexW(None, false, PCWSTR(name.as_ptr())) } {
        Ok(handle) => handle,
        Err(_) => return true,
    };
    if unsafe { GetLastError() } == ERROR_ALREADY_EXISTS {
        unsafe {
            let _ = CloseHandle(handle);
        }
        focus_existing();
        return false;
    }
    let _ = INSTANCE.set(handle.0 as isize);
    true
}
