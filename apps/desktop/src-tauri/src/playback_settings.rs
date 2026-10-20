use discatelier_contracts::{AppError, PlaybackSettings};
use std::{io::Read, path::Path};

const FILE: &str = "playback-settings.json";

pub fn read(directory: &Path) -> Result<PlaybackSettings, AppError> {
    let file = match std::fs::File::open(directory.join(FILE)) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(PlaybackSettings::default())
        }
        Err(_) => return Err(AppError::new("settings", "无法读取播放设置。")),
    };
    let mut text = String::new();
    file.take(16385)
        .read_to_string(&mut text)
        .map_err(|_| AppError::new("settings", "播放设置不可读取。"))?;
    if text.len() > 16384 {
        return Err(AppError::new("settings", "播放设置超出长度限制。"));
    }
    serde_json::from_str(&text).map_err(|_| AppError::new("settings", "播放设置格式不正确。"))
}

pub fn save(directory: &Path, settings: &PlaybackSettings) -> Result<(), AppError> {
    if settings.mpv_executable.len() > 4096
        || settings.make_mkv_library.len() > 4096
        || settings.vlc_library.len() > 4096
    {
        return Err(AppError::new("validation", "路径过长。"));
    }
    if !settings.mpv_executable.is_empty() || !settings.make_mkv_library.is_empty() {
        discatelier_player_mpv::MpvProbe::configured(settings)?;
    }
    if !settings.vlc_library.is_empty() {
        discatelier_player_vlc::configured(settings)?;
    }
    let bytes = serde_json::to_vec(settings)
        .map_err(|_| AppError::new("settings", "无法保存播放设置。"))?;
    std::fs::create_dir_all(directory)
        .map_err(|_| AppError::new("settings", "无法访问设置目录。"))?;
    let temporary = directory.join(format!("playback-settings-{}.json", uuid::Uuid::new_v4()));
    std::fs::write(&temporary, bytes)
        .map_err(|_| AppError::new("settings", "无法保存播放设置。"))?;
    std::fs::rename(temporary, directory.join(FILE))
        .map_err(|_| AppError::new("settings", "无法替换播放设置。"))
}
