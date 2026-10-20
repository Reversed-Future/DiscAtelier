mod decisions;
mod host;
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

#[derive(Default)]
pub struct AgentState {
    running: AtomicBool,
    cancelled: AtomicBool,
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
    library: tauri::State<'_, LibraryState>,
    discogs: tauri::State<'_, DiscogsState>,
    state: tauri::State<'_, Arc<AgentState>>,
    directory: tauri::State<'_, DataLocation>,
    text: String,
) -> Result<Session, AppError> {
    let lease = acquire(state.inner())?;
    state.cancelled.store(false, Ordering::Release);
    let library = library.inner().clone();
    let discogs = discogs.inner().clone();
    let settings = integration_settings::read(&directory.0)?;
    if settings.ai_base_url.is_empty() || settings.ai_model.is_empty() {
        return Err(error("请在设置中填写 AI 服务地址和模型名称。"));
    }
    let key = integration_settings::key(&settings.ai_base_url)?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut session = load(&library)?;
        let mut host = host::ToolHost {
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
        decisions::decide(&library, &session_id, &proposal_id, approve, undo)
    })
    .await
    .map_err(|_| error("助手操作未完成。"))?
}
