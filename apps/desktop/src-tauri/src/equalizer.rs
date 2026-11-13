//! Equalizer profiles and the VLC-only application path.
use crate::playback::PlaybackState;
use crate::playback_backend::PlaybackSession;
use discatelier_contracts::{AppError, PlaybackControl, PlaybackSnapshot, PlaybackSource};
use serde::{Deserialize, Serialize};
use std::{
    io::Read,
    path::{Path, PathBuf},
};
use tauri::Manager;

const FILE: &str = "equalizer.json";
const MAX_BYTES: u64 = 256 * 1024;
const BANDS: usize = 10;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EqualizerProfile {
    pub id: String,
    pub name: String,
    pub preamp: f64,
    pub bands: Vec<f64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EqualizerState {
    #[serde(default = "version")]
    pub version: u32,
    pub enabled: bool,
    pub active_profile: String,
    pub preamp: f64,
    pub bands: Vec<f64>,
    #[serde(default)]
    pub profiles: Vec<EqualizerProfile>,
}
fn version() -> u32 {
    1
}
impl Default for EqualizerState {
    fn default() -> Self {
        Self {
            version: 1,
            enabled: false,
            active_profile: "flat".into(),
            preamp: 0.0,
            bands: vec![0.0; BANDS],
            profiles: Vec::new(),
        }
    }
}

fn validate_bands(preamp: f64, bands: &[f64]) -> bool {
    preamp.is_finite()
        && (-12.0..=12.0).contains(&preamp)
        && bands.len() == BANDS
        && bands.iter().all(|value| value.is_finite() && (-12.0..=12.0).contains(value))
}
fn validate(state: &EqualizerState) -> Result<(), AppError> {
    if !validate_bands(state.preamp, &state.bands)
        || state.active_profile.is_empty()
        || state.active_profile.chars().count() > 100
        || state.profiles.len() > 50
    {
        return Err(AppError::new("validation", "均衡器配置无效。"));
    }
    let mut ids = std::collections::HashSet::new();
    for profile in &state.profiles {
        if profile.id.is_empty()
            || profile.id.chars().count() > 100
            || !ids.insert(profile.id.as_str())
            || profile.name.trim().is_empty()
            || profile.name.chars().count() > 40
            || !validate_bands(profile.preamp, &profile.bands)
        {
            return Err(AppError::new("validation", "自定义均衡器配置无效。"));
        }
    }
    Ok(())
}
fn store(directory: &Path) -> PathBuf {
    directory.join(FILE)
}

pub fn read(directory: &Path) -> Result<EqualizerState, AppError> {
    let file = match std::fs::File::open(store(directory)) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(EqualizerState::default())
        }
        Err(_) => return Err(AppError::new("equalizer", "无法读取均衡器设置。")),
    };
    let mut text = String::new();
    file.take(MAX_BYTES + 1)
        .read_to_string(&mut text)
        .map_err(|_| AppError::new("equalizer", "均衡器设置不可读取。"))?;
    if text.len() as u64 > MAX_BYTES {
        return Err(AppError::new("equalizer", "均衡器设置超出长度限制。"));
    }
    let state: EqualizerState = serde_json::from_str(&text)
        .map_err(|_| AppError::new("equalizer", "均衡器设置格式不正确。"))?;
    validate(&state)?;
    Ok(state)
}
pub fn save(directory: &Path, state: &EqualizerState) -> Result<(), AppError> {
    validate(state)?;
    let bytes = serde_json::to_vec(state)
        .map_err(|_| AppError::new("equalizer", "无法保存均衡器设置。"))?;
    std::fs::create_dir_all(directory)
        .map_err(|_| AppError::new("equalizer", "无法访问设置目录。"))?;
    let temp = directory.join(format!("equalizer-{}.json", uuid::Uuid::new_v4()));
    std::fs::write(&temp, bytes)
        .map_err(|_| AppError::new("equalizer", "无法保存均衡器设置。"))?;
    std::fs::rename(temp, store(directory))
        .map_err(|_| AppError::new("equalizer", "无法替换均衡器设置。"))
}

fn applies_to(source: &PlaybackSource) -> bool {
    source.media_token == "local-audio"
        || source.playlist.starts_with("netease-song:")
        || source.playlist.starts_with("cd-track:")
}

pub fn apply(
    session: &PlaybackSession,
    snapshot: &PlaybackSnapshot,
    state: &EqualizerState,
) -> Result<(), AppError> {
    if !matches!(session, PlaybackSession::Vlc(_)) || !applies_to(&snapshot.source) {
        return Ok(());
    }
    session.control(
        &snapshot.session_id,
        PlaybackControl::Equalizer {
            enabled: state.enabled,
            preamp: state.preamp,
            bands: state.bands.clone(),
        },
    )
}

pub fn apply_current(
    playback: &PlaybackState,
    state: &EqualizerState,
) -> Result<(), AppError> {
    let current = playback
        .lock()
        .map_err(|_| AppError::new("equalizer", "播放服务不可用。"))?;
    let Some(session) = current.as_ref() else { return Ok(()) };
    let snapshot = session.snapshot()?;
    apply(session, &snapshot, state)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn equalizer_only_follows_audio_sources() {
        let source = |media_token: &str, playlist: &str| PlaybackSource {
            mount_point: "fixture".into(),
            media_token: media_token.into(),
            playlist: playlist.into(),
            label: "test".into(),
        };
        assert!(applies_to(&source("local-audio", "local:track.flac")));
        assert!(applies_to(&source("netease", "netease-song:1")));
        assert!(applies_to(&source("optical", "cd-track:1")));
        assert!(!applies_to(&source("local-video", "local:movie.mkv")));
        assert!(!applies_to(&source("optical", "dvd-menu")));
        assert!(!applies_to(&source("optical", "bd-menu")));
    }

    #[test]
    fn round_trips_custom_profiles_and_clamps_are_rejected() {
        let directory = std::env::temp_dir().join(format!(
            "discatelier-equalizer-{}",
            uuid::Uuid::new_v4()
        ));
        let mut state = EqualizerState::default();
        state.enabled = true;
        state.active_profile = "custom:test".into();
        state.bands[0] = 6.0;
        state.profiles.push(EqualizerProfile {
            id: "custom:test".into(),
            name: "Test".into(),
            preamp: 1.0,
            bands: vec![0.0; BANDS],
        });
        save(&directory, &state).unwrap();
        let stored = read(&directory).unwrap();
        assert_eq!(stored.active_profile, "custom:test");
        assert_eq!(stored.bands[0], 6.0);
        state.bands[0] = 20.0;
        assert!(save(&directory, &state).is_err());
    }
}

#[tauri::command]
pub async fn equalizer_get(
    directory: tauri::State<'_, crate::data_location::DataLocation>,
) -> Result<EqualizerState, AppError> {
    let directory = directory.0.clone();
    tauri::async_runtime::spawn_blocking(move || read(&directory))
        .await
        .map_err(|_| AppError::new("equalizer", "无法读取均衡器设置。"))?
}

#[tauri::command]
pub async fn equalizer_save(
    window: tauri::WebviewWindow,
    state: EqualizerState,
) -> Result<EqualizerState, AppError> {
    let directory = window.state::<crate::data_location::DataLocation>().0.clone();
    let playback = window
        .state::<PlaybackState>()
        .inner()
        .clone();
    let next = state.clone();
    tauri::async_runtime::spawn_blocking(move || {
        save(&directory, &state)?;
        apply_current(&playback, &state)
    })
    .await
    .map_err(|_| AppError::new("equalizer", "均衡器设置未完成。"))??;
    Ok(next)
}
