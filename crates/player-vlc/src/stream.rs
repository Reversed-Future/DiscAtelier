use crate::{ffi, worker::Start, Checkpoint, VlcSession};
use discatelier_contracts::{AppError, PlaybackSource};
use std::path::PathBuf;

fn validate_url(value: &str) -> Result<(), AppError> {
    let url = url::Url::parse(value).map_err(|_| ffi::error("音频地址无效。"))?;
    if url.scheme() != "https"
        || !url
            .host_str()
            .is_some_and(|s| s.ends_with(".music.126.net"))
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
    {
        return Err(ffi::error("音频地址无效。"));
    }
    Ok(())
}
impl VlcSession {
    /// Play a local audio/video file through VLC. Audio deliberately passes a
    /// zero window so VLC never creates a native video surface over the UI.
    pub fn start_local(
        path: PathBuf,
        window: usize,
        source: PlaybackSource,
        checkpoint: Checkpoint,
    ) -> Result<Self, AppError> {
        let file = source
            .playlist
            .strip_prefix("local:")
            .ok_or_else(|| ffi::error("本地播放路径无效。"))?;
        let file = PathBuf::from(file);
        if !file.is_absolute() || !file.is_file() {
            return Err(ffi::error("本地文件不存在。"));
        }
        if !matches!(source.media_token.as_str(), "local-audio" | "local-video") {
            return Err(ffi::error("本地媒体类型无效。"));
        }
        if source.media_token == "local-video" && window == 0 {
            return Err(ffi::error("内置播放区域尚未创建。"));
        }
        let location = url::Url::from_file_path(&file)
            .map_err(|_| ffi::error("本地文件路径无效。"))?
            .to_string();
        Self::launch(
            Start {
                path,
                location,
                window,
                seconds: 0.0,
                title: None,
                track: None,
                dvd: false,
                bluray_menu: false,
                silent: false,
            },
            source,
            checkpoint,
        )
    }

    pub fn start_stream(
        path: PathBuf,
        window: usize,
        source: PlaybackSource,
        url: String,
        checkpoint: Checkpoint,
    ) -> Result<Self, AppError> {
        validate_url(&url)?;
        if window == 0
            || source
                .playlist
                .strip_prefix("netease-song:")
                .and_then(|v| v.parse::<u64>().ok())
                .is_none_or(|id| id == 0)
        {
            return Err(ffi::error("网络音频来源无效。"));
        }
        Self::launch(
            Start {
                path,
                location: url,
                window,
                seconds: 0.0,
                title: None,
                track: None,
                dvd: false,
                bluray_menu: false,
                silent: false,
            },
            source,
            checkpoint,
        )
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn network_audio_never_accepts_disc_or_local_urls() {
        assert!(validate_url("https://p3.music.126.net/test.mp3").is_ok());
        for value in [
            "file:///F:/movie.m2ts",
            "dvdnav:///F:/",
            "http://p3.music.126.net/test.mp3",
            "https://p3.music.126.net.evil.example/a",
            "https://user:pass@p3.music.126.net/a",
        ] {
            assert!(validate_url(value).is_err());
        }
    }
}
