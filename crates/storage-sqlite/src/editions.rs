use crate::{
    artwork, db_error,
    writes::{receipt, save_receipt},
};
use discatelier_contracts::{AppError, CoverChange, ModelChange, UpdateEdition};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use sha2::{Digest, Sha256};
use uuid::Uuid;

pub fn update(
    connection: &mut Connection,
    request: &UpdateEdition,
    prepared: &crate::models::prepared::PreparedModels,
) -> Result<String, AppError> {
    update_with_video(connection, request, prepared, None)
}
pub fn update_with_video(
    connection: &mut Connection,
    request: &UpdateEdition,
    prepared: &crate::models::prepared::PreparedModels,
    video: Option<&discatelier_contracts::VideoMetadata>,
) -> Result<String, AppError> {
    update_draft(connection, request, prepared, video, None, None)
}
pub fn update_with_content(
    connection: &mut Connection,
    request: &UpdateEdition,
    prepared: &crate::models::prepared::PreparedModels,
    content: &discatelier_contracts::EditionContent,
) -> Result<String, AppError> {
    update_draft(connection, request, prepared, None, Some(content), None)
}
pub fn replace_source(
    connection: &mut Connection,
    value: &discatelier_contracts::ReplaceEditionSource,
    prepared: &crate::models::prepared::PreparedModels,
) -> Result<String, AppError> {
    update_draft(
        connection,
        &value.request,
        prepared,
        value.video.as_ref(),
        Some(&value.content),
        Some(value),
    )
}
fn update_draft(
    connection: &mut Connection,
    request: &UpdateEdition,
    prepared: &crate::models::prepared::PreparedModels,
    video: Option<&discatelier_contracts::VideoMetadata>,
    content: Option<&discatelier_contracts::EditionContent>,
    source: Option<&discatelier_contracts::ReplaceEditionSource>,
) -> Result<String, AppError> {
    let _total = crate::profiling::Span::new("edition.total");
    let payload =
        crate::profiling::measure("edition.request_hash", || -> Result<String, AppError> {
            Ok(format!(
                "edition:{:x}",
                Sha256::digest(
                    if let Some(source) = source {
                        serde_json::to_vec(&("replace_source", source))
                    } else if content.is_some() {
                        serde_json::to_vec(&(request, "content", content))
                    } else if video.is_some() {
                        serde_json::to_vec(&(request, video))
                    } else {
                        serde_json::to_vec(request)
                    }
                    .map_err(|_| AppError::new("validation", "数据编码失败"))?
                )
            ))
        })?;
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(db_error)?;
    if let Some(id) = receipt(&transaction, &request.request_id, &payload)? {
        return Ok(id);
    }
    let current: Option<(String, Option<String>, i64)> = transaction
        .query_row(
            "SELECT work_id,cover_asset_id,revision FROM editions WHERE id=?1",
            [&request.edition_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(db_error)?;
    let (work_id, old_cover, revision) =
        current.ok_or_else(|| AppError::new("not_found", "发行版本不存在"))?;
    if revision != request.expected_revision {
        return Err(AppError::new(
            "conflict",
            "版本资料已发生变化，请重新打开后再编辑。",
        ));
    }
    let cover = match &request.cover {
        CoverChange::Keep => old_cover,
        CoverChange::Remove => None,
        CoverChange::Replace { data_url } => {
            Some(artwork::save(&transaction, &artwork::decode(data_url)?)?)
        }
    };
    match &request.model {
        ModelChange::Prepared { token } => {
            let id = crate::models::save_prepared(&transaction, prepared.get(token)?)?;
            transaction
                .execute(
                    "UPDATE editions SET model_asset_id=?1 WHERE id=?2",
                    params![id, request.edition_id],
                )
                .map_err(db_error)?;
        }
        ModelChange::Keep => {}
        ModelChange::Remove => {
            transaction
                .execute(
                    "UPDATE editions SET model_asset_id=NULL WHERE id=?1",
                    [&request.edition_id],
                )
                .map_err(db_error)?;
        }
        ModelChange::Replace { text } => {
            let id = crate::models::save(&transaction, text)?;
            transaction
                .execute(
                    "UPDATE editions SET model_asset_id=?1 WHERE id=?2",
                    params![id, request.edition_id],
                )
                .map_err(db_error)?;
        }
    }
    let edition = &request.edition;
    transaction
        .execute(
            "UPDATE works SET category_id=?1,title=?2,creator=?3 WHERE id=?4",
            params![edition.category_id, edition.title, edition.creator, work_id],
        )
        .map_err(db_error)?;
    transaction.execute("UPDATE editions SET edition_label=?1,barcode=?2,catalog_number=?3,cover_asset_id=?4,revision=revision+1 WHERE id=?5",
        params![edition.edition_label,edition.barcode,edition.catalog_number,cover,request.edition_id]).map_err(db_error)?;
    for (index, medium) in edition.media.iter().enumerate() {
        transaction.execute("INSERT INTO media (id,edition_id,position,carrier_id,label) VALUES (?1,?2,?3,?4,?5)
            ON CONFLICT(edition_id,position) DO UPDATE SET carrier_id=excluded.carrier_id,label=excluded.label",
            params![Uuid::new_v4().to_string(),request.edition_id,(index+1) as i64,medium.carrier_id,medium.label]).map_err(db_error)?;
    }
    transaction
        .execute(
            "DELETE FROM media WHERE edition_id=?1 AND position>?2",
            params![request.edition_id, edition.media.len() as i64],
        )
        .map_err(db_error)?;
    if let Some(value) = content {
        crate::content::replace(&transaction, &request.edition_id, value)?;
    }
    if let Some(value) = video {
        crate::video::save(&transaction, &request.edition_id, value)?;
    }
    if let Some(value) = source {
        crate::source_replacement::save(&transaction, value)?;
    }
    save_receipt(
        &transaction,
        &request.request_id,
        &payload,
        &request.edition_id,
    )?;
    crate::profiling::measure("edition.commit", || transaction.commit()).map_err(db_error)?;
    Ok(request.edition_id.clone())
}
