use crate::{
    bluray,
    job::PlayerJob,
    protocol::PlaybackState,
    session::{Checkpoint, Request},
    transport::Ipc,
    Decryptor, MpvProbe,
};
use discatelier_application::PlaybackProgress;
use discatelier_contracts::{
    AppError, PlaybackControl, PlaybackMode, PlaybackPhase, PlaybackSnapshot,
};
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    os::windows::process::CommandExt,
    path::{Path, PathBuf},
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
    let context = PlayContext {
        directory: &directory,
        shared: &shared,
        receiver: &receiver,
        checkpoint: &checkpoint,
        cancelled: &cancelled,
    };
    let result = match runtime {
        Ok(runtime) => {
            let mut result =
                runtime.block_on(play(&config, Decryptor::LocalAacs, &mut state, &context));
            if let Err(error) = &result {
                if !cancelled.load(Ordering::Acquire) {
                    if let Some(failure) = bluray::classify_decryption(
                        &error.message,
                        &read_log(&directory, &state.snapshot.session_id, Decryptor::LocalAacs),
                    ) {
                        if config.fallback_library().is_some() {
                            state.snapshot.playback_mode = PlaybackMode::MakeMkvFallback;
                            state.snapshot.phase = PlaybackPhase::Loading;
                            state.snapshot.error = None;
                            state.snapshot.duration_seconds = None;
                            state.snapshot.seekable = false;
                            state.snapshot.audio_tracks.clear();
                            state.snapshot.selected_audio = None;
                            state.loaded = false;
                            state.core_idle = true;
                            state.progress.reset_sample();
                            publish(&mut state, &shared, &checkpoint, false);
                            result = runtime.block_on(play(
                                &config,
                                Decryptor::MakeMkv,
                                &mut state,
                                &context,
                            ));
                            if let Err(fallback_error) = &result {
                                state.snapshot.error = Some(format!(
                                    "本地解密失败：{}；兼容模式也未能播放：{}",
                                    failure.message(),
                                    fallback_error.message
                                ));
                            }
                        } else {
                            let reason = if !config.fallback_enabled() {
                                "MakeMKV 兼容兜底已在播放设置中关闭，未启动兼容模式。"
                            } else {
                                "未配置可用的 MakeMKV libmmbd64.dll，未启动兼容模式。"
                            };
                            state.snapshot.error = Some(format!(
                                "{} {reason} 请导入适用的 KEYDB.cfg 后重试。",
                                failure.message()
                            ));
                        }
                    } else if let Some(report) = bluray::report(
                        &error.message,
                        &read_log(&directory, &state.snapshot.session_id, Decryptor::LocalAacs),
                    ) {
                        state.snapshot.error = Some(report.into());
                    }
                }
            }
            result
        }
        Err(_) => Err(AppError::new("player", "无法启动播放线程。")),
    };
    if let Err(error) = result {
        if state.snapshot.phase != PlaybackPhase::Stopping {
            state.snapshot.phase = PlaybackPhase::Failed;
            if state.snapshot.error.is_none() {
                state.snapshot.error = Some(error.message);
            }
        }
    }
    if state.snapshot.phase.active() {
        state.snapshot.phase = PlaybackPhase::Stopped;
    }
    for decryptor in [Decryptor::LocalAacs, Decryptor::MakeMkv] {
        let _ = std::fs::remove_file(log_path(&directory, &state.snapshot.session_id, decryptor));
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
        PlaybackControl::Volume { volume } => {
            if *volume > 100 {
                return Err(AppError::new("validation", "音量必须在 0–100 之间。"));
            }
            state.snapshot.volume = *volume;
            Ok(json!(["set_property", "volume", volume]))
        }
        PlaybackControl::Rate { rate } => {
            if !rate.is_finite() || !(0.25..=4.0).contains(rate) {
                return Err(AppError::new(
                    "validation",
                    "播放速度必须在 0.25–4 倍之间。",
                ));
            }
            state.snapshot.rate = *rate;
            state.progress.reset_sample();
            Ok(json!(["set_property", "speed", rate]))
        }
        PlaybackControl::Chapter { .. } => Err(AppError::new(
            "unsupported",
            "当前播放后端不支持 DVD 章节。",
        )),
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
fn log_path(directory: &Path, session_id: &str, decryptor: Decryptor) -> PathBuf {
    let suffix = match decryptor {
        Decryptor::LocalAacs => "aacs",
        Decryptor::MakeMkv => "compat",
    };
    directory.join(format!("mpv-{session_id}-{suffix}.log"))
}
fn read_log(directory: &Path, session_id: &str, decryptor: Decryptor) -> String {
    let path = log_path(directory, session_id, decryptor);
    let bytes = std::fs::read(path).unwrap_or_default();
    let start = bytes.len().saturating_sub(64 * 1024);
    String::from_utf8_lossy(&bytes[start..]).into_owned()
}
struct PlayContext<'a> {
    directory: &'a Path,
    shared: &'a Arc<Mutex<PlaybackSnapshot>>,
    receiver: &'a mpsc::Receiver<Request>,
    checkpoint: &'a Checkpoint,
    cancelled: &'a AtomicBool,
}
async fn play(
    config: &MpvProbe,
    decryptor: Decryptor,
    state: &mut PlaybackState,
    context: &PlayContext<'_>,
) -> Result<(), AppError> {
    let PlayContext {
        directory,
        shared,
        receiver,
        checkpoint,
        cancelled,
    } = context;
    let pipe = format!(r"\\.\pipe\discatelier-{}", state.snapshot.session_id);
    let bindings = directory.join("player-bindings.conf");
    let log = log_path(directory, &state.snapshot.session_id, decryptor);
    let _ = std::fs::remove_file(&log);
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
        .arg(format!("--log-file={}", log.display()))
        .arg("--msg-level=all=error")
        .arg(format!("--start={}", state.snapshot.position_seconds));
    if !state.snapshot.source.playlist.starts_with("local:")
        && !state.snapshot.source.mount_point.is_empty()
    {
        process.arg(format!(
            "--bluray-device={}",
            state.snapshot.source.mount_point
        ));
    }
    process
        .creation_flags(windows_sys::Win32::System::Threading::CREATE_NO_WINDOW)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    config.decryptor_env(&mut process, decryptor);
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
