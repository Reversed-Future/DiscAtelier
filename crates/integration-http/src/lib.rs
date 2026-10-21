use discatelier_contracts::AppError;
use reqwest::{
    blocking::Client,
    header::{HeaderValue, AUTHORIZATION},
    redirect::Policy,
    Url,
};
use serde_json::Value;
use std::{io::Read, time::Duration};
pub mod stream;

pub fn endpoint(base: &str, route: &str) -> Result<Url, AppError> {
    let mut url = Url::parse(base).map_err(|_| error("服务地址无效。"))?;
    let local = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    if base.len() > 2048
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || !(url.scheme() == "https" || url.scheme() == "http" && local)
    {
        return Err(error(
            "服务地址须为 HTTPS，或本机 HTTP 地址；不要包含凭据、查询参数。",
        ));
    }
    let path = format!("{}/{}", url.path().trim_end_matches('/'), route);
    url.set_path(&path);
    Ok(url)
}
pub fn request(
    base: &str,
    route: &str,
    query: &[(&str, String)],
    body: Option<&Value>,
    token: Option<&str>,
) -> Result<Value, AppError> {
    let url = endpoint(base, route)?;
    let client = Client::builder()
        .redirect(Policy::none())
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(30))
        .user_agent(concat!("DiscAtelier/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|_| error("无法建立服务连接。"))?;
    let mut request = if let Some(body) = body {
        client
            .post(url)
            .header("Content-Type", "application/json")
            .body(body.to_string())
    } else {
        client.get(url).query(query)
    };
    if let Some(token) = token.filter(|s| !s.is_empty()) {
        let mut header = HeaderValue::from_str(&format!("Bearer {token}"))
            .map_err(|_| error("密钥格式无效。"))?;
        header.set_sensitive(true);
        request = request.header(AUTHORIZATION, header);
    }
    let response = request
        .send()
        .map_err(|_| error("服务连接失败或超时，请检查地址和网络。"))?;
    if !response.status().is_success() {
        return Err(error(format!(
            "服务返回 HTTP {}。",
            response.status().as_u16()
        )));
    }
    const LIMIT: u64 = 2 * 1024 * 1024;
    if response.content_length().is_some_and(|n| n > LIMIT) {
        return Err(error("响应超出大小限制。"));
    }
    let mut bytes = Vec::new();
    response
        .take(LIMIT + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| error("响应读取失败。"))?;
    if bytes.len() as u64 > LIMIT {
        return Err(error("响应超出大小限制。"));
    }
    serde_json::from_slice(&bytes).map_err(|_| error("服务没有返回有效 JSON。"))
}
pub fn error(message: impl Into<String>) -> AppError {
    AppError::new("integration", message)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn endpoint_preserves_path_and_rejects_credential_and_insecure_remote_urls() {
        assert_eq!(
            endpoint("https://example.org/Custom/v1/", "chat/completions")
                .unwrap()
                .as_str(),
            "https://example.org/Custom/v1/chat/completions"
        );
        assert!(endpoint("http://127.0.0.1:3456", "album").is_ok());
        for s in [
            "http://example.org",
            "https://u:p@example.org",
            "https://example.org?token=x",
            "file:///C:/x",
        ] {
            assert!(endpoint(s, "album").is_err());
        }
    }
}
