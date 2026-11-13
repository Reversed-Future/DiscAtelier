//! Independent equalizer window so playback can be adjusted while a video or
//! track keeps playing in the main window.
use discatelier_contracts::AppError;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

pub fn setup(app: &AppHandle) -> Result<(), AppError> {
    let window = WebviewWindowBuilder::new(
        app,
        "equalizer",
        WebviewUrl::App("index.html".into()),
    )
    .title("均衡器")
    .inner_size(820.0, 620.0)
    .min_inner_size(620.0, 560.0)
    .decorations(false)
    .skip_taskbar(true)
    .always_on_top(true)
    .visible(false)
    .focused(false)
    .shadow(true)
    .center()
    .build()
    .map_err(|error| AppError::new("window", format!("无法初始化均衡器窗口：{error}")))?;
    let handle = app.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            if let Some(window) = handle.get_webview_window("equalizer") {
                let _ = window.emit("equalizer-window-active", false);
                let _ = window.hide();
            }
        }
    });
    Ok(())
}

fn open(app: &AppHandle) -> Result<(), AppError> {
    if let Some(window) = app.get_webview_window("equalizer") {
        window
            .show()
            .map_err(|error| AppError::new("window", format!("无法显示均衡器窗口：{error}")))?;
        window
            .unminimize()
            .map_err(|error| AppError::new("window", format!("无法恢复均衡器窗口：{error}")))?;
        window
            .set_focus()
            .map_err(|error| AppError::new("window", format!("无法聚焦均衡器窗口：{error}")))?;
        let _ = window.emit("equalizer-window-active", true);
        return Ok(());
    }
    let window = WebviewWindowBuilder::new(
        app,
        "equalizer",
        WebviewUrl::App("index.html".into()),
    )
    .title("均衡器")
    .inner_size(820.0, 620.0)
    .min_inner_size(620.0, 560.0)
    .decorations(false)
    .skip_taskbar(true)
    .always_on_top(true)
    .center()
    .build()
    .map_err(|error| AppError::new("window", format!("无法打开均衡器窗口：{error}")))?;
    // A secondary WebView2 window can be created before its initial app-URL
    // navigation settles. Navigate once explicitly so it never remains at
    // about:blank.
    let url = reqwest::Url::parse("http://tauri.localhost/index.html")
        .map_err(|_| AppError::new("window", "均衡器窗口地址无效。"))?;
    window
        .navigate(url)
        .map_err(|error| AppError::new("window", format!("无法加载均衡器窗口：{error}")))?;
    let _ = window.emit("equalizer-window-active", true);
    Ok(())
}

#[tauri::command]
pub fn equalizer_window_open(app: tauri::AppHandle) -> Result<(), AppError> {
    // Window creation must happen on the event-loop thread. Commands may run
    // on the async runtime; creating a WebView2 window there can leave it at
    // about:blank. Queue the operation and return immediately.
    let handle = app.clone();
    app.run_on_main_thread(move || {
        let _ = open(&handle);
    })
    .map_err(|error| AppError::new("window", format!("无法安排均衡器窗口：{error}")))
}
