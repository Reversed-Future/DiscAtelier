mod credentials;
mod github;
#[cfg(test)]
mod signature_tests;

use crate::{commands::LibraryState, optical::OpticalState, playback::PlaybackState};
use discatelier_contracts::AppError;
use github::error;
use serde::Serialize;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use tauri::{ipc::Channel, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Default)]
pub struct UpdateState {
    busy: AtomicBool,
    pending: Mutex<Option<Pending>>,
}
struct Pending {
    update: Update,
    size: u64,
    bytes: Option<Arc<Vec<u8>>>,
}
struct Operation<'a>(&'a AtomicBool);
impl UpdateState {
    fn begin(&self) -> Result<Operation<'_>, AppError> {
        self.busy
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map_err(|_| error("更新操作正在进行。"))?;
        Ok(Operation(&self.busy))
    }
}
impl Drop for Operation<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::Release);
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    current_version: String,
    configured: bool,
    available: Option<Available>,
}
#[derive(Serialize)]
pub struct Available {
    version: String,
    notes: String,
    ready: bool,
}
#[derive(Clone, Serialize)]
pub struct Progress {
    received: u64,
    total: Option<u64>,
}

#[tauri::command]
pub fn update_status(
    app: tauri::AppHandle,
    state: tauri::State<'_, UpdateState>,
) -> Result<UpdateStatus, AppError> {
    let pending = state
        .pending
        .lock()
        .map_err(|_| error("更新服务不可用。"))?;
    Ok(UpdateStatus {
        current_version: app.package_info().version.to_string(),
        configured: credentials::read()?.is_some(),
        available: pending.as_ref().map(|p| Available {
            version: p.update.version.clone(),
            notes: p.update.body.clone().unwrap_or_default(),
            ready: p.bytes.is_some(),
        }),
    })
}
#[tauri::command]
pub fn update_save_token(
    state: tauri::State<'_, UpdateState>,
    token: String,
) -> Result<(), AppError> {
    let _operation = state.begin()?;
    credentials::save(&token)?;
    *state
        .pending
        .lock()
        .map_err(|_| error("更新服务不可用。"))? = None;
    Ok(())
}
#[tauri::command]
pub fn update_forget_token(state: tauri::State<'_, UpdateState>) -> Result<(), AppError> {
    let _operation = state.begin()?;
    credentials::forget()?;
    *state
        .pending
        .lock()
        .map_err(|_| error("更新服务不可用。"))? = None;
    Ok(())
}
#[tauri::command]
pub async fn update_check(
    app: tauri::AppHandle,
    state: tauri::State<'_, UpdateState>,
) -> Result<UpdateStatus, AppError> {
    let _operation = state.begin()?;
    *state
        .pending
        .lock()
        .map_err(|_| error("更新服务不可用。"))? = None;
    let token = credentials::read()?.ok_or_else(|| error("请先配置 GitHub Token。"))?;
    let client = github::client()?;
    let release: github::Release = serde_json::from_slice(
        &github::read(&client, github::LATEST, &token, 2 * 1024 * 1024, |_, _| {}).await?,
    )
    .map_err(|_| error("GitHub 发行信息无效。"))?;
    if github::version(&release)? > app.package_info().version {
        let asset = github::asset(&release, "latest.json", 256 * 1024)?;
        let manifest = serde_json::from_slice(
            &github::read(&client, &asset.url, &token, asset.size, |_, _| {}).await?,
        )
        .map_err(|_| error("更新清单无效。"))?;
        let size = github::validate_manifest(&release, &manifest)?;
        let updater = app
            .updater_builder()
            .build()
            .map_err(|_| error("更新配置无效。"))?;
        let update = updater
            .restore_update(manifest)
            .map_err(|_| error("无法读取签名更新信息。"))?
            .ok_or_else(|| error("没有可安装的新版本。"))?;
        *state
            .pending
            .lock()
            .map_err(|_| error("更新服务不可用。"))? = Some(Pending {
            update,
            size,
            bytes: None,
        });
    }
    update_status(app, state.clone())
}
#[tauri::command]
pub async fn update_download(
    app: tauri::AppHandle,
    state: tauri::State<'_, UpdateState>,
    on_progress: Channel<Progress>,
) -> Result<UpdateStatus, AppError> {
    let _operation = state.begin()?;
    let (update, size) = {
        let pending = state
            .pending
            .lock()
            .map_err(|_| error("更新服务不可用。"))?;
        let p = pending.as_ref().ok_or_else(|| error("请先检查更新。"))?;
        (p.update.clone(), p.size)
    };
    let token = credentials::read()?.ok_or_else(|| error("请先配置 GitHub Token。"))?;
    let mut last = std::time::Instant::now();
    let bytes = github::read(
        &github::client()?,
        update.download_url.as_str(),
        &token,
        size,
        |received, _| {
            if last.elapsed().as_millis() >= 100 || received == size {
                let _ = on_progress.send(Progress {
                    received,
                    total: Some(size),
                });
                last = std::time::Instant::now();
            }
        },
    )
    .await?;
    if bytes.len() as u64 != size {
        return Err(error("下载文件不完整，请重试。"));
    }
    update
        .verify(&bytes)
        .map_err(|_| error("更新签名校验失败，已拒绝安装。"))?;
    let mut pending = state
        .pending
        .lock()
        .map_err(|_| error("更新服务不可用。"))?;
    pending
        .as_mut()
        .ok_or_else(|| error("请重新检查更新。"))?
        .bytes = Some(Arc::new(bytes));
    drop(pending);
    update_status(app, state.clone())
}
#[tauri::command]
pub async fn update_install(
    app: tauri::AppHandle,
    directory: tauri::State<'_, crate::data_location::DataLocation>,
    state: tauri::State<'_, UpdateState>,
    optical: tauri::State<'_, OpticalState>,
    library: tauri::State<'_, LibraryState>,
    playback: tauri::State<'_, PlaybackState>,
) -> Result<(), AppError> {
    let _operation = state.begin()?;
    if app
        .state::<crate::playback_exit::PlaybackExit>()
        .is_closing()
    {
        return Err(error("应用正在关闭。"));
    }
    let (update, bytes) = {
        let mut pending = state
            .pending
            .lock()
            .map_err(|_| error("更新服务不可用。"))?;
        let p = pending.as_mut().ok_or_else(|| error("请先下载更新。"))?;
        (
            p.update.clone(),
            p.bytes.clone().ok_or_else(|| error("请先下载更新。"))?,
        )
    };
    let library = library.inner().clone();
    let playback = playback.inner().clone();
    let directory = directory.0.clone();
    // The shared optical gate prevents playback starting between the check and
    // installation. Hold the library lock through backup and installer launch.
    let result = crate::optical::run(optical.inner().clone(), move |_| {
        if crate::playback::active(&playback)? {
            return Err(error("请先停止播放再安装更新。"));
        }
        update
            .verify(&bytes)
            .map_err(|_| error("更新签名校验失败，已拒绝安装。"))?;
        crate::playback::shutdown(&playback);
        // Retain the write gate even when LibraryService failed to open a newer
        // schema. Backup uses SQLite's read-only snapshot API independently.
        let _library = library.lock().map_err(|_| error("收藏库不可访问。"))?;
        discatelier_storage::backup_for_update(&directory)?;
        update
            .install(bytes.as_slice())
            .map_err(|_| error("安装程序未能启动，请重新下载后重试。"))
    })
    .await;
    // Windows exits only after a successfully launched, verified installer.
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn operations_are_exclusive_and_errors_release_the_gate() {
        let state = UpdateState::default();
        let first = state.begin().unwrap();
        assert!(state.begin().is_err());
        drop(first);
        assert!(state.begin().is_ok());
    }
}
