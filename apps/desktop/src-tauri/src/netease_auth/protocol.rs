use super::error;
use discatelier_contracts::AppError;
use serde::Serialize;
use serde_json::Value;

#[derive(Serialize, Clone, PartialEq, Debug)]
#[serde(rename_all = "camelCase")]
pub enum AccountState {
    LoggedOut,
    LoggedIn,
    Expired,
}
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    pub state: AccountState,
    pub nickname: Option<String>,
    pub avatar_url: Option<String>,
}
impl Account {
    pub fn logged_out() -> Self {
        Self {
            state: AccountState::LoggedOut,
            nickname: None,
            avatar_url: None,
        }
    }
}
#[derive(Serialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
pub enum Phase {
    Waiting,
    Confirming,
    LoggedIn,
    Expired,
}
#[derive(Serialize)]
pub struct Poll {
    pub phase: Phase,
    pub account: Option<Account>,
}
impl Poll {
    pub fn phase(phase: Phase) -> Self {
        Self {
            phase,
            account: None,
        }
    }
}
#[derive(Serialize)]
pub struct QrImage {
    pub image: String,
}

pub fn account(raw: &Value) -> Result<Account, AppError> {
    match raw.get("loggedIn").and_then(Value::as_bool) {
        Some(false) => Ok(Account {
            state: AccountState::Expired,
            nickname: None,
            avatar_url: None,
        }),
        Some(true) => {
            let nickname = raw
                .get("nickname")
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty() && s.chars().count() <= 200)
                .ok_or_else(|| error("网易云账号信息不完整。"))?;
            Ok(Account {
                state: AccountState::LoggedIn,
                nickname: Some(nickname.to_owned()),
                avatar_url: raw
                    .get("avatarUrl")
                    .and_then(Value::as_str)
                    .and_then(|raw| {
                        let url = reqwest::Url::parse(raw).ok()?;
                        (raw.len() <= 2048
                            && url.scheme() == "https"
                            && url.host_str()?.ends_with(".music.126.net")
                            && url.username().is_empty()
                            && url.password().is_none()
                            && url.port().is_none())
                        .then(|| url.to_string())
                    }),
            })
        }
        _ => Err(error("网易云登录状态格式无效。")),
    }
}
// Only this documented authentication cookie is retained. No attributes, profile
// data, cookies for other services, or arbitrary upstream text enter the vault.
pub fn credential(raw: &str) -> Result<String, AppError> {
    if raw.len() > 16384 {
        return Err(error("网易云登录凭据格式无效。"));
    }
    let mut values = raw
        .split(';')
        .filter_map(|s| s.trim().strip_prefix("MUSIC_U="));
    let value = values
        .next()
        .filter(|s| {
            !s.is_empty()
                && s.len() <= 4088
                && s.is_ascii()
                && !s
                    .bytes()
                    .any(|b| b.is_ascii_whitespace() || b.is_ascii_control())
        })
        .ok_or_else(|| error("没有收到有效的网易云登录凭据，请重新扫码。"))?;
    if values.next().is_some() {
        return Err(error("网易云登录凭据重复，请重新扫码。"));
    }
    Ok(format!("MUSIC_U={value}"))
}
