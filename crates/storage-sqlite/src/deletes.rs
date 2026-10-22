use crate::{db_error, writes};
use discatelier_contracts::{AppError, DeleteCopy};
use rusqlite::{Connection, OptionalExtension, Transaction, TransactionBehavior};
use sha2::{Digest, Sha256};

type CopyRow = (String, String, i64, Option<String>, Option<String>);

pub fn delete(connection: &mut Connection, request: &DeleteCopy) -> Result<String, AppError> {
    let payload = format!(
        "delete:{:x}",
        Sha256::digest(
            serde_json::to_vec(request).map_err(|_| AppError::new("validation", "数据编码失败"))?
        )
    );
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(db_error)?;
    if let Some(id) = writes::receipt(&transaction, &request.request_id, &payload)? {
        return Ok(id);
    }
    let current: Option<CopyRow> = transaction
        .query_row(
            "SELECT c.edition_id,e.work_id,c.revision,e.cover_asset_id,e.model_asset_id
             FROM copies c JOIN editions e ON e.id=c.edition_id WHERE c.id=?1",
            [&request.id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            },
        )
        .optional()
        .map_err(db_error)?;
    let Some((edition_id, work_id, revision, cover, model)) = current else {
        return Err(AppError::new("not_found", "收藏不存在。"));
    };
    if revision != request.expected_revision {
        return Err(AppError::new(
            "conflict",
            "这条收藏已发生变化，请重新打开后再删除。",
        ));
    }
    transaction
        .execute("DELETE FROM purchases WHERE copy_id=?1", [&request.id])
        .map_err(db_error)?;
    transaction
        .execute(
            "DELETE FROM collection_order WHERE copy_id=?1",
            [&request.id],
        )
        .map_err(db_error)?;
    transaction
        .execute("DELETE FROM copies WHERE id=?1", [&request.id])
        .map_err(db_error)?;
    let remaining: i64 = transaction
        .query_row(
            "SELECT count(*) FROM copies WHERE edition_id=?1",
            [&edition_id],
            |row| row.get(0),
        )
        .map_err(db_error)?;
    if remaining == 0 {
        delete_edition(
            &transaction,
            &edition_id,
            &work_id,
            cover.as_deref(),
            model.as_deref(),
        )?;
    }
    writes::save_receipt(&transaction, &request.request_id, &payload, &request.id)?;
    transaction.commit().map_err(db_error)?;
    Ok(request.id.clone())
}

fn delete_edition(
    transaction: &Transaction<'_>,
    edition_id: &str,
    work_id: &str,
    cover: Option<&str>,
    model: Option<&str>,
) -> Result<(), AppError> {
    // Child tables without an ON DELETE cascade are removed explicitly and in
    // dependency order before the edition row itself.
    for sql in [
        "DELETE FROM imported_identifiers WHERE edition_id=?1",
        "DELETE FROM edition_sources WHERE edition_id=?1",
        "DELETE FROM media WHERE edition_id=?1",
        "DELETE FROM edition_content WHERE edition_id=?1",
        "DELETE FROM edition_supplements WHERE edition_id=?1",
        "DELETE FROM edition_song_links WHERE edition_id=?1",
        "DELETE FROM edition_disc_albums WHERE edition_id=?1",
        "DELETE FROM edition_music_albums WHERE edition_id=?1",
        "DELETE FROM video_edition_details WHERE edition_id=?1",
        "DELETE FROM video_edition_parts WHERE edition_id=?1",
    ] {
        transaction.execute(sql, [edition_id]).map_err(db_error)?;
    }
    transaction
        .execute("DELETE FROM editions WHERE id=?1", [edition_id])
        .map_err(db_error)?;
    transaction
        .execute(
            "DELETE FROM works WHERE id=?1
             AND NOT EXISTS(SELECT 1 FROM editions WHERE work_id=?1)",
            [work_id],
        )
        .map_err(db_error)?;
    if let Some(id) = cover {
        transaction
            .execute(
                "DELETE FROM assets WHERE id=?1
                 AND NOT EXISTS(SELECT 1 FROM editions WHERE cover_asset_id=?1)",
                [id],
            )
            .map_err(db_error)?;
    }
    if let Some(id) = model {
        transaction
            .execute(
                "DELETE FROM model_assets WHERE id=?1
                 AND NOT EXISTS(SELECT 1 FROM editions WHERE model_asset_id=?1)",
                [id],
            )
            .map_err(db_error)?;
    }
    Ok(())
}
