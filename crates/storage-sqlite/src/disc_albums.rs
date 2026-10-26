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
    // Only a user-confirmed binding edit materializes the old whole-list scope.
    // Ordinary reads remain non-mutating, and clearing one new disc stays cleared.
    let saved = read(&tx, edition)?;
    if !saved.is_empty() {
        if let Some(item) = crate::reads::edition(&tx, edition)? {
            let content = crate::content::read(&tx, edition)?.unwrap_or_default();
            let keys: Vec<_> = discatelier_application::optical_discs::for_media(
                &content.tracks,
                &item.edition.title,
                &item.edition.media,
            )
            .into_iter()
            .map(|disc| disc.key)
            .collect();
            {
                for link in
                    discatelier_application::disc_links::resolve(&keys, &saved, &item.edition.media)
                {
                    tx.execute("INSERT INTO edition_disc_albums VALUES(?1,?2,?3) ON CONFLICT(edition_id,disc_key) DO NOTHING", params![edition, link.disc_key, link.album_id as i64]).map_err(db_error)?;
                }
                for link in &saved {
                    if !keys.contains(&link.disc_key)
                        && (link.disc_key == "unassigned"
                            || keys.iter().any(|key| {
                                discatelier_application::disc_links::same_disc(
                                    key,
                                    &link.disc_key,
                                    &item.edition.media,
                                )
                            }))
                    {
                        tx.execute(
                            "DELETE FROM edition_disc_albums WHERE edition_id=?1 AND disc_key=?2",
                            params![edition, link.disc_key],
                        )
                        .map_err(db_error)?;
                    }
                }
            }
        }
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
