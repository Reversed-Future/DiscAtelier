use crate::{
    commands::{self, LibraryState},
    data_location::DataLocation,
    integration_settings,
};
use discatelier_contracts::{AppError, MusicSupplement};
use discatelier_integration_http::error;
use discatelier_provider_netease::{self as provider, AlbumResult};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

#[derive(Default)]
pub struct NeteaseState(pub Mutex<HashMap<u64, (Instant, MusicSupplement)>>);
#[tauri::command]
pub async fn netease_search(
    directory: tauri::State<'_, DataLocation>,
    query: String,
) -> Result<Vec<AlbumResult>, AppError> {
    let base = integration_settings::read(&directory.0)?.netease_base_url;
    tauri::async_runtime::spawn_blocking(move || provider::search(&base, &query))
        .await
        .map_err(|_| error("网易云搜索未完成。"))?
}
#[tauri::command]
pub async fn netease_album(
    directory: tauri::State<'_, DataLocation>,
    state: tauri::State<'_, Arc<NeteaseState>>,
    id: u64,
) -> Result<MusicSupplement, AppError> {
    let base = integration_settings::read(&directory.0)?.netease_base_url;
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let album = provider::album(&base, id)?;
        let mut cache = state.0.lock().map_err(|_| error("资料缓存不可用。"))?;
        cache.retain(|_, (time, _)| time.elapsed() < Duration::from_secs(600));
        if cache.len() >= 20 {
            cache.clear();
        }
        cache.insert(id, (Instant::now(), album.clone()));
        Ok(album)
    })
    .await
    .map_err(|_| error("网易云读取未完成。"))?
}
#[tauri::command]
pub async fn netease_saved(
    library: tauri::State<'_, LibraryState>,
    edition_id: String,
) -> Result<Option<MusicSupplement>, AppError> {
    commands::run(library.inner().clone(), move |s| s.supplement(&edition_id)).await
}
#[tauri::command]
pub async fn netease_apply(
    library: tauri::State<'_, LibraryState>,
    state: tauri::State<'_, Arc<NeteaseState>>,
    edition_id: String,
    revision: i64,
    id: u64,
) -> Result<(), AppError> {
    let album = state
        .0
        .lock()
        .map_err(|_| error("资料缓存不可用。"))?
        .get(&id)
        .filter(|(time, _)| time.elapsed() < Duration::from_secs(600))
        .map(|(_, album)| album.clone())
        .ok_or_else(|| error("预览已过期，请重新查询。"))?;
    commands::run(library.inner().clone(), move |s| {
        s.save_supplement(&edition_id, revision, &album)
    })
    .await
}
