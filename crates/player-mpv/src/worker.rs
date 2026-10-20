use crate::{
    job::PlayerJob,
    protocol::PlaybackState,
    session::{Checkpoint, Request},
    transport::Ipc,
    MpvProbe,
};
use discatelier_application::PlaybackProgress;
use discatelier_contracts::{AppError, PlaybackControl, PlaybackPhase, PlaybackSnapshot};
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    os::windows::process::CommandExt,
    path::PathBuf,
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex,
    },
    time::{Duration, Instant},
};

pub fn run(
    config: MpvProbe,
    initial: PlaybackSnapshot,
    directory: PathBuf,
    shared: Arc<Mutex<PlaybackSnapshot>>,
    receiver: mpsc::Receiver<Request>,
    checkpoint: Checkpoint,
    cancelled: Arc<AtomicBool>,
) {
    let mut state = PlaybackState {
        snapshot: initial,
        progress: PlaybackProgress::default(),
        loaded: false,
        core_idle: true,
    };
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build();
    let result = match runtime {
        Ok(runtime) => runtime.block_on(play(
            &config,
            &directory,
            &mut state,
            &shared,
            &receiver,
            &checkpoint,
            &cancelled,
        )),
        Err(_) => Err(AppError::new("player", "无法启动播放线程。")),
    };
    if let Err(error) = result {
        if state.snapshot.phase != PlaybackPhase::Stopping {
            state.snapshot.phase = PlaybackPhase::Failed;
            state.snapshot.error = Some(error.message);
        }
    }
    if state.snapshot.phase.active() {
        state.snapshot.phase = PlaybackPhase::Stopped;
    }
    publish(&mut state, &shared, &checkpoint, true);
}
fn publish(
    state: &mut PlaybackState,
    shared: &Arc<Mutex<PlaybackSnapshot>>,
    checkpoint: &Checkpoint,
    save: bool,
) {
    state.snapshot.updated_at = chrono::Utc::now().to_rfc3339();
    if save {
        if let Err(error) = checkpoint(&state.snapshot) {
            state.snapshot.error = Some(format!("播放历史未保存：{}", error.message));
        }
    }
    if let Ok(mut current) = shared.lock() {
        *current = state.snapshot.clone();
    }
}
fn command(state: &mut PlaybackState, control: &PlaybackControl) -> Result<Value, AppError> {
    if matches!(control, PlaybackControl::Stop) {
        return Ok(json!(["quit"]));
    }
    if !state.loaded {
        return Err(AppError::new("player", "光盘仍在读取中。"));
    }
    match control {
        PlaybackControl::Pause { paused } => Ok(json!(["set_property", "pause", paused])),
        PlaybackControl::Seek { seconds } => {
            if !seconds.is_finite()
                || *seconds < 0.0
                || !state.snapshot.seekable
                || !state
                    .snapshot
                    .duration_seconds
                    .is_some_and(|d| *seconds <= d)
            {
                return Err(AppError::new("validation", "当前播放位置不可跳转。"));
            }
            state.progress.reset_sample();
            Ok(json!(["seek", seconds, "absolute+exact"]))
        }
        PlaybackControl::Audio { id } => {
            if !state.snapshot.audio_tracks.iter().any(|t| t.id == *id) {
                return Err(AppError::new("validation", "音轨不存在。"));
            }
            Ok(json!(["set_property", "aid", id]))
        }
        PlaybackControl::Menu { .. } => {
            Err(AppError::new("unsupported", "当前播放后端不支持原盘菜单。"))
        }
        PlaybackControl::Stop => unreachable!(),
    }
}
async fn play(
    config: &MpvProbe,
    directory: &std::path::Path,
    state: &mut PlaybackState,
    shared: &Arc<Mutex<PlaybackSnapshot>>,
    receiver: &mpsc::Receiver<Request>,
    checkpoint: &Checkpoint,
    cancelled: &AtomicBool,
) -> Result<(), AppError> {
    let pipe = format!(r"\\.\pipe\discatelier-{}", state.snapshot.session_id);
    let bindings = directory.join("player-bindings.conf");
    std::fs::write(&bindings,"SPACE cycle pause\nLEFT seek -5 relative\nRIGHT seek 5 relative\nf cycle fullscreen\nESC quit\nq quit\n")
        .map_err(|_|AppError::new("player","无法保存播放快捷键。"))?;
    let mut process = Command::new(&config.executable);
    if let Some(window) = config.video_window {
        // MPV's documented Win32 --wid contract takes the HWND cast to uint32_t.
        process.arg(format!("--wid={}", window as u32)).args([
            "--input-vo-keyboard=no",
            "--input-cursor=no",
            "--input-cursor-passthrough=yes",
        ]);
    }
    process
        .args([
            "--no-config",
            "--load-scripts=no",
            "--idle=yes",
            "--force-window=immediate",
            "--osc=no",
            "--input-default-bindings=no",
            "--input-media-keys=no",
            "--drag-and-drop=no",
            "--resume-playback=no",
            "--save-position-on-quit=no",
            "--save-watch-history=no",
            "--keep-open=no",
            "--title=DiscAtelier",
        ])
        .arg(format!("--input-conf={}", bindings.display()))
        .arg(format!("--input-ipc-server={pipe}"))
        .arg(format!(
            "--bluray-device={}",
            state.snapshot.source.mount_point
        ))
        .arg(format!("--start={}", state.snapshot.position_seconds))
        .creation_flags(windows_sys::Win32::System::Threading::CREATE_NO_WINDOW)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    if let Some(path) = &config.make_mkv_library {
        let stem = path.with_extension("");
        process
            .env("LIBAACS_PATH", &stem)
            .env("LIBBDPLUS_PATH", &stem);
    }
    let mut child = process
        .spawn()
        .map_err(|_| AppError::new("player", "无法启动 MPV。"))?;
    let job = PlayerJob::attach(&mut child)?;
    let started = Instant::now();
    let mut ipc = loop {
        if cancelled.load(Ordering::Acquire) {
            state.snapshot.phase = PlaybackPhase::Stopping;
            return Ok(());
        }
        if let Ok(request) = receiver.try_recv() {
            if matches!(request.control, PlaybackControl::Stop) {
                state.snapshot.phase = PlaybackPhase::Stopping;
                let _ = request.reply.send(Ok(()));
                return Ok(());
            }
            let _ = request
                .reply
                .send(Err(AppError::new("player", "播放器正在启动。")));
        }
        if child
            .try_wait()
            .map_err(|_| AppError::new("player", "无法读取播放器进程状态。"))?
            .is_some()
        {
            return Err(AppError::new("player", "MPV 启动失败，请检查播放设置。"));
        }
        if let Ok(ipc) = Ipc::connect(&pipe) {
            break ipc;
        }
        if started.elapsed() > Duration::from_secs(8) {
            return Err(AppError::new("player", "MPV 控制连接超时。"));
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    };
    let properties = [
        "time-pos",
        "duration",
        "pause",
        "core-idle",
        "seeking",
        "seekable",
        "track-list",
        "media-title",
    ];
    for (index, name) in properties.iter().enumerate() {
        ipc.send(
            index as u64 + 1,
            json!(["observe_property", index + 1, name]),
        )
        .await?;
    }
    ipc.send(
        20,
        json!([
            "loadfile",
            config.media_url(&state.snapshot.source),
            "replace"
        ]),
    )
    .await?;
    let mut pending: BTreeMap<u64, (Instant, mpsc::Sender<Result<(), AppError>>)> = BTreeMap::new();
    let mut sequence = 100u64;
    let mut closing = None;
    let mut saved = Instant::now();
    let mut heartbeat = Instant::now();
    let mut heartbeat_pending = None;
    let mut previous_phase = state.snapshot.phase.clone();
    loop {
        if cancelled.load(Ordering::Acquire) && closing.is_none() {
            state.snapshot.phase = PlaybackPhase::Stopping;
            state.progress.reset_sample();
            closing = Some(Instant::now());
            let _ = ipc.send(30, json!(["quit"])).await;
        }
        if closing.is_none()
            && state.loaded
            && heartbeat.elapsed() >= Duration::from_secs(5)
            && heartbeat_pending.is_none()
        {
            ipc.send(40, json!(["get_property", "pause"])).await?;
            heartbeat_pending = Some(Instant::now());
        }
        if let Ok(request) = receiver.try_recv() {
            match command(state, &request.control) {
                Ok(value) => {
                    sequence += 1;
                    if matches!(request.control, PlaybackControl::Stop) {
                        state.snapshot.phase = PlaybackPhase::Stopping;
                        state.progress.reset_sample();
                        closing = Some(Instant::now());
                        let _ = ipc.send(sequence, value).await;
                        let _ = request.reply.send(Ok(()));
                    } else {
                        match ipc.send(sequence, value).await {
                            Ok(()) => {
                                pending.insert(sequence, (Instant::now(), request.reply));
                            }
                            Err(error) => {
                                let _ = request.reply.send(Err(error));
                            }
                        }
                    }
                }
                Err(error) => {
                    let _ = request.reply.send(Err(error));
                }
            }
        }
        match ipc.next().await {
            Ok(Some(value)) => {
                if let Some(id) = value["request_id"].as_u64() {
                    if id == 40 {
                        heartbeat = Instant::now();
                        heartbeat_pending = None;
                    }
                    if let Some((_, reply)) = pending.remove(&id) {
                        let result = if value["error"] == "success" {
                            Ok(())
                        } else {
                            Err(AppError::new(
                                "player",
                                format!(
                                    "操作未完成：{}",
                                    value["error"].as_str().unwrap_or("未知响应")
                                ),
                            ))
                        };
                        let _ = reply.send(result);
                    } else if id == 20 && value["error"] != "success" {
                        return Err(AppError::new(
                            "player",
                            format!(
                                "光盘打开失败：{}",
                                value["error"].as_str().unwrap_or("未知响应")
                            ),
                        ));
                    }
                }
                state.event(&value, started.elapsed().as_secs_f64());
            }
            Ok(None) => {}
            Err(error) => {
                if !state.snapshot.phase.active() || closing.is_some() {
                    break;
                }
                return Err(error);
            }
        }
        let phase_changed = previous_phase != state.snapshot.phase;
        publish(
            state,
            shared,
            checkpoint,
            phase_changed || saved.elapsed() >= Duration::from_secs(5),
        );
        if phase_changed || saved.elapsed() >= Duration::from_secs(5) {
            saved = Instant::now();
        }
        previous_phase = state.snapshot.phase.clone();
        pending.retain(|_, (sent, reply)| {
            if sent.elapsed() < Duration::from_secs(3) {
                true
            } else {
                let _ = reply.send(Err(AppError::new("player", "播放器未确认操作。")));
                false
            }
        });
        if !state.snapshot.phase.active() && closing.is_none() {
            closing = Some(Instant::now());
            let _ = ipc.send(30, json!(["quit"])).await;
        }
        if let Some(status) = child
            .try_wait()
            .map_err(|_| AppError::new("player", "播放器进程不可读取。"))?
        {
            if !status.success() && closing.is_none() && state.snapshot.phase.active() {
                return Err(AppError::new(
                    "player",
                    "播放器异常退出，已保存最后播放位置。",
                ));
            }
            break;
        }
        if closing.is_some_and(|time| time.elapsed() > Duration::from_secs(2)) {
            break;
        }
        if closing.is_none()
            && heartbeat_pending.is_some_and(|time| time.elapsed() > Duration::from_secs(3))
        {
            return Err(AppError::new(
                "player",
                "播放器控制连接已失去响应，播放已停止。",
            ));
        }
        if !state.loaded && closing.is_none() && started.elapsed() > Duration::from_secs(60) {
            return Err(AppError::new("player", "光盘读取超时，播放已停止。"));
        }
    }
    drop(ipc);
    drop(job);
    let _ = child.wait();
    for (_, (_, reply)) in pending {
        let _ = reply.send(Err(AppError::new("session", "播放会话已结束。")));
    }
    Ok(())
}
