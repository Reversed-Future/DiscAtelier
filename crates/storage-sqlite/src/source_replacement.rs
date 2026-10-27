use crate::db_error;
use discatelier_contracts::{AppError, ReplaceEditionSource};
use rusqlite::{params, Connection, OptionalExtension};

pub fn save(connection: &Connection, value: &ReplaceEditionSource) -> Result<(), AppError> {
    let edition_id = &value.request.edition_id;
    let owner: Option<String> = connection
        .query_row(
            "SELECT edition_id FROM edition_sources WHERE provider_id=?1 AND external_id=?2",
            params![value.source.provider_id, value.source.external_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(db_error)?;
    if owner.is_some_and(|id| id != *edition_id) {
        return Err(AppError::new(
            "conflict",
            "这个 Discogs 发行已关联另一版本，请选择其他发行。",
        ));
    }
    connection
        .execute(
            "DELETE FROM imported_identifiers WHERE edition_id=?1",
            [edition_id],
        )
        .map_err(db_error)?;
    connection
        .execute(
            "DELETE FROM edition_sources WHERE edition_id=?1",
            [edition_id],
        )
        .map_err(db_error)?;
    connection.execute("INSERT INTO edition_sources (edition_id,provider_id,external_id,fetched_at) VALUES (?1,?2,?3,?4)",
        params![edition_id,value.source.provider_id,value.source.external_id,value.source.fetched_at]).map_err(db_error)?;
    for (position, identifier) in value.identifiers.iter().enumerate() {
        connection.execute("INSERT INTO imported_identifiers (edition_id,position,namespace,kind,value,description) VALUES (?1,?2,?3,?4,?5,?6)",
            params![edition_id,(position+1) as i64,identifier.namespace,identifier.kind,identifier.value,identifier.description]).map_err(db_error)?;
    }
    Ok(())
}
