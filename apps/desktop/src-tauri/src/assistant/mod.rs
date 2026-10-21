#[cfg(test)]
mod action_tests;
mod actions;
mod decisions;
mod host;
mod player;
mod prepare;
use crate::{
    commands::LibraryState, data_location::DataLocation, discogs::DiscogsState,
    integration_settings,
};
use discatelier_agent_harness::{Model, Session};
use discatelier_contracts::AppError;
use discatelier_integration_http::error;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tauri::Manager;

#[derive(Default)]
pub struct AgentState {
    running: AtomicBool,
    cancelled: AtomicBool,
    prepared: std::sync::Mutex<Option<actions::PreparedAction>>,
}
struct Lease(Arc<AgentState>);
impl Drop for Lease {
    fn drop(&mut self) {
        self.0.running.store(false, Ordering::Release);
    }
}
fn acquire(state: &Arc<AgentState>) -> Result<Lease, AppError> {
    state
        .running
        .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
        .map_err(|_| error("助手正在处理，请稍后。"))?;
    Ok(Lease(state.clone()))
}
fn load(library: &LibraryState) -> Result<Session, AppError> {
    host::with_library(library, |s| s.assistant_load())?
        .map(|text| Session::restore(&text))
        .transpose()
        .map(|s| s.unwrap_or_default())
}
fn save(library: &LibraryState, session: &Session) -> Result<(), AppError> {
    let payload = serde_json::to_string(session).map_err(|_| error("会话不可保存。"))?;
    host::with_library(library, |s| s.assistant_save(&session.id, &payload))
}
#[tauri::command]
pub async fn assistant_snapshot(
    library: tauri::State<'_, LibraryState>,
    state: tauri::State<'_, Arc<AgentState>>,
) -> Result<Session, AppError> {
    let library = library.inner().clone();
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut session = load(&library)?;
        if session.phase == "running" && !state.running.load(Ordering::Acquire) {
            session.phase = "interrupted".into();
            session.error = Some("上轮已中断，可继续提问。".into());
            // Snapshot is read-only: a new turn may start concurrently after this check.
        }
        Ok(session)
    })
    .await
    .map_err(|_| error("会话不可读取。"))?
}
#[tauri::command]
pub async fn assistant_send(
    window: tauri::WebviewWindow,
    on_event: tauri::ipc::Channel<Session>,
    text: String,
) -> Result<Session, AppError> {
    let state = window.state::<Arc<AgentState>>();
    let lease = acquire(state.inner())?;
    state.cancelled.store(false, Ordering::Release);
    let library = window.state::<LibraryState>().inner().clone();
    let discogs = window.state::<DiscogsState>().inner().clone();
    let runtime = window
        .state::<Arc<discatelier_netease_runtime::Runtime>>()
        .inner()
        .clone();
    let settings = integration_settings::read(&window.state::<DataLocation>().0)?;
    if settings.ai_base_url.is_empty() || settings.ai_model.is_empty() {
        return Err(error("请在设置中填写 AI 服务地址和模型名称。"));
    }
    let key = integration_settings::key(&settings.ai_base_url)?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut session = load(&library)?;
        let mut host = host::ToolHost {
            window,
            agent: lease.0.clone(),
            updates: on_event,
            runtime,
            library,
            discogs,
            settings: settings.clone(),
        };
        discatelier_agent_harness::run(
            &mut session,
            &text,
            Model {
                base: &settings.ai_base_url,
                name: &settings.ai_model,
                key: key.as_deref(),
            },
            &mut host,
            &lease.0.cancelled,
        )?;
        Ok(session)
    })
    .await
    .map_err(|_| error("助手运行中断。"))?
}
#[tauri::command]
pub fn assistant_cancel(state: tauri::State<'_, Arc<AgentState>>) {
    state.cancelled.store(true, Ordering::Release);
}
#[tauri::command]
pub async fn assistant_new(
    library: tauri::State<'_, LibraryState>,
    state: tauri::State<'_, Arc<AgentState>>,
) -> Result<Session, AppError> {
    let lease = acquire(state.inner())?;
    let library = library.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _lease = lease;
        *_lease
            .0
            .prepared
            .lock()
            .map_err(|_| error("变更预览不可用。"))? = None;
        let s = Session::default();
        save(&library, &s)?;
        Ok(s)
    })
    .await
    .map_err(|_| error("会话创建失败。"))?
}
#[tauri::command]
pub async fn assistant_decide(
    library: tauri::State<'_, LibraryState>,
    state: tauri::State<'_, Arc<AgentState>>,
    session_id: String,
    proposal_id: String,
    approve: bool,
    undo: bool,
) -> Result<Session, AppError> {
    let lease = acquire(state.inner())?;
    let library = library.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _lease = lease;
        let session = load(&library)?;
        if session.action.is_some() && !undo {
            decisions::decide_action(&library, &_lease.0, &session_id, &proposal_id, approve)
        } else {
            decisions::decide(&library, &session_id, &proposal_id, approve, undo)
        }
    })
    .await
    .map_err(|_| error("助手操作未完成。"))?
}

#[tauri::command]
pub fn assistant_preview_images(
    state: tauri::State<'_, Arc<AgentState>>,
    proposal_id: String,
) -> Result<actions::Images, AppError> {
    let guard = state
        .prepared
        .lock()
        .map_err(|_| error("变更预览不可用。"))?;
    let prepared = guard
        .as_ref()
        .ok_or_else(|| error("变更预览已失效，请取消后重新提出。"))?;
    prepared.check(&proposal_id)?;
    Ok(prepared.images.clone())
}
