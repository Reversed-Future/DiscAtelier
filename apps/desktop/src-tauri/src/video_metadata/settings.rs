use super::error;
use discatelier_contracts::AppError;
use serde::Serialize;

fn entry(provider: &str) -> Result<keyring::Entry, AppError> {
    if !["tmdb", "bangumi"].contains(&provider) {
        return Err(error("未知资料源。"));
    }
    let service = if std::env::var_os("DISCATELIER_TEST_DATA_DIR").is_some() {
        "com.reversedfuture.discatelier.tests"
    } else {
        "com.reversedfuture.discatelier"
    };
    keyring::Entry::new(service, &format!("video-{provider}"))
        .map_err(|_| error("无法访问凭据管理器。"))
}
pub fn token(provider: &str) -> Result<Option<String>, AppError> {
    match entry(provider)?.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err(error("无法读取资料源令牌。")),
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    tmdb_configured: bool,
    bangumi_configured: bool,
}
#[tauri::command]
pub fn video_settings_get() -> Result<Status, AppError> {
    Ok(Status {
        tmdb_configured: token("tmdb")?.is_some(),
        bangumi_configured: token("bangumi")?.is_some(),
    })
}
#[tauri::command]
pub fn video_settings_save(
    provider: String,
    value: Option<String>,
    forget: bool,
) -> Result<Status, AppError> {
    let entry = entry(&provider)?;
    if forget {
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => (),
            Err(_) => return Err(error("无法移除令牌。")),
        }
    } else if let Some(value) = value.filter(|v| !v.is_empty()) {
        if value.len() > 4096 || value.chars().any(|c| c.is_whitespace() || c.is_control()) {
            return Err(error("令牌格式无效，请粘贴令牌本身。"));
        }
        entry
            .set_password(&value)
            .map_err(|_| error("无法安全保存令牌。"))?;
    }
    video_settings_get()
}
