//! Local synthetic media for the explicitly enabled acceptance build only.
use discatelier_contracts::{AppError, PlaybackSource};
use std::path::{Path, PathBuf};

pub fn resolve(
    directory: &Path,
    mount: &str,
    token: &str,
    playlist: &str,
) -> Result<Option<(PlaybackSource, PathBuf)>, AppError> {
    if mount != "test-video" {
        return Ok(None);
    }
    let root = std::env::var_os("DISCATELIER_TEST_DATA_DIR")
        .map(PathBuf::from)
        .filter(|root| root == directory)
        .ok_or_else(|| AppError::new("test", "测试视频仅可用于隔离测试库。"))?;
    if token != "local-fixture-v1" || playlist != "00000.mpls" {
        return Err(AppError::new("test", "测试视频请求无效。"));
    }
    let file = root.join("playback-fixture.mkv");
    let source = PlaybackSource {
        mount_point: mount.into(),
        media_token: token.into(),
        playlist: playlist.into(),
        label: "播放测试".into(),
    };
    Ok(Some((source, file)))
}
