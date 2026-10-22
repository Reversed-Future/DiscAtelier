use crate::MpvProbe;
use discatelier_contracts::{
    AppError, PlaybackControl, PlaybackPhase, PlaybackSnapshot, PlaybackSource,
};
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex,
    },
    thread,
    time::Duration,
};

pub type Checkpoint = Arc<dyn Fn(&PlaybackSnapshot) -> Result<(), AppError> + Send + Sync>;
pub(crate) struct Request {
    pub control: PlaybackControl,
    pub reply: mpsc::Sender<Result<(), AppError>>,
}
pub struct MpvSession {
    pub(crate) snapshot: Arc<Mutex<PlaybackSnapshot>>,
    sender: mpsc::SyncSender<Request>,
    cancelled: Arc<AtomicBool>,
    worker: Option<thread::JoinHandle<()>>,
}
impl MpvSession {
    pub fn start(
        config: MpvProbe,
        source: PlaybackSource,
        resume_seconds: f64,
        directory: PathBuf,
        checkpoint: Checkpoint,
    ) -> Result<Self, AppError> {
        if !resume_seconds.is_finite() || !(0.0..=604800.0).contains(&resume_seconds) {
            return Err(AppError::new("validation", "播放位置无效。"));
        }
        if source.playlist.len() != 10
            || !source.playlist.ends_with(".mpls")
            || !source.playlist.as_bytes()[..5]
                .iter()
                .all(u8::is_ascii_digit)
        {
            return Err(AppError::new("validation", "播放列表无效。"));
        }
        let now = chrono::Utc::now().to_rfc3339();
        let initial = PlaybackSnapshot {
            session_id: uuid::Uuid::new_v4().to_string(),
            title: source.label.clone(),
            source,
            started_at: now.clone(),
            updated_at: now,
            phase: PlaybackPhase::Loading,
            position_seconds: resume_seconds,
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
            dvd_menu: false,
            error: None,
        };
        checkpoint(&initial)?;
        let snapshot = Arc::new(Mutex::new(initial.clone()));
        let state = snapshot.clone();
        let (sender, receiver) = mpsc::sync_channel(8);
        let cancelled = Arc::new(AtomicBool::new(false));
        let cancellation = cancelled.clone();
        let worker = thread::spawn(move || {
            crate::worker::run(
                config,
                initial,
                directory,
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
            .map_err(|_| AppError::new("player", "播放状态不可读取。"))
    }
    pub fn control(&self, session_id: &str, control: PlaybackControl) -> Result<(), AppError> {
        let current = self.snapshot()?;
        if current.session_id != session_id || !current.phase.active() {
            return Err(AppError::new("session", "播放会话已结束。"));
        }
        if matches!(control, PlaybackControl::Stop) {
            self.cancelled.store(true, Ordering::Release);
            return Ok(());
        }
        let (reply, result) = mpsc::channel();
        self.sender
            .try_send(Request { control, reply })
            .map_err(|_| AppError::new("player", "播放器忙，请稍后重试。"))?;
        result
            .recv_timeout(Duration::from_secs(5))
            .map_err(|_| AppError::new("player", "播放器未确认操作。"))?
    }
    pub fn stop(&self) {
        self.cancelled.store(true, Ordering::Release);
    }
}
impl Drop for MpvSession {
    fn drop(&mut self) {
        self.stop();
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}
