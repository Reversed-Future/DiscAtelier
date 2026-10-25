mod audio_cd;
mod cd_metadata;
pub use audio_cd::cd_track;
pub use cd_metadata::read_cd_metadata;
mod ffi;
mod player;
mod stream;
#[cfg(test)]
mod tests;
mod worker;
use discatelier_contracts::*;
use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex,
    },
    thread,
    time::Duration,
};
pub type Checkpoint = Arc<dyn Fn(&PlaybackSnapshot) -> Result<(), AppError> + Send + Sync>;
pub(crate) struct Request {
    control: PlaybackControl,
    reply: mpsc::Sender<Result<(), AppError>>,
}
pub struct VlcSession {
    snapshot: Arc<Mutex<PlaybackSnapshot>>,
    sender: mpsc::SyncSender<Request>,
    cancelled: Arc<AtomicBool>,
    worker: Option<thread::JoinHandle<()>>,
}
/// Deliberate app-defined routes, never caller-supplied media URLs.
pub const DVD_MENU: &str = "dvd-menu";
pub const BD_MENU: &str = "bd-menu";

pub fn configured(settings: &PlaybackSettings) -> Result<PathBuf, AppError> {
    let path = PathBuf::from(&settings.vlc_library);
    if !path.is_absolute()
        || !path.is_file()
        || path.file_name().and_then(|s| s.to_str()) != Some("libvlc.dll")
    {
        return Err(ffi::error(
            "未检测到 VLC。请安装 VLC，或在播放设置中填写 vlc/libvlc.dll 的完整路径。",
        ));
    }
    let root = path.parent().ok_or_else(|| ffi::error("VLC 目录无效。"))?;
    let plugins = root.join("plugins");
    let plugins_empty = std::fs::read_dir(&plugins)
        .map(|mut entries| entries.next().is_none())
        .unwrap_or(true);
    if !root.join("libvlccore.dll").is_file() || !plugins.is_dir() || plugins_empty {
        return Err(ffi::error(
            "VLC 运行时不完整：需要同目录的 libvlccore.dll 和非空 plugins 插件目录。请重新安装或重新打包 VLC。",
        ));
    }
    Ok(path)
}
pub fn dvd_location(source: &PlaybackSource) -> Result<String, AppError> {
    let mount = source.mount_point.as_bytes();
    if source.playlist != DVD_MENU
        || mount.len() != 2
        || !mount[0].is_ascii_uppercase()
        || mount[1] != b':'
    {
        return Err(ffi::error("DVD 光驱路径无效。"));
    }
    Ok(format!("dvdnav:///{}/", source.mount_point))
}

/// VLC's libbluray access path. Menu support is requested through the
/// `bluray-menu` media option; BD-J additionally needs a usable JVM.
pub fn bluray_location(source: &PlaybackSource) -> Result<String, AppError> {
    let mount = source.mount_point.as_bytes();
    if source.playlist != BD_MENU
        || mount.len() != 2
        || !mount[0].is_ascii_uppercase()
        || mount[1] != b':'
    {
        return Err(ffi::error("蓝光光驱路径无效。"));
    }
    Ok(format!("bluray:///{}/", source.mount_point))
}

fn disc_location(source: &PlaybackSource) -> Result<String, AppError> {
    match source.playlist.as_str() {
        DVD_MENU => dvd_location(source),
        BD_MENU => bluray_location(source),
        _ => Err(ffi::error("该光盘不接受菜单播放。")),
    }
}

/// Start a muted menu in an off-screen VLC surface, let it settle, and take
/// one video snapshot. The caller must not use this while another session owns
/// the drive.
pub fn capture_menu(
    path: &Path,
    window: usize,
    source: &PlaybackSource,
    output: &Path,
    wait: Duration,
) -> Result<(), AppError> {
    if window == 0 {
        return Err(ffi::error("静态菜单截图窗口尚未创建。"));
    }
    let location = disc_location(source)?;
    let player = player::Player::open(path, &location, window, None, true, true)?;
    std::thread::sleep(wait);
    player.snapshot(output)
}

