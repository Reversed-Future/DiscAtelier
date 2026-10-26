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
