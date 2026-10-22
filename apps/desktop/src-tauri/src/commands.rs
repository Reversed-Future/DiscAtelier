use discatelier_application::LibraryService;
use discatelier_contracts::*;
use discatelier_storage::SqliteLibrary;
use std::sync::{Arc, Mutex};

pub type LibraryState = Arc<Mutex<Result<LibraryService<SqliteLibrary>, AppError>>>;

#[tauri::command]
pub async fn library_content(
    state: tauri::State<'_, LibraryState>,
    edition_id: String,
) -> Result<Option<EditionContent>, AppError> {
    run(state.inner().clone(), move |service| {
        service.edition_content(&edition_id)
    })
    .await
}

pub(crate) async fn run<T: Send + 'static>(
    state: LibraryState,
    task: impl FnOnce(&mut LibraryService<SqliteLibrary>) -> Result<T, AppError> + Send + 'static,
) -> Result<T, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut service = state
            .lock()
            .map_err(|_| AppError::new("storage", "收藏服务不可用，请重启应用。"))?;
        task(service.as_mut().map_err(|error| error.clone())?)
    })
    .await
    .map_err(|_| AppError::new("internal", "收藏操作未完成，请重新打开应用检查。"))?
}
#[tauri::command]
pub async fn library_move(
    state: tauri::State<'_, LibraryState>,
    copy_id: String,
    before_id: Option<String>,
) -> Result<(), AppError> {
    run(state.inner().clone(), move |service| {
        service.move_copy(&copy_id, before_id.as_deref())
    })
    .await
}
#[tauri::command]
pub async fn library_list(
    state: tauri::State<'_, LibraryState>,
    query: LibraryQuery,
) -> Result<LibrarySnapshot, AppError> {
    run(state.inner().clone(), move |service| service.list(query)).await
}
#[tauri::command]
pub async fn library_create(
    state: tauri::State<'_, LibraryState>,
    request: CreateCopy,
) -> Result<String, AppError> {
    run(state.inner().clone(), move |service| {
        service.create(request)
    })
    .await
}
#[tauri::command]
pub async fn library_update(
    state: tauri::State<'_, LibraryState>,
    request: UpdateCopy,
) -> Result<String, AppError> {
    run(state.inner().clone(), move |service| {
        service.update(request)
    })
    .await
}
#[tauri::command]
pub async fn library_delete(
    state: tauri::State<'_, LibraryState>,
    request: DeleteCopy,
) -> Result<String, AppError> {
    run(state.inner().clone(), move |service| {
        service.delete(request)
    })
    .await
}
#[tauri::command]
pub async fn library_backup(state: tauri::State<'_, LibraryState>) -> Result<String, AppError> {
    run(state.inner().clone(), |service| service.backup()).await
}
#[tauri::command]
pub async fn library_update_edition(
    state: tauri::State<'_, LibraryState>,
    request: UpdateEdition,
) -> Result<String, AppError> {
    run(state.inner().clone(), move |service| {
        service.update_edition(request)
    })
    .await
}
#[tauri::command]
pub async fn library_cover(
    state: tauri::State<'_, LibraryState>,
    asset_id: String,
) -> Result<String, AppError> {
    run(state.inner().clone(), move |service| {
        service.cover(asset_id)
    })
    .await
}
#[tauri::command]
pub async fn library_backups(
    state: tauri::State<'_, LibraryState>,
) -> Result<Vec<BackupEntry>, AppError> {
    run(state.inner().clone(), |service| service.backups()).await
}
#[tauri::command]
pub async fn library_prepare_restore(
    state: tauri::State<'_, LibraryState>,
    path: String,
) -> Result<RestorePreview, AppError> {
    run(state.inner().clone(), move |service| {
        service.prepare_restore(path)
    })
    .await
}
#[tauri::command]
pub async fn library_restore(
    state: tauri::State<'_, LibraryState>,
    optical: tauri::State<'_, crate::optical::OpticalState>,
    playback: tauri::State<'_, crate::playback::PlaybackState>,
    token: String,
) -> Result<String, AppError> {
    let library = state.inner().clone();
    let playback = playback.inner().clone();
    crate::optical::run(optical.inner().clone(), move |_| {
        if crate::playback::active(&playback)? {
            return Err(AppError::new("player", "请先停止播放再恢复收藏。"));
        }
        crate::playback::shutdown(&playback);
        let mut library = library
            .lock()
            .map_err(|_| AppError::new("storage", "收藏库不可访问。"))?;
        let service = library.as_mut().map_err(|e| e.clone())?;
        let backup = service.restore(token)?;
        service.interrupt_playback()?;
        Ok(backup)
    })
    .await
}

#[tauri::command]
pub async fn library_model(
    state: tauri::State<'_, LibraryState>,
    asset_id: String,
    preview: bool,
) -> Result<String, AppError> {
    run(state.inner().clone(), move |service| {
        service.model(asset_id, preview)
    })
    .await
}
