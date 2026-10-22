use discatelier_application::{OpticalDeviceProvider, OpticalPlaybackProbe};
use discatelier_contracts::{
    AppError, OpticalDrive, OpticalKind, PlaybackDiagnostic, PlaybackSettings, PlaybackSource,
};
use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

pub struct OpticalService {
    pub(crate) directory: PathBuf,
    gate: Mutex<()>,
    pub(crate) cd_metadata: Mutex<crate::cd_metadata::Cache>,
    pub(crate) cd_metadata_gate: Mutex<()>,
}
impl OpticalService {
    pub fn new(directory: PathBuf) -> Self {
        Self {
            directory,
            gate: Mutex::new(()),
            cd_metadata: Mutex::default(),
            cd_metadata_gate: Mutex::default(),
        }
    }
}
pub type OpticalState = Arc<OpticalService>;
pub(crate) async fn run<T: Send + 'static>(
    state: OpticalState,
    action: impl FnOnce(&Path) -> Result<T, AppError> + Send + 'static,
) -> Result<T, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = state
            .gate
            .lock()
            .map_err(|_| AppError::new("device", "光驱服务不可用。"))?;
        action(&state.directory)
    })
    .await
    .map_err(|_| AppError::new("device", "光驱读取未完成。"))?
}
#[tauri::command]
pub async fn optical_list(
    state: tauri::State<'_, OpticalState>,
) -> Result<Vec<OpticalDrive>, AppError> {
    run(state.inner().clone(), |_| {
        discatelier_optical_windows::WindowsOptical.enumerate()
    })
    .await
}
#[tauri::command]
pub async fn optical_probe(
    state: tauri::State<'_, OpticalState>,
    playback: tauri::State<'_, crate::playback::PlaybackState>,
    mount_point: String,
    token: String,
    playlist: String,
) -> Result<PlaybackDiagnostic, AppError> {
    let playback = playback.inner().clone();
    run(state.inner().clone(), move |directory| {
        if crate::playback::active(&playback)? {
            return Err(AppError::new("player", "请先停止播放再运行诊断。"));
        }
        verify_disc(&mount_point, &token, &playlist)?;
        let settings = crate::playback_settings::read(directory)?;
        let result = discatelier_player_mpv::MpvProbe::configured(&settings)?
            .probe(&mount_point, &playlist)?;
        verify_disc(&mount_point, &token, &playlist)?;
        Ok(result)
    })
    .await
}

pub(crate) fn verify_disc(
    mount_point: &str,
    token: &str,
    playlist: &str,
) -> Result<PlaybackSource, AppError> {
    let drives = discatelier_optical_windows::WindowsOptical.enumerate()?;
    for drive in drives {
        if drive.mount_point != mount_point {
            continue;
        }
        if let Some(medium) = drive.medium.filter(|m| {
            m.token == token
                && match m.kind {
                    OpticalKind::AudioCd => m.playlists.iter().any(|p| p == playlist),
                    OpticalKind::Bluray => m.playlists.iter().any(|p| p == playlist),
                    OpticalKind::DvdVideo => playlist == discatelier_player_vlc::DVD_MENU,
                    OpticalKind::Other => false,
                }
        }) {
            return Ok(PlaybackSource {
                mount_point: drive.mount_point,
                media_token: medium.token,
                playlist: playlist.into(),
                label: medium.label,
            });
        }
    }
    Err(AppError::new("mediaChanged", "光盘已变化，请刷新后重试。"))
}

#[tauri::command]
pub async fn playback_settings_get(
    state: tauri::State<'_, OpticalState>,
) -> Result<PlaybackSettings, AppError> {
    run(state.inner().clone(), crate::playback_settings::read).await
}

#[tauri::command]
pub async fn playback_settings_save(
    state: tauri::State<'_, OpticalState>,
    settings: PlaybackSettings,
) -> Result<(), AppError> {
    run(state.inner().clone(), move |directory| {
        crate::playback_settings::save(directory, &settings)
    })
    .await
}
