//! Content-sized tray presentation, independent of playback and close preferences.
use discatelier_contracts::AppError;
use std::sync::Mutex;
use tauri::{Emitter, Manager, PhysicalPosition, PhysicalSize};

#[derive(Default)]
pub struct TrayWindowState(Mutex<Layout>);
#[derive(Default)]
struct Layout {
    height: Option<f64>,
    anchor: Option<PhysicalPosition<f64>>,
    pending: bool,
}

fn place(
    window: &tauri::WebviewWindow,
    point: PhysicalPosition<f64>,
    height: f64,
) -> tauri::Result<()> {
    if let Some(monitor) = window.app_handle().monitor_from_point(point.x, point.y)? {
        let area = monitor.work_area();
        let scale = monitor.scale_factor();
        let width = ((280.0 * scale).ceil() as u32).min(area.size.width);
        let height = ((height * scale).ceil() as u32).min(area.size.height);
        let gap = (8.0 * scale).round() as i32;
        let x = (point.x as i32 + gap).clamp(
            area.position.x,
            area.position.x + (area.size.width - width) as i32,
        );
        let y = (point.y as i32 - height as i32 - gap).clamp(
            area.position.y,
            area.position.y + (area.size.height - height) as i32,
        );
        // Moving between monitors changes DPI and can resize the window. Apply the
        // final pixel dimensions AFTER that move, including the very first open.
        window.set_position(PhysicalPosition::new(x, y))?;
        refresh_frame(window)?;
        window.set_size(PhysicalSize::new(width, height))?;
        window.set_position(PhysicalPosition::new(x, y))?;
    }
    Ok(())
}

fn refresh_frame(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::{
            SetWindowPos, SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER,
        };
        // Tao sizes shadowed, borderless windows using outer/client offsets.
        // Before the first NCCALCSIZE those offsets still include the caption.
        // Recalculate the hidden frame before Tao reads them for set_size.
        let ok = unsafe {
            SetWindowPos(
                window.hwnd()?.0,
                std::ptr::null_mut(),
                0,
                0,
                0,
                0,
                SWP_FRAMECHANGED | SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER,
            )
        };
        if ok == 0 {
            return Err(std::io::Error::last_os_error().into());
        }
    }
    #[cfg(not(windows))]
    let _ = window;
    Ok(())
}

pub fn show_popup(app: &tauri::AppHandle, point: PhysicalPosition<f64>) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window("tray-panel") else {
        return Ok(());
    };
    let height = {
        let state = app.state::<TrayWindowState>();
        let mut layout = state.0.lock().unwrap_or_else(|e| e.into_inner());
        layout.anchor = Some(point);
        layout.pending = layout.height.is_none();
        layout.height
    };
    if let Some(height) = height {
        place(&window, point, height)?;
        window.emit("tray-open", ())?;
        window.show()?;
        window.set_focus()?;
    }
    Ok(())
}

#[tauri::command]
pub fn tray_resize(window: tauri::WebviewWindow, height: f64) -> Result<(), AppError> {
    if window.label() != "tray-panel" || !height.is_finite() || !(120.0..=2048.0).contains(&height)
    {
        return Err(AppError::new("window", "托盘尺寸无效。"));
    }
    let (anchor, pending) = {
        let state = window.state::<TrayWindowState>();
        let mut layout = state.0.lock().unwrap_or_else(|e| e.into_inner());
        layout.height = Some(height);
        let pending = layout.pending;
        layout.pending = false;
        (layout.anchor, pending)
    };
    let apply = || -> tauri::Result<()> {
        if let Some(anchor) = anchor {
            if pending {
                show_popup(window.app_handle(), anchor)?;
            } else if window.is_visible()? {
                place(&window, anchor, height)?;
            }
        }
        Ok(())
    };
    apply().map_err(|_| AppError::new("window", "无法调整托盘菜单。"))
}
