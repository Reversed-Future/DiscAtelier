use crate::{commands::LibraryState, discogs::DiscogsState, integration_settings::Settings};
use discatelier_agent_harness::{tools::*, Host, Proposal, Session, ToolResult};
use discatelier_application::LibraryService;
use discatelier_contracts::*;
use discatelier_integration_http::error;
use discatelier_storage::SqliteLibrary;
use serde_json::{json, Value};

pub struct ToolHost {
    pub window: tauri::WebviewWindow,
    pub agent: std::sync::Arc<super::AgentState>,
    pub updates: tauri::ipc::Channel<Session>,
    pub runtime: std::sync::Arc<discatelier_netease_runtime::Runtime>,
    pub library: LibraryState,
    pub discogs: DiscogsState,
    pub settings: Settings,
}
pub fn with_library<T>(
    state: &LibraryState,
    action: impl FnOnce(&mut LibraryService<SqliteLibrary>) -> Result<T, AppError>,
) -> Result<T, AppError> {
    let mut guard = state.lock().map_err(|_| error("收藏库不可访问。"))?;
    action(guard.as_mut().map_err(|e| e.clone())?)
}
pub(super) fn find(s: &LibraryService<SqliteLibrary>, id: &str) -> Result<LibraryCopy, AppError> {
    for category in ["music", "video"] {
        if let Some(item) = s
            .list(LibraryQuery {
                category_id: category.into(),
                query: String::new(),
                status: None,
            })?
            .copies
            .into_iter()
            .find(|c| c.id == id)
        {
            return Ok(item);
        }
    }
    Err(error("未找到这个副本 ID。"))
}
fn public_item(item: &LibraryCopy) -> Value {
    json!({"id":item.id,"editionId":item.edition_id,"title":item.edition.title,"creator":item.edition.creator,"status":item.copy.status,"edition":item.edition,"revision":item.revision})
}
impl Host for ToolHost {
    fn progress(&mut self, session: &Session) {
        let _ = self.updates.send(session.clone());
    }
    fn checkpoint(&mut self, session: &Session) -> Result<(), AppError> {
        let text = serde_json::to_string(session).map_err(|_| error("会话不可保存。"))?;
        with_library(&self.library, |s| s.assistant_save(&session.id, &text))
    }
    fn execute(&mut self, name: &str, arguments: &str) -> Result<ToolResult, AppError> {
        let mut proposal = None;
        let mut action = None;
        let value = match name {
            "propose_add_collection" | "propose_netease_supplement" | "propose_cover" => {
                let prepared = super::prepare::prepare(self, name, arguments)?;
                let preview = prepared.preview.clone();
                let value = json!({"status":"awaiting_user_confirmation","title":preview.title,"written":false});
                *self
                    .agent
                    .prepared
                    .lock()
                    .map_err(|_| error("变更预览不可用。"))? = Some(prepared);
                action = Some(preview);
                value
            }
            "get_playback" | "play_music" | "control_playback" => {
                super::player::execute(self, name, arguments)?
            }
            "search_library" => {
                let args: SearchLibrary = parse(arguments)?;
                with_library(&self.library, |s| {
                    let result = s.list(LibraryQuery {
                        category_id: args.category,
                        query: args.query,
                        status: args.status,
                    })?;
                    Ok(
                        json!({"count":result.copies.len(),"ownedCount":result.owned_count,"amountsMinor":result.amounts,"unpricedCount":result.unpriced_count,"items":result.copies.iter().take(30).map(public_item).collect::<Vec<_>>(),"truncated":result.copies.len()>30}),
                    )
                })?
            }
            "get_copy" => {
                let args: CopyId = parse(arguments)?;
                with_library(&self.library, |s| {
                    let item = find(s, &args.id)?;
                    Ok(
                        json!({"copy":public_item(&item),"content":s.edition_content(&item.edition_id)?,"netease":s.supplement(&item.edition_id)?}),
                    )
                })?
            }
            "search_netease" => {
                let args: Query = parse(arguments)?;
                json!(crate::netease::search(
                    &self.runtime,
                    &self.settings,
                    &args.query
                )?)
            }
            "get_netease_album" => {
                let args: RemoteId = parse(arguments)?;
                json!(crate::netease::album(
                    &self.runtime,
                    &self.settings,
                    args.id
                )?)
            }
            "search_discogs" => {
                let args: Query = parse(arguments)?;
                crate::discogs::assistant::search(&self.discogs, args.query)?
            }
            "get_discogs_release" => {
                let args: RemoteId = parse(arguments)?;
                crate::discogs::assistant::release(&self.discogs, args.id)?
            }
            "propose_status" => {
                let args: ChangeStatus = parse(arguments)?;
                let p = with_library(&self.library, |s| {
                    let item = find(s, &args.id)?;
                    if !["owned", "wanted", "transit"].contains(&args.status.as_str())
                        || args.status == item.copy.status
                    {
                        return Err(error("目标状态无效或无需修改。"));
                    }
                    let mut copy = item.copy.clone();
                    copy.status = args.status;
                    Ok(Proposal {
                        title: item.edition.title,
                        before: item.copy,
                        request: UpdateCopy {
                            request_id: uuid::Uuid::new_v4().to_string(),
                            id: item.id,
                            expected_revision: item.revision,
                            copy,
                        },
                    })
                })?;
                let value = json!({"status":"awaiting_user_confirmation","title":p.title,"before":p.before.status,"after":p.request.copy.status,"written":false});
                proposal = Some(p);
                value
            }
            _ => return Err(error("工具未注册或没有访问权限。")),
        };
        Ok(ToolResult {
            value,
            proposal,
            action,
        })
    }
}
