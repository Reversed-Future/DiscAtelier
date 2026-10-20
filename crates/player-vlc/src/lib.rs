mod audio_cd;
pub use audio_cd::cd_track;
mod ffi;
mod player;
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
/// A deliberate app-defined route, never a caller-supplied media URL.
pub const DVD_MENU: &str = "dvd-menu";

pub fn configured(settings: &PlaybackSettings) -> Result<PathBuf, AppError> {
    let path = PathBuf::from(&settings.vlc_library);
    if !path.is_absolute()
        || !path.is_file()
        || path.file_name().and_then(|s| s.to_str()) != Some("libvlc.dll")
    {
        return Err(ffi::error("请在播放设置中填写 libvlc.dll 的完整路径。"));
    }
    let root = path
        .parent()
        .ok_or_else(|| ffi::error("libVLC 目录无效。"))?;
    if !root.join("libvlccore.dll").is_file() || !root.join("plugins").is_dir() {
        return Err(ffi::error(
            "VLC 安装不完整，需要同目录下的 libvlccore.dll 和 plugins。",
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
fn validate_resume(seconds: f64, title: Option<i32>) -> Result<(), AppError> {
    if !seconds.is_finite()
        || !(0.0..=604800.0).contains(&seconds)
        || title.is_some_and(|value| !(1..=9999).contains(&value))
        || (seconds > 0.0 && title.is_none())
    {
        return Err(ffi::error("DVD 续播需要有效的标题编号和时间。"));
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
            dvd_location(&source)?
        };
        let now = chrono::Utc::now().to_rfc3339();
        let initial = PlaybackSnapshot {
            session_id: uuid::Uuid::new_v4().to_string(),
            title: track.map_or_else(
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
            dvd_title: None,
            dvd_menu: track.is_none(),
            error: None,
        };
        checkpoint(&initial)?;
        let snapshot = Arc::new(Mutex::new(initial.clone()));
        let state = snapshot.clone();
        let (sender, receiver) = mpsc::sync_channel(8);
        let cancelled = Arc::new(AtomicBool::new(false));
        let cancellation = cancelled.clone();
        let worker = thread::spawn(move || {
            worker::run(
                worker::Start {
                    path,
                    location,
                    window,
                    seconds,
                    title,
                    track,
                },
                initial,
                state,
                receiver,
                checkpoint,
                cancellation,
            )
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
