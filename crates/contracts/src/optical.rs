use serde::{Deserialize, Serialize};

/// Internal read-only device contract; mount points are not edition identities.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpticalDrive {
    pub mount_point: String,
    pub name: String,
    pub status: OpticalStatus,
    pub medium: Option<OpticalMedium>,
    pub error: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum OpticalStatus {
    Empty,
    Ready,
    Unavailable,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpticalMedium {
    pub label: String,
    #[serde(default)]
    pub disc_title: Option<String>,
    pub file_system: String,
    /// Volume serial and index hash detect stale probe results, not an edition ID.
    pub token: String,
    pub kind: OpticalKind,
    pub playlists: Vec<String>,
    #[serde(default)]
    pub tracks: Vec<CdTrack>,
    /// MusicBrainz Disc ID for audio CDs; absent for data media.
    #[serde(default)]
    pub disc_id: Option<String>,
    pub aacs_directory: bool,
    #[serde(default)]
    pub bdplus_directory: bool,
    pub java_directory: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum OpticalKind {
    AudioCd,
    Bluray,
    DvdVideo,
    Other,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CdTrack {
    pub number: u8,
    pub duration_seconds: f64,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackDiagnostic {
    pub status: String,
    pub message: String,
    pub details: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DvdChapter {
    pub index: u32,
    pub start_seconds: f64,
    pub duration_seconds: f64,
}
/// One seamless-branching play item in a Blu-ray playlist. Segment times are
/// relative to the playlist start and are derived from the read-only MPLS
/// metadata; they never authorize writing to or modifying the disc.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BluraySegment {
    pub index: u32,
    pub clip_id: String,
    pub start_seconds: f64,
    pub duration_seconds: f64,
    /// True for playlist connection conditions 5/6, where the player may read
    /// ahead into the next clip without a visible break.
    pub seamless: bool,
    pub angle_count: u8,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlurayChapter {
    pub index: u32,
    pub start_seconds: f64,
    pub duration_seconds: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlurayAudioStream {
    /// MPEG-TS PID; VLC also exposes this as the audio track id.
    pub pid: u16,
    pub language: String,
    pub codec: String,
    /// Exact for mono/stereo; MPLS "multi channel" is exposed as 6 because the
    /// playlist does not distinguish 5.1 from 7.1.
    pub channels: Option<u8>,
    pub format: u8,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlurayPlaylist {
    pub playlist: String,
    pub duration_seconds: f64,
    pub segments: Vec<BluraySegment>,
    pub chapters: Vec<BlurayChapter>,
    #[serde(default)]
    pub audio_streams: Vec<BlurayAudioStream>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpticalBinding {
    pub media_token: String,
    pub copy_id: String,
    pub title: String,
    pub creator: String,
    pub label: String,
    pub disc_key: Option<String>,
    pub disc_label: Option<String>,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpticalPresence {
    pub copy_id: String,
    pub title: String,
    pub creator: String,
    pub drive: String,
    pub mount_point: String,
    pub media_token: String,
    pub label: String,
    pub playing: bool,
    pub disc_key: Option<String>,
    pub disc_label: Option<String>,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpticalDisc {
    pub key: String,
    pub label: String,
    pub title: String,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpticalCandidate {
    pub copy_id: String,
    pub edition_id: String,
    pub title: String,
    pub creator: String,
    pub edition_label: String,
    pub category_id: String,
    pub score: u32,
    pub match_kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlaybackSettings {
    #[serde(default)]
    pub smtc_enabled: bool,
    pub mpv_executable: String,
    pub make_mkv_library: String,
    #[serde(default)]
    pub vlc_library: String,
    #[serde(default = "default_make_mkv_fallback")]
    pub make_mkv_fallback: bool,
}
fn default_make_mkv_fallback() -> bool {
    true
}
impl Default for PlaybackSettings {
    fn default() -> Self {
        Self {
            smtc_enabled: false,
            mpv_executable: String::new(),
            make_mkv_library: String::new(),
            vlc_library: String::new(),
            make_mkv_fallback: true,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::PlaybackSettings;

    #[test]
    fn old_settings_default_to_fallback_enabled() {
        let value: PlaybackSettings =
            serde_json::from_str(r#"{"mpvExecutable":"","makeMkvLibrary":"","vlcLibrary":""}"#)
                .unwrap();
        assert!(value.make_mkv_fallback);
        assert!(!value.smtc_enabled);
    }
}
