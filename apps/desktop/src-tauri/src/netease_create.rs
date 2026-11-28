use crate::{
    commands::{self, LibraryState},
    netease::{cached_album, NeteaseState},
};
use discatelier_contracts::{AppError, CreateCopy, EditionContent};
use std::sync::Arc;

#[tauri::command]
pub async fn netease_create_copy(
    library: tauri::State<'_, LibraryState>,
    state: tauri::State<'_, Arc<NeteaseState>>,
    request: CreateCopy,
    album_id: Option<u64>,
    content: Option<EditionContent>,
) -> Result<String, AppError> {
    // Only accept metadata already fetched by the backend. The UI supplies an
    // album ID, never arbitrary source payloads. Save everything atomically.
    let album = album_id.map(|id| cached_album(&state, id)).transpose()?;
    commands::run(library.inner().clone(), move |service| {
        service.create_music_with_content(request, album, content)
    })
    .await
}
