use super::{error, Vault};
use discatelier_contracts::AppError;

pub struct WindowsVault;
fn entry() -> Result<keyring::Entry, AppError> {
    let service = "com.reversedfuture.discatelier";
    #[cfg(any(debug_assertions, feature = "performance-harness"))]
    let service = if std::env::var_os("DISCATELIER_TEST_DATA_DIR").is_some() {
        "com.reversedfuture.discatelier.integration-test"
    } else {
        service
    };
    keyring::Entry::new(service, "netease-music-u")
        .map_err(|_| error("无法访问 Windows 凭据管理器。"))
}
impl Vault for WindowsVault {
    fn read(&self) -> Result<Option<String>, AppError> {
        match entry()?.get_password() {
            Ok(value) => Ok(Some(super::protocol::credential(&value)?)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err(error("无法读取网易云登录凭据。")),
        }
    }
    fn save(&self, cookie: &str) -> Result<(), AppError> {
        entry()?
            .set_password(&super::protocol::credential(cookie)?)
            .map_err(|_| error("无法安全保存登录凭据，请重试。"))
    }
    fn forget(&self) -> Result<(), AppError> {
        match entry()?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err(error("无法移除网易云登录凭据。")),
        }
    }
}
pub fn playback_cookie() -> Result<Option<String>, AppError> {
    WindowsVault.read()
}

#[cfg(test)]
mod tests {
    #[test]
    fn windows_vault_roundtrip_uses_an_isolated_entry() {
        let target = format!("netease-test-{}", uuid::Uuid::new_v4());
        let entry = keyring::Entry::new("com.reversedfuture.discatelier.integration-test", &target)
            .unwrap();
        entry.set_password("MUSIC_U=isolated-test-value").unwrap();
        let result = entry.get_password();
        entry.delete_credential().unwrap();
        assert_eq!(result.unwrap(), "MUSIC_U=isolated-test-value");
        assert!(matches!(entry.get_password(), Err(keyring::Error::NoEntry)));
    }
}
