use crate::{db_error, writes};
use discatelier_contracts::{AppError, CreateCopy, EditionContent, MusicSupplement};
use rusqlite::{params, Connection, TransactionBehavior};
use sha2::{Digest, Sha256};

pub fn create(
    connection: &mut Connection,
    request: &CreateCopy,
    album: Option<&MusicSupplement>,
    content: Option<&EditionContent>,
    prepared: &crate::models::prepared::PreparedModels,
) -> Result<String, AppError> {
    if request.existing_edition_id.is_some()
        || request
            .edition
            .as_ref()
            .is_none_or(|edition| edition.category_id != "music")
    {
        return Err(AppError::new(
            "validation",
            "网易云资料只能用于新增音乐版本。",
        ));
    }
    let encoded = match content {
        None => serde_json::to_vec(&(request, album)),
        Some(content) => serde_json::to_vec(&(request, album, content)),
    }
    .map_err(|_| AppError::new("validation", "数据编码失败。"))?;
    let payload = format!("create-music:{:x}", Sha256::digest(encoded));
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(db_error)?;
    if let Some(id) = writes::receipt(&transaction, &request.request_id, &payload)? {
        return Ok(id);
    }
    let id = writes::insert_copy(&transaction, request, prepared)?;
    let edition: String = transaction
        .query_row("SELECT edition_id FROM copies WHERE id=?1", [&id], |row| {
            row.get(0)
        })
        .map_err(db_error)?;
    if let Some(content) = content {
        crate::content::replace(&transaction, &edition, content)?;
    }
    if let Some(album) = album {
        let data = serde_json::to_string(album)
            .map_err(|_| AppError::new("storage", "网易云资料不可保存。"))?;
        transaction
            .execute(
                "INSERT INTO edition_supplements(edition_id,payload) VALUES(?1,?2)",
                params![edition, data],
            )
            .map_err(db_error)?;
    }
    writes::save_receipt(&transaction, &request.request_id, &payload, &id)?;
    transaction.commit().map_err(db_error)?;
    Ok(id)
}
