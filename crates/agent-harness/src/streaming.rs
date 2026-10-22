use crate::{reply, Message, Model};
use discatelier_contracts::AppError;
use discatelier_integration_http::{error, stream::stream_request};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::atomic::AtomicBool;

#[derive(Deserialize)]
struct Chunk {
    choices: Vec<Choice>,
}
#[derive(Deserialize)]
struct Choice {
    index: usize,
    delta: Delta,
    finish_reason: Option<String>,
}
#[derive(Deserialize)]
struct Delta {
    role: Option<String>,
    content: Option<String>,
    #[serde(default)]
    tool_calls: Option<Vec<Call>>,
}
#[derive(Deserialize)]
struct Call {
    index: usize,
    id: Option<String>,
    r#type: Option<String>,
    function: Option<Function>,
}
#[derive(Deserialize)]
struct Function {
    name: Option<String>,
    arguments: Option<String>,
}

#[derive(Default)]
struct Assembly {
    text: String,
    id: String,
    name: String,
    arguments: String,
    has_call: bool,
    finish: Option<String>,
}
impl Assembly {
    fn push(&mut self, value: Value) -> Result<(), AppError> {
        let chunk: Chunk = serde_json::from_value(value).map_err(|_| error("流式字段不匹配。"))?;
        if chunk.choices.is_empty() {
            return Ok(());
        }
        if chunk.choices.len() != 1 || chunk.choices[0].index != 0 || self.finish.is_some() {
            return Err(error("流式回答顺序无效。"));
        }
        let c = chunk.choices.into_iter().next().unwrap();
        if c.delta.role.as_deref().is_some_and(|s| s != "assistant") {
            return Err(error("流式角色无效。"));
        }
        if let Some(text) = c.delta.content {
            self.text.push_str(&text);
        }
        for call in c.delta.tool_calls.unwrap_or_default() {
            if call.index != 0 || call.r#type.as_deref().is_some_and(|s| s != "function") {
                return Err(error("每次只支持一个函数工具。"));
            }
            self.has_call = true;
            if let Some(id) = call.id {
                self.id.push_str(&id);
            }
            if let Some(f) = call.function {
                if let Some(name) = f.name {
                    self.name.push_str(&name);
                }
                if let Some(args) = f.arguments {
                    self.arguments.push_str(&args);
                }
            }
        }
        if self.text.len() > 32000
            || self.id.len() > 200
            || self.name.len() > 100
            || self.arguments.len() > 4000
        {
            return Err(error("流式内容超出限制。"));
        }
        self.finish = c.finish_reason;
        Ok(())
    }
    fn finish(self) -> Result<Message, AppError> {
        let reason = self
            .finish
            .ok_or_else(|| error("回答未完整结束，未执行任何未完成的工具。"))?;
        if self.has_call && reason != "tool_calls" || !self.has_call && reason != "stop" {
            return Err(error("回答被截断或工具未完整结束。"));
        }
        let calls = if self.has_call {
            vec![
                json!({"id":self.id,"type":"function","function":{"name":self.name,"arguments":self.arguments}}),
            ]
        } else {
            vec![]
        };
        reply(
            json!({"choices":[{"finish_reason":reason,"message":{"role":"assistant","content":self.text,"tool_calls":calls}}]}),
        )
    }
}
pub fn complete(
    model: &Model<'_>,
    payload: &Value,
    cancelled: &AtomicBool,
    mut text: impl FnMut(&str),
) -> Result<Message, AppError> {
    let mut assembly = Assembly::default();
    let json = stream_request(model.base, payload, model.key, cancelled, |chunk| {
        assembly.push(chunk)?;
        text(&assembly.text);
        Ok(())
    })?;
    match json {
        Some(value) => reply(value),
        None => assembly.finish(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn tool_fragments_are_joined_only_after_complete_finish() {
        let mut a = Assembly::default();
        a.push(json!({"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call1","type":"function","function":{"name":"search_library","arguments":"{\"query\":"}}]},"finish_reason":null}]})).unwrap();
        a.push(json!({"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\"音乐\"}"}}]},"finish_reason":"tool_calls"}]})).unwrap();
        assert_eq!(
            a.finish().unwrap().tool_calls[0].function.arguments,
            "{\"query\":\"音乐\"}"
        );
        assert!(Assembly::default().finish().is_err());
    }
    #[test]
    fn null_tool_calls_and_reasoning_chunks_are_accepted() {
        let mut a = Assembly::default();
        a.push(json!({"choices":[{"delta":{"content":"","reasoning_content":null,"role":"assistant","tool_calls":null},"finish_reason":null,"index":0}]})).unwrap();
        a.push(json!({"choices":[{"delta":{"content":null,"reasoning_content":"思考","role":null,"tool_calls":null},"finish_reason":null,"index":0}]})).unwrap();
        a.push(json!({"choices":[{"delta":{"content":"你好","reasoning_content":null,"role":null,"tool_calls":null},"finish_reason":"stop","index":0}]})).unwrap();
        assert_eq!(a.finish().unwrap().content.as_deref(), Some("你好"));
    }
    #[test]
    fn truncated_and_parallel_tools_are_rejected() {
        let mut a = Assembly::default();
        a.push(
            json!({"choices":[{"index":0,"delta":{"content":"部分"},"finish_reason":"length"}]}),
        )
        .unwrap();
        assert!(a.finish().is_err());
        assert!(Assembly::default().push(json!({"choices":[{"index":0,"delta":{"tool_calls":[{"index":1}]},"finish_reason":null}]})).is_err());
    }
}
