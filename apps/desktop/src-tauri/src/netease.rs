use crate::{
    commands::{self, LibraryState},
    data_location::DataLocation,
    integration_settings,
};
use discatelier_contracts::{AppError, MusicSupplement};
use discatelier_integration_http::error;
use discatelier_provider_netease::{self as provider, AlbumResult, AlbumSearchPage};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

#[derive(Default)]
pub struct NeteaseState(pub Mutex<HashMap<u64, (Instant, MusicSupplement)>>);
pub fn search(
    runtime: &discatelier_netease_runtime::Runtime,
    settings: &integration_settings::Settings,
    query: &str,
) -> Result<Vec<AlbumResult>, AppError> {
    Ok(search_page(runtime, settings, query, 0)?.items)
}
pub fn search_page(
    runtime: &discatelier_netease_runtime::Runtime,
    settings: &integration_settings::Settings,
    query: &str,
    offset: u32,
) -> Result<AlbumSearchPage, AppError> {
    if settings.netease_mode == integration_settings::NeteaseMode::Builtin {
        provider::parse_search_page(
            runtime.request("search", serde_json::json!({"query":query,"offset":offset}))?,
            offset,
        )
    } else {
        provider::search_page(&settings.netease_base_url, query, offset)
    }
}
pub fn album(
    runtime: &discatelier_netease_runtime::Runtime,
    settings: &integration_settings::Settings,
    id: u64,
) -> Result<MusicSupplement, AppError> {
    if settings.netease_mode == integration_settings::NeteaseMode::Builtin {
        provider::parse_album(runtime.request("album", serde_json::json!({"id":id}))?, id)
    } else {
        provider::album(&settings.netease_base_url, id)
    }
}
#[tauri::command]
pub async fn netease_search(
    directory: tauri::State<'_, DataLocation>,
    runtime: tauri::State<'_, Arc<discatelier_netease_runtime::Runtime>>,
    query: String,
    offset: Option<u32>,
) -> Result<AlbumSearchPage, AppError> {
    let settings = integration_settings::read(&directory.0)?;
    let runtime = runtime.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        search_page(&runtime, &settings, &query, offset.unwrap_or(0))
    })
    .await
    .map_err(|_| error("网易云搜索未完成。"))?
}
#[tauri::command]
pub async fn netease_album(
    directory: tauri::State<'_, DataLocation>,
    runtime: tauri::State<'_, Arc<discatelier_netease_runtime::Runtime>>,
    state: tauri::State<'_, Arc<NeteaseState>>,
    id: u64,
) -> Result<MusicSupplement, AppError> {
    let settings = integration_settings::read(&directory.0)?;
    let runtime = runtime.inner().clone();
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let album = album(&runtime, &settings, id)?;
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
