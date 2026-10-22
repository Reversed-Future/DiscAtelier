use crate::credentials::DiscogsCredentials;
use discatelier_application::MetadataProvider;
use discatelier_contracts::*;
use discatelier_provider_discogs::DiscogsProvider;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
pub mod assistant;
pub mod imports;

const MAX_AGE: Duration = Duration::from_secs(6 * 60 * 60);
struct ReleaseSnapshot {
    release: MetadataRelease,
    fetched_at: String,
    received: Instant,
}
struct PreparedImport {
    content: EditionContent,
    source: EditionSource,
    identifiers: Vec<ImportedIdentifier>,
    created: Instant,
}

pub struct DiscogsService {
    provider: DiscogsProvider,
    credentials: DiscogsCredentials,
    release: Option<ReleaseSnapshot>,
    imports: HashMap<String, PreparedImport>,
}
impl DiscogsService {
    pub fn new() -> Result<Self, AppError> {
        let provider = DiscogsProvider::new()?;
        #[cfg(debug_assertions)]
        let provider = if std::env::var_os("DISCATELIER_TEST_DATA_DIR").is_some() {
            match std::env::var("DISCATELIER_TEST_DISCOGS_PORT").ok() {
                Some(port) => DiscogsProvider::test_endpoint(
                    port.parse::<u16>()
                        .ok()
                        .filter(|value| *value > 0)
                        .ok_or_else(|| AppError::new("validation", "测试端口无效"))?,
                )?,
                None => provider,
            }
        } else {
            provider
        };
        Ok(Self {
            provider,
            credentials: DiscogsCredentials::new()?,
            release: None,
            imports: HashMap::new(),
        })
    }
}
pub type DiscogsState = Arc<Mutex<Result<DiscogsService, AppError>>>;
async fn run<T: Send + 'static>(
    state: DiscogsState,
    task: impl FnOnce(&mut DiscogsService) -> Result<T, AppError> + Send + 'static,
) -> Result<T, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut service = state
            .lock()
            .map_err(|_| AppError::new("provider", "Discogs 服务不可用，请重启。"))?;
        task(service.as_mut().map_err(|error| error.clone())?)
    })
    .await
    .map_err(|_| AppError::new("provider", "Discogs 操作未完成。"))?
}
#[tauri::command]
pub async fn discogs_configured(state: tauri::State<'_, DiscogsState>) -> Result<bool, AppError> {
    run(state.inner().clone(), |service| {
        Ok(service.credentials.read()?.is_some())
    })
    .await
}
#[tauri::command]
pub async fn discogs_save_token(
    state: tauri::State<'_, DiscogsState>,
    token: String,
) -> Result<(), AppError> {
    run(state.inner().clone(), move |service| {
        service.credentials.save(&token)
    })
    .await
}
#[tauri::command]
pub async fn discogs_forget_token(state: tauri::State<'_, DiscogsState>) -> Result<(), AppError> {
    run(state.inner().clone(), |service| {
        service.credentials.forget()
    })
    .await
}
#[tauri::command]
pub async fn discogs_search(
    state: tauri::State<'_, DiscogsState>,
    request: MetadataSearch,
) -> Result<MetadataResults, AppError> {
    run(state.inner().clone(), move |service| {
        let token = service
            .credentials
            .read()?
            .ok_or_else(|| AppError::new("authentication", "请先配置 Discogs Token。"))?;
        service.provider.search(request, &token)
    })
    .await
}
#[tauri::command]
pub async fn discogs_release(
    state: tauri::State<'_, DiscogsState>,
    id: u64,
) -> Result<MetadataRelease, AppError> {
    run(state.inner().clone(), move |service| {
        let token = service.credentials.read()?;
        let release = service.provider.release(id, token.as_deref())?;
        service.release = Some(ReleaseSnapshot {
            release: release.clone(),
            fetched_at: chrono::Utc::now().to_rfc3339(),
            received: Instant::now(),
        });
        Ok(release)
    })
    .await
}
#[tauri::command]
pub fn discogs_open_token_page(app: tauri::AppHandle) -> Result<(), AppError> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url("https://www.discogs.com/settings/developers", None::<&str>)
        .map_err(|_| AppError::new("browser", "无法打开系统浏览器。"))
}
#[tauri::command]
pub fn discogs_open_release(app: tauri::AppHandle, id: u64) -> Result<(), AppError> {
    use tauri_plugin_opener::OpenerExt;
    if id == 0 || id > 9_007_199_254_740_991 {
        return Err(AppError::new("validation", "发行 ID 无效。"));
    }
    app.opener()
        .open_url(
            format!("https://www.discogs.com/release/{id}"),
            None::<&str>,
        )
        .map_err(|_| AppError::new("browser", "无法打开系统浏览器。"))
}
