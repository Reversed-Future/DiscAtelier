use discatelier_contracts::AppError;
use discatelier_integration_http::error;

#[tauri::command]
pub fn about_open_project(app: tauri::AppHandle) -> Result<(), AppError> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(
            "https://github.com/Reversed-Future/DiscAtelier",
            None::<&str>,
        )
        .map_err(|_| error("无法打开项目主页。"))
}
