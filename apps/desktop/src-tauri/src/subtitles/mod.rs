pub mod appearance;
pub mod disc;
mod disc_ocr;
pub mod download;
pub mod models;
pub mod overlay;
mod recognition;
mod timing;
mod translation;
use crate::{data_location::DataLocation, integration_settings, playback::PlaybackState};
use discatelier_contracts::AppError;

use recognition::{Engine, WINDOW};
use serde::Serialize;
use timing::Cue;

use std::{
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};
use tauri::Manager;
fn error(msg: impl Into<String>) -> AppError {
    AppError::new("subtitles", msg)
}
struct Job {
    model_id: String,
    id: String,
    session: String,
    track_id: i64,
    track: usize,
    video: PathBuf,
    engine: Engine,
    translation: Option<(String, String)>,
    stop: AtomicBool,
}
#[derive(Default)]
pub struct Jobs(Mutex<Option<Arc<Job>>>);
impl Jobs {
    fn current(&self, id: &str) -> Result<Arc<Job>, AppError> {
        self.0
            .lock()
            .map_err(|_| error("字幕服务不可用。"))?
            .as_ref()
            .filter(|j| j.id == id)
            .cloned()
            .ok_or_else(|| error("字幕任务已切换。"))
    }
    pub fn stop(&self, id: Option<&str>) {
        if let Ok(mut guard) = self.0.lock() {
            if guard
                .as_ref()
                .is_some_and(|j| id.is_none_or(|id| j.id == id))
            {
                if let Some(j) = guard.take() {
                    j.stop.store(true, Ordering::Release)
                }
            }
        }
    }
}
#[derive(Serialize)]
pub struct Started {
    id: String,
    bilingual: bool,
    notice: String,
    appearance: appearance::Appearance,
}
#[tauri::command]
pub fn subtitle_start(
    app: tauri::AppHandle,
    directory: tauri::State<'_, DataLocation>,
    playback: tauri::State<'_, PlaybackState>,
    jobs: tauri::State<'_, Jobs>,
    session: String,
    track_id: i64,
) -> Result<Started, AppError> {
    let s = snapshot(&playback)?;
    if s.session_id != session || !s.phase.active() || s.selected_audio != Some(track_id) {
        return Err(error("当前本地视频音轨不可用。"));
    }
    let track = s
        .audio_tracks
        .iter()
        .position(|a| a.id == track_id)
        .ok_or_else(|| error("无法定位当前音轨。"))?
        + 1;
    let video = if s.source.media_token == "local-video" {
        PathBuf::from(
            s.source
                .playlist
                .strip_prefix("local:")
                .ok_or_else(|| error("无效的视频来源。"))?,
        )
    } else {
        discatelier_player_vlc::captions::Capture::current(&session)?;
        PathBuf::new()
    };
    let resource = app
        .path()
        .resource_dir()
        .map_err(|_| error("无法定位字幕引擎。"))?;
    // Third-party CLI libraries use ordinary Win32 paths.
    let plain = |p: PathBuf| PathBuf::from(p.to_string_lossy().trim_start_matches(r"\\?\"));
    let p = models::read(&directory.0)?;
    // Keep model selection and session registration atomic with uninstall.
    let mut current = jobs.0.lock().map_err(|_| error("字幕服务不可用。"))?;
    let engine = Engine {
        scratch: plain(directory.0.join("subtitle-cache")),
        mpv: plain(resource.join("mpv/mpv.exe")),
        whisper: plain(resource.join("whisper/whisper-cli.exe")),
        model: plain(models::selected(&directory.0, &p)?),
        language: p.language,
    };
    if !engine.mpv.is_file() || !engine.whisper.is_file() {
        return Err(error("字幕运行组件缺失，请重新安装应用。"));
    }
    let translation = if p.bilingual {
        let ai = integration_settings::read(&directory.0)?;
        (!ai.ai_base_url.is_empty() && !ai.ai_model.is_empty())
            .then_some((ai.ai_base_url, ai.ai_model))
    } else {
        None
    };
    let bilingual = translation.is_some();
    let notice = if p.bilingual && !bilingual {
        "当前仅显示原文。配置“设置 → 助手”后可开启中文翻译。"
    } else {
        ""
    };
    let id = uuid::Uuid::new_v4().to_string();
    let job = Arc::new(Job {
        model_id: p.model,
        id: id.clone(),
        session,
        track_id,
        track,
        video,
        engine,
        translation,
        stop: AtomicBool::new(false),
    });
    if let Some(old) = current.replace(job) {
        old.stop.store(true, Ordering::Release)
    }
    Ok(Started {
        id,
        bilingual,
        notice: notice.into(),
        appearance: p.appearance,
    })
}
fn snapshot(playback: &PlaybackState) -> Result<discatelier_contracts::PlaybackSnapshot, AppError> {
    playback
        .lock()
        .map_err(|_| error("播放器不可用。"))?
        .as_ref()
        .ok_or_else(|| error("视频已关闭。"))?
        .snapshot()
}
fn active_job(jobs: &Jobs, id: &str, playback: &PlaybackState) -> Result<Arc<Job>, AppError> {
    let job = jobs.current(id)?;
    let s = snapshot(playback)?;
    if !s.phase.active() || s.session_id != job.session || s.selected_audio != Some(job.track_id) {
        return Err(error("播放会话或音轨已切换。"));
    }
    Ok(job)
}
#[tauri::command]
pub fn subtitle_stop(jobs: tauri::State<'_, Jobs>, id: String) {
    jobs.stop(Some(&id))
}
#[tauri::command]
pub async fn subtitle_recognize(
    jobs: tauri::State<'_, Jobs>,
    playback: tauri::State<'_, PlaybackState>,
    id: String,
    start: u64,
) -> Result<Vec<Cue>, AppError> {
    let job = active_job(&jobs, &id, &playback)?;
    if job.video.as_os_str().is_empty() || start % WINDOW != 0 {
        return Err(error("字幕片段时间无效。"));
    }
    tauri::async_runtime::spawn_blocking(move || {
        job.engine
            .recognize(&job.video, job.track, start, &job.stop)
    })
    .await
    .map_err(|_| error("识别任务中断。"))?
}
#[tauri::command]
pub async fn subtitle_translate(
    jobs: tauri::State<'_, Jobs>,
    playback: tauri::State<'_, PlaybackState>,
    id: String,
    lines: Vec<String>,
) -> Result<Vec<String>, AppError> {
    let job = active_job(&jobs, &id, &playback)?;
    if lines.is_empty() || lines.len() > 128 || lines.iter().map(String::len).sum::<usize>() > 16384
    {
        return Err(error("字幕文本长度异常。"));
    }
    tauri::async_runtime::spawn_blocking(move || {
        let (base, model) = job
            .translation
            .as_ref()
            .ok_or_else(|| error("未启用中文翻译。"))?;
        translation::translate(base, model, &lines, &job.stop)
    })
    .await
    .map_err(|_| error("翻译任务中断。"))?
}
