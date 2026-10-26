use crate::{data_location::DataLocation, integration_settings};
use discatelier_contracts::AppError;
use discatelier_provider_netease::lyrics::{self, Lyrics};
use std::sync::Arc;

#[tauri::command]
pub async fn netease_lyrics(
    directory: tauri::State<'_, DataLocation>,
    runtime: tauri::State<'_, Arc<discatelier_netease_runtime::Runtime>>,
    id: u64,
) -> Result<Lyrics, AppError> {
    if id == 0 || id > 9_007_199_254_740_991 {
        return Err(AppError::new("netease", "歌曲 ID 无效。"));
    }
    let settings = integration_settings::read(&directory.0)?;
    let runtime = runtime.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        if settings.netease_mode == integration_settings::NeteaseMode::Builtin {
            lyrics::parse(runtime.request("lyrics", serde_json::json!({"id":id}))?)
        } else {
            lyrics::fetch(&settings.netease_base_url, id)
        }
    })
    .await
    .map_err(|_| AppError::new("netease", "歌词读取未完成。"))?
}
