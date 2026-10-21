use crate::db_error;
use discatelier_contracts::{AppError, DiscAlbumLink};
use rusqlite::{params, Connection};

pub fn read(connection: &Connection, edition: &str) -> Result<Vec<DiscAlbumLink>, AppError> {
    let mut statement = connection.prepare("SELECT disc_key,album_id FROM edition_disc_albums WHERE edition_id=?1 ORDER BY disc_key").map_err(db_error)?;
    let rows = statement
        .query_map([edition], |r| {
            Ok(DiscAlbumLink {
                disc_key: r.get(0)?,
                album_id: r.get::<_, i64>(1)? as u64,
            })
        })
        .map_err(db_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(db_error)
}
pub fn save(
    connection: &mut Connection,
    edition: &str,
    revision: i64,
    key: &str,
    id: Option<u64>,
) -> Result<(), AppError> {
    let tx = connection.transaction().map_err(db_error)?;
    let changed = tx
        .execute(
            "UPDATE editions SET revision=revision+1 WHERE id=?1 AND revision=?2",
            params![edition, revision],
        )
        .map_err(db_error)?;
    if changed != 1 {
        return Err(AppError::new(
            "conflict",
            "收藏资料已改变，请重新打开详情。",
        ));
    }
    if let Some(id) = id {
        tx.execute("INSERT INTO edition_disc_albums VALUES(?1,?2,?3) ON CONFLICT(edition_id,disc_key) DO UPDATE SET album_id=excluded.album_id", params![edition,key,id as i64]).map_err(db_error)?;
    } else {
        tx.execute(
            "DELETE FROM edition_disc_albums WHERE edition_id=?1 AND disc_key=?2",
            params![edition, key],
        )
        .map_err(db_error)?;
    }
    tx.commit().map_err(db_error)
}
