use crate::commands::{self, LibraryState};
use discatelier_application::LibraryService;
use discatelier_contracts::{
    AppError, DiscAlbumLink, LibraryQuery, LinkedMusicAlbum, ReleaseTrack, SongLink,
};
use discatelier_storage::SqliteLibrary;
use serde::Serialize;
use std::sync::{Arc, Mutex};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueContext {
    title: String,
    revision: i64,
    albums: Vec<LinkedMusicAlbum>,
    links: Vec<SongLink>,
    bindings: Vec<DiscAlbumLink>,
    tracks: Vec<ReleaseTrack>,
}
#[derive(Default)]
pub struct QueueState(Mutex<Vec<QueueOrder>>);
struct QueueOrder {
    edition: String,
    revision: i64,
    ids: Vec<u64>,
}

fn context(
    service: &LibraryService<SqliteLibrary>,
    edition: &str,
) -> Result<QueueContext, AppError> {
    let item = service
        .list(LibraryQuery {
            category_id: "music".into(),
            ..Default::default()
        })?
        .copies
        .into_iter()
        .find(|c| c.edition_id == edition)
        .ok_or_else(|| AppError::new("netease", "收藏已改变，请重新打开详情。"))?;
    Ok(QueueContext {
        title: item.edition.title,
        revision: item.edition_revision,
        albums: service.music_albums(edition)?,
        links: service.song_links(edition)?,
        bindings: service.disc_albums(edition)?,
        tracks: service
            .edition_content(edition)?
            .map(|c| c.tracks)
            .unwrap_or_default(),
    })
}
#[tauri::command]
pub async fn netease_queue_context(
    library: tauri::State<'_, LibraryState>,
    edition_id: String,
) -> Result<QueueContext, AppError> {
    commands::run(library.inner().clone(), move |s| context(s, &edition_id)).await
}
#[tauri::command]
pub async fn netease_queue_remember(
    library: tauri::State<'_, LibraryState>,
    state: tauri::State<'_, Arc<QueueState>>,
    edition_id: String,
    revision: i64,
    ids: Vec<u64>,
) -> Result<(), AppError> {
    let state = state.inner().clone();
    commands::run(library.inner().clone(), move |s| {
        let value = context(s, &edition_id)?;
        if revision != value.revision
            || ids.is_empty()
            || ids.len() > 5000
            || ids.iter().any(|id| {
                !value
                    .albums
                    .iter()
                    .any(|a| a.album.tracks.iter().any(|t| t.id == *id))
                    && !value.links.iter().any(|l| l.song.id == *id)
            })
        {
            return Err(AppError::new("netease", "播放列表已改变，请重新选择曲目。"));
        }
        let mut orders = state
            .0
            .lock()
            .map_err(|_| AppError::new("netease", "播放列表不可用。"))?;
        orders.retain(|q| q.edition != edition_id);
        orders.insert(
            0,
            QueueOrder {
                edition: edition_id,
                revision,
                ids,
            },
        );
        orders.truncate(3);
        Ok(())
    })
    .await
}
pub fn adjacent(
    state: &QueueState,
    service: &LibraryService<SqliteLibrary>,
    edition: &str,
    song: u64,
    forward: bool,
) -> Result<u64, AppError> {
    let value = context(service, edition)?;
    let orders = state
        .0
        .lock()
        .map_err(|_| AppError::new("netease", "播放列表不可用。"))?;
    let queue = orders
        .iter()
        .find(|q| q.edition == edition && q.revision == value.revision)
        .ok_or_else(|| {
            AppError::new("netease", "播放列表正在刷新，请从收藏选择一首歌曲后重试。")
        })?;
    let index = queue
        .ids
        .iter()
        .position(|id| *id == song)
        .ok_or_else(|| AppError::new("netease", "当前歌曲不在播放列表内。"))?;
    Ok(queue.ids[(index + if forward { 1 } else { queue.ids.len() - 1 }) % queue.ids.len()])
}
