use super::*;
use crate::commands::{self, LibraryState};
use discatelier_provider_discogs::import_draft;

#[tauri::command]
pub async fn discogs_complete_content(
    state: tauri::State<'_, DiscogsState>,
    library: tauri::State<'_, LibraryState>,
    edition_id: String,
    id: u64,
) -> Result<EditionContent, AppError> {
    let expected = edition_id.clone();
    let existing = commands::run(library.inner().clone(), move |service| {
        let item = service
            .source_copy("discogs", &id.to_string())?
            .filter(|item| item.edition_id == expected)
            .ok_or_else(|| AppError::new("conflict", "收藏来源不匹配，请重新打开详情。"))?;
        Ok((item.source.unwrap(), service.edition_content(&expected)?))
    })
    .await?;
    if let Some(content) = existing.1.filter(|c| c.details_loaded) {
        return Ok(content);
    }
    let content = run(state.inner().clone(), move |service| {
        let token = service.credentials.read()?;
        let release = service.provider.release(id, token.as_deref())?;
        Ok(EditionContent::from(&release))
    })
    .await?;
    let saved = content.clone();
    commands::run(library.inner().clone(), move |service| {
        service.complete_content(&edition_id, &existing.0, &saved)?;
        service
            .edition_content(&edition_id)?
            .ok_or_else(|| AppError::new("storage", "资料未保存。"))
    })
    .await
}

#[tauri::command]
pub async fn discogs_prepare_import(
    state: tauri::State<'_, DiscogsState>,
    library: tauri::State<'_, LibraryState>,
    id: u64,
    category_id: String,
    refresh_cover: Option<bool>,
) -> Result<ImportPreview, AppError> {
    let (token, edition, source, images) = run(state.inner().clone(), move |service| {
        let snapshot = service
            .release
            .as_ref()
            .filter(|snapshot| snapshot.release.id == id && snapshot.received.elapsed() < MAX_AGE)
            .ok_or_else(|| AppError::new("expired", "资料已过期，请重新查询这个发行。"))?;
        let (edition, identifiers) = import_draft(&snapshot.release, category_id)?;
        let source = EditionSource {
            provider_id: "discogs".into(),
            external_id: id.to_string(),
            fetched_at: snapshot.fetched_at.clone(),
        };
        validate_source(&source, &identifiers)?;
        service
            .imports
            .retain(|_, value| value.created.elapsed() < MAX_AGE);
        // Bounded preparation cache; a visible form never gets replaced by background search.
        if service.imports.len() >= 16 {
            let oldest = service
                .imports
                .iter()
                .min_by_key(|(_, value)| value.created)
                .map(|(key, _)| key.clone());
            if let Some(key) = oldest {
                service.imports.remove(&key);
            }
        }
        let token = uuid::Uuid::new_v4().to_string();
        service.imports.insert(
            token.clone(),
            PreparedImport {
                content: EditionContent::from(&snapshot.release),
                source: source.clone(),
                identifiers,
                created: snapshot.received,
            },
        );
        Ok((token, edition, source, snapshot.release.images.clone()))
    })
    .await?;
    let lookup = source.clone();
    let existing = commands::run(library.inner().clone(), move |service| {
        service.source_copy(&lookup.provider_id, &lookup.external_id)
    })
    .await?;
    let cover = if existing.is_none() || refresh_cover.unwrap_or(false) {
        run(state.inner().clone(), move |service| {
            service.provider.cover(&images)
        })
        .await?
    } else {
        None
    };
    Ok(ImportPreview {
        token,
        edition,
        source,
        existing,
        cover,
    })
}

#[tauri::command]
pub async fn discogs_import(
    state: tauri::State<'_, DiscogsState>,
    library: tauri::State<'_, LibraryState>,
    netease: tauri::State<'_, Arc<crate::netease::NeteaseState>>,
    request: ImportCopyRequest,
) -> Result<String, AppError> {
    let supplement = request
        .netease_album_id
        .map(|id| crate::netease::cached_album(&netease, id))
        .transpose()?;
    let value = run(state.inner().clone(), move |service| {
        let prepared = service
            .imports
            .get(&request.token)
            .filter(|value| value.created.elapsed() < MAX_AGE)
            .ok_or_else(|| AppError::new("expired", "资料已过期，请返回资料页重新查询。"))?;
        Ok(ImportCopy {
            supplement,
            content: prepared.content.clone(),
            request,
            source: prepared.source.clone(),
            identifiers: prepared.identifiers.clone(),
        })
    })
    .await?;
    // No network lock is held while the personal collection transaction commits.
    commands::run(library.inner().clone(), move |service| {
        service.import_copy(value)
    })
    .await
}

#[tauri::command]
pub async fn discogs_update_edition(
    state: tauri::State<'_, DiscogsState>,
    library: tauri::State<'_, LibraryState>,
    request: UpdateEdition,
    token: String,
    content: EditionContent,
    metadata: Option<VideoMetadata>,
) -> Result<String, AppError> {
    let value = run(state.inner().clone(), move |service| {
        let prepared = service
            .imports
            .get(&token)
            .filter(|value| value.created.elapsed() < MAX_AGE)
            .ok_or_else(|| AppError::new("expired", "资料已过期，请重新选择 Discogs 发行。"))?;
        Ok(ReplaceEditionSource {
            request,
            content,
            video: metadata,
            source: prepared.source.clone(),
            identifiers: prepared.identifiers.clone(),
        })
    })
    .await?;
    commands::run(library.inner().clone(), move |service| {
        service.replace_edition_source(value)
    })
    .await
}
