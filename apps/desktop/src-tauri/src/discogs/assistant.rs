use super::*;
use serde_json::{json, Value};

pub fn prepare_collection(
    state: &DiscogsState,
    id: u64,
    category: String,
    copy: discatelier_domain::CopyDraft,
) -> Result<ImportCopy, AppError> {
    let mut guard = state
        .lock()
        .map_err(|_| AppError::new("provider", "Discogs 服务不可用。"))?;
    let s = guard.as_mut().map_err(|e| e.clone())?;
    let release = s.provider.release(id, s.credentials.read()?.as_deref())?;
    let (edition, identifiers) = discatelier_provider_discogs::import_draft(&release, category)?;
    let cover = s.provider.cover(&release.images)?;
    Ok(ImportCopy {
        supplement: None,
        content: EditionContent::from(&release),
        identifiers,
        source: EditionSource {
            provider_id: "discogs".into(),
            external_id: id.to_string(),
            fetched_at: chrono::Utc::now().to_rfc3339(),
        },
        request: ImportCopyRequest {
            netease_album_id: None,
            request_id: uuid::Uuid::new_v4().to_string(),
            token: uuid::Uuid::new_v4().to_string(),
            edition,
            copy,
            cover,
            model: None,
            model_token: None,
            existing_edition_id: None,
            expected_revision: None,
        },
    })
}
pub fn original_cover(state: &DiscogsState, id: u64) -> Result<String, AppError> {
    let mut guard = state
        .lock()
        .map_err(|_| AppError::new("provider", "Discogs 服务不可用。"))?;
    let s = guard.as_mut().map_err(|e| e.clone())?;
    let release = s.provider.release(id, s.credentials.read()?.as_deref())?;
    s.provider
        .cover(&release.images)?
        .ok_or_else(|| AppError::new("provider", "该发行没有封面。"))
}

pub fn search(state: &DiscogsState, query: String) -> Result<Value, AppError> {
    let mut guard = state
        .lock()
        .map_err(|_| AppError::new("provider", "Discogs 服务不可用。"))?;
    let s = guard.as_mut().map_err(|e| e.clone())?;
    let token = s
        .credentials
        .read()?
        .ok_or_else(|| AppError::new("authentication", "请先配置 Discogs Token。"))?;
    let result = s.provider.search(
        MetadataSearch {
            mode: "keyword".into(),
            query,
            page: 1,
        },
        &token,
    )?;
    Ok(
        json!({"pagination":result.pagination,"results":result.results.iter().map(|r| json!({"id":r.id,"title":r.title,"country":r.country,"year":r.year,"catalogNumber":r.catno,"format":r.format})).collect::<Vec<_>>()}),
    )
}
pub fn release(state: &DiscogsState, id: u64) -> Result<Value, AppError> {
    let mut guard = state
        .lock()
        .map_err(|_| AppError::new("provider", "Discogs 服务不可用。"))?;
    let s = guard.as_mut().map_err(|e| e.clone())?;
    let token = s.credentials.read()?;
    let r = s.provider.release(id, token.as_deref())?;
    Ok(
        json!({"id":r.id,"title":r.title,"artists":r.artists,"formats":r.formats,"genres":r.genres,"styles":r.styles,"tracklist":r.tracklist}),
    )
}
