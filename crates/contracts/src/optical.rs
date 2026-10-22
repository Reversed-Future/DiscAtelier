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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PlaybackSettings {
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
    }
}
