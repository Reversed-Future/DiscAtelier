use crate::commands::{self, LibraryState};
use discatelier_contracts::{AppError, ModelPreparation};
use discatelier_storage::{prepare_model_file, profiling};
use std::path::PathBuf;
use tauri::{
    http::{Request, Response},
    Manager,
};

async fn prepare(state: LibraryState, path: PathBuf) -> Result<ModelPreparation, AppError> {
    // Decode outside the collection mutex; the immutable snapshot is committed later.
    let model = tauri::async_runtime::spawn_blocking(move || prepare_model_file(&path))
        .await
        .map_err(|_| AppError::new("model", "模型读取未完成，请重试。"))??;
    commands::run(state, move |service| service.stage_model(model)).await
}

#[tauri::command]
pub async fn model_choose(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, LibraryState>,
) -> Result<Option<ModelPreparation>, AppError> {
    #[cfg(target_os = "windows")]
    let owner = window
        .hwnd()
        .map_err(|_| AppError::new("model", "无法取得应用窗口。"))?
        .0 as usize;
    #[cfg(not(target_os = "windows"))]
    let owner = 0;
    let path = tauri::async_runtime::spawn_blocking(move || crate::model_picker::choose(owner))
        .await
        .map_err(|_| AppError::new("model", "文件选择未完成。"))??;
    match path {
        Some(path) => prepare(state.inner().clone(), path).await.map(Some),
        None => Ok(None),
    }
}

#[tauri::command]
pub async fn model_release(
    state: tauri::State<'_, LibraryState>,
    token: String,
) -> Result<(), AppError> {
    commands::run(state.inner().clone(), move |service| {
        service.release_model(&token)
    })
    .await
}

/// One-way raw transfer to the validation worker. Tokens resolve in-memory
/// snapshots only, never filesystem paths; no cache survives the webview session.
pub fn protocol(
    context: tauri::UriSchemeContext<'_, tauri::Wry>,
    request: Request<Vec<u8>>,
) -> Response<Vec<u8>> {
    let origin = request
        .headers()
        .get("Origin")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let allowed = matches!(origin, "http://tauri.localhost" | "http://127.0.0.1:1420");
    let token = request.uri().path().strip_prefix('/').unwrap_or("");
    let valid = allowed
        && context.webview_label() == "main"
        && request.method() == "GET"
        && request.uri().query().is_none()
        && uuid::Uuid::parse_str(token).is_ok();
    let result = if valid {
        let state = context.app_handle().state::<LibraryState>();
        let data = state.lock().map_err(|_| ()).and_then(|service| {
            service
                .as_ref()
                .map_err(|_| ())
                .and_then(|service| service.prepared_model_data(token).map_err(|_| ()))
        });
        data.map(|text| profiling::measure("model.worker_transfer", || text.as_bytes().to_vec()))
    } else {
        Err(())
    };
    let mut response = Response::builder()
        .status(if result.is_ok() { 200 } else { 404 })
        .header("Content-Type", "application/json")
        .header("Cache-Control", "no-store")
        .header("X-Content-Type-Options", "nosniff");
    if allowed {
        response = response.header("Access-Control-Allow-Origin", origin);
    }
    response
        .body(result.unwrap_or_default())
        .expect("constant response headers")
}
