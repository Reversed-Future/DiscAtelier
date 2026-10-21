use super::model::error;
use discatelier_contracts::AppError;

fn entry(id: &str) -> Result<keyring::Entry, AppError> {
    let service = "com.reversedfuture.discatelier";
    #[cfg(any(debug_assertions, feature = "performance-harness"))]
    let service = if std::env::var_os("DISCATELIER_TEST_DATA_DIR").is_some() {
        "com.reversedfuture.discatelier.integration-test"
    } else {
        service
    };
    keyring::Entry::new(service, &format!("apihz-exchange-{id}"))
        .map_err(|_| error("无法访问 Windows 凭据管理器。"))
}
pub fn read(id: &str) -> Result<Option<String>, AppError> {
    if id.is_empty() {
        return Ok(None);
    }
    match entry(id)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err(error("无法读取汇率 KEY。")),
    }
}
pub fn save(id: &str, key: &str) -> Result<(), AppError> {
    if key.is_empty() || key.len() > 1024 || !key.bytes().all(|b| b.is_ascii_graphic()) {
        return Err(error("KEY 不能为空或包含空格。"));
    }
    entry(id)?
        .set_password(key)
        .map_err(|_| error("无法安全保存汇率 KEY。"))
}
pub fn forget(id: &str) -> Result<(), AppError> {
    if id.is_empty() {
        return Ok(());
    }
    match entry(id)?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err(error("无法移除汇率 KEY。")),
    }
}
