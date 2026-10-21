use crate::{
    commands::{self, LibraryState},
    data_location::DataLocation,
    integration_settings,
};
use discatelier_contracts::{AppError, SongLink, SupplementTrack};
use discatelier_provider_netease as provider;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

#[derive(Default)]
pub struct SongState(Mutex<HashMap<u64, (Instant, SupplementTrack)>>);
impl SongState {
    fn store(&self, song: SupplementTrack) -> Result<(), AppError> {
        let mut cache = self
            .0
            .lock()
            .map_err(|_| AppError::new("netease", "歌曲缓存不可用。"))?;
        cache.retain(|_, (time, _)| time.elapsed() < Duration::from_secs(600));
        if cache.len() >= 100 {
            cache.clear();
        }
        cache.insert(song.id, (Instant::now(), song));
        Ok(())
    }
    fn read(&self, id: u64) -> Result<Option<SupplementTrack>, AppError> {
        Ok(self
            .0
            .lock()
            .map_err(|_| AppError::new("netease", "歌曲缓存不可用。"))?
            .get(&id)
            .filter(|(time, _)| time.elapsed() < Duration::from_secs(600))
            .map(|(_, s)| s.clone()))
    }
}

#[tauri::command]
pub async fn netease_song_detail(
    directory: tauri::State<'_, DataLocation>,
    runtime: tauri::State<'_, Arc<discatelier_netease_runtime::Runtime>>,
    state: tauri::State<'_, Arc<SongState>>,
    id: u64,
) -> Result<SupplementTrack, AppError> {
    if id == 0 || id > 9_007_199_254_740_991 {
        return Err(AppError::new("netease", "歌曲 ID 无效。"));
    }
    let settings = integration_settings::read(&directory.0)?;
    let runtime = runtime.inner().clone();
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let song = if settings.netease_mode == integration_settings::NeteaseMode::Builtin {
            provider::parse_song(
                runtime.request("songDetail", serde_json::json!({"id":id}))?,
                id,
            )?
        } else {
            provider::song_detail(&settings.netease_base_url, id)?
        };
        state.store(song.clone())?;
        Ok(song)
    })
    .await
    .map_err(|_| AppError::new("netease", "歌曲读取未完成。"))?
}

#[tauri::command]
pub async fn netease_track_links(
    library: tauri::State<'_, LibraryState>,
    edition_id: String,
) -> Result<Vec<SongLink>, AppError> {
    commands::run(library.inner().clone(), move |s| s.song_links(&edition_id)).await
}

#[tauri::command]
pub async fn netease_link_track(
    library: tauri::State<'_, LibraryState>,
    state: tauri::State<'_, Arc<SongState>>,
    edition_id: String,
    revision: i64,
    position: String,
    title: String,
    song_id: Option<u64>,
) -> Result<(), AppError> {
    let cached = song_id.map(|id| state.read(id)).transpose()?.flatten();
    commands::run(library.inner().clone(), move |service| {
        let link = if let Some(id) = song_id {
            // Only provider-verified metadata can be persisted, never client-supplied song fields.
            let albums = service.music_albums(&edition_id)?;
            let song = cached
                .or_else(|| {
                    albums
                        .into_iter()
                        .flat_map(|a| a.album.tracks)
                        .find(|t| t.id == id)
                })
                .ok_or_else(|| AppError::new("netease", "歌曲预览已过期，请重新读取歌曲链接。"))?;
            Some(SongLink {
                position: position.clone(),
                title: title.clone(),
                song,
            })
        } else {
            None
        };
        service.save_song_link(&edition_id, revision, &position, &title, link.as_ref())
    })
    .await
}
