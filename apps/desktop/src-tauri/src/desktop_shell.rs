//! Tray presentation and close preferences; never owns a player or a library.
use discatelier_contracts::AppError;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{Emitter, Manager};

const FILE: &str = "window-preferences.json";
#[derive(Clone, Copy, Default, Deserialize, Serialize, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub enum CloseAction {
    #[default]
    Ask,
    Tray,
    Quit,
}
#[derive(Default, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayState {
    session_id: String,
    title: String,
    artist: String,
    active: bool,
    paused: bool,
    busy: bool,
    previous: bool,
    next: bool,
    repeat: Option<String>,
}
#[derive(Default)]
pub struct ShellState {
    tray: Mutex<TrayState>,
}
fn error(message: &str) -> AppError {
    AppError::new("window", message)
}
fn main_only(window: &tauri::WebviewWindow) -> Result<(), AppError> {
    if window.label() != "main" {
        return Err(error("此操作仅适用于主窗口。"));
    }
    Ok(())
}
#[tauri::command]
pub fn window_close_preference(window: tauri::WebviewWindow) -> Result<CloseAction, AppError> {
    main_only(&window)?;
    let path = window
        .state::<crate::data_location::DataLocation>()
        .0
        .join(FILE);
    match std::fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes)
            .map_err(|_| error("关闭偏好无法读取，请在设置中重新选择。")),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(CloseAction::Ask),
        Err(_) => Err(error("无法读取关闭偏好。")),
    }
}
#[tauri::command]
pub fn window_save_close_preference(
    window: tauri::WebviewWindow,
    action: CloseAction,
) -> Result<(), AppError> {
    main_only(&window)?;
    let directory = window
        .state::<crate::data_location::DataLocation>()
        .0
        .clone();
    std::fs::create_dir_all(&directory).map_err(|_| error("无法访问设置目录。"))?;
    let temp = directory.join(format!("window-preferences-{}.json", uuid::Uuid::new_v4()));
    std::fs::write(
        &temp,
        serde_json::to_vec(&action).map_err(|_| error("无法保存关闭偏好。"))?,
    )
    .map_err(|_| error("无法保存关闭偏好。"))?;
    std::fs::rename(temp, directory.join(FILE)).map_err(|_| error("无法替换关闭偏好。"))
}
pub fn show_main(app: &tauri::AppHandle) -> tauri::Result<()> {
    if let Some(popup) = app.get_webview_window("tray-panel") {
        popup.hide()?;
    }
    if let Some(main) = app.get_webview_window("main") {
        main.show()?;
        main.unminimize()?;
        main.set_focus()?;
    }
    Ok(())
}
pub fn request_close(app: &tauri::AppHandle) {
    let Some(main) = app.get_webview_window("main") else {
        return;
    };
    match window_close_preference(main.clone()).unwrap_or(CloseAction::Ask) {
        CloseAction::Quit => app.exit(0),
        CloseAction::Tray => {
            let _ = main.hide();
        }
        CloseAction::Ask => {
            let _ = main.emit("window-close-request", ());
        }
    }
}
#[tauri::command]
pub fn window_finish_close(
    window: tauri::WebviewWindow,
    action: CloseAction,
    remember: bool,
) -> Result<(), AppError> {
    main_only(&window)?;
    if action == CloseAction::Ask {
        return Err(error("请选择最小化到托盘或退出应用。"));
    }
    if remember {
        window_save_close_preference(window.clone(), action)?;
    }
    match action {
        CloseAction::Tray => window.hide().map_err(|_| error("无法最小化到托盘。")),
        CloseAction::Quit => {
            window.app_handle().exit(0);
            Ok(())
        }
        CloseAction::Ask => unreachable!(),
    }
}
#[tauri::command]
pub fn tray_sync(window: tauri::WebviewWindow, value: TrayState) -> Result<(), AppError> {
    main_only(&window)?;
    *window
        .state::<ShellState>()
        .tray
        .lock()
        .map_err(|_| error("托盘状态不可用。"))? = value.clone();
    window
        .emit_to("tray-panel", "tray-state", value)
        .map_err(|_| error("无法更新托盘。"))
}
#[tauri::command]
pub fn tray_snapshot(app: tauri::AppHandle) -> Result<TrayState, AppError> {
    app.state::<ShellState>()
        .tray
        .lock()
        .map(|state| state.clone())
        .map_err(|_| error("托盘状态不可用。"))
}
#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub enum TrayAction {
    Show,
    Player,
    Settings,
    Quit,
    Dismiss,
    Toggle,
    Previous,
    Next,
    Repeat,
}
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TrayCommand {
    action: TrayAction,
    session_id: String,
}
#[tauri::command]
pub fn tray_action(
    app: tauri::AppHandle,
    action: TrayAction,
    session_id: String,
) -> Result<(), AppError> {
    match action {
        TrayAction::Quit => app.exit(0),
        TrayAction::Show | TrayAction::Player | TrayAction::Settings => {
            show_main(&app).map_err(|_| error("无法显示主窗口。"))?;
            app.emit_to("main", "tray-command", TrayCommand { action, session_id })
                .map_err(|_| error("无法发送托盘操作。"))?;
        }
        TrayAction::Dismiss => {
            if let Some(window) = app.get_webview_window("tray-panel") {
                window.hide().map_err(|_| error("无法关闭托盘菜单。"))?;
            }
        }
        _ => {
            app.emit_to("main", "tray-command", TrayCommand { action, session_id })
                .map_err(|_| error("无法发送播放操作。"))?;
        }
    }
    Ok(())
}
fn show_popup(app: &tauri::AppHandle, position: tauri::PhysicalPosition<f64>) -> tauri::Result<()> {
    let Some(window) = app.get_webview_window("tray-panel") else {
        return Ok(());
    };
    if let Some(monitor) = app.monitor_from_point(position.x, position.y)? {
        let area = monitor.work_area();
        let scale = monitor.scale_factor();
        let width = (280.0 * scale) as i32;
        let height = (326.0 * scale) as i32;
        window.set_size(tauri::PhysicalSize::new(width as u32, height as u32))?;
        // Anchor the menu's bottom-left beside the pointer, then keep it on-screen.
        let gap = (8.0 * scale).round() as i32;
        let x = (position.x as i32 + gap).clamp(
            area.position.x,
            (area.position.x + area.size.width as i32 - width).max(area.position.x),
        );
        let y = (position.y as i32 - height - gap).clamp(
            area.position.y,
            (area.position.y + area.size.height as i32 - height).max(area.position.y),
        );
        window.set_position(tauri::PhysicalPosition::new(x, y))?;
    }
    window.emit("tray-open", ())?;
    window.show()?;
    window.set_focus()
}
pub fn setup(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
    app.manage(ShellState::default());
    let popup = tauri::WebviewWindowBuilder::new(
        app,
        "tray-panel",
        tauri::WebviewUrl::App("index.html#tray".into()),
    )
    .title("DiscAtelier 托盘")
    .inner_size(280.0, 326.0)
    .decorations(false)
    .resizable(false)
    .skip_taskbar(true)
    .always_on_top(true)
    .visible(false)
    .focused(false)
    .shadow(true)
    .background_color(tauri::utils::config::Color(24, 24, 24, 255))
    .build()?;
    let handle = app.clone();
    popup.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Focused(false)) {
            if let Some(window) = handle.get_webview_window("tray-panel") {
                let _ = window.hide();
            }
        }
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            if let Some(window) = handle.get_webview_window("tray-panel") {
                let _ = window.hide();
            }
        }
    });
    let icon = app.default_window_icon().ok_or("缺少应用图标")?.clone();
    TrayIconBuilder::with_id("discatelier-tray")
        .icon(icon)
        .tooltip("DiscAtelier")
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                position,
                button,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let result = match button {
                    MouseButton::Left => show_main(tray.app_handle()),
                    MouseButton::Right => show_popup(tray.app_handle(), position),
                    _ => Ok(()),
                };
                if result.is_err() {
                    let _ = show_main(tray.app_handle());
                }
            }
        })
        .build(app)?;
    Ok(())
}
