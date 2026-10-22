pub mod artwork;
pub mod links;
mod providers;
pub mod recognition;
pub mod settings;
#[cfg(test)]
mod tests;
use crate::{
    commands::{self, LibraryState},
    data_location::DataLocation,
};
use discatelier_contracts::*;
use serde::Serialize;

fn error(message: impl Into<String>) -> AppError {
    AppError::new("video_metadata", message)
}
#[tauri::command]
pub fn video_open_source(app: tauri::AppHandle, url: String) -> Result<(), AppError> {
    use tauri_plugin_opener::OpenerExt;
    if url != "https://www.themoviedb.org/settings/api" && providers::parse_link(&url)?.is_none() {
        return Err(error("资料来源链接无效。"));
    }
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|_| error("无法打开系统浏览器。"))
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchPage {
    pub items: Vec<VideoWork>,
    pub page: u32,
    pub has_more: bool,
}

#[tauri::command]
pub async fn video_search(
    source: VideoSource,
    query: String,
    page: u32,
) -> Result<SearchPage, AppError> {
    tauri::async_runtime::spawn_blocking(move || providers::search(source, &query, page))
        .await
        .map_err(|_| error("作品查询未完成。"))?
}
#[tauri::command]
pub async fn video_work(source: VideoSource, id: u64) -> Result<VideoWork, AppError> {
    tauri::async_runtime::spawn_blocking(move || providers::detail(source, id))
        .await
        .map_err(|_| error("作品读取未完成。"))?
}
#[tauri::command]
pub async fn video_metadata(
    state: tauri::State<'_, LibraryState>,
    edition_id: String,
) -> Result<Option<VideoMetadata>, AppError> {
    commands::run(state.inner().clone(), move |s| {
        s.video_metadata(&edition_id)
    })
    .await
}
#[tauri::command]
pub async fn video_create(
    state: tauri::State<'_, LibraryState>,
    request: CreateCopy,
    metadata: VideoMetadata,
) -> Result<String, AppError> {
    commands::run(state.inner().clone(), move |s| {
        s.create_video(request, metadata)
    })
    .await
}
#[tauri::command]
pub async fn video_update(
    state: tauri::State<'_, LibraryState>,
    request: UpdateEdition,
    metadata: VideoMetadata,
) -> Result<String, AppError> {
    commands::run(state.inner().clone(), move |s| {
        s.update_video(request, metadata)
    })
    .await
}

#[tauri::command]
pub async fn video_chapters(source: VideoSource, id: u64) -> Result<Vec<VideoChapter>, AppError> {
    tauri::async_runtime::spawn_blocking(move || providers::chapters(source, id))
        .await
        .map_err(|_| error("章节读取未完成。"))?
}

#[tauri::command]
pub async fn video_images(source: VideoSource, id: u64) -> Result<Vec<VideoImage>, AppError> {
    tauri::async_runtime::spawn_blocking(move || providers::images(source, id))
        .await
        .map_err(|_| error("图库读取未完成。"))?
}
