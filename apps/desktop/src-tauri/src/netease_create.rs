use crate::{
    commands::{self, LibraryState},
    netease::{cached_album, NeteaseState},
};
use discatelier_contracts::{AppError, CreateCopy};
use std::sync::Arc;

#[tauri::command]
pub async fn netease_create_copy(
    library: tauri::State<'_, LibraryState>,
    state: tauri::State<'_, Arc<NeteaseState>>,
    request: CreateCopy,
    album_id: u64,
) -> Result<String, AppError> {
    // Only accept metadata already fetched by the backend. The UI supplies an
    // album ID, never arbitrary source payloads. Save everything atomically.
    let album = cached_album(&state, album_id)?;
    commands::run(library.inner().clone(), move |service| {
        service.create_music(request, album)
    })
    .await
}
