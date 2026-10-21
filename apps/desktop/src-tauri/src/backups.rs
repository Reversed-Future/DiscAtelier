use crate::{commands::LibraryState, data_location::DataLocation};
use discatelier_contracts::{AppError, BackupInventory};
use discatelier_storage::backup_management;
use std::path::PathBuf;

async fn run<T: Send + 'static>(
    state: LibraryState,
    directory: PathBuf,
    task: impl FnOnce(&std::path::Path) -> Result<T, AppError> + Send + 'static,
) -> Result<T, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        // Lock even when the library cannot open (e.g. a newer database schema).
        // This also excludes this application's backup, restore and update writes.
        let _guard = state
            .lock()
            .map_err(|_| AppError::new("storage", "收藏服务不可用，请重启应用。"))?;
        task(&directory)
    })
    .await
    .map_err(|_| AppError::new("backup", "备份操作未完成，请刷新列表。"))?
}

#[tauri::command]
pub async fn backup_inventory(
    state: tauri::State<'_, LibraryState>,
    location: tauri::State<'_, DataLocation>,
) -> Result<BackupInventory, AppError> {
    run(
        state.inner().clone(),
        location.0.clone(),
        backup_management::inventory,
    )
    .await
}

#[tauri::command]
pub async fn backup_delete_one(
    state: tauri::State<'_, LibraryState>,
    location: tauri::State<'_, DataLocation>,
    name: String,
    stamp: String,
) -> Result<(), AppError> {
    run(
        state.inner().clone(),
        location.0.clone(),
        move |directory| backup_management::delete_one(directory, &name, &stamp),
    )
    .await
}
