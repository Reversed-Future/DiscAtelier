use crate::{ffi, player::Player, Checkpoint, Request};
use discatelier_application::PlaybackProgress;
use discatelier_contracts::*;
use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex,
    },
    time::{Duration, Instant},
};

pub struct Start {
    pub path: PathBuf,
    pub location: String,
    pub window: usize,
    pub seconds: f64,
    pub title: Option<i32>,
    pub track: Option<u8>,
    pub dvd: bool,
}
struct Publication {
    shared: Arc<Mutex<PlaybackSnapshot>>,
    checkpoint: Checkpoint,
    bookmark: Option<PlaybackSnapshot>,
}
impl Publication {
    fn publish(&mut self, snapshot: &mut PlaybackSnapshot, save: bool) {
        snapshot.updated_at = chrono::Utc::now().to_rfc3339();
        if !snapshot.dvd_menu
            && snapshot.dvd_title.is_some()
            && snapshot.phase != PlaybackPhase::Loading
        {
            self.bookmark = Some(snapshot.clone());
        }
        if save {
            let mut record = snapshot.clone();
            // Returning to a menu must not overwrite the last title's resume point.
            if snapshot.dvd_menu {
                if let Some(bookmark) = &self.bookmark {
                    record.dvd_title = bookmark.dvd_title;
                    record.position_seconds = bookmark.position_seconds;
                    record.duration_seconds = bookmark.duration_seconds;
                    record.selected_audio = bookmark.selected_audio;
                }
            }
            if let Err(error) = (self.checkpoint)(&record) {
                snapshot.error = Some(error.message);
            }
        }
        if let Ok(mut shared) = self.shared.lock() {
            *shared = snapshot.clone();
        }
    }
}
pub fn run(
    start: Start,
    mut snapshot: PlaybackSnapshot,
    shared: Arc<Mutex<PlaybackSnapshot>>,
    receiver: mpsc::Receiver<Request>,
    checkpoint: Checkpoint,
    cancelled: Arc<AtomicBool>,
) {
    let mut publication = Publication {
        shared,
        checkpoint,
        bookmark: None,
    };
    let result =
        Player::open(&start.path, &start.location, start.window, start.track).and_then(|player| {
            let result = playing(
                &player,
                &start,
                &mut snapshot,
                &mut publication,
                receiver,
                &cancelled,
            );
            let phase = snapshot.phase.clone();
            snapshot.phase = PlaybackPhase::Stopping;
            publication.publish(&mut snapshot, true);
            // Blocking libVLC stop/release runs here, never on the UI thread.
            drop(player);
            snapshot.phase = phase;
            result
        });
    if let Err(error) = result {
        snapshot.phase = PlaybackPhase::Failed;
        snapshot.error = Some(error.message);
    } else if snapshot.phase.active() {
        snapshot.phase = PlaybackPhase::Stopped;
    }
    publication.publish(&mut snapshot, true);
}
fn playing(
    player: &Player,
    start: &Start,
    snapshot: &mut PlaybackSnapshot,
    publication: &mut Publication,
    receiver: mpsc::Receiver<Request>,
    cancelled: &AtomicBool,
) -> Result<(), AppError> {
    let api = &player.api;
    let handle = player.handle;
    let started = Instant::now();
    let mut saved = Instant::now();
    let mut metadata = Instant::now() - Duration::from_secs(2);
    let mut titles = Vec::new();
    let mut metadata_title = None;
    let mut progress = PlaybackProgress::default();
    let mut resume = start.title.map(|title| (title, false, Instant::now()));
    let mut loaded = false;
    let mut cd_resume = !start.dvd && start.seconds > 0.0;
    loop {
        if cancelled.load(Ordering::Acquire) {
            return Ok(());
        }
        let previous_phase = snapshot.phase.clone();
        let previous_title = snapshot.dvd_title;
        let state = unsafe { (api.libvlc_media_player_get_state)(handle) };
        if state == 7 {
            return Err(ffi::error("媒体读取或解码失败，请检查来源与 VLC 安装。"));
        }
        if state == 6 {
            snapshot.completed = !start.dvd && progress.completed(snapshot.duration_seconds, true);
            snapshot.phase = PlaybackPhase::Ended;
            return Ok(());
        }
        if state == 5 && loaded {
            return Ok(());
        }
        loaded |= state == 3 || state == 4;
        if !loaded && started.elapsed() > Duration::from_secs(60) {
            return Err(ffi::error("媒体读取超时。"));
        }
        let current_title = unsafe { (api.libvlc_media_player_get_title)(handle) };
        if metadata.elapsed() >= Duration::from_secs(1) || metadata_title != Some(current_title) {
            titles = player.titles();
            let (tracks, selected) = player.tracks();
            snapshot.audio_tracks = tracks;
            snapshot.selected_audio = selected;
            metadata = Instant::now();
            metadata_title = Some(current_title);
        }
        snapshot.dvd_menu = start.dvd
            && !titles
                .iter()
                .any(|(id, menu)| *id == current_title && !menu);
        snapshot.dvd_title = (start.dvd && !snapshot.dvd_menu).then_some(current_title);
        if snapshot.dvd_title != previous_title {
            progress.reset_sample();
        }
        let duration = unsafe { (api.libvlc_media_player_get_length)(handle) };
        snapshot.duration_seconds =
            (!snapshot.dvd_menu && duration > 0).then_some(duration as f64 / 1000.0);
        snapshot.position_seconds = if snapshot.dvd_menu {
            0.0
        } else {
            unsafe { (api.libvlc_media_player_get_time)(handle) }.max(0) as f64 / 1000.0
        };
        snapshot.seekable =
            !snapshot.dvd_menu && unsafe { (api.libvlc_media_player_is_seekable)(handle) } != 0;
        snapshot.paused = state == 4;
        if let Some((title, requested, since)) = resume.as_mut() {
            if loaded && !*requested && !titles.is_empty() {
                if !titles.iter().any(|(id, menu)| id == title && !menu) {
                    return Err(ffi::error("记录中的 DVD 标题已不可用，请从原盘菜单播放。"));
                }
                unsafe {
                    (api.libvlc_media_player_set_title)(handle, *title);
                }
                *requested = true;
                *since = Instant::now();
            } else if *requested
                && current_title == *title
                && snapshot.seekable
                && snapshot.duration_seconds.is_some()
            {
                let seconds = start.seconds.min(snapshot.duration_seconds.unwrap_or(0.0));
                unsafe {
                    (api.libvlc_media_player_set_time)(handle, (seconds * 1000.0) as i64);
                }
                snapshot.position_seconds = seconds;
                progress.reset_sample();
                resume = None;
            } else if (*requested && since.elapsed() > Duration::from_secs(15))
                || started.elapsed() > Duration::from_secs(60)
            {
                return Err(ffi::error("未能恢复 DVD 标题，请从原盘菜单重新播放。"));
            }
        }
        if cd_resume && loaded && snapshot.seekable {
            player.control(
                PlaybackControl::Seek {
                    seconds: start
                        .seconds
                        .min(snapshot.duration_seconds.unwrap_or(start.seconds)),
                },
                snapshot,
            )?;
            progress.reset_sample();
            cd_resume = false;
        }
        if cd_resume && started.elapsed() > Duration::from_secs(60) {
            return Err(ffi::error("CD 续播超时，请从头播放。"));
        }
        snapshot.phase = if !loaded || resume.is_some() || cd_resume {
            PlaybackPhase::Loading
        } else if snapshot.paused {
            PlaybackPhase::Paused
        } else if state == 2 {
            PlaybackPhase::Buffering
        } else {
            PlaybackPhase::Playing
        };
        progress.sample(
            snapshot.position_seconds,
            started.elapsed().as_secs_f64(),
            snapshot.phase == PlaybackPhase::Playing && !snapshot.dvd_menu,
        );
        snapshot.watched_seconds = progress.watched();
        // DVD menus can loop or return automatically; never infer whole-disc completion.
        snapshot.completed = false;
        let save = saved.elapsed() >= Duration::from_secs(5)
            || previous_phase != snapshot.phase
            || previous_title != snapshot.dvd_title;
        publication.publish(snapshot, save);
        if save {
            saved = Instant::now();
        }
        match receiver.recv_timeout(Duration::from_millis(100)) {
            Ok(request) => {
                let volume = if let PlaybackControl::Volume { volume } = &request.control {
                    Some(*volume)
                } else {
                    None
                };
                let rate = if let PlaybackControl::Rate { rate } = &request.control {
                    Some(*rate)
                } else {
                    None
                };
                let resets = matches!(
                    request.control,
                    PlaybackControl::Seek { .. }
                        | PlaybackControl::Rate { .. }
                        | PlaybackControl::Menu { .. }
                        | PlaybackControl::Pause { .. }
                );
                let result = if resume.is_some() {
                    Err(ffi::error("正在恢复 DVD 标题。"))
                } else {
                    player.control(request.control, snapshot)
                };
                if result.is_ok() {
                    if let Some(volume) = volume {
                        snapshot.volume = volume;
                    }
                    if let Some(rate) = rate {
                        snapshot.rate = rate;
                    }
                    if resets {
                        progress.reset_sample();
                    }
                }
                let _ = request.reply.send(result);
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {}
            Err(mpsc::RecvTimeoutError::Disconnected) => return Ok(()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn returning_to_menu_preserves_title_position_but_updates_final_phase() {
        let records = Arc::new(Mutex::new(Vec::<PlaybackRecord>::new()));
        let sink = records.clone();
        let mut s = crate::tests::snapshot();
        let shared = Arc::new(Mutex::new(s.clone()));
        let mut publication = Publication {
            shared: shared.clone(),
            bookmark: None,
            checkpoint: Arc::new(move |s| {
                sink.lock().unwrap().push(PlaybackRecord::from(s));
                Ok(())
            }),
        };
        publication.publish(&mut s, true);
        s.dvd_menu = true;
        s.dvd_title = None;
        s.duration_seconds = None;
        s.position_seconds = 0.0;
        s.phase = PlaybackPhase::Stopped;
        publication.publish(&mut s, true);
        let saved = records.lock().unwrap();
        assert_eq!(saved.last().unwrap().dvd_title, Some(2));
        assert_eq!(saved.last().unwrap().position_seconds, 50.0);
        assert_eq!(saved.last().unwrap().phase, PlaybackPhase::Stopped);
        assert_eq!(shared.lock().unwrap().position_seconds, 0.0);
        assert!(shared.lock().unwrap().dvd_menu);
    }
}
