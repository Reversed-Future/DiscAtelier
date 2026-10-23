use crate::db_error;
use discatelier_contracts::{AppError, OpticalBinding};
use rusqlite::{params, Connection, OptionalExtension};

pub(crate) fn binding(
    connection: &Connection,
    media_token: &str,
) -> Result<Option<OpticalBinding>, AppError> {
    connection
        .query_row(
            "SELECT b.copy_id,w.title,w.creator,b.label,b.media_token
             FROM optical_bindings b
             JOIN copies c ON c.id=b.copy_id
             JOIN editions e ON e.id=c.edition_id
             JOIN works w ON w.id=e.work_id
             WHERE b.media_token=?1",
            params![media_token],
            |row| {
                Ok(OpticalBinding {
                    copy_id: row.get(0)?,
                    title: row.get(1)?,
                    creator: row.get(2)?,
                    label: row.get(3)?,
                    media_token: row.get(4)?,
                })
            },
        )
        .optional()
        .map_err(db_error)
}

pub(crate) fn save(
    connection: &Connection,
    media_token: &str,
    copy_id: &str,
    label: &str,
) -> Result<(), AppError> {
    if media_token.is_empty()
        || media_token.len() > 256
        || copy_id.is_empty()
        || copy_id.len() > 256
        || label.len() > 512
    {
        return Err(AppError::new("validation", "光盘关联参数无效。"));
    }
    let exists: bool = connection
        .query_row("SELECT 1 FROM copies WHERE id=?1", params![copy_id], |_| {
            Ok(true)
        })
        .optional()
        .map_err(db_error)?
        .unwrap_or(false);
    if !exists {
        return Err(AppError::new("validation", "收藏条目不存在。"));
    }
    connection
        .execute(
            "INSERT INTO optical_bindings(media_token,copy_id,label,created_at)
             VALUES(?1,?2,?3,?4)
             ON CONFLICT(media_token) DO UPDATE SET
               copy_id=excluded.copy_id,label=excluded.label,created_at=excluded.created_at",
            params![media_token, copy_id, label, chrono::Utc::now().to_rfc3339()],
        )
        .map_err(db_error)?;
    Ok(())
}

pub(crate) fn remove(connection: &Connection, media_token: &str) -> Result<(), AppError> {
    connection
        .execute(
            "DELETE FROM optical_bindings WHERE media_token=?1",
            params![media_token],
        )
        .map_err(db_error)?;
    Ok(())
}
