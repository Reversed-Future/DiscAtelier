use discatelier_application::OpticalPlaybackProbe;
mod job;
mod protocol;
mod session;
mod transport;
mod worker;
use discatelier_contracts::{AppError, PlaybackDiagnostic, PlaybackSettings};
pub use session::{Checkpoint, MpvSession};
use std::{
    io::Read,
    path::PathBuf,
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

pub struct MpvProbe {
    executable: PathBuf,
    make_mkv_library: Option<PathBuf>,
    video_window: Option<usize>,
    #[cfg(feature = "test-fixture")]
    fixture: Option<PathBuf>,
}
impl MpvProbe {
    pub fn configured(settings: &PlaybackSettings) -> Result<Self, AppError> {
        // Installation layout verified on this host; no shell or PATH lookup.
        let executable = if settings.mpv_executable.is_empty() {
            std::env::var_os("ProgramFiles")
                .map(PathBuf::from)
                .map(|root| root.join("MPV Player").join("mpv.exe"))
                .filter(|path| path.is_file())
                .ok_or_else(|| AppError::new("player", "请在设置中配置 MPV。"))?
        } else {
            PathBuf::from(&settings.mpv_executable)
        };
        if !executable.is_absolute()
            || !executable.is_file()
            || executable.file_name().and_then(|s| s.to_str()) != Some("mpv.exe")
        {
            return Err(AppError::new("validation", "请选择 mpv.exe 的完整路径。"));
        }
        let make_mkv_library = if settings.make_mkv_library.is_empty() {
            None
        } else {
            let path = PathBuf::from(&settings.make_mkv_library);
            if !path.is_absolute()
                || !path.is_file()
                || path.file_name().and_then(|s| s.to_str()) != Some("libmmbd64.dll")
            {
                return Err(AppError::new(
                    "validation",
                    "请选择 MakeMKV 的 libmmbd64.dll 完整路径。",
                ));
            }
            Some(path)
        };
        Ok(Self {
            executable,
            make_mkv_library,
            video_window: None,
            #[cfg(feature = "test-fixture")]
            fixture: None,
        })
    }
    pub fn embedded(mut self, window: usize) -> Result<Self, AppError> {
        if window == 0 {
            return Err(AppError::new("player", "内置播放区域尚未创建。"));
        }
        self.video_window = Some(window);
        Ok(self)
    }
    #[cfg(feature = "test-fixture")]
    pub fn with_fixture(mut self, path: PathBuf) -> Result<Self, AppError> {
        if !path.is_absolute() || !path.is_file() {
            return Err(AppError::new("test", "本地测试视频不存在。"));
        }
        self.fixture = Some(path);
        Ok(self)
    }
    fn media_url(&self, source: &discatelier_contracts::PlaybackSource) -> String {
        #[cfg(feature = "test-fixture")]
        if let Some(path) = &self.fixture {
            return path.to_string_lossy().into_owned();
        }
        format!("bd://mpls/{}", &source.playlist[..5])
    }
}
fn drain(mut pipe: impl Read) -> Vec<u8> {
    let mut result = Vec::new();
    let mut buffer = [0u8; 4096];
    while let Ok(length) = pipe.read(&mut buffer) {
        if length == 0 {
            break;
        }
        let keep = length.min(65536usize.saturating_sub(result.len()));
        result.extend_from_slice(&buffer[..keep]);
    }
    result
}
fn classify(success: bool, timed_out: bool, details: String) -> PlaybackDiagnostic {
    let (status, message) = if timed_out {
        ("timeout", "读取超时，诊断已停止。")
    } else if details.contains("AACS encryption detected but cannot find libaacs.") {
        (
            "missingAacs",
            "检测到 AACS 加密，缺少 libaacs，当前无法打开这张 BD。",
        )
    } else if details.contains("BD+ encryption detected but cannot find libbdplus.") {
        ("missingBdPlus", "检测到 BD+ 加密，缺少 libbdplus。")
    } else if success && details.contains("VO: [null]") && details.contains("V: ") {
        ("frameDecoded", "首帧解码通过；完整播放与菜单尚未验证。")
    } else if success {
        ("opened", "已打开光盘；视频解码、区域与菜单尚未验证。")
    } else {
        ("failed", "播放器未能打开光盘，请查看诊断记录。")
    };
    PlaybackDiagnostic {
        status: status.into(),
        message: message.into(),
        details,
    }
}
impl OpticalPlaybackProbe for MpvProbe {
    fn probe(&self, mount_point: &str, playlist: &str) -> Result<PlaybackDiagnostic, AppError> {
        if playlist.len() != 10
            || !playlist.ends_with(".mpls")
            || !playlist.as_bytes()[..5].iter().all(u8::is_ascii_digit)
        {
            return Err(AppError::new("validation", "播放列表无效。"));
        }
        let mut command = Command::new(&self.executable);
        command
            .args([
                "--no-config",
                "--terminal=yes",
                "--load-scripts=no",
                "--resume-playback=no",
                "--save-position-on-quit=no",
                "--save-watch-history=no",
                "--input-terminal=no",
                "--audio=no",
                "--vo=null",
                "--frames=1",
            ])
            .arg(format!("--bluray-device={mount_point}"))
            .arg(format!("bd://mpls/{}", &playlist[..5]))
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        if let Some(path) = &self.make_mkv_library {
            // dl_win32.c appends ".dll"; absolute stem avoids global DLL changes.
            let stem = path.with_extension("");
            command
                .env("LIBAACS_PATH", &stem)
                .env("LIBBDPLUS_PATH", &stem);
        }
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(windows_sys::Win32::System::Threading::CREATE_NO_WINDOW);
        }
        let mut child = command
            .spawn()
            .map_err(|_| AppError::new("player", "无法启动播放诊断。"))?;
        let out = child.stdout.take().unwrap();
        let err = child.stderr.take().unwrap();
        let stdout = thread::spawn(move || drain(out));
        let stderr = thread::spawn(move || drain(err));
        let deadline = Instant::now() + Duration::from_secs(45);
        let mut timed_out = false;
        let status = loop {
            match child.try_wait() {
                Ok(Some(status)) => break Some(status),
                Ok(None) if Instant::now() < deadline => thread::sleep(Duration::from_millis(100)),
                _ => {
                    timed_out = true;
                    let _ = child.kill();
                    break child.wait().ok();
                }
            }
        };
        let mut details = String::from_utf8_lossy(&stdout.join().unwrap_or_default()).into_owned();
        details.push_str(&String::from_utf8_lossy(&stderr.join().unwrap_or_default()));
        Ok(classify(
            status.is_some_and(|s| s.success()),
            timed_out,
            details,
        ))
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn aacs_failure_is_not_reported_as_region_success() {
        let report = classify(
            false,
            false,
            "[bd] AACS encryption detected but cannot find libaacs.\nNo protocol handler found"
                .into(),
        );
        assert_eq!(report.status, "missingAacs");
    }
    #[test]
    fn open_success_is_not_full_playback_validation() {
        assert_eq!(classify(true, false, String::new()).status, "opened");
        assert_eq!(classify(true, true, String::new()).status, "timeout");
    }
    #[test]
    fn frame_decode_requires_video_output_and_success() {
        let log = "VO: [null] 1920x1080 yuv420p\nV: 00:00:00 / 02:10:00 (0%)".to_owned();
        assert_eq!(classify(true, false, log.clone()).status, "frameDecoded");
        assert_eq!(classify(false, false, log).status, "failed");
    }
}
