use crate::{
    commands::LibraryState,
    optical::{verify_disc, OpticalState},
};
use discatelier_contracts::*;
use discatelier_player_mpv::{Checkpoint, MpvProbe, MpvSession};
use std::sync::{Arc, Mutex};
use tauri::Manager;

use crate::playback_backend::PlaybackSession;
pub type PlaybackState = Arc<Mutex<Option<PlaybackSession>>>;
pub fn active(state: &PlaybackState) -> Result<bool, AppError> {
    state
        .lock()
        .map_err(|_| AppError::new("player", "播放服务不可用。"))?
        .as_ref()
        .map(|session| session.snapshot().map(|s| s.phase.active()))
        .transpose()
        .map(|s| s.unwrap_or(false))
}
pub fn shutdown(state: &PlaybackState) {
    let session = state.lock().ok().and_then(|mut current| current.take());
    drop(session);
}
#[tauri::command]
pub async fn playback_start(
    optical: tauri::State<'_, OpticalState>,
    window: tauri::WebviewWindow,
    mount_point: String,
    token: String,
    playlist: String,
    resume_seconds: f64,
    resume_title: Option<i32>,
) -> Result<PlaybackSnapshot, AppError> {
    if window
        .state::<crate::playback_exit::PlaybackExit>()
        .is_closing()
    {
        return Err(AppError::new("player", "应用正在关闭。"));
    }
    let player = window.state::<PlaybackState>().inner().clone();
    let library = window.state::<LibraryState>().inner().clone();
    let cd_metadata = optical.inner().clone();
    let video_window = window
        .state::<crate::video_surface::VideoSurface>()
        .handle();
    let resources = window.clone();
    crate::optical::run(optical.inner().clone(), move |directory| {
        let mut current = player
            .lock()
            .map_err(|_| AppError::new("player", "播放服务不可用。"))?;
        let same_cd = current
            .as_ref()
            .and_then(|s| s.snapshot().ok())
            .is_some_and(|s| {
                discatelier_player_vlc::cd_track(&s.source.playlist).is_some()
                    && discatelier_player_vlc::cd_track(&playlist).is_some()
                    && s.source.mount_point == mount_point
                    && s.source.media_token == token
            });
        if !same_cd
            && current
                .as_ref()
                .is_some_and(|s| s.snapshot().is_ok_and(|s| s.phase.active()))
        {
            return Err(AppError::new("player", "请先停止当前播放。"));
        }
        let mut settings = crate::playback_settings::read(directory)?;
        if settings.vlc_library.trim().is_empty() {
            if let Some(path) = crate::bundled_runtime::vlc_library(window.app_handle()) {
                settings.vlc_library = path.to_string_lossy().into_owned();
            }
        }
        #[cfg(feature = "performance-harness")]
        let fixture = crate::playback_fixture::resolve(directory, &mount_point, &token, &playlist)?;
        #[cfg(feature = "performance-harness")]
        let source = match &fixture {
            Some((source, _)) => source.clone(),
            None => verify_disc(&mount_point, &token, &playlist)?,
        };
        #[cfg(not(feature = "performance-harness"))]
        let source = verify_disc(&mount_point, &token, &playlist)?;
        let cd_history = cd_metadata.clone();
        let checkpoint: Checkpoint = Arc::new(move |snapshot| {
            let record = PlaybackRecord::from(&crate::cd_metadata::decorate_snapshot(
                &cd_history,
                snapshot.clone(),
            ));
            let mut library = library
                .lock()
                .map_err(|_| AppError::new("history", "收藏库不可访问。"))?;
            library
                .as_mut()
                .map_err(|e| e.clone())?
                .save_playback(&record)
        });
        let vlc = source.playlist == discatelier_player_vlc::DVD_MENU
            || source.playlist == discatelier_player_vlc::BD_MENU
            || discatelier_player_vlc::cd_track(&source.playlist).is_some();
        let vlc_path = if vlc {
            Some(discatelier_player_vlc::configured(&settings)?)
        } else {
            None
        };
        // Verification completes before an existing CD session is stopped.
        if same_cd {
            drop(current.take());
        }
        let session = if let Some(path) = vlc_path {
            PlaybackSession::Vlc(discatelier_player_vlc::VlcSession::start(
                path,
                video_window,
                source,
                resume_seconds,
                resume_title,
                checkpoint,
            )?)
        } else {
            if resume_title.is_some() {
                return Err(AppError::new("validation", "BD 不使用 DVD 标题编号。"));
            }
            let (libaacs, libbdplus) = crate::optical::bluray_libraries(&resources)?;
            let config = MpvProbe::configured(&settings)?
                .with_bluray_libraries(libaacs, libbdplus)?
                .embedded(video_window)?;
            #[cfg(feature = "performance-harness")]
            let config = match fixture {
                Some((_, file)) => config.with_fixture(file)?,
                None => config,
            };
            PlaybackSession::Mpv(MpvSession::start(
                config,
                source,
                resume_seconds,
                directory.to_owned(),
                checkpoint,
            )?)
        };
        let snapshot = crate::cd_metadata::decorate_snapshot(&cd_metadata, session.snapshot()?);
        *current = Some(session);
        Ok(snapshot)
    })
    .await
}
#[tauri::command]
pub async fn playback_start_local(
    window: tauri::WebviewWindow,
    copy_id: String,
    path: String,
) -> Result<PlaybackSnapshot, AppError> {
    if window
        .state::<crate::playback_exit::PlaybackExit>()
        .is_closing()
    {
        return Err(AppError::new("player", "应用正在关闭。"));
    }
    let player = window.state::<PlaybackState>().inner().clone();
    let library = window.state::<LibraryState>().inner().clone();
    let directory = window
        .state::<crate::data_location::DataLocation>()
        .0
        .clone();
    let binding = crate::local_files::find(&directory, &copy_id, &path)?;
    let mut current = player
        .lock()
        .map_err(|_| AppError::new("player", "播放服务不可用。"))?;
    if let Some(session) = current.as_ref() {
        if session
            .snapshot()
            .is_ok_and(|snapshot| snapshot.phase.active())
        {
            let local = session
                .snapshot()
                .is_ok_and(|snapshot| snapshot.source.playlist.starts_with("local:"));
            if !local {
                return Err(AppError::new("player", "请先停止当前播放。"));
            }
        }
    }
    drop(current.take());
    let settings = crate::playback_settings::read(&directory)?;
    let video_window = window
        .state::<crate::video_surface::VideoSurface>()
        .handle();
    let config = MpvProbe::configured(&settings)?.embedded(video_window)?;
    let source = PlaybackSource {
        mount_point: copy_id.clone(),
        media_token: if crate::local_files::is_audio(&path) {
            "local-audio"
        } else {
            "local-video"
        }
        .into(),
        playlist: format!("local:{path}"),
        label: binding.label,
    };
    let checkpoint: Checkpoint = Arc::new(move |snapshot| {
        let record = PlaybackRecord::from(snapshot);
        let mut library = library
            .lock()
            .map_err(|_| AppError::new("history", "收藏库不可访问。"))?;
        library
            .as_mut()
            .map_err(|error| error.clone())?
            .save_playback(&record)
    });
    let session = MpvSession::start(config, source, 0.0, directory, checkpoint)?;
    let snapshot = session.snapshot()?;
    *current = Some(PlaybackSession::Mpv(session));
    Ok(snapshot)
}
#[tauri::command]
pub async fn playback_snapshot(
    playback: tauri::State<'_, PlaybackState>,
    optical: tauri::State<'_, OpticalState>,
) -> Result<Option<PlaybackSnapshot>, AppError> {
    let playback = playback.inner().clone();
    let optical = optical.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        playback
            .lock()
            .map_err(|_| AppError::new("player", "播放服务不可用。"))?
            .as_ref()
            .map(|s| {
                s.snapshot()
                    .map(|snapshot| crate::cd_metadata::decorate_snapshot(&optical, snapshot))
            })
            .transpose()
    })
    .await
    .map_err(|_| AppError::new("player", "播放状态不可读取。"))?
}
#[tauri::command]
pub async fn playback_control(
    playback: tauri::State<'_, PlaybackState>,
    session_id: String,
    control: PlaybackControl,
) -> Result<(), AppError> {
    let playback = playback.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let current = playback
            .lock()
            .map_err(|_| AppError::new("player", "播放服务不可用。"))?;
        current
            .as_ref()
            .ok_or_else(|| AppError::new("session", "没有正在播放的会话。"))?
            .control(&session_id, control)
    })
    .await
    .map_err(|_| AppError::new("player", "播放操作未完成。"))?
}
#[tauri::command]
pub async fn playback_history(
    library: tauri::State<'_, LibraryState>,
) -> Result<Vec<PlaybackRecord>, AppError> {
    crate::commands::run(library.inner().clone(), |service| {
        service.playback_history()
    })
    .await
}
