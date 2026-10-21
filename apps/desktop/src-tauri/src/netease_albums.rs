use crate::commands::{self, LibraryState};
use discatelier_contracts::{AppError, LinkedMusicAlbum};

#[tauri::command]
pub async fn netease_disc_albums(
    library: tauri::State<'_, LibraryState>,
    edition_id: String,
) -> Result<Vec<discatelier_contracts::DiscAlbumLink>, AppError> {
    commands::run(library.inner().clone(), move |s| s.disc_albums(&edition_id)).await
}
#[tauri::command]
pub async fn netease_bind_disc(
    library: tauri::State<'_, LibraryState>,
    edition_id: String,
    revision: i64,
    disc_key: String,
    album_id: Option<u64>,
) -> Result<(), AppError> {
    commands::run(library.inner().clone(), move |s| {
        s.save_disc_album(&edition_id, revision, &disc_key, album_id)
    })
    .await
}

#[tauri::command]
pub async fn netease_albums(
    library: tauri::State<'_, LibraryState>,
    edition_id: String,
) -> Result<Vec<LinkedMusicAlbum>, AppError> {
    commands::run(library.inner().clone(), move |s| {
        s.music_albums(&edition_id)
    })
    .await
}
#[tauri::command]
pub async fn netease_reorder_albums(
    library: tauri::State<'_, LibraryState>,
    edition_id: String,
    revision: i64,
    ids: Vec<u64>,
) -> Result<(), AppError> {
    commands::run(library.inner().clone(), move |s| {
        s.reorder_music_albums(&edition_id, revision, &ids)
    })
    .await
}
#[tauri::command]
pub async fn netease_remove_album(
    library: tauri::State<'_, LibraryState>,
    edition_id: String,
    revision: i64,
    id: u64,
) -> Result<(), AppError> {
    commands::run(library.inner().clone(), move |s| {
        s.remove_music_album(&edition_id, revision, id)
    })
    .await
}
