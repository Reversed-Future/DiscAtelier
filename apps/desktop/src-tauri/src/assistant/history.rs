use super::{acquire, host::with_library, load, save, AgentState};
use crate::commands::LibraryState;
use discatelier_agent_harness::Session;
use discatelier_contracts::{AppError, AssistantHistoryEntry};
use discatelier_integration_http::error;
use serde::Serialize;
use std::sync::Arc;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryPage {
    items: Vec<AssistantHistoryEntry>,
    next_offset: Option<u32>,
}

#[tauri::command]
pub async fn assistant_history(
    library: tauri::State<'_, LibraryState>,
    offset: u32,
) -> Result<HistoryPage, AppError> {
    let library = library.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut items = with_library(&library, |s| s.assistant_history(offset))?;
        let next_offset = (items.len() > 30).then(|| offset.saturating_add(30));
        items.truncate(30);
        Ok(HistoryPage { items, next_offset })
    })
    .await
    .map_err(|_| error("会话历史不可读取。"))?
}

pub(super) fn allow_switch(session: &Session) -> Result<(), AppError> {
    if session.pending.is_some() || session.action.is_some() {
        return Err(error("请先处理当前会话中待确认的修改。"));
    }
    Ok(())
}

#[tauri::command]
pub async fn assistant_resume(
    library: tauri::State<'_, LibraryState>,
    state: tauri::State<'_, Arc<AgentState>>,
    id: String,
) -> Result<Session, AppError> {
    let lease = acquire(state.inner())?;
    let library = library.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let _lease = lease;
        allow_switch(&load(&library)?)?;
        let payload = with_library(&library, |s| s.assistant_load_id(&id))?
            .ok_or_else(|| error("会话不存在。"))?;
        let mut session = Session::restore(&payload)?;
        if session.id != id {
            return Err(error("会话编号不匹配。"));
        }
        if session.phase == "running" {
            session.phase = "interrupted".into();
            session.error = Some("上轮已中断，可以重试。".into());
        }
        save(&library, &session)?;
        Ok(session)
    })
    .await
    .map_err(|_| error("无法打开会话。"))?
}
