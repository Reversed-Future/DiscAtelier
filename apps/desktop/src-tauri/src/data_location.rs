use discatelier_contracts::AppError;
use serde::Serialize;
use std::path::PathBuf;
use tauri_plugin_opener::OpenerExt;

pub struct DataLocation(pub PathBuf);
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocationInfo {
    directory: String,
    database: String,
    backups: String,
}
#[tauri::command]
pub fn data_location(state: tauri::State<'_, DataLocation>) -> LocationInfo {
    LocationInfo {
        directory: state.0.to_string_lossy().into_owned(),
        database: state
            .0
            .join("library.sqlite3")
            .to_string_lossy()
            .into_owned(),
        backups: state.0.join("backups").to_string_lossy().into_owned(),
    }
}
#[tauri::command]
pub fn data_open_directory(
    app: tauri::AppHandle,
    state: tauri::State<'_, DataLocation>,
) -> Result<(), AppError> {
    app.opener()
        .open_path(state.0.to_string_lossy(), None::<&str>)
        .map_err(|_| AppError::new("storage", "无法打开数据目录。"))
}
