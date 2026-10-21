mod commands;
pub mod credentials;
mod protocol;
#[cfg(test)]
mod tests;
pub use commands::*;
use discatelier_contracts::AppError;
use protocol::{Account, AccountState, Phase, Poll, QrImage};
use serde_json::{json, Value};
use std::{
    collections::VecDeque,
    sync::Mutex,
    time::{Duration, Instant},
};

fn error(message: &str) -> AppError {
    AppError::new("netease-auth", message)
}
trait Vault {
    fn read(&self) -> Result<Option<String>, AppError>;
    fn save(&self, cookie: &str) -> Result<(), AppError>;
    fn forget(&self) -> Result<(), AppError>;
}
type Call<'a> = dyn Fn(&str, Value) -> Result<Value, AppError> + 'a;
struct Pending {
    id: String,
    key: Option<String>,
    created: Instant,
    last_poll: Option<Instant>,
    checking: bool,
    phase: Phase,
}
#[derive(Default)]
pub struct Auth {
    pending: Mutex<Option<Pending>>,
    cancelled: Mutex<VecDeque<String>>,
}
impl Auth {
    fn begin(&self, id: String, call: &Call<'_>) -> Result<QrImage, AppError> {
        uuid::Uuid::parse_str(&id).map_err(|_| error("登录会话无效。"))?;
        let cancelled = self
            .cancelled
            .lock()
            .map_err(|_| error("登录服务不可用。"))?;
        if cancelled.iter().any(|value| value == &id) {
            return Err(error("登录已取消。"));
        }
        *self.pending.lock().map_err(|_| error("登录服务不可用。"))? = Some(Pending {
            id: id.clone(),
            key: None,
            created: Instant::now(),
            last_poll: None,
            checking: false,
            phase: Phase::Waiting,
        });
        drop(cancelled);
        let result = call("authStart", json!({}));
        let mut lock = self.pending.lock().map_err(|_| error("登录服务不可用。"))?;
        let pending = lock
            .as_mut()
            .filter(|p| p.id == id)
            .ok_or_else(|| error("登录已取消。"))?;
        let value = match result {
            Ok(v) => v,
            Err(e) => {
                *lock = None;
                return Err(e);
            }
        };
        let key = value
            .get("key")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty() && s.len() <= 1024)
            .ok_or_else(|| error("二维码信息不完整。"))?;
        let image = value
            .get("image")
            .and_then(Value::as_str)
            .filter(|s| s.starts_with("data:image/png;base64,") && s.len() <= 131072)
            .ok_or_else(|| error("二维码图片不可用。"))?;
        pending.key = Some(key.to_owned());
        Ok(QrImage {
            image: image.to_owned(),
        })
    }
    pub fn cancel(&self, id: &str) -> Result<(), AppError> {
        uuid::Uuid::parse_str(id).map_err(|_| error("登录会话无效。"))?;
        let mut cancelled = self
            .cancelled
            .lock()
            .map_err(|_| error("登录服务不可用。"))?;
        if cancelled.len() >= 64 {
            cancelled.pop_front();
        }
        cancelled.push_back(id.to_owned());
        let mut lock = self.pending.lock().map_err(|_| error("登录服务不可用。"))?;
        if lock.as_ref().is_some_and(|p| p.id == id) {
            *lock = None;
        }
        Ok(())
    }
    fn poll(&self, id: &str, vault: &impl Vault, call: &Call<'_>) -> Result<Poll, AppError> {
        let key = {
            let mut lock = self.pending.lock().map_err(|_| error("登录服务不可用。"))?;
            let pending = lock
                .as_mut()
                .filter(|p| p.id == id)
                .ok_or_else(|| error("登录已取消，请重新扫码。"))?;
            if pending.created.elapsed() >= Duration::from_secs(300) {
                *lock = None;
                return Ok(Poll::phase(Phase::Expired));
            }
            if pending.checking
                || pending
                    .last_poll
                    .is_some_and(|t| t.elapsed() < Duration::from_secs(3))
            {
                return Ok(Poll::phase(pending.phase));
            }
            let key = pending
                .key
                .clone()
                .ok_or_else(|| error("二维码尚未准备好。"))?;
            pending.checking = true;
            pending.last_poll = Some(Instant::now());
            key
        };
        let result = (|| {
            let raw = call("authCheck", json!({"key":key}))?;
            let code = raw
                .get("code")
                .and_then(Value::as_u64)
                .ok_or_else(|| error("扫码状态不可用。"))?;
            if code != 803 {
                return Ok((code, None));
            }
            let cookie = protocol::credential(
                raw.get("cookie")
                    .and_then(Value::as_str)
                    .ok_or_else(|| error("登录凭据未返回。"))?,
            )?;
            let account = protocol::account(&call("authStatus", json!({"cookie":cookie}))?)?;
            if account.state != AccountState::LoggedIn {
                return Err(error("登录未生效，请重新扫码。"));
            }
            Ok((code, Some((cookie, account))))
        })();
        // A close, refresh or logout during a network request invalidates its result.
        let mut lock = self.pending.lock().map_err(|_| error("登录服务不可用。"))?;
        let pending = lock
            .as_mut()
            .filter(|p| p.id == id)
            .ok_or_else(|| error("登录已取消。"))?;
        pending.checking = false;
        if pending.created.elapsed() >= Duration::from_secs(300) {
            *lock = None;
            return Ok(Poll::phase(Phase::Expired));
        }
        let (code, authorized) = result?;
        match code {
            800 => {
                *lock = None;
                Ok(Poll::phase(Phase::Expired))
            }
            801 | 802 => {
                pending.phase = if code == 801 {
                    Phase::Waiting
                } else {
                    Phase::Confirming
                };
                Ok(Poll::phase(pending.phase))
            }
            803 => {
                let (cookie, account) = authorized.ok_or_else(|| error("登录凭据不可用。"))?;
                vault.save(&cookie)?;
                *lock = None;
                Ok(Poll {
                    phase: Phase::LoggedIn,
                    account: Some(account),
                })
            }
            _ => Err(error("扫码状态不可用，请重新扫码。")),
        }
    }
    fn status(&self, vault: &impl Vault, call: &Call<'_>) -> Result<Account, AppError> {
        match vault.read()? {
            None => Ok(Account::logged_out()),
            Some(cookie) => protocol::account(&call("authStatus", json!({"cookie":cookie}))?),
        }
    }
    fn logout(&self, vault: &impl Vault, call: &Call<'_>) -> Result<Account, AppError> {
        let cookie = {
            let mut lock = self.pending.lock().map_err(|_| error("登录服务不可用。"))?;
            *lock = None;
            let cookie = vault.read().ok().flatten();
            vault.forget()?;
            cookie
        };
        if let Some(cookie) = cookie {
            let _ = call("authLogout", json!({"cookie":cookie}));
        }
        Ok(Account::logged_out())
    }
}
