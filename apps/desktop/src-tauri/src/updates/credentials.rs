use discatelier_contracts::AppError;

fn entry() -> Result<keyring::Entry, AppError> {
    let service = "com.reversedfuture.discatelier";
    #[cfg(any(debug_assertions, feature = "performance-harness"))]
    let service = if std::env::var_os("DISCATELIER_TEST_DATA_DIR").is_some() {
        "com.reversedfuture.discatelier.integration-test"
    } else {
        service
    };
    keyring::Entry::new(service, "github-update-token").map_err(|_| unavailable())
}
pub fn read() -> Result<Option<String>, AppError> {
    match entry()?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(_) => Err(unavailable()),
    }
}
pub fn save(token: &str) -> Result<(), AppError> {
    if token.is_empty() || token.len() > 1024 || !token.bytes().all(|b| b.is_ascii_graphic()) {
        return Err(AppError::new("validation", "Token 不能为空或包含空格。"));
    }
    entry()?.set_password(token).map_err(|_| unavailable())
}
pub fn forget() -> Result<(), AppError> {
    match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err(unavailable()),
    }
}
fn unavailable() -> AppError {
    AppError::new("credentials", "无法访问 Windows 凭据管理器。")
}
