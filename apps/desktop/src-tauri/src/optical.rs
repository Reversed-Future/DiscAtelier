use discatelier_application::{OpticalDeviceProvider, OpticalPlaybackProbe};
use discatelier_contracts::{
    AppError, DvdChapter, LibraryQuery, OpticalBinding, OpticalCandidate, OpticalDrive,
    OpticalKind, OpticalPresence, PlaybackDiagnostic, PlaybackSettings, PlaybackSource,
};
use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use tauri::Manager;

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
pub(crate) fn bluray_libraries(
    window: &tauri::WebviewWindow,
) -> Result<(PathBuf, PathBuf), AppError> {
    let packaged = window
        .path()
        .resource_dir()
        .map_err(|_| AppError::new("player", "无法定位应用资源目录。"))?
        .join("aacs");
    let directory = if packaged.join("libaacs.dll").is_file() {
        packaged
    } else {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("aacs")
    };
    let aacs = directory.join("libaacs.dll");
    let bdplus = directory.join("libbdplus.dll");
    if !aacs.is_file() || !bdplus.is_file() {
        return Err(AppError::new(
            "player",
            "安装包缺少 libaacs/libbdplus，无法使用本地蓝光解密。",
        ));
    }
    Ok((aacs, bdplus))
}
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
pub async fn optical_eject(
    state: tauri::State<'_, OpticalState>,
    playback: tauri::State<'_, crate::playback::PlaybackState>,
    mount_point: String,
) -> Result<(), AppError> {
    if crate::playback::active(&playback)? {
        return Err(AppError::new("player", "请先停止播放再弹出光驱。"));
    }
    run(state.inner().clone(), move |_| {
        discatelier_optical_windows::eject(&mount_point)
    })
    .await
}
#[tauri::command]
pub async fn optical_probe(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, OpticalState>,
    playback: tauri::State<'_, crate::playback::PlaybackState>,
    mount_point: String,
    token: String,
    playlist: String,
) -> Result<PlaybackDiagnostic, AppError> {
    let playback = playback.inner().clone();
    let (libaacs, libbdplus) = bluray_libraries(&window)?;
    run(state.inner().clone(), move |directory| {
        if crate::playback::active(&playback)? {
            return Err(AppError::new("player", "请先停止播放再运行诊断。"));
        }
        verify_disc(&mount_point, &token, &playlist)?;
        let settings = crate::playback_settings::read(directory)?;
        let result = discatelier_player_mpv::MpvProbe::configured(&settings)?
            .with_bluray_libraries(libaacs, libbdplus)?
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
                    OpticalKind::Bluray => {
                        playlist == discatelier_player_vlc::BD_MENU
                            || m.playlists.iter().any(|p| p == playlist)
                    }
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

#[tauri::command]
pub async fn optical_candidates(
    library: tauri::State<'_, crate::commands::LibraryState>,
    label: String,
    query: String,
) -> Result<Vec<OpticalCandidate>, AppError> {
    if label.len() > 512 || query.len() > 1000 {
        return Err(AppError::new("validation", "光盘标题查询条件无效。"));
    }
    let query = query.trim().to_string();
    crate::commands::run(library.inner().clone(), move |service| {
        let mut copies = Vec::new();
        for category in ["music", "video"] {
            copies.extend(
                service
                    .list(LibraryQuery {
                        category_id: category.into(),
                        status: Some("owned".into()),
                        query: query.clone(),
                    })?
                    .copies,
            );
        }
        Ok(crate::optical_match::candidates(copies, &label))
    })
    .await
}

#[tauri::command]
pub async fn optical_associate(
    library: tauri::State<'_, crate::commands::LibraryState>,
    media_token: String,
    copy_id: String,
    label: String,
    disc_key: Option<String>,
) -> Result<OpticalBinding, AppError> {
    crate::commands::run(library.inner().clone(), move |service| {
        service.save_optical_disc_binding(&media_token, &copy_id, &label, disc_key.as_deref())?;
        service
            .optical_binding(&media_token)?
            .ok_or_else(|| AppError::new("storage", "光盘关联未保存。"))
    })
    .await
}

#[tauri::command]
pub async fn optical_discs(
    library: tauri::State<'_, crate::commands::LibraryState>,
    edition_id: String,
) -> Result<Vec<discatelier_contracts::OpticalDisc>, AppError> {
    crate::commands::run(library.inner().clone(), move |service| {
        service.edition_discs(&edition_id)
    })
    .await
}

#[tauri::command]
pub async fn optical_dvd_chapters(
    state: tauri::State<'_, OpticalState>,
    mount_point: String,
    token: String,
    title: u32,
) -> Result<Vec<DvdChapter>, AppError> {
    if !(1..=9999).contains(&title) {
        return Err(AppError::new("validation", "DVD 标题号无效。"));
    }
    run(state.inner().clone(), move |_| {
        let source = verify_disc(&mount_point, &token, discatelier_player_vlc::DVD_MENU)?;
        let root = PathBuf::from(format!("{}\\", source.mount_point));
        discatelier_optical_windows::dvd::chapters(&root, title)
    })
    .await
}

#[tauri::command]
pub async fn optical_unbind(
    library: tauri::State<'_, crate::commands::LibraryState>,
    media_token: String,
) -> Result<(), AppError> {
    crate::commands::run(library.inner().clone(), move |service| {
        service.remove_optical_binding(&media_token)
    })
    .await
}

#[tauri::command]
pub async fn optical_presence(
    library: tauri::State<'_, crate::commands::LibraryState>,
    playback: tauri::State<'_, crate::playback::PlaybackState>,
) -> Result<Vec<OpticalPresence>, AppError> {
    let drives = tauri::async_runtime::spawn_blocking(|| {
        discatelier_optical_windows::WindowsOptical.enumerate()
    })
    .await
    .map_err(|_| AppError::new("device", "光驱读取未完成。"))??;
    let playing = playback
        .lock()
        .map_err(|_| AppError::new("player", "播放服务不可用。"))?
        .as_ref()
        .and_then(|session| session.snapshot().ok())
        .filter(|snapshot| snapshot.phase.active())
        .map(|snapshot| snapshot.source.media_token);
    let media = drives
        .into_iter()
        .filter_map(|drive| {
            drive
                .medium
                .map(|medium| (drive.name, drive.mount_point, medium))
        })
        .collect::<Vec<_>>();
    crate::commands::run(library.inner().clone(), move |service| {
        let mut result = Vec::new();
        for (drive, mount_point, medium) in media {
            let Some(binding) = service.optical_binding(&medium.token)? else {
                continue;
            };
            result.push(OpticalPresence {
                copy_id: binding.copy_id,
                title: binding.title,
                creator: binding.creator,
                drive,
                mount_point,
                media_token: medium.token.clone(),
                label: medium.label,
                playing: playing.as_deref() == Some(medium.token.as_str()),
                disc_key: binding.disc_key,
                disc_label: binding.disc_label,
            });
        }
        Ok(result)
    })
    .await
}
