use crate::db_error;
use discatelier_contracts::{validate_supplement, AppError, LinkedMusicAlbum, MusicSupplement};
use rusqlite::{params, Connection};

pub fn read(connection: &Connection, edition: &str) -> Result<Vec<LinkedMusicAlbum>, AppError> {
    let mut statement = connection.prepare("SELECT album_id,legacy_positions,payload FROM edition_music_albums WHERE edition_id=?1 ORDER BY ordinal,album_id").map_err(db_error)?;
    let rows = statement
        .query_map([edition], |r| {
            Ok((
                r.get::<_, i64>(0)? as u64,
                r.get::<_, bool>(1)?,
                r.get::<_, String>(2)?,
            ))
        })
        .map_err(db_error)?;
    rows.map(|row| {
        let (id, legacy_positions, raw) = row.map_err(db_error)?;
        let album: MusicSupplement = serde_json::from_str(&raw)
            .map_err(|_| AppError::new("storage", "专辑关联不可读取。"))?;
        validate_supplement(&album)?;
        if id != album.album_id {
            return Err(AppError::new("storage", "专辑关联标识不一致。"));
        }
        Ok(LinkedMusicAlbum {
            album,
            legacy_positions,
        })
    })
    .collect()
}

pub fn write(
    connection: &mut Connection,
    edition: &str,
    revision: i64,
    albums: &[LinkedMusicAlbum],
) -> Result<(), AppError> {
    validate_albums(albums)?;
    let tx = connection.transaction().map_err(db_error)?;
    let changed = tx.execute("UPDATE editions SET revision=revision+1 WHERE id=?1 AND revision=?2 AND work_id IN (SELECT id FROM works WHERE category_id='music')", params![edition,revision]).map_err(db_error)?;
    if changed != 1 {
        return Err(AppError::new(
            "conflict",
            "收藏资料已改变，请重新打开详情。",
        ));
    }
    for entry in read(&tx, edition)? {
        if !albums
            .iter()
            .any(|a| a.album.album_id == entry.album.album_id)
        {
            tx.execute(
                "DELETE FROM edition_music_albums WHERE edition_id=?1 AND album_id=?2",
                params![edition, entry.album.album_id as i64],
            )
            .map_err(db_error)?;
        }
    }
    for (index, entry) in albums.iter().enumerate() {
        let raw = serde_json::to_string(&entry.album)
            .map_err(|_| AppError::new("storage", "专辑关联不可保存。"))?;
        tx.execute("INSERT INTO edition_music_albums VALUES(?1,?2,?3,?4,?5) ON CONFLICT(edition_id,album_id) DO UPDATE SET ordinal=excluded.ordinal,legacy_positions=excluded.legacy_positions,payload=excluded.payload", params![edition,entry.album.album_id as i64,index as i64,entry.legacy_positions,raw]).map_err(db_error)?;
    }
    tx.commit().map_err(db_error)
}

fn validate_albums(albums: &[LinkedMusicAlbum]) -> Result<(), AppError> {
    if albums.len() > 20
        || albums.iter().map(|a| a.album.tracks.len()).sum::<usize>() > 5000
        || albums.iter().filter(|a| a.legacy_positions).count() > 1
    {
        return Err(AppError::new(
            "validation",
            "每份实体最多关联 20 张数字专辑、5000 首曲目。",
        ));
    }
    for (i, entry) in albums.iter().enumerate() {
        validate_supplement(&entry.album)?;
        if albums[..i]
            .iter()
            .any(|a| a.album.album_id == entry.album.album_id)
        {
            return Err(AppError::new("validation", "数字专辑不能重复关联。"));
        }
    }
    Ok(())
}

pub fn validate(connection: &Connection) -> Result<(), AppError> {
    let mut statement = connection
        .prepare("SELECT DISTINCT edition_id FROM edition_music_albums")
        .map_err(db_error)?;
    let ids = statement
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(db_error)?;
    for id in ids {
        validate_albums(&read(connection, &id.map_err(db_error)?)?)?;
    }
    Ok(())
}
