use discatelier_application::OpticalPlaybackProbe;
pub mod bluray;
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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Decryptor {
    LocalAacs,
    MakeMkv,
}
pub struct MpvProbe {
    executable: PathBuf,
    make_mkv_library: Option<PathBuf>,
    make_mkv_fallback: bool,
    libaacs: Option<PathBuf>,
    libbdplus: Option<PathBuf>,
    video_window: Option<usize>,
    #[cfg(feature = "test-fixture")]
    fixture: Option<PathBuf>,
}
impl MpvProbe {
    pub fn configured(settings: &PlaybackSettings) -> Result<Self, AppError> {
        // Installation layout verified on this host; no shell or PATH lookup.
        let executable = if settings.mpv_executable.is_empty() {
            std::env::var_os("DISCATELIER_MPV")
                .map(PathBuf::from)
                .filter(|path| path.is_file())
                .or_else(|| {
                    std::env::var_os("ProgramFiles")
                        .map(PathBuf::from)
                        .map(|root| root.join("MPV Player").join("mpv.exe"))
                        .filter(|path| path.is_file())
                })
                .ok_or_else(|| {
                    AppError::new(
                        "player",
                        "未检测到 MPV。请安装 MPV，或在播放设置中配置 mpv.exe；安装包应包含 mpv/mpv.exe。",
                    )
                })?
        } else {
            PathBuf::from(&settings.mpv_executable)
        };
        if !executable.is_absolute()
            || !executable.is_file()
            || executable.file_name().and_then(|s| s.to_str()) != Some("mpv.exe")
        {
            return Err(AppError::new(
                "validation",
                "MPV 路径无效：请选择完整、存在的 mpv.exe。",
            ));
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
            make_mkv_fallback: settings.make_mkv_fallback,
            libaacs: None,
            libbdplus: None,
            video_window: None,
            #[cfg(feature = "test-fixture")]
            fixture: None,
        })
    }
    /// Attach the libaacs/libbdplus DLLs bundled with the application.
    /// The paths are validated by name so a user-configured MakeMKV DLL can
    /// never be selected accidentally as the default decryptor.
    pub fn with_bluray_libraries(
        mut self,
        libaacs: PathBuf,
        libbdplus: PathBuf,
    ) -> Result<Self, AppError> {
        for (path, name) in [(&libaacs, "libaacs.dll"), (&libbdplus, "libbdplus.dll")] {
            if !path.is_absolute()
                || !path.is_file()
                || path.file_name().and_then(|value| value.to_str()) != Some(name)
            {
                return Err(AppError::new(
                    "player",
                    format!("找不到随应用提供的 {name}。"),
                ));
            }
        }
        self.libaacs = Some(libaacs);
        self.libbdplus = Some(libbdplus);
        Ok(self)
    }
    pub(crate) fn decryptor_env(&self, process: &mut Command, decryptor: Decryptor) {
        match decryptor {
            Decryptor::LocalAacs => {
                if let Some(path) = &self.libaacs {
                    process.env("LIBAACS_PATH", path.with_extension(""));
                }
                if let Some(path) = &self.libbdplus {
                    process.env("LIBBDPLUS_PATH", path.with_extension(""));
                }
            }
            Decryptor::MakeMkv => {
                if let Some(path) = &self.make_mkv_library {
                    let stem = path.with_extension("");
                    process.env("LIBAACS_PATH", stem.clone());
                    process.env("LIBBDPLUS_PATH", stem);
                }
            }
        }
    }
    pub(crate) fn fallback_library(&self) -> Option<&PathBuf> {
        self.make_mkv_fallback
            .then_some(self.make_mkv_library.as_ref())
            .flatten()
    }
    pub(crate) fn fallback_enabled(&self) -> bool {
        self.make_mkv_fallback
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
        if let Some(path) = source.playlist.strip_prefix("local:") {
            return path.to_owned();
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
    } else if let Some(failure) = bluray::classify_decryption("", &details) {
        let status = match failure {
            bluray::DecryptionFailure::MissingAacs => "missingAacs",
            bluray::DecryptionFailure::MissingBdPlus => "missingBdPlus",
            bluray::DecryptionFailure::Aacs2 => "unsupportedAacs2",
            bluray::DecryptionFailure::AacsKeys => "aacsKey",
        };
        (status, failure.message())
    } else if details.to_ascii_lowercase().contains("region mismatch")
        || details.to_ascii_lowercase().contains("wrong region")
    {
        ("regionMismatch", "光盘区域与当前播放器区域不一致。")
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
        self.decryptor_env(&mut command, Decryptor::LocalAacs);
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
