//! Windows SMTC adapter. Native state is updated on the main window thread.
use discatelier_contracts::{AppError, PlaybackSnapshot};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};
use windows::{
    core::{factory, HSTRING},
    Foundation::{TimeSpan, TypedEventHandler},
    Media::*,
    Win32::{Foundation::HWND, System::WinRT::ISystemMediaTransportControlsInterop},
};

#[derive(Default)]
pub struct State(pub Mutex<Option<Controller>>);
#[derive(Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Metadata {
    pub session_id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub previous: bool,
    pub next: bool,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Command {
    session_id: String,
    action: &'static str,
    seconds: Option<f64>,
}
pub struct Controller {
    controls: SystemMediaTransportControls,
    button: i64,
    seek: i64,
    session: Arc<Mutex<String>>,
    metadata: String,
}
fn error(_: impl std::fmt::Display) -> AppError {
    AppError::new("smtc", "Windows 媒体控制不可用，请关闭 SMTC 或稍后重试。")
}
fn ticks(seconds: f64) -> TimeSpan {
    TimeSpan {
        Duration: (seconds.max(0.0) * 10_000_000.0).min(i64::MAX as f64) as i64,
    }
}
fn emit(
    app: &tauri::AppHandle,
    session: &Mutex<String>,
    action: &'static str,
    seconds: Option<f64>,
) {
    if let Ok(id) = session.lock() {
        if !id.is_empty() {
            let _ = app.emit_to(
                "main",
                "system-media-command",
                Command {
                    session_id: id.clone(),
                    action,
                    seconds,
                },
            );
        }
    }
}
impl Controller {
    fn new(window: &tauri::WebviewWindow) -> Result<Self, AppError> {
        let interop: ISystemMediaTransportControlsInterop =
            factory::<SystemMediaTransportControls, _>().map_err(error)?;
        let controls: SystemMediaTransportControls =
            unsafe { interop.GetForWindow(HWND(window.hwnd().map_err(error)?.0)) }
                .map_err(error)?;
        controls.SetIsEnabled(false).map_err(error)?;
        let session = Arc::new(Mutex::new(String::new()));
        let app = window.app_handle().clone();
        let id = session.clone();
        let button = controls
            .ButtonPressed(&TypedEventHandler::<
                SystemMediaTransportControls,
                SystemMediaTransportControlsButtonPressedEventArgs,
            >::new(move |_, args| {
                if let Some(args) = args.as_ref() {
                    let action = match args.Button()? {
                        SystemMediaTransportControlsButton::Play => Some("play"),
                        SystemMediaTransportControlsButton::Pause => Some("pause"),
                        SystemMediaTransportControlsButton::Stop => Some("stop"),
                        SystemMediaTransportControlsButton::Previous => Some("previous"),
                        SystemMediaTransportControlsButton::Next => Some("next"),
                        _ => None,
                    };
                    if let Some(action) = action {
                        emit(&app, &id, action, None);
                    }
                }
                Ok(())
            }))
            .map_err(error)?;
        let app = window.app_handle().clone();
        let id = session.clone();
        let seek =
            match controls.PlaybackPositionChangeRequested(&TypedEventHandler::<
                SystemMediaTransportControls,
                PlaybackPositionChangeRequestedEventArgs,
            >::new(move |_, args| {
                if let Some(args) = args.as_ref() {
                    emit(
                        &app,
                        &id,
                        "seek",
                        Some(args.RequestedPlaybackPosition()?.Duration as f64 / 10_000_000.0),
                    );
                }
                Ok(())
            })) {
                Ok(token) => token,
                Err(e) => {
                    let _ = controls.RemoveButtonPressed(button);
                    return Err(error(e));
                }
            };
        Ok(Self {
            controls,
            button,
            seek,
            session,
            metadata: String::new(),
        })
    }
    fn update(
        &mut self,
        snapshot: Option<&PlaybackSnapshot>,
        metadata: &Metadata,
    ) -> windows::core::Result<()> {
        let Some(s) = snapshot.filter(|s| s.phase.active()) else {
            self.session
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .clear();
            self.controls.SetIsEnabled(false)?;
            self.controls.DisplayUpdater()?.ClearAll()?;
            self.metadata.clear();
            return Ok(());
        };
        let matched = metadata.session_id == s.session_id;
        *self.session.lock().unwrap_or_else(|e| e.into_inner()) = s.session_id.clone();
        let title = if matched && !metadata.title.is_empty() {
            &metadata.title
        } else {
            &s.title
        };
        let artist = if matched {
            metadata.artist.as_str()
        } else {
            ""
        };
        let album = if matched { metadata.album.as_str() } else { "" };
        let identity = format!("{}\0{}\0{}\0{}", s.session_id, title, artist, album);
        if identity != self.metadata {
            let updater = self.controls.DisplayUpdater()?;
            updater.ClearAll()?;
            if s.source.media_token == "local-audio"
                || s.source.playlist.starts_with("netease-song:")
                || s.source.playlist.starts_with("cd-track:")
            {
                updater.SetType(MediaPlaybackType::Music)?;
                let music = updater.MusicProperties()?;
                music.SetTitle(&HSTRING::from(title))?;
                music.SetArtist(&HSTRING::from(artist))?;
                music.SetAlbumTitle(&HSTRING::from(album))?;
            } else {
                updater.SetType(MediaPlaybackType::Video)?;
                updater.VideoProperties()?.SetTitle(&HSTRING::from(title))?;
            }
            updater.Update()?;
            self.metadata = identity;
        }
        self.controls.SetIsPlayEnabled(true)?;
        self.controls.SetIsPauseEnabled(true)?;
        self.controls.SetIsStopEnabled(true)?;
        self.controls
            .SetIsPreviousEnabled(matched && metadata.previous)?;
        self.controls.SetIsNextEnabled(matched && metadata.next)?;
        self.controls.SetPlaybackStatus(if s.paused {
            MediaPlaybackStatus::Paused
        } else {
            MediaPlaybackStatus::Playing
        })?;
        self.controls.SetPlaybackRate(s.rate)?;
        let timeline = SystemMediaTransportControlsTimelineProperties::new()?;
        timeline.SetStartTime(ticks(0.0))?;
        timeline.SetMinSeekTime(ticks(if s.seekable { 0.0 } else { s.position_seconds }))?;
        let end = s
            .duration_seconds
            .unwrap_or(s.position_seconds)
            .max(s.position_seconds);
        timeline.SetEndTime(ticks(end))?;
        timeline.SetMaxSeekTime(ticks(if s.seekable { end } else { s.position_seconds }))?;
        timeline.SetPosition(ticks(s.position_seconds))?;
        self.controls.UpdateTimelineProperties(&timeline)?;
        self.controls.SetIsEnabled(true)
    }
}
impl Drop for Controller {
    fn drop(&mut self) {
        if let Ok(mut id) = self.session.lock() {
            id.clear();
        }
        let _ = self.controls.SetIsEnabled(false);
        let _ = self.controls.RemoveButtonPressed(self.button);
        let _ = self
            .controls
            .RemovePlaybackPositionChangeRequested(self.seek);
    }
}
pub fn shutdown(app: &tauri::AppHandle) {
    if let Some(state) = app.try_state::<State>() {
        if let Ok(mut controller) = state.0.lock() {
            controller.take();
        }
    }
}

