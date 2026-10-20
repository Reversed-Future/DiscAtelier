use discatelier_contracts::AppError;

pub struct DiscogsCredentials {
    entry: keyring::Entry,
}
impl DiscogsCredentials {
    pub fn new() -> Result<Self, AppError> {
        let service = "com.reversedfuture.discatelier";
        // Tests use a separate Windows vault entry, never the user's saved token.
        #[cfg(any(debug_assertions, feature = "performance-harness"))]
        let service = if std::env::var_os("DISCATELIER_TEST_DATA_DIR").is_some() {
            "com.reversedfuture.discatelier.integration-test"
        } else {
            service
        };
        Ok(Self {
            entry: keyring::Entry::new(service, "discogs-token").map_err(|_| unavailable())?,
        })
    }
    pub fn read(&self) -> Result<Option<String>, AppError> {
        match self.entry.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err(unavailable()),
        }
    }
    pub fn save(&self, token: &str) -> Result<(), AppError> {
        if token.is_empty()
            || token.len() > 1024
            || token
                .bytes()
                .any(|byte| byte.is_ascii_whitespace() || byte.is_ascii_control())
        {
            return Err(AppError::new(
                "validation",
                "Token 不能为空或包含空格、换行。",
            ));
        }
        self.entry.set_password(token).map_err(|_| unavailable())
    }
    pub fn forget(&self) -> Result<(), AppError> {
        match self.entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err(unavailable()),
        }
    }
}
fn unavailable() -> AppError {
    AppError::new("credentials", "无法访问 Windows 凭据管理器。")
}
