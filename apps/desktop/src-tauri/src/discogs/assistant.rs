use super::*;
use serde_json::{json, Value};

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
