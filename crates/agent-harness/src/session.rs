use discatelier_contracts::{AppError, UpdateCopy};
use discatelier_domain::CopyDraft;
use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ChangeField {
    pub label: String,
    pub before: String,
    pub after: String,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ActionPreview {
    pub id: String,
    pub title: String,
    pub kind: String,
    pub changes: Vec<ChangeField>,
    pub has_images: bool,
}

#[derive(Clone, Serialize, Deserialize)]
pub struct Function {
    pub name: String,
    pub arguments: String,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    pub r#type: String,
    pub function: Function,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Message {
    pub role: String,
    pub content: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tool_calls: Vec<ToolCall>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}
impl Message {
    pub fn text(role: &str, content: impl Into<String>) -> Self {
        Self {
            role: role.into(),
            content: Some(content.into()),
            tool_calls: vec![],
            tool_call_id: None,
        }
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Proposal {
    pub title: String,
    pub before: CopyDraft,
    pub request: UpdateCopy,
}
impl Proposal {
    pub fn validate(&self) -> Result<(), AppError> {
        let mut before = self.before.clone();
        before.status.clone_from(&self.request.copy.status);
        if serde_json::to_value(before).ok() != serde_json::to_value(&self.request.copy).ok()
            || self.request.expected_revision < 1
            || self.request.request_id.is_empty()
            || self.title.len() > 2000
        {
            return Err(AppError::new("policy", "仅允许确认已展示的状态修改。"));
        }
        discatelier_domain::validate_copy(&self.request.copy)
            .map_err(|e| AppError::new("policy", e))
    }
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub phase: String,
    pub messages: Vec<Message>,
    pub events: Vec<String>,
    pub pending: Option<Proposal>,
    #[serde(default)]
    pub action: Option<ActionPreview>,
    pub undo: Option<Proposal>,
    pub error: Option<String>,
}
impl Default for Session {
    fn default() -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            phase: "idle".into(),
            messages: vec![],
            events: vec![],
            pending: None,
            action: None,
            undo: None,
            error: None,
        }
    }
}
impl Session {
    pub fn event(&mut self, text: String) {
        self.events.push(text);
        if self.events.len() > 200 {
            self.events.remove(0);
        }
    }
    pub fn restore(text: &str) -> Result<Self, AppError> {
        let s: Self =
            serde_json::from_str(text).map_err(|_| AppError::new("assistant", "会话格式无效。"))?;
        if s.messages.len() > 120
            || s.events.len() > 200
            || text.len() > 1024 * 1024
            || uuid::Uuid::parse_str(&s.id).is_err()
            || s.messages
                .iter()
                .any(|m| !["user", "assistant", "tool"].contains(&m.role.as_str()))
        {
            return Err(AppError::new("assistant", "会话格式无效。"));
        }
        if let Some(p) = &s.pending {
            p.validate()?;
        }
        if let Some(action) = &s.action {
            if s.pending.is_some()
                || uuid::Uuid::parse_str(&action.id).is_err()
                || !["add", "supplement", "cover"].contains(&action.kind.as_str())
                || action.changes.len() > 30
                || action.title.len() > 2000
            {
                return Err(AppError::new("assistant", "待确认操作格式无效。"));
            }
        }
        if let Some(p) = &s.undo {
            p.validate()?;
        }
        Ok(s)
    }
}
