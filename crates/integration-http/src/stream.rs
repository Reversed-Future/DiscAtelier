use crate::{endpoint, error};
use discatelier_contracts::AppError;
use reqwest::{
    header::{HeaderValue, AUTHORIZATION},
    redirect::Policy,
    Client,
};
use serde_json::Value;
use std::{
    sync::atomic::{AtomicBool, Ordering},
    time::Duration,
};

async fn cancellation(flag: &AtomicBool) {
    while !flag.load(Ordering::Acquire) {
        tokio::time::sleep(Duration::from_millis(40)).await;
    }
}

/// SSE and compatible JSON share the same credential and redirect policy.
/// Cancellation drops the in-flight HTTP future, including while awaiting headers.
pub fn stream_request(
    base: &str,
    body: &Value,
    token: Option<&str>,
    cancelled: &AtomicBool,
    mut event: impl FnMut(Value) -> Result<(), AppError>,
) -> Result<Option<Value>, AppError> {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|_| error("流式连接不可用。"))?;
    runtime.block_on(async {
        let client = Client::builder().redirect(Policy::none()).connect_timeout(Duration::from_secs(8))
            .timeout(Duration::from_secs(120)).build().map_err(|_| error("无法建立服务连接。"))?;
        let mut request = client.post(endpoint(base, "chat/completions")?).header("Content-Type", "application/json")
            .header("Accept", if body.get("stream").and_then(Value::as_bool) == Some(false) { "application/json" } else { "text/event-stream" }).body(body.to_string());
        if let Some(token) = token.filter(|s| !s.is_empty()) {
            let mut header = HeaderValue::from_str(&format!("Bearer {token}")).map_err(|_| error("密钥格式无效。"))?;
            header.set_sensitive(true); request = request.header(AUTHORIZATION, header);
        }
        let mut response = tokio::select! {
            biased;
            _ = cancellation(cancelled) => return Err(error("已停止。")),
            value = request.send() => value.map_err(|_| error("服务连接失败或超时，请检查地址和网络。"))?,
        };
        if !response.status().is_success() { return Err(error(format!("服务返回 HTTP {}。", response.status().as_u16()))); }
        let sse = response.headers().get("content-type").and_then(|h| h.to_str().ok())
            .is_some_and(|h| h.split(';').next() == Some("text/event-stream"));
        let mut decoder = Decoder::default(); let mut json = Vec::new(); let mut total = 0;
        loop {
            let chunk = tokio::select! {
                biased;
                _ = cancellation(cancelled) => return Err(error("已停止。")),
                value = response.chunk() => value.map_err(|_| error("流式响应中断。"))?,
            };
            let Some(chunk) = chunk else {
                if sse { return Err(error("流式响应未完整结束，请重试。")); }
                return serde_json::from_slice(&json).map(Some).map_err(|_| error("接口没有返回 SSE 或有效 JSON。"));
            };
            total += chunk.len();
            if total > 2 * 1024 * 1024 { return Err(error("响应超出大小限制。")); }
            if sse { if decoder.feed(&chunk, &mut event)? { return Ok(None); } }
            else { json.extend_from_slice(&chunk); }
        }
    })
}

#[derive(Default)]
struct Decoder {
    line: Vec<u8>,
    data: String,
}
impl Decoder {
    fn feed(
        &mut self,
        bytes: &[u8],
        event: &mut impl FnMut(Value) -> Result<(), AppError>,
    ) -> Result<bool, AppError> {
        for byte in bytes {
            if *byte != b'\n' {
                self.line.push(*byte);
                if self.line.len() > 65536 {
                    return Err(error("流式行超出大小限制。"));
                }
                continue;
            }
            let line = std::str::from_utf8(&self.line)
                .map_err(|_| error("流式字符编码无效。"))?
                .trim_end_matches('\r');
            if line.is_empty() && !self.data.is_empty() {
                if self.data.trim() == "[DONE]" {
                    return Ok(true);
                }
                event(serde_json::from_str(&self.data).map_err(|_| error("流式数据格式无效。"))?)?;
                self.data.clear();
            } else if let Some(value) = line.strip_prefix("data:") {
                if !self.data.is_empty() {
                    self.data.push('\n');
                }
                self.data.push_str(value.strip_prefix(' ').unwrap_or(value));
                if self.data.len() > 65536 {
                    return Err(error("流式事件超出大小限制。"));
                }
            }
            self.line.clear();
        }
        Ok(false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn arbitrary_utf8_byte_boundaries_and_crlf_comments_are_supported() {
        let bytes =
            ": heartbeat\r\ndata: {\"text\":\"音乐🌙\"}\r\n\r\ndata: [DONE]\r\n\r\n".as_bytes();
        let mut decoder = Decoder::default();
        let mut seen = vec![];
        let mut done = false;
        for byte in bytes {
            done = decoder
                .feed(&[*byte], &mut |value| {
                    seen.push(value);
                    Ok(())
                })
                .unwrap();
        }
        assert!(done);
        assert_eq!(seen[0]["text"], "音乐🌙");
    }
    #[test]
    fn oversized_event_and_invalid_json_are_rejected() {
        assert!(Decoder::default()
            .feed(&vec![b'x'; 65537], &mut |_| Ok(()))
            .is_err());
        assert!(Decoder::default()
            .feed(b"data: nope\n\n", &mut |_| Ok(()))
            .is_err());
    }
}