fn validate_resume(seconds: f64, title: Option<i32>) -> Result<(), AppError> {
    if !seconds.is_finite()
        || !(0.0..=604800.0).contains(&seconds)
        || title.is_some_and(|value| !(1..=9999).contains(&value))
        || (seconds > 0.0 && title.is_none())
    {
        return Err(ffi::error("光盘续播需要有效的标题编号和时间。"));
    }
    Ok(())
}
impl VlcSession {
    pub fn start(
        path: PathBuf,
        window: usize,
        source: PlaybackSource,
        seconds: f64,
        title: Option<i32>,
        checkpoint: Checkpoint,
    ) -> Result<Self, AppError> {
        if window == 0 {
            return Err(ffi::error("内置播放区域尚未创建。"));
        }
        let track = cd_track(&source.playlist);
        let location = if track.is_some() {
            if title.is_some() || !seconds.is_finite() || !(0.0..=604800.0).contains(&seconds) {
                return Err(ffi::error("CD 续播位置无效。"));
            }
            audio_cd::location(&source)?.0
        } else {
            validate_resume(seconds, title)?;
            disc_location(&source)?
        };
        Self::launch(
            worker::Start {
                path,
                location,
                window,
                seconds,
                title,
                track,
                dvd: track.is_none(),
                bluray_menu: source.playlist == BD_MENU,
                silent: false,
            },
            source,
            checkpoint,
        )
    }
    fn launch(
        start: worker::Start,
        source: PlaybackSource,
        checkpoint: Checkpoint,
    ) -> Result<Self, AppError> {
        let now = chrono::Utc::now().to_rfc3339();
        let initial = PlaybackSnapshot {
            session_id: uuid::Uuid::new_v4().to_string(),
            title: start.track.map_or_else(
                || source.label.clone(),
                |n| format!("{} · 曲目 {n}", source.label),
            ),
            source,
            started_at: now.clone(),
            updated_at: now,
            phase: PlaybackPhase::Loading,
            position_seconds: 0.0,
            duration_seconds: None,
            watched_seconds: 0.0,
            completed: false,
            paused: false,
            seeking: false,
            seekable: false,
            audio_tracks: Vec::new(),
            selected_audio: None,
            volume: 100,
            rate: 1.0,
            dvd_title: None,
            dvd_menu: start.dvd,
            playback_mode: discatelier_contracts::PlaybackMode::LocalAacs,
            error: None,
        };
        checkpoint(&initial)?;
        let snapshot = Arc::new(Mutex::new(initial.clone()));
        let state = snapshot.clone();
        let (sender, receiver) = mpsc::sync_channel(8);
        let cancelled = Arc::new(AtomicBool::new(false));
        let cancellation = cancelled.clone();
        let worker = thread::spawn(move || {
            worker::run(start, initial, state, receiver, checkpoint, cancellation)
        });
        Ok(Self {
            snapshot,
            sender,
            cancelled,
            worker: Some(worker),
        })
    }
    pub fn snapshot(&self) -> Result<PlaybackSnapshot, AppError> {
        self.snapshot
            .lock()
            .map(|s| s.clone())
            .map_err(|_| ffi::error("播放状态不可读取。"))
    }
    pub fn control(&self, id: &str, control: PlaybackControl) -> Result<(), AppError> {
        let current = self.snapshot()?;
        if current.session_id != id || !current.phase.active() {
            return Err(ffi::error("播放会话已结束。"));
        }
        if matches!(control, PlaybackControl::Stop) {
            self.cancelled.store(true, Ordering::Release);
            return Ok(());
        }
        let (reply, result) = mpsc::channel();
        self.sender
            .try_send(Request { control, reply })
            .map_err(|_| ffi::error("播放器忙，请稍后重试。"))?;
        result
            .recv_timeout(Duration::from_secs(5))
            .map_err(|_| ffi::error("播放器未确认操作。"))?
    }
}
impl Drop for VlcSession {
    fn drop(&mut self) {
        self.cancelled.store(true, Ordering::Release);
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}
/// No media is opened. Used by the explicit non-UI installation smoke test.
pub fn inspect_runtime(path: &Path) -> Result<String, AppError> {
    let api = ffi::Api::load(path)?;
    unsafe {
        let instance = (api.libvlc_new)(0, std::ptr::null());
        if instance.is_null() {
            return Err(ffi::error("libVLC 初始化失败。"));
        }
        let version = ffi::text((api.libvlc_get_version)());
        (api.libvlc_release)(instance);
        Ok(version)
    }
}
