use crate::db_error;
use discatelier_contracts::{AppError, OpticalBinding};
use rusqlite::{params, Connection, OptionalExtension};

pub(crate) fn binding(
    connection: &Connection,
    media_token: &str,
) -> Result<Option<OpticalBinding>, AppError> {
    connection
        .query_row(
            "SELECT b.copy_id,w.title,w.creator,b.label,b.media_token,b.disc_key,b.disc_label
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
                    disc_key: row.get(5)?,
                    disc_label: row.get(6)?,
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
    disc_key: Option<&str>,
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
    let disc_label = if let Some(key) = disc_key {
        let (edition, title): (String, String) = connection.query_row(
            "SELECT e.id,w.title FROM copies c JOIN editions e ON e.id=c.edition_id JOIN works w ON w.id=e.work_id WHERE c.id=?1",
            [copy_id], |row| Ok((row.get(0)?, row.get(1)?)),
        ).map_err(db_error)?;
        let content = crate::content::read(connection, &edition)?.unwrap_or_default();
        let media = crate::reads::edition(connection, &edition)?
            .map(|copy| copy.edition.media)
            .unwrap_or_default();
        Some(
            discatelier_application::optical_discs::for_media(&content.tracks, &title, &media)
                .into_iter()
                .find(|disc| disc.key == key)
                .ok_or_else(|| AppError::new("validation", "该 Disc 已不存在，请重新选择。"))?
                .label,
        )
    } else {
        None
    };
    connection
        .execute(
            "INSERT INTO optical_bindings(media_token,copy_id,label,created_at,disc_key,disc_label)
             VALUES(?1,?2,?3,?4,?5,?6)
             ON CONFLICT(media_token) DO UPDATE SET
               copy_id=excluded.copy_id,label=excluded.label,created_at=excluded.created_at,
               disc_key=excluded.disc_key,disc_label=excluded.disc_label",
            params![
                media_token,
                copy_id,
                label,
                chrono::Utc::now().to_rfc3339(),
                disc_key,
                disc_label
            ],
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
