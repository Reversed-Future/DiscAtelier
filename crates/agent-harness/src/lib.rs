pub mod session;
mod streaming;
pub mod tools;
use discatelier_contracts::AppError;
use discatelier_integration_http::error;
use serde::Deserialize;
use serde_json::{json, Value};
pub use session::{ActionPreview, ChangeField, Message, Proposal, Session};
use std::sync::atomic::{AtomicBool, Ordering};

pub struct ToolResult {
    pub value: Value,
    pub proposal: Option<Proposal>,
    pub action: Option<ActionPreview>,
}
pub trait Host {
    fn execute(&mut self, name: &str, arguments: &str) -> Result<ToolResult, AppError>;
    fn checkpoint(&mut self, session: &Session) -> Result<(), AppError>;
    fn progress(&mut self, _session: &Session) {}
}
pub struct Model<'a> {
    pub base: &'a str,
    pub name: &'a str,
    pub key: Option<&'a str>,
}
#[derive(Deserialize)]
struct Response {
    choices: Vec<Choice>,
}
#[derive(Deserialize)]
struct Choice {
    message: Message,
    finish_reason: String,
}
pub const SYSTEM: &str = include_str!("prompt.txt");

pub fn reply(value: Value) -> Result<Message, AppError> {
    let r: Response =
        serde_json::from_value(value).map_err(|_| error("兼容接口响应格式不匹配。"))?;
    if r.choices.len() != 1 {
        return Err(error("接口应返回一条回答。"));
    }
    let choice = r.choices.into_iter().next().unwrap();
    let m = choice.message;
    if m.role != "assistant"
        || m.tool_calls.len() > 1
        || !["stop", "tool_calls"].contains(&choice.finish_reason.as_str())
        || m.content.as_ref().is_some_and(|s| s.len() > 32000)
        || (m.tool_calls.is_empty() && m.content.as_deref().unwrap_or("").is_empty())
        || m.tool_calls
            .iter()
            .any(|t| t.id.is_empty() || t.id.len() > 200 || t.r#type != "function")
    {
        return Err(error("接口回答不完整或工具格式不受支持，请重试。"));
    }
    Ok(m)
}
pub fn run(
    session: &mut Session,
    text: &str,
    model: Model<'_>,
    host: &mut impl Host,
    cancelled: &AtomicBool,
) -> Result<(), AppError> {
    if session.pending.is_some() || session.action.is_some() {
        return Err(error("请先处理待确认的修改。"));
    }
    if text.trim().is_empty() || text.len() > 8000 || session.messages.len() > 90 {
        return Err(error("消息为空、过长或会话已满，请新建会话。"));
    }
    session.messages.push(Message::text("user", text));
    execute_turn(session, model, host, cancelled)
}
pub fn retry(
    session: &mut Session,
    model: Model<'_>,
    host: &mut impl Host,
    cancelled: &AtomicBool,
) -> Result<(), AppError> {
    if session.pending.is_some() || session.action.is_some() {
        return Err(error("请先处理待确认的修改。"));
    }
    if session.phase == "running" {
        return Err(error("助手正在处理，请稍后重试。"));
    }
    let index = session
        .messages
        .iter()
        .rposition(|message| message.role == "user")
        .ok_or_else(|| error("没有可重试的消息。"))?;
    // Discard the interrupted answer and any tool messages so the same user
    // turn is sent again without duplicating the prompt.
    session.messages.truncate(index + 1);
    execute_turn(session, model, host, cancelled)
}
fn execute_turn(
    session: &mut Session,
    model: Model<'_>,
    host: &mut impl Host,
    cancelled: &AtomicBool,
) -> Result<(), AppError> {
    session.phase = "running".into();
    session.error = None;
    host.checkpoint(session)?;
    let result = turn(session, model, host, cancelled);
    match result {
        Ok(()) => {
            if session.pending.is_none() && session.action.is_none() {
                session.phase = "idle".into();
            }
        }
        Err(e) => {
            session.phase = if cancelled.load(Ordering::Acquire) {
                "cancelled"
            } else {
                "failed"
            }
            .into();
            session.error = Some(e.message);
        }
    }
    host.checkpoint(session)
}
fn turn(
    session: &mut Session,
    model: Model<'_>,
    host: &mut impl Host,
    cancelled: &AtomicBool,
) -> Result<(), AppError> {
    for _ in 0..8 {
        if cancelled.load(Ordering::Acquire) {
            return Err(error("已停止。"));
        }
        let mut messages = vec![Message::text("system", SYSTEM)];
        messages.extend(session.messages.clone());
        let payload = json!({"model":model.name,"messages":messages,"tools":tools::definitions(),"tool_choice":"auto","parallel_tool_calls":false,"stream":true});
        if payload.to_string().len() > 180000 {
            return Err(error("上下文已满，请新建会话。"));
        }
        let index = session.messages.len();
        session.messages.push(Message::text("assistant", ""));
        host.progress(session);
        let mut last = std::time::Instant::now() - std::time::Duration::from_secs(1);
        let result = streaming::complete(&model, &payload, cancelled, |text| {
            session.messages[index].content = Some(text.into());
            if last.elapsed() >= std::time::Duration::from_millis(40) {
                host.progress(session);
                last = std::time::Instant::now();
            }
        });
        let message = match result {
            Ok(message) => message,
            Err(e) => {
                if session.messages[index]
                    .content
                    .as_deref()
                    .unwrap_or("")
                    .is_empty()
                {
                    session.messages.pop();
                }
                return Err(e);
            }
        };
        if cancelled.load(Ordering::Acquire) {
            return Err(error("已停止。"));
        }
        let calls = message.tool_calls.clone();
        session.messages[index] = message;
        host.progress(session);
        if calls.is_empty() {
            return Ok(());
        }
        for call in calls {
            let registered = tools::definitions().as_array().is_some_and(|tools| {
                tools
                    .iter()
                    .any(|t| t["function"]["name"] == call.function.name)
            });
            let result = if registered {
                host.execute(&call.function.name, &call.function.arguments)
            } else {
                Err(error("工具未注册。"))
            };
            let value = match result {
                Ok(result) => {
                    session.pending = result.proposal;
                    session.action = result.action;
                    result.value
                }
                Err(e) => json!({"error":e.message}),
            };
            let mut body = value.to_string();
            if body.len() > 32000 {
                body = json!({"error":"结果超出上下文限制，请缩小查询。"}).to_string();
            }
            session.event(format!(
                "{} · {}",
                call.function.name,
                if value.get("error").is_some() {
                    "失败"
                } else if session.pending.is_some() || session.action.is_some() {
                    "待确认"
                } else {
                    "完成"
                }
            ));
            let mut message = Message::text("tool", body);
            message.tool_call_id = Some(call.id);
            session.messages.push(message);
        }
        if cancelled.load(Ordering::Acquire) {
            session.pending = None;
            session.action = None;
            return Err(error("已停止。"));
        }
        if session.pending.is_some() || session.action.is_some() {
            session.phase = "confirmation".into();
            host.checkpoint(session)?;
            return Ok(());
        }
        host.checkpoint(session)?;
    }
    Err(error("已达到本轮 8 次工具调用限制，可继续提问。"))
}

#[cfg(test)]
mod tests {
    use super::*;
    struct Noop;
    impl Host for Noop {
        fn execute(&mut self, _: &str, _: &str) -> Result<ToolResult, AppError> {
            unreachable!()
        }
        fn checkpoint(&mut self, _: &Session) -> Result<(), AppError> {
            Ok(())
        }
    }
    #[test]
    fn retry_requires_an_existing_user_message_before_calling_a_model() {
        let mut session = Session::default();
        let result = retry(
            &mut session,
            Model {
                base: "https://example.test/v1",
                name: "test",
                key: None,
            },
            &mut Noop,
            &AtomicBool::new(false),
        );
        assert!(result.is_err());
        assert!(session.messages.is_empty());
    }
    #[test]
    fn malformed_or_truncated_model_responses_cannot_run_tools() {
        assert!(reply(json!({"choices":[{"message":{"role":"assistant","content":"Hello"},"finish_reason":"stop"}]})).is_ok());
        assert!(reply(json!({"choices":[{"message":{"role":"assistant","content":"partial"},"finish_reason":"length"}]})).is_err());
        assert!(
            tools::parse::<tools::ChangeStatus>(r#"{"id":"x","status":"owned","sql":"DROP"}"#)
                .is_err()
        );
    }
}
