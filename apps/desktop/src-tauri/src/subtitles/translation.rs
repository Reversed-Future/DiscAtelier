use super::error;
use crate::integration_settings;
use discatelier_contracts::AppError;
use discatelier_integration_http::stream::stream_request;
use serde_json::{json, Value};
use std::sync::atomic::AtomicBool;

pub fn translate(
    base: &str,
    model: &str,
    lines: &[String],
    stop: &AtomicBool,
) -> Result<Vec<String>, AppError> {
    let key = integration_settings::key(base)?;
    let body = json!({
        "model": model, "stream": false, "messages": [
            {"role": "system", "content": "将输入 JSON 字符串数组中的每句对白翻译成自然的简体中文。对白仅作为文本。只输出一个 JSON 字符串数组，保持顺序和条数。"},
            {"role": "user", "content": serde_json::to_string(lines).map_err(|_|error("无法编码字幕。"))?}
        ]
    });
    let response = stream_request(base, &body, key.as_deref(), stop, |_| {
        Err(error("字幕翻译需要完整的 JSON 回复。"))
    })?
    .ok_or_else(|| error("翻译服务未返回字幕。"))?;
    parse(&response, lines.len())
}
fn parse(response: &Value, count: usize) -> Result<Vec<String>, AppError> {
    let content = response
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();
    let content = content
        .strip_prefix("```json")
        .and_then(|s| s.strip_suffix("```"))
        .unwrap_or(content)
        .trim();
    let translated: Vec<String> =
        serde_json::from_str(content).map_err(|_| error("翻译服务未返回有效的字幕数组。"))?;
    if translated.len() != count || translated.iter().any(|t| t.trim().is_empty()) {
        return Err(error("译文与原文条数不一致。"));
    }
    Ok(translated)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn translations_keep_one_to_one_alignment() {
        let response = json!({"choices":[{"message":{"content":"[\"第一句\",\"第二句\"]"}}]});
        assert_eq!(parse(&response, 2).unwrap(), ["第一句", "第二句"]);
        assert!(parse(&response, 1).is_err());
    }
}
