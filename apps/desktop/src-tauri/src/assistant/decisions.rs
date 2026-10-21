use super::{host, load, save};
use crate::commands::LibraryState;
use discatelier_agent_harness::{Message, Proposal, Session};
use discatelier_contracts::{AppError, UpdateCopy};
use discatelier_integration_http::error;

pub fn decide(
    library: &LibraryState,
    session_id: &str,
    proposal_id: &str,
    approve: bool,
    undo: bool,
) -> Result<Session, AppError> {
    let mut session = load(library)?;
    if session.id != session_id || session.action.is_some() || undo && session.pending.is_some() {
        return Err(error("会话已变化，请刷新。"));
    }
    let proposal = if undo {
        session.undo.clone()
    } else {
        session.pending.clone()
    }
    .filter(|p| p.request.request_id == proposal_id)
    .ok_or_else(|| error("修改已处理或不存在。"))?;
    proposal.validate()?;
    if approve {
        host::with_library(library, |s| s.update(proposal.request.clone()))?;
        session.undo = if undo {
            None
        } else {
            Some(Proposal {
                title: proposal.title.clone(),
                before: proposal.request.copy.clone(),
                request: UpdateCopy {
                    request_id: uuid::Uuid::new_v4().to_string(),
                    id: proposal.request.id.clone(),
                    expected_revision: proposal.request.expected_revision + 1,
                    copy: proposal.before.clone(),
                },
            })
        };
    }
    if !undo {
        session.pending = None;
    }
    let result = if approve {
        if undo {
            "已撤销状态修改"
        } else {
            "已保存状态修改"
        }
    } else {
        "已取消状态修改"
    };
    session.phase = "idle".into();
    session.error = None;
    session.event(format!("{} · {}", proposal.title, result));
    session
        .messages
        .push(Message::text("user", format!("界面操作结果：{result}。")));
    save(library, &session)?;
    Ok(session)
}

pub fn decide_action(
    library: &LibraryState,
    state: &super::AgentState,
    session_id: &str,
    id: &str,
    approve: bool,
) -> Result<Session, AppError> {
    let mut session = load(library)?;
    if session.id != session_id {
        return Err(error("会话已变化，请刷新。"));
    }
    let preview = session
        .action
        .clone()
        .filter(|p| p.id == id)
        .ok_or_else(|| error("操作已处理或不存在。"))?;
    let mut guard = state
        .prepared
        .lock()
        .map_err(|_| error("变更预览不可用。"))?;
    if approve {
        let prepared = guard
            .as_ref()
            .ok_or_else(|| error("应用重启或预览已失效，请取消后重新提出。"))?;
        prepared.check(id)?;
        prepared.apply(library)?;
    }
    // Cache stays available if the write fails. Revisions reject stale edits;
    // create/import request receipts prevent duplicate inserts on retry.
    session.action = None;
    if approve {
        session.undo = None;
    }
    session.phase = "idle".into();
    session.error = None;
    let result = if approve {
        "已保存确认的变更"
    } else {
        "已取消，收藏未修改"
    };
    session.event(format!("{} · {result}", preview.title));
    session.messages.push(Message::text(
        "user",
        format!("界面操作结果：{}；{result}。", preview.title),
    ));
    save(library, &session)?;
    *guard = None;
    Ok(session)
}

#[cfg(test)]
mod tests {
    use super::*;
    use discatelier_application::LibraryService;
    use discatelier_contracts::{CreateCopy, LibraryQuery};
    use discatelier_storage::SqliteLibrary;
    use std::sync::{Arc, Mutex};
    fn query() -> LibraryQuery {
        LibraryQuery {
            category_id: "music".into(),
            query: String::new(),
            status: None,
        }
    }
    #[test]
    fn confirmation_rejects_stale_changes_and_supports_once_only_undo() {
        let dir =
            std::env::temp_dir().join(format!("discatelier-agent-test-{}", uuid::Uuid::new_v4()));
        let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
        let request: CreateCopy = serde_json::from_value(serde_json::json!({"requestId":uuid::Uuid::new_v4().to_string(),"edition":{"categoryId":"music","title":"Fixture","creator":"Artist","editionLabel":"","barcode":"","catalogNumber":"","media":[{"carrierId":"cd","label":""}]},"existingEditionId":null,"copy":{"status":"wanted","acquiredAt":"","amountMinor":null,"currency":"CNY","seller":"","purchaseUrl":"","storageLocation":"","notes":"private note"}})).unwrap();
        service.create(request).unwrap();
        let item = service.list(query()).unwrap().copies.remove(0);
        let mut copy = item.copy.clone();
        copy.status = "owned".into();
        let proposal = Proposal {
            title: item.edition.title,
            before: item.copy.clone(),
            request: UpdateCopy {
                id: item.id,
                request_id: uuid::Uuid::new_v4().to_string(),
                expected_revision: item.revision,
                copy,
            },
        };
        let library: LibraryState = Arc::new(Mutex::new(Ok(service)));
        let mut session = Session {
            pending: Some(proposal.clone()),
            ..Default::default()
        };
        save(&library, &session).unwrap();
        assert!(decide(&library, &session.id, "wrong", true, false).is_err());
        assert_eq!(
            host::with_library(&library, |s| s.list(query()))
                .unwrap()
                .copies[0]
                .copy
                .status,
            "wanted"
        );
        session = decide(
            &library,
            &session.id,
            &proposal.request.request_id,
            true,
            false,
        )
        .unwrap();
        assert!(decide(
            &library,
            &session.id,
            &proposal.request.request_id,
            true,
            false
        )
        .is_err());
        let item = host::with_library(&library, |s| s.list(query()))
            .unwrap()
            .copies
            .remove(0);
        assert_eq!(item.copy.status, "owned");
        assert_eq!(item.copy.notes, "private note");
        let undo = session.undo.clone().unwrap();
        session = decide(&library, &session.id, &undo.request.request_id, true, true).unwrap();
        assert!(session.undo.is_none());
        assert_eq!(
            host::with_library(&library, |s| s.list(query()))
                .unwrap()
                .copies[0]
                .copy
                .status,
            "wanted"
        );
        session.pending = Some(proposal);
        save(&library, &session).unwrap();
        // A fresh request ID with an old revision cannot overwrite subsequent edits.
        session.pending.as_mut().unwrap().request.request_id = uuid::Uuid::new_v4().to_string();
        save(&library, &session).unwrap();
        assert!(decide(
            &library,
            &session.id,
            &session.pending.as_ref().unwrap().request.request_id,
            true,
            false
        )
        .is_err());
    }
}
