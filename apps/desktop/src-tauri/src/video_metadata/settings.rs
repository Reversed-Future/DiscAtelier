use super::error;
use crate::data_location::DataLocation;
use discatelier_contracts::AppError;
use serde::{Deserialize, Serialize};
use std::path::Path;

const EXPIRY_FILE: &str = "video-token-expiry.json";
const EXPIRY_DAYS: [u32; 6] = [7, 14, 30, 90, 180, 365];

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

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Expiry {
    #[serde(default)]
    bangumi_expires_at: Option<String>,
}

fn expiry_path(directory: &Path) -> std::path::PathBuf {
    directory.join(EXPIRY_FILE)
}

fn read_expiry(directory: &Path) -> Expiry {
    std::fs::read(expiry_path(directory))
        .ok()
        .filter(|bytes| bytes.len() <= 4096)
        .and_then(|bytes| serde_json::from_slice(&bytes).ok())
        .unwrap_or_default()
}

fn write_expiry(directory: &Path, expires_at: Option<String>) -> Result<(), AppError> {
    std::fs::create_dir_all(directory).map_err(|_| error("无法访问设置目录。"))?;
    let path = expiry_path(directory);
    let bytes = serde_json::to_vec(&Expiry {
        bangumi_expires_at: expires_at,
    })
    .map_err(|_| error("无法生成令牌到期记录。"))?;
    let temporary = directory.join(format!(".video-token-expiry-{}.tmp", uuid::Uuid::new_v4()));
    std::fs::write(&temporary, bytes).map_err(|_| error("无法写入令牌到期记录。"))?;
    std::fs::rename(&temporary, path).map_err(|_| {
        let _ = std::fs::remove_file(&temporary);
        error("无法保存令牌到期记录。")
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    tmdb_configured: bool,
    bangumi_configured: bool,
    bangumi_expires_at: Option<String>,
    bangumi_expired: bool,
    bangumi_days_remaining: Option<i64>,
}

fn expiry_state(now: chrono::DateTime<chrono::Utc>, value: &str) -> Option<(bool, i64)> {
    let value = chrono::DateTime::parse_from_rfc3339(value)
        .ok()?
        .with_timezone(&chrono::Utc);
    Some((value <= now, (value - now).num_days().max(0)))
}

fn status(directory: &Path) -> Result<Status, AppError> {
    let expires_at = read_expiry(directory).bangumi_expires_at;
    let now = chrono::Utc::now();
    let state = expires_at
        .as_deref()
        .and_then(|value| expiry_state(now, value));
    Ok(Status {
        tmdb_configured: token("tmdb")?.is_some(),
        bangumi_configured: token("bangumi")?.is_some(),
        bangumi_expires_at: expires_at,
        bangumi_expired: state.is_some_and(|(expired, _)| expired),
        bangumi_days_remaining: state.map(|(_, days)| days),
    })
}

#[tauri::command]
pub fn video_settings_get(location: tauri::State<'_, DataLocation>) -> Result<Status, AppError> {
    status(&location.0)
}

#[tauri::command]
pub fn video_settings_save(
    location: tauri::State<'_, DataLocation>,
    provider: String,
    value: Option<String>,
    forget: bool,
    expires_in_days: Option<u32>,
) -> Result<Status, AppError> {
    if provider == "bangumi" && !forget {
        if let Some(days) = expires_in_days.filter(|days| !EXPIRY_DAYS.contains(days)) {
            return Err(error(format!("不支持 {days} 天的令牌过期时间。")));
        }
    }
    let entry = entry(&provider)?;
    if forget {
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => (),
            Err(_) => return Err(error("无法移除令牌。")),
        }
        if provider == "bangumi" {
            write_expiry(&location.0, None)?;
        }
    } else {
        if let Some(value) = value.filter(|value| !value.is_empty()) {
            if value.len() > 4096 || value.chars().any(|c| c.is_whitespace() || c.is_control()) {
                return Err(error("令牌格式无效，请粘贴令牌本身。"));
            }
            entry
                .set_password(&value)
                .map_err(|_| error("无法安全保存令牌。"))?;
        }
        if provider == "bangumi" {
            if let Some(days) = expires_in_days {
                let expires_at =
                    (chrono::Utc::now() + chrono::Duration::days(i64::from(days))).to_rfc3339();
                write_expiry(&location.0, Some(expires_at))?;
            } else if token("bangumi")?.is_some()
                && read_expiry(&location.0).bangumi_expires_at.is_none()
            {
                return Err(error("请选择 Bangumi 令牌的过期时间。"));
            }
        }
    }
    status(&location.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expiry_options_and_states_are_bounded() {
        assert_eq!(EXPIRY_DAYS, [7, 14, 30, 90, 180, 365]);
        let now = chrono::Utc::now();
        assert_eq!(expiry_state(now, "not a date"), None);
        let future = (now + chrono::Duration::days(8)).to_rfc3339();
        let (expired, days) = expiry_state(now, &future).unwrap();
        assert!(!expired);
        assert!((7..=8).contains(&days));
        let past = (now - chrono::Duration::days(1)).to_rfc3339();
        assert!(expiry_state(now, &past).unwrap().0);
    }
}
