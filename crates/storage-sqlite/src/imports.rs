use crate::{db_error, reads, writes};
use discatelier_contracts::*;
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use sha2::{Digest, Sha256};

pub fn source_copy(
    connection: &Connection,
    provider_id: &str,
    external_id: &str,
) -> Result<Option<LibraryCopy>, AppError> {
    let id: Option<String> = connection
        .query_row(
            "SELECT edition_id FROM edition_sources WHERE provider_id=?1 AND external_id=?2",
            params![provider_id, external_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(db_error)?;
    id.map(|id| reads::edition(connection, &id))
        .transpose()
        .map(Option::flatten)
}

pub fn create(
    connection: &mut Connection,
    value: &ImportCopy,
    prepared: &crate::models::prepared::PreparedModels,
) -> Result<String, AppError> {
    let request = &value.request;
    let payload = format!(
        "import:{:x}",
        Sha256::digest(
            serde_json::to_vec(value).map_err(|_| AppError::new("validation", "数据编码失败"))?
        )
    );
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(db_error)?;
    if let Some(id) = writes::receipt(&transaction, &request.request_id, &payload)? {
        return Ok(id);
    }
    let current: Option<(String, i64)> = transaction.query_row(
        "SELECT s.edition_id,e.revision FROM edition_sources s JOIN editions e ON e.id=s.edition_id WHERE s.provider_id=?1 AND s.external_id=?2",
        params![value.source.provider_id, value.source.external_id], |row| Ok((row.get(0)?, row.get(1)?)),
    ).optional().map_err(db_error)?;
    match (
        &current,
        &request.existing_edition_id,
        request.expected_revision,
    ) {
        (None, None, None) => (),
        (Some((id, revision)), Some(expected), Some(expected_revision))
            if id == expected && *revision == expected_revision => {}
        _ => {
            return Err(AppError::new(
                "conflict",
                "这个版本的收藏已改变，请返回资料页重新选择。",
            ))
        }
    }
    let create = CreateCopy {
        request_id: request.request_id.clone(),
        edition: current.is_none().then(|| request.edition.clone()),
        existing_edition_id: current.as_ref().map(|(id, _)| id.clone()),
        copy: request.copy.clone(),
        cover: request.cover.clone(),
        model: request.model.clone(),
        model_token: request.model_token.clone(),
    };
    let id = writes::insert_copy(&transaction, &create, prepared)?;
    if current.is_none() {
        let edition_id: String = transaction
            .query_row("SELECT edition_id FROM copies WHERE id=?1", [&id], |row| {
                row.get(0)
            })
            .map_err(db_error)?;
        transaction.execute("INSERT INTO edition_sources (edition_id,provider_id,external_id,fetched_at) VALUES (?1,?2,?3,?4)",
            params![edition_id, value.source.provider_id, value.source.external_id, value.source.fetched_at]).map_err(db_error)?;
        for (position, identifier) in value.identifiers.iter().enumerate() {
            transaction.execute("INSERT INTO imported_identifiers (edition_id,position,namespace,kind,value,description) VALUES (?1,?2,?3,?4,?5,?6)",
                params![edition_id, (position + 1) as i64, identifier.namespace, identifier.kind, identifier.value, identifier.description]).map_err(db_error)?;
        }
    }
    let edition_id: String = transaction
        .query_row("SELECT edition_id FROM copies WHERE id=?1", [&id], |row| {
            row.get(0)
        })
        .map_err(db_error)?;
    crate::content::insert(&transaction, &edition_id, &value.content)?;
    if let Some(album) = &value.supplement {
        validate_supplement(album)?;
        let payload = serde_json::to_string(album)
            .map_err(|_| AppError::new("storage", "补充资料不可保存。"))?;
        transaction.execute("INSERT INTO edition_supplements(edition_id,payload) VALUES(?1,?2) ON CONFLICT(edition_id) DO UPDATE SET payload=excluded.payload", params![edition_id,payload]).map_err(db_error)?;
        if current.is_some() {
            transaction
                .execute(
                    "UPDATE editions SET revision=revision+1 WHERE id=?1",
                    [&edition_id],
                )
                .map_err(db_error)?;
        }
    }
    writes::save_receipt(&transaction, &request.request_id, &payload, &id)?;
    transaction.commit().map_err(db_error)?;
    Ok(id)
}

pub fn validate(connection: &Connection) -> Result<(), AppError> {
    let mut statement = connection
        .prepare("SELECT edition_id,provider_id,external_id,fetched_at FROM edition_sources")
        .map_err(db_error)?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                EditionSource {
                    provider_id: row.get(1)?,
                    external_id: row.get(2)?,
                    fetched_at: row.get(3)?,
                },
            ))
        })
        .map_err(db_error)?;
    for row in rows {
        let (id, source) = row.map_err(db_error)?;
        let mut identifiers = connection.prepare("SELECT namespace,kind,value,description FROM imported_identifiers WHERE edition_id=?1 ORDER BY position").map_err(db_error)?;
        let identifiers = identifiers
            .query_map([&id], |row| {
                Ok(ImportedIdentifier {
                    namespace: row.get(0)?,
                    kind: row.get(1)?,
                    value: row.get(2)?,
                    description: row.get(3)?,
                })
            })
            .map_err(db_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(db_error)?;
        validate_source(&source, &identifiers)?;
    }
    Ok(())
}