pub async fn configure(window: tauri::WebviewWindow, enabled: bool) -> Result<(), AppError> {
    if window.label() != "main" {
        return Err(error("Invalid window"));
    }
    let (send, receive) = tokio::sync::oneshot::channel();
    let owner = window.clone();
    window
        .run_on_main_thread(move || {
            let result = (|| {
                if owner
                    .state::<crate::playback_exit::PlaybackExit>()
                    .is_closing()
                {
                    return Ok(());
                }
                let state = owner.state::<State>();
                let mut current = state.0.lock().map_err(error)?;
                if enabled && current.is_none() {
                    *current = Some(Controller::new(&owner)?);
                } else if !enabled {
                    current.take();
                }
                Ok(())
            })();
            let _ = send.send(result);
        })
        .map_err(error)?;
    receive.await.map_err(error)?
}
#[tauri::command]
pub async fn system_media_refresh(window: tauri::WebviewWindow) -> Result<bool, AppError> {
    let enabled =
        crate::playback_settings::read(&window.state::<crate::data_location::DataLocation>().0)?
            .smtc_enabled;
    configure(window, enabled).await?;
    Ok(enabled)
}
#[tauri::command]
pub async fn system_media_sync(
    window: tauri::WebviewWindow,
    metadata: Metadata,
) -> Result<(), AppError> {
    if window.label() != "main"
        || metadata.title.len() > 4000
        || metadata.artist.len() > 4000
        || metadata.album.len() > 4000
    {
        return Err(error("Invalid metadata"));
    }
    let player = window
        .state::<crate::playback::PlaybackState>()
        .inner()
        .clone();
    let snapshot = tauri::async_runtime::spawn_blocking(move || {
        player
            .lock()
            .map_err(error)?
            .as_ref()
            .map(|session| session.snapshot())
            .transpose()
    })
    .await
    .map_err(error)??;
    let owner = window.clone();
    let (send, receive) = tokio::sync::oneshot::channel();
    window
        .run_on_main_thread(move || {
            if owner
                .state::<crate::playback_exit::PlaybackExit>()
                .is_closing()
            {
                let _ = send.send(Ok(()));
                return;
            }
            let state = owner.state::<State>();
            let result = state.0.lock().map_err(error).and_then(|mut current| {
                if let Some(controller) = current.as_mut() {
                    controller
                        .update(snapshot.as_ref(), &metadata)
                        .map_err(error)
                } else {
                    Ok(())
                }
            });
            let _ = send.send(result);
        })
        .map_err(error)?;
    receive.await.map_err(error)?
}
