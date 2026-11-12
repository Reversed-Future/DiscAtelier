//! Cross-session playback preferences that must exist before a media session starts.
use crate::playback_backend::PlaybackSession;
use discatelier_contracts::{AppError, PlaybackControl, PlaybackSnapshot};
use serde::{Deserialize, Serialize};
use std::{
    io::Read,
    path::{Path, PathBuf},
};
use tauri::Manager;

const FILE: &str = "playback-memory.json";
const MAX_BYTES: u64 = 4096;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Memory {
    #[serde(default = "default_volume")]
    pub volume: u16,
}
fn default_volume() -> u16 {
    100
}
impl Default for Memory {
    fn default() -> Self {
        Self { volume: 100 }
    }
}
fn store(directory: &Path) -> PathBuf {
    directory.join(FILE)
}
fn validate(volume: u16) -> Result<(), AppError> {
    if volume > 100 {
        return Err(AppError::new("validation", "音量必须在 0–100 之间。"));
    }
    Ok(())
}

pub fn read(directory: &Path) -> Memory {
    let Ok(file) = std::fs::File::open(store(directory)) else {
        return Memory::default();
    };
    let mut text = String::new();
    if file.take(MAX_BYTES + 1).read_to_string(&mut text).is_err()
        || text.len() as u64 > MAX_BYTES
    {
        return Memory::default();
    }
    serde_json::from_str::<Memory>(&text)
        .ok()
        .filter(|value| value.volume <= 100)
        .unwrap_or_default()
}

pub fn apply(
    session: &PlaybackSession,
    snapshot: &mut PlaybackSnapshot,
    directory: &Path,
) -> Result<(), AppError> {
    let volume = read(directory).volume;
    if snapshot.volume == volume {
        return Ok(());
    }
    session.control(
        &snapshot.session_id,
        PlaybackControl::Volume { volume },
    )?;
    snapshot.volume = volume;
    Ok(())
}

pub fn save(directory: &Path, volume: u16) -> Result<(), AppError> {
    validate(volume)?;
    let bytes = serde_json::to_vec(&Memory { volume })
        .map_err(|_| AppError::new("memory", "无法保存播放音量。"))?;
    std::fs::create_dir_all(directory)
        .map_err(|_| AppError::new("memory", "无法访问设置目录。"))?;
    let temporary = directory.join(format!("playback-memory-{}.json", uuid::Uuid::new_v4()));
    std::fs::write(&temporary, bytes)
        .map_err(|_| AppError::new("memory", "无法保存播放音量。"))?;
    std::fs::rename(temporary, store(directory))
        .map_err(|_| AppError::new("memory", "无法替换播放音量。"))
}

#[tauri::command]
pub async fn playback_volume_get(
    directory: tauri::State<'_, crate::data_location::DataLocation>,
) -> Result<u16, AppError> {
    Ok(read(&directory.0).volume)
}

#[tauri::command]
pub async fn playback_volume_save(
    window: tauri::WebviewWindow,
    volume: u16,
) -> Result<u16, AppError> {
    let directory = window
        .state::<crate::data_location::DataLocation>()
        .0
        .clone();
    tauri::async_runtime::spawn_blocking(move || {
        save(&directory, volume)?;
        Ok(volume)
    })
    .await
    .map_err(|_| AppError::new("memory", "播放音量未保存。"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn clamps_and_round_trips_volume() {
        let directory = std::env::temp_dir().join(format!(
            "discatelier-volume-{}",
            uuid::Uuid::new_v4()
        ));
        assert_eq!(read(&directory).volume, 100);
        save(&directory, 64).unwrap();
        assert_eq!(read(&directory).volume, 64);
        assert!(save(&directory, 101).is_err());
        std::fs::write(store(&directory), b"{broken").unwrap();
        assert_eq!(read(&directory).volume, 100);
    }
}
