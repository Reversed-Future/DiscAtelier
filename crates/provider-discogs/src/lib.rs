use discatelier_application::MetadataProvider;
use discatelier_contracts::*;
mod artwork;
mod mapping;
pub use mapping::import_draft;
use reqwest::{
    blocking::Client,
    header::{HeaderValue, AUTHORIZATION},
    redirect::Policy,
};
use serde::de::DeserializeOwned;
use std::{
    io::Read,
    time::{Duration, Instant},
};

pub struct DiscogsProvider {
    client: Client,
    next_request: Instant,
    cooldown: bool,
    base_url: String,
}
impl DiscogsProvider {
    pub fn new() -> Result<Self, AppError> {
        let client = Client::builder()
            .user_agent(concat!("DiscAtelier/", env!("CARGO_PKG_VERSION")))
            .redirect(Policy::none())
            .connect_timeout(Duration::from_secs(8))
            .timeout(Duration::from_secs(20))
            .build()
            .map_err(|_| AppError::new("network", "无法初始化 Discogs 连接。"))?;
        Ok(Self {
            client,
            next_request: Instant::now(),
            cooldown: false,
            base_url: "https://api.discogs.com".into(),
        })
    }
    /// Debug builds only; the desktop additionally requires an isolated test data directory.
    #[cfg(any(debug_assertions, test))]
    pub fn test_endpoint(port: u16) -> Result<Self, AppError> {
        let mut provider = Self::new()?;
        provider.base_url = format!("http://127.0.0.1:{port}");
        provider.client = Client::builder()
            .no_proxy()
            .redirect(Policy::none())
            .timeout(Duration::from_secs(20))
            .build()
            .map_err(|_| AppError::new("network", "测试连接初始化失败"))?;
        Ok(provider)
    }
    fn get<T: DeserializeOwned>(
        &mut self,
        path: &str,
        query: &[(String, String)],
        token: Option<&str>,
    ) -> Result<T, AppError> {
        if self.cooldown && self.next_request > Instant::now() {
            return Err(AppError::new(
                "rate_limit",
                format!(
                    "请在 {} 秒后重试。",
                    self.next_request
                        .saturating_duration_since(Instant::now())
                        .as_secs()
                        + 1
                ),
            ));
        }
        // A normal selection directly after search waits on this worker, not the UI.
        std::thread::sleep(self.next_request.saturating_duration_since(Instant::now()));
        self.cooldown = false;
        // Conservative anonymous limit also applies to authenticated calls.
        self.next_request = Instant::now() + Duration::from_secs(3);
        let mut request = self
            .client
            .get(format!("{}{path}", self.base_url))
            .query(query);
        if let Some(token) = token {
            let mut header = HeaderValue::from_str(&format!("Discogs token={token}"))
                .map_err(|_| AppError::new("authentication", "Token 格式无效。"))?;
            header.set_sensitive(true);
            request = request.header(AUTHORIZATION, header);
        }
        let response = request.send().map_err(|error| {
            AppError::new(
                if error.is_timeout() {
                    "timeout"
                } else {
                    "network"
                },
                if error.is_timeout() {
                    "Discogs 请求超时，请重试。"
                } else {
                    "无法连接 Discogs，请检查网络。"
                },
            )
        })?;
        let remaining = response
            .headers()
            .get("X-Discogs-Ratelimit-Remaining")
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse::<u32>().ok());
        let status = response.status().as_u16();
        if remaining == Some(0) || status == 429 {
            self.cooldown = true;
            let retry = response
                .headers()
                .get("Retry-After")
                .and_then(|value| value.to_str().ok())
                .and_then(|value| value.parse::<u64>().ok())
                .unwrap_or(60)
                .clamp(3, 3600);
            self.next_request = Instant::now() + Duration::from_secs(retry);
        }
        match status {
            200 => (),
            401 | 403 => {
                return Err(AppError::new(
                    "authentication",
                    "Discogs 拒绝访问，请检查 Token 或账户权限。",
                ))
            }
            404 => return Err(AppError::new("not_found", "未找到这个发行。")),
            429 => {
                return Err(AppError::new(
                    "rate_limit",
                    "Discogs 请求过于频繁，请稍后重试。",
                ))
            }
            _ => {
                return Err(AppError::new(
                    "provider",
                    format!("Discogs 暂不可用（HTTP {status}）。"),
                ))
            }
        }
        const LIMIT: u64 = 4 * 1024 * 1024;
        let mut bytes = Vec::new();
        response
            .take(LIMIT + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| AppError::new("network", "Discogs 响应未完整接收。"))?;
        if bytes.len() as u64 > LIMIT {
            return Err(AppError::new("provider", "Discogs 响应过大。"));
        }
        serde_json::from_slice(&bytes).map_err(|_| {
            AppError::new(
                "provider_schema",
                "Discogs 数据格式有变化，未导入任何收藏。",
            )
        })
    }
}
impl MetadataProvider for DiscogsProvider {
    fn search(
        &mut self,
        request: MetadataSearch,
        token: &str,
    ) -> Result<MetadataResults, AppError> {
        if token.is_empty() {
            return Err(AppError::new("authentication", "请先配置 Discogs Token。"));
        }
        let parameters = search_parameters(&request)?;
        let mut results: MetadataResults =
            self.get("/database/search", &parameters, Some(token))?;
        results.results.retain(|item| item.kind == "release");
        Ok(results)
    }
    fn release(&mut self, id: u64, token: Option<&str>) -> Result<MetadataRelease, AppError> {
        if id == 0 || id > 9_007_199_254_740_991 {
            return Err(AppError::new("validation", "发行 ID 无效。"));
        }
        let result: MetadataRelease = self.get(&format!("/releases/{id}"), &[], token)?;
        if result.id != id {
            return Err(AppError::new(
                "provider_schema",
                "Discogs 返回的发行与请求不一致。",
            ));
        }
        Ok(result)
    }
}
fn search_parameters(request: &MetadataSearch) -> Result<Vec<(String, String)>, AppError> {
    let field = match request.mode.as_str() {
        "keyword" => "q",
        "barcode" => "barcode",
        "catalog" => "catno",
        _ => return Err(AppError::new("validation", "搜索方式无效。")),
    };
    if request.query.trim().is_empty()
        || request.query.len() > 500
        || request.page == 0
        || request.page > 100
    {
        return Err(AppError::new(
            "validation",
            "请填写搜索内容，页码范围为 1–100。",
        ));
    }
    Ok(vec![
        (field.into(), request.query.clone()),
        ("type".into(), "release".into()),
        ("per_page".into(), "20".into()),
        ("page".into(), request.page.to_string()),
    ])
}

#[cfg(test)]
mod tests;
