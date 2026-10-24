use discatelier_contracts::AppError;
use reqwest::{header, Client};
use semver::Version;
use serde::Deserialize;
use serde_json::Value;
use std::time::Duration;

pub const LATEST: &str = "https://api.github.com/repos/Reversed-Future/DiscAtelier/releases/latest";
const ASSETS: &str = "https://api.github.com/repos/Reversed-Future/DiscAtelier/releases/assets/";
pub const MAX_PACKAGE: u64 = 512 * 1024 * 1024;
#[derive(Deserialize)]
pub struct Release {
    pub tag_name: String,
    pub draft: bool,
    pub prerelease: bool,
    pub assets: Vec<Asset>,
}
#[derive(Deserialize)]
pub struct Asset {
    pub name: String,
    pub url: String,
    pub size: u64,
    pub state: String,
}
pub fn error(message: &str) -> AppError {
    AppError::new("update", message)
}
pub fn version(release: &Release) -> Result<Version, AppError> {
    if release.draft || release.prerelease {
        return Err(error("该发行版尚未正式发布。"));
    }
    let version = release
        .tag_name
        .strip_prefix('v')
        .ok_or_else(|| error("发行版本格式无效。"))?;
    let parsed = Version::parse(version).map_err(|_| error("发行版本格式无效。"))?;
    if !parsed.pre.is_empty() {
        return Err(error("不安装预发行版本。"));
    }
    Ok(parsed)
}
pub fn asset<'a>(release: &'a Release, name: &str, limit: u64) -> Result<&'a Asset, AppError> {
    let mut matches = release.assets.iter().filter(|asset| asset.name == name);
    let asset = matches
        .next()
        .ok_or_else(|| error("发行版缺少更新文件，请稍后重试。"))?;
    if matches.next().is_some()
        || asset.state != "uploaded"
        || asset.size == 0
        || asset.size > limit
        || !valid_asset_url(&asset.url)
    {
        return Err(error("更新文件信息无效。"));
    }
    Ok(asset)
}
fn valid_asset_url(url: &str) -> bool {
    url.strip_prefix(ASSETS)
        .is_some_and(|id| !id.is_empty() && id.bytes().all(|b| b.is_ascii_digit()))
}
pub fn validate_manifest(release: &Release, manifest: &Value) -> Result<u64, AppError> {
    let version = version(release)?.to_string();
    if manifest.get("version").and_then(Value::as_str) != Some(version.as_str()) {
        return Err(error("更新清单与发行版本不一致。"));
    }
    let package = asset(
        release,
        &format!("DiscAtelier_{version}_x64-setup.exe"),
        MAX_PACKAGE,
    )?;
    let platform = &manifest["platforms"]["windows-x86_64"];
    if platform["url"].as_str() != Some(package.url.as_str())
        || !platform["signature"]
            .as_str()
            .is_some_and(|s| !s.trim().is_empty() && s.len() <= 8192)
    {
        return Err(error("更新地址或签名不完整。"));
    }
    Ok(package.size)
}
pub fn client() -> Result<Client, AppError> {
    Client::builder()
        .user_agent(concat!("DiscAtelier/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(300))
        .redirect(reqwest::redirect::Policy::limited(5))
        .build()
        .map_err(|_| error("无法建立更新连接。"))
}
/// Authorization is attached only to this repository's API. reqwest removes it
/// when GitHub redirects a binary request to a different host.
pub async fn read(
    client: &Client,
    url: &str,
    token: Option<&str>,
    limit: u64,
    mut progress: impl FnMut(u64, Option<u64>),
) -> Result<Vec<u8>, AppError> {
    if url != LATEST && !valid_asset_url(url) {
        return Err(error("更新地址不属于此仓库。"));
    }
    let accept = if url == LATEST {
        "application/vnd.github+json"
    } else {
        "application/octet-stream"
    };
    let mut request = client
        .get(url)
        .timeout(Duration::from_secs(if limit <= 2 * 1024 * 1024 {
            30
        } else {
            300
        }))
        .header(header::ACCEPT, accept);
    if let Some(token) = token {
        request = request.bearer_auth(token);
    }
    let mut response = request
        .send()
        .await
        .map_err(|_| error("连接失败，请检查网络后重试。"))?;
    if !response.status().is_success() {
        return Err(error(match response.status().as_u16() {
            401 => "GitHub Token 已失效，请重新配置。",
            403 => "GitHub 暂时拒绝请求，请检查权限或稍后重试。",
            404 => "无法访问发行版，请检查仓库读取权限。",
            _ => "GitHub 暂时不可用，请稍后重试。",
        }));
    }
    let total = response.content_length();
    if total.is_some_and(|n| n > limit) {
        return Err(error("更新文件超出大小限制。"));
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| error("下载中断，请重试。"))?
    {
        if bytes.len() as u64 + chunk.len() as u64 > limit {
            return Err(error("更新文件超出大小限制。"));
        }
        bytes.extend_from_slice(&chunk);
        progress(bytes.len() as u64, total);
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn release() -> Release {
        serde_json::from_value(serde_json::json!({
            "tag_name":"v0.1.4","draft":false,"prerelease":false,
            "assets":[{"name":"DiscAtelier_0.1.4_x64-setup.exe","url":format!("{ASSETS}123"),"size":42,"state":"uploaded"}]
        })).unwrap()
    }
    fn manifest() -> Value {
        serde_json::json!({"version":"0.1.4","platforms":{"windows-x86_64":{"url":format!("{ASSETS}123"),"signature":"test-signature"}}})
    }
    #[test]
    fn binds_manifest_to_exact_release_asset() {
        assert_eq!(validate_manifest(&release(), &manifest()).unwrap(), 42);
        let mut m = manifest();
        m["version"] = "0.1.5".into();
        assert!(validate_manifest(&release(), &m).is_err());
        m = manifest();
        m["platforms"]["windows-x86_64"]["url"] = format!("{ASSETS}124").into();
        assert!(validate_manifest(&release(), &m).is_err());
        m = manifest();
        m["platforms"]["windows-x86_64"]["signature"] = "".into();
        assert!(validate_manifest(&release(), &m).is_err());
    }
    #[test]
    fn refuses_foreign_or_ambiguous_assets() {
        for suffix in ["", "../123", "123?token=x", "123#x", "123/other"] {
            assert!(!valid_asset_url(&format!("{ASSETS}{suffix}")));
        }
        assert!(!valid_asset_url("https://example.com/123"));
        let mut r = release();
        r.assets.push(Asset {
            name: r.assets[0].name.clone(),
            url: r.assets[0].url.clone(),
            size: 42,
            state: "uploaded".into(),
        });
        assert!(validate_manifest(&r, &manifest()).is_err());
    }
    #[test]
    fn refuses_unpublished_or_oversized_packages() {
        let mut r = release();
        r.draft = true;
        assert!(version(&r).is_err());
        r.draft = false;
        r.prerelease = true;
        assert!(version(&r).is_err());
        r.prerelease = false;
        r.assets[0].size = MAX_PACKAGE + 1;
        assert!(validate_manifest(&r, &manifest()).is_err());
    }
}
