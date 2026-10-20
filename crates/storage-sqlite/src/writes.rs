use crate::db_error;
use discatelier_contracts::*;
use rusqlite::{params, Connection, OptionalExtension, Transaction, TransactionBehavior};
use sha2::{Digest, Sha256};
use uuid::Uuid;

pub(crate) fn receipt(
    transaction: &Transaction<'_>,
    request_id: &str,
    payload: &str,
) -> Result<Option<String>, AppError> {
    let existing: Option<(String, String)> = transaction
        .query_row(
            "SELECT payload_hash,result_id FROM write_receipts WHERE request_id=?1",
            [request_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(db_error)?;
    match existing {
        Some((hash, id)) if hash == payload => Ok(Some(id)),
        Some(_) => Err(AppError::new(
            "conflict",
            "请求已用于另一项修改，请重新打开表单。",
        )),
        None => Ok(None),
    }
}
pub(crate) fn save_receipt(
    transaction: &Transaction<'_>,
    request_id: &str,
    payload: &str,
    id: &str,
) -> Result<(), AppError> {
    transaction
        .execute(
            "INSERT INTO write_receipts VALUES (?1,?2,?3)",
            params![request_id, payload, id],
        )
        .map_err(db_error)?;
    Ok(())
}
pub fn create(
    connection: &mut Connection,
    request: &CreateCopy,
    prepared: &crate::models::prepared::PreparedModels,
) -> Result<String, AppError> {
    let payload = format!(
        "create:{:x}",
        Sha256::digest(
            serde_json::to_vec(request).map_err(|_| AppError::new("validation", "数据编码失败"))?
        )
    );
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(db_error)?;
    if let Some(id) = receipt(&transaction, &request.request_id, &payload)? {
        return Ok(id);
    }
    let id = insert_copy(&transaction, request, prepared)?;
    save_receipt(&transaction, &request.request_id, &payload, &id)?;
    transaction.commit().map_err(db_error)?;
    Ok(id)
}

pub(crate) fn insert_copy(
    transaction: &Transaction<'_>,
    request: &CreateCopy,
    prepared: &crate::models::prepared::PreparedModels,
) -> Result<String, AppError> {
    if request.existing_edition_id.is_some()
        && (request.cover.is_some() || request.model.is_some() || request.model_token.is_some())
    {
        return Err(AppError::new(
            "validation",
            "同版副本继承版本封面和模型，请在版本编辑中修改。",
        ));
    }
    let artwork = request
        .cover
        .as_deref()
        .map(crate::artwork::decode)
        .transpose()?;
    let cover_id = artwork
        .as_ref()
        .map(|asset| crate::artwork::save(transaction, asset))
        .transpose()?;
    let model_id = crate::models::save_input(
        transaction,
        request.model.as_deref(),
        request.model_token.as_deref(),
        prepared,
    )?;
    let edition_id = if let Some(edition) = &request.edition {
        let work_id = Uuid::new_v4().to_string();
        let edition_id = Uuid::new_v4().to_string();
        transaction
            .execute(
                "INSERT INTO works VALUES (?1,?2,?3,?4)",
                params![work_id, edition.category_id, edition.title, edition.creator],
            )
            .map_err(db_error)?;
        transaction
            .execute(
                "INSERT INTO editions (id,work_id,edition_label,barcode,catalog_number,cover_asset_id,model_asset_id) VALUES (?1,?2,?3,?4,?5,?6,?7)",
                params![
                    edition_id,
                    work_id,
                    edition.edition_label,
                    edition.barcode,
                    edition.catalog_number,
                    cover_id,
                    model_id
                ],
            )
            .map_err(db_error)?;
        for (position, medium) in edition.media.iter().enumerate() {
            transaction
                .execute(
                    "INSERT INTO media VALUES (?1,?2,?3,?4,?5)",
                    params![
                        Uuid::new_v4().to_string(),
                        edition_id,
                        (position + 1) as i64,
                        medium.carrier_id,
                        medium.label
                    ],
                )
                .map_err(db_error)?;
        }
        edition_id
    } else {
        let id = request
            .existing_edition_id
            .as_ref()
            .ok_or_else(|| AppError::new("validation", "缺少发行版本"))?;
        let exists: bool = transaction
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM editions WHERE id=?1)",
                [id],
                |row| row.get(0),
            )
            .map_err(db_error)?;
        if !exists {
            return Err(AppError::new("not_found", "发行版本不存在"));
        }
        id.clone()
    };
    let id = Uuid::new_v4().to_string();
    let value = &request.copy;
    transaction
        .execute(
            "INSERT INTO copies VALUES (?1,?2,?3,?4,?5,?6,?7,1)",
            params![
                id,
                edition_id,
                value.status,
                chrono::Utc::now().to_rfc3339(),
                value.acquired_at,
                value.storage_location,
                value.notes
            ],
        )
        .map_err(db_error)?;
    transaction
        .execute(
            "INSERT INTO purchases VALUES (?1,?2,?3,?4,?5)",
            params![
                id,
                value.amount_minor,
                value.currency,
                value.seller,
                value.purchase_url
            ],
        )
        .map_err(db_error)?;
    Ok(id)
}
pub fn update(connection: &mut Connection, request: &UpdateCopy) -> Result<String, AppError> {
    let payload = format!(
        "update:{:x}",
        Sha256::digest(
            serde_json::to_vec(request).map_err(|_| AppError::new("validation", "数据编码失败"))?
        )
    );
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(db_error)?;
    if let Some(id) = receipt(&transaction, &request.request_id, &payload)? {
        return Ok(id);
    }
    let value = &request.copy;
    let changed = transaction.execute(
        "UPDATE copies SET status=?1,acquired_at=?2,storage_location=?3,notes=?4,revision=revision+1 WHERE id=?5 AND revision=?6",
        params![value.status,value.acquired_at,value.storage_location,value.notes,request.id,request.expected_revision]
    ).map_err(db_error)?;
    if changed != 1 {
        return Err(AppError::new(
            "conflict",
            "这条收藏已发生变化，请重新打开后再编辑。",
        ));
    }
    transaction.execute("UPDATE purchases SET amount_minor=?1,currency=?2,seller=?3,purchase_url=?4 WHERE copy_id=?5",
        params![value.amount_minor,value.currency,value.seller,value.purchase_url,request.id]).map_err(db_error)?;
    save_receipt(&transaction, &request.request_id, &payload, &request.id)?;
    transaction.commit().map_err(db_error)?;
    Ok(request.id.clone())
}
