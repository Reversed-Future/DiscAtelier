use crate::{data_location::DataLocation, integration_settings};
use discatelier_contracts::AppError;
use discatelier_integration_http::error;
use discatelier_provider_netease as provider;
use std::sync::Arc;

#[tauri::command]
pub async fn netease_album_cover(
    directory: tauri::State<'_, DataLocation>,
    runtime: tauri::State<'_, Arc<discatelier_netease_runtime::Runtime>>,
    id: u64,
) -> Result<String, AppError> {
    if id == 0 || id > 9_007_199_254_740_991 {
        return Err(error("专辑 ID 无效。"));
    }
    let settings = integration_settings::read(&directory.0)?;
    let runtime = runtime.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        if settings.netease_mode == integration_settings::NeteaseMode::Builtin {
            provider::download_album_cover(
                runtime.request("album", serde_json::json!({"id":id}))?,
                id,
            )
        } else {
            provider::album_cover(&settings.netease_base_url, id)
        }
    })
    .await
    .map_err(|_| error("网易云封面读取未完成。"))?
}
