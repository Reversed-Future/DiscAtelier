mod snapshots;
use crate::{db_error, writes, SqliteLibrary};
use discatelier_application::video::VideoRepository;
use discatelier_contracts::*;
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use sha2::{Digest, Sha256};

impl VideoRepository for SqliteLibrary {
    fn video_metadata(&self, edition: &str) -> Result<Option<VideoMetadata>, AppError> {
        read(&self.connection, edition)
    }
    fn create_video(
        &mut self,
        request: &CreateCopy,
        metadata: &VideoMetadata,
    ) -> Result<String, AppError> {
        validate_video(metadata)?;
        let payload = format!(
            "video:{:x}",
            Sha256::digest(serde_json::to_vec(&(request, metadata)).map_err(|_| invalid())?)
        );
        let tx = self
            .connection
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(db_error)?;
        if let Some(id) = writes::receipt(&tx, &request.request_id, &payload)? {
            return Ok(id);
        }
        let id = writes::insert_copy(&tx, request, &self.prepared_models)?;
        let edition: String = tx
            .query_row("SELECT edition_id FROM copies WHERE id=?1", [&id], |r| {
                r.get(0)
            })
            .map_err(db_error)?;
        save(&tx, &edition, metadata)?;
        writes::save_receipt(&tx, &request.request_id, &payload, &id)?;
        tx.commit().map_err(db_error)?;
        Ok(id)
    }
    fn update_video(
        &mut self,
        request: &UpdateEdition,
        metadata: &VideoMetadata,
    ) -> Result<String, AppError> {
        validate_video(metadata)?;
        crate::editions::update_with_video(
            &mut self.connection,
            request,
            &self.prepared_models,
            Some(metadata),
        )
    }
}
fn invalid() -> AppError {
    AppError::new("storage", "影像资料无法读取或保存。")
}
pub fn save(connection: &Connection, edition: &str, value: &VideoMetadata) -> Result<(), AppError> {
    validate_video(value)?;
    let work_id: String = connection
        .query_row("SELECT work_id FROM editions WHERE id=?1", [edition], |r| {
            r.get(0)
        })
        .map_err(db_error)?;
    connection.execute("INSERT INTO video_work_metadata(work_id,payload) VALUES(?1,?2) ON CONFLICT(work_id) DO UPDATE SET payload=excluded.payload", params![work_id,snapshots::encode(value)?]).map_err(db_error)?;
    connection.execute("INSERT INTO video_edition_details(edition_id,payload) VALUES(?1,?2) ON CONFLICT(edition_id) DO UPDATE SET payload=excluded.payload", params![edition,serde_json::to_string(&value.physical).map_err(|_|invalid())?]).map_err(db_error)?;
    connection.execute("INSERT INTO video_edition_parts(edition_id,payload) VALUES(?1,?2) ON CONFLICT(edition_id) DO UPDATE SET payload=excluded.payload", params![edition,serde_json::to_string(&value.parts).map_err(|_|invalid())?]).map_err(db_error)?;
    Ok(())
}
fn read(connection: &Connection, edition: &str) -> Result<Option<VideoMetadata>, AppError> {
    let row: Option<(String, String)> = connection.query_row("SELECT w.payload,p.payload FROM video_edition_details p JOIN editions e ON e.id=p.edition_id JOIN video_work_metadata w ON w.work_id=e.work_id WHERE e.id=?1", [edition], |r| Ok((r.get(0)?,r.get(1)?))).optional().map_err(db_error)?;
    row.map(|(work, physical)| {
        let mut value = snapshots::decode(&work)?;
        value.physical = serde_json::from_str(&physical).map_err(|_| invalid())?;
        let parts: Option<String> = connection
            .query_row(
                "SELECT payload FROM video_edition_parts WHERE edition_id=?1",
                [edition],
                |r| r.get(0),
            )
            .optional()
            .map_err(db_error)?;
        value.parts = parts
            .map(|text| serde_json::from_str(&text).map_err(|_| invalid()))
            .transpose()?
            .unwrap_or_default();
        validate_video(&value)?;
        Ok(value)
    })
    .transpose()
}
pub fn validate(connection: &Connection) -> Result<(), AppError> {
    let mut works = connection
        .prepare("SELECT payload FROM video_work_metadata")
        .map_err(db_error)?;
    for row in works
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(db_error)?
    {
        validate_video(&snapshots::decode(&row.map_err(db_error)?)?)?;
    }
    let mut statement = connection
        .prepare("SELECT edition_id FROM video_edition_details")
        .map_err(db_error)?;
    for id in statement
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(db_error)?
    {
        read(connection, &id.map_err(db_error)?)?.ok_or_else(invalid)?;
    }
    Ok(())
}
