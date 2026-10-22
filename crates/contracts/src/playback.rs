use serde::{Deserialize, Serialize};

/// App-defined physical client coordinates. Native handles never come from the webview.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VideoViewport {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub visible: bool,
    #[serde(default)]
    pub interactive: bool,
    #[serde(default)]
    pub clip_top: i32,
    #[serde(default)]
    pub clip_bottom: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlaybackSource {
    pub mount_point: String,
    pub media_token: String,
    pub playlist: String,
    pub label: String,
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PlaybackPhase {
    Loading,
    Playing,
    Paused,
    Buffering,
    Stopping,
    Stopped,
    Ended,
    Failed,
    Interrupted,
}
impl PlaybackPhase {
    pub fn active(&self) -> bool {
        matches!(
            self,
            Self::Loading | Self::Playing | Self::Paused | Self::Buffering | Self::Stopping
        )
    }
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioTrack {
    pub id: i64,
    pub title: String,
    pub language: String,
    pub codec: String,
    pub channels: Option<u64>,
    pub selected: bool,
}
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PlaybackMode {
    #[default]
    LocalAacs,
    MakeMkvFallback,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackSnapshot {
    pub session_id: String,
    pub source: PlaybackSource,
    pub title: String,
    pub started_at: String,
    pub updated_at: String,
    pub phase: PlaybackPhase,
    pub position_seconds: f64,
    pub duration_seconds: Option<f64>,
    pub watched_seconds: f64,
    pub completed: bool,
    pub paused: bool,
    pub seeking: bool,
    pub seekable: bool,
    pub audio_tracks: Vec<AudioTrack>,
    pub selected_audio: Option<i64>,
    #[serde(default = "default_volume")]
    pub volume: u16,
    #[serde(default = "default_rate")]
    pub rate: f64,
    #[serde(default)]
    pub dvd_title: Option<i32>,
    #[serde(default)]
    pub dvd_menu: bool,
    #[serde(default)]
    pub playback_mode: PlaybackMode,
    pub error: Option<String>,
}
fn default_volume() -> u16 {
    100
}
fn default_rate() -> f64 {
    1.0
}
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MenuDirection {
    Activate,
    Up,
    Down,
    Left,
    Right,
    Root,
}
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "action", rename_all = "camelCase", deny_unknown_fields)]
pub enum PlaybackControl {
    Pause { paused: bool },
    Seek { seconds: f64 },
    Volume { volume: u16 },
    Rate { rate: f64 },
    Audio { id: i64 },
    Menu { direction: MenuDirection },
    Stop,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackRecord {
    pub session_id: String,
    pub source: PlaybackSource,
    pub title: String,
    pub started_at: String,
    pub updated_at: String,
    pub phase: PlaybackPhase,
    pub position_seconds: f64,
    pub duration_seconds: Option<f64>,
    pub watched_seconds: f64,
    pub completed: bool,
    pub selected_audio: Option<i64>,
    #[serde(default)]
    pub dvd_title: Option<i32>,
    #[serde(default)]
    pub playback_mode: PlaybackMode,
}
impl From<&PlaybackSnapshot> for PlaybackRecord {
    fn from(s: &PlaybackSnapshot) -> Self {
        Self {
            session_id: s.session_id.clone(),
            source: s.source.clone(),
            title: s.title.clone(),
            started_at: s.started_at.clone(),
            updated_at: s.updated_at.clone(),
            phase: s.phase.clone(),
            position_seconds: s.position_seconds,
            duration_seconds: s.duration_seconds,
            watched_seconds: s.watched_seconds,
            completed: s.completed,
            selected_audio: s.selected_audio,
            dvd_title: s.dvd_title,
            playback_mode: s.playback_mode,
        }
    }
}
