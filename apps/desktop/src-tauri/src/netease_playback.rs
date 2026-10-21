use crate::{
    commands::{self, LibraryState},
    data_location::DataLocation,
    integration_settings,
    playback::PlaybackState,
    playback_backend::PlaybackSession,
};
use discatelier_contracts::{AppError, PlaybackRecord, PlaybackSnapshot, PlaybackSource};
use discatelier_provider_netease as provider;
use std::sync::Arc;
use tauri::Manager;

#[tauri::command]
pub async fn netease_play(
    window: tauri::WebviewWindow,
    edition_id: String,
    song_id: u64,
) -> Result<PlaybackSnapshot, AppError> {
    let library = window.state::<LibraryState>().inner().clone();
    let directory = window.state::<DataLocation>().0.clone();
    let runtime = window
        .state::<Arc<discatelier_netease_runtime::Runtime>>()
        .inner()
        .clone();
    let player = window.state::<PlaybackState>().inner().clone();
    let video_window = window
        .state::<crate::video_surface::VideoSurface>()
        .handle();
    let app = window.app_handle().clone();
    let edition = edition_id.clone();
    let (media_token, title) = commands::run(library.clone(), move |service| {
        let albums = service.music_albums(&edition)?;
        let links = service.song_links(&edition)?;
        let track = links
            .iter()
            .find(|l| l.song.id == song_id)
            .map(|l| &l.song)
            .or_else(|| {
                albums
                    .iter()
                    .flat_map(|a| &a.album.tracks)
                    .find(|t| t.id == song_id)
            })
            .ok_or_else(|| AppError::new("netease", "歌曲关联已改变，请重新打开收藏资料。"))?;
        Ok((
            if albums.len() == 1 {
                albums[0].album.album_id.to_string()
            } else {
                edition
            },
            track.title.clone(),
        ))
    })
    .await?;
    tauri::async_runtime::spawn_blocking(move || {
        let settings = integration_settings::read(&directory)?;
        let vlc = discatelier_player_vlc::configured(&crate::playback_settings::read(&directory)?)?;
        let stream = if settings.netease_mode == integration_settings::NeteaseMode::Builtin {
            let mut arguments = serde_json::json!({"id":song_id});
            if let Some(cookie) = crate::netease_auth::credentials::playback_cookie()? {
                arguments["cookie"] = cookie.into();
            }
            provider::parse_song_stream(runtime.request("songUrl", arguments)?, song_id)?
        } else {
            provider::song_stream(&settings.netease_base_url, song_id)?
        };
        if app
            .state::<crate::playback_exit::PlaybackExit>()
            .is_closing()
        {
            return Err(AppError::new("player", "应用正在关闭。"));
        }
        let mut current = player
            .lock()
            .map_err(|_| AppError::new("player", "播放服务不可用。"))?;
        if current.as_ref().is_some_and(|s| {
            s.snapshot()
                .is_ok_and(|s| s.phase.active() && !s.source.playlist.starts_with("netease-song:"))
        }) {
            return Err(AppError::new("player", "请先停止当前光盘播放。"));
        }
        let source = PlaybackSource {
            mount_point: edition_id,
            media_token,
            playlist: format!("netease-song:{song_id}"),
            label: if stream.preview {
                format!("{title} · 试听")
            } else {
                title
            },
        };
        let checkpoint = Arc::new(move |snapshot: &PlaybackSnapshot| {
            let mut library = library
                .lock()
                .map_err(|_| AppError::new("history", "收藏库不可访问。"))?;
            library
                .as_mut()
                .map_err(|e| e.clone())?
                .save_playback(&PlaybackRecord::from(snapshot))
        });
        drop(current.take());
        let session = discatelier_player_vlc::VlcSession::start_stream(
            vlc,
            video_window,
            source,
            stream.url,
            checkpoint,
        )?;
        let snapshot = session.snapshot()?;
        *current = Some(PlaybackSession::Vlc(session));
        Ok(snapshot)
    })
    .await
    .map_err(|_| AppError::new("player", "网易云播放未完成。"))?
}
