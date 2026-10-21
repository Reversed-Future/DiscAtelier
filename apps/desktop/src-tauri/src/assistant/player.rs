use super::host::{find, with_library, ToolHost};
use discatelier_agent_harness::tools::{parse, PlayMusic, PlayerControl};
use discatelier_contracts::{AppError, PlaybackControl, PlaybackSnapshot};
use discatelier_integration_http::error;
use serde_json::{json, Value};
use tauri::Manager;

fn snapshot(host: &ToolHost) -> Result<Option<PlaybackSnapshot>, AppError> {
    let state = host.window.state::<crate::playback::PlaybackState>();
    let current = state.lock().map_err(|_| error("播放服务不可用。"))?;
    current.as_ref().map(|p| p.snapshot()).transpose()
}
fn public(snapshot: Option<PlaybackSnapshot>) -> Value {
    snapshot.map(|s| json!({"sessionId":s.session_id,"title":s.title,"phase":s.phase,"paused":s.paused,"positionSeconds":s.position_seconds,"durationSeconds":s.duration_seconds,"seekable":s.seekable,"source":s.source})).unwrap_or(json!({"phase":"idle"}))
}
pub fn execute(host: &ToolHost, name: &str, arguments: &str) -> Result<Value, AppError> {
    match name {
        "get_playback" => {
            let args: Value = parse(arguments)?;
            if args != json!({}) {
                return Err(error("播放查询不接受参数。"));
            }
            Ok(public(snapshot(host)?))
        }
        "play_music" => {
            let args: PlayMusic = parse(arguments)?;
            let edition = with_library(&host.library, |s| Ok(find(s, &args.id)?.edition_id))?;
            Ok(public(Some(tauri::async_runtime::block_on(
                crate::netease_playback::netease_play(host.window.clone(), edition, args.song_id),
            )?)))
        }
        "control_playback" => {
            let args: PlayerControl = parse(arguments)?;
            let current = snapshot(host)?.ok_or_else(|| error("没有当前播放。"))?;
            if ["next", "previous"].contains(&args.action.as_str()) {
                let id: u64 = current
                    .source
                    .playlist
                    .strip_prefix("netease-song:")
                    .and_then(|s| s.parse().ok())
                    .ok_or_else(|| error("助手上下曲仅支持网易云关联专辑。"))?;
                let state = host
                    .window
                    .state::<std::sync::Arc<crate::netease_queue::QueueState>>();
                let next = with_library(&host.library, |s| {
                    crate::netease_queue::adjacent(
                        &state,
                        s,
                        &current.source.mount_point,
                        id,
                        args.action == "next",
                    )
                })?;
                return Ok(public(Some(tauri::async_runtime::block_on(
                    crate::netease_playback::netease_play(
                        host.window.clone(),
                        current.source.mount_point,
                        next,
                    ),
                )?)));
            }
            let control = match args.action.as_str() {
                "pause" => PlaybackControl::Pause { paused: true },
                "resume" => PlaybackControl::Pause { paused: false },
                "stop" => PlaybackControl::Stop,
                "seek" => {
                    let seconds = args
                        .seconds
                        .filter(|s| s.is_finite() && *s >= 0.0)
                        .ok_or_else(|| error("跳转秒数无效。"))?;
                    if !current.seekable || current.duration_seconds.is_some_and(|d| seconds > d) {
                        return Err(error("当前播放不能跳转到该位置。"));
                    }
                    PlaybackControl::Seek { seconds }
                }
                _ => return Err(error("播放操作不受支持。")),
            };
            let state = host.window.state::<crate::playback::PlaybackState>();
            let guard = state.lock().map_err(|_| error("播放服务不可用。"))?;
            let player = guard.as_ref().ok_or_else(|| error("当前播放已结束。"))?;
            player.control(&current.session_id, control)?;
            Ok(
                json!({"accepted":true,"action":args.action,"playback":public(Some(player.snapshot()?))}),
            )
        }
        _ => Err(error("播放工具未注册。")),
    }
}
