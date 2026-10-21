use crate::{db_error, SqliteLibrary};
use discatelier_application::SongLinkRepository;
use discatelier_contracts::{validate_song_link, AppError, SongLink};
use rusqlite::{params, Connection, OptionalExtension};

fn decode(raw: &str) -> Result<SongLink, AppError> {
    let value =
        serde_json::from_str(raw).map_err(|_| AppError::new("storage", "歌曲关联不可读取。"))?;
    validate_song_link(&value)?;
    Ok(value)
}
impl SongLinkRepository for SqliteLibrary {
    fn song_links(&self, edition: &str) -> Result<Vec<SongLink>, AppError> {
        let mut statement = self
            .connection
            .prepare("SELECT payload FROM edition_song_links WHERE edition_id=?1 ORDER BY rowid")
            .map_err(db_error)?;
        let rows = statement
            .query_map([edition], |r| r.get::<_, String>(0))
            .map_err(db_error)?;
        rows.map(|r| decode(&r.map_err(db_error)?)).collect()
    }
    fn save_song_link(
        &mut self,
        edition: &str,
        revision: i64,
        position: &str,
        title: &str,
        link: Option<&SongLink>,
    ) -> Result<(), AppError> {
        if let Some(link) = link {
            validate_song_link(link)?;
        }
        let tx = self.connection.transaction().map_err(db_error)?;
        let changed = tx.execute("UPDATE editions SET revision=revision+1 WHERE id=?1 AND revision=?2 AND work_id IN (SELECT id FROM works WHERE category_id='music')", params![edition,revision]).map_err(db_error)?;
        if changed != 1 {
            return Err(AppError::new(
                "conflict",
                "收藏资料已改变，请重新打开详情。",
            ));
        }
        // Clear legacy overrides in every associated album without touching other links.
        for mut entry in crate::music_albums::read(&tx, edition)? {
            entry
                .album
                .links
                .retain(|l| l.position != position || l.title != title);
            let raw = serde_json::to_string(&entry.album)
                .map_err(|_| AppError::new("storage", "补充资料不可保存。"))?;
            tx.execute(
                "UPDATE edition_music_albums SET payload=?3 WHERE edition_id=?1 AND album_id=?2",
                params![edition, entry.album.album_id as i64, raw],
            )
            .map_err(db_error)?;
        }
        if let Some(link) = link {
            let total: i64 = tx
                .query_row(
                    "SELECT count(*) FROM edition_song_links WHERE edition_id=?1",
                    [edition],
                    |r| r.get(0),
                )
                .map_err(db_error)?;
            let exists = tx.query_row("SELECT 1 FROM edition_song_links WHERE edition_id=?1 AND position=?2 AND title=?3", params![edition,position,title], |_| Ok(())).optional().map_err(db_error)?.is_some();
            if total >= 1000 && !exists {
                return Err(AppError::new(
                    "validation",
                    "单个版本最多关联 1000 首歌曲。",
                ));
            }
            let raw = serde_json::to_string(link)
                .map_err(|_| AppError::new("storage", "歌曲关联不可保存。"))?;
            tx.execute("INSERT INTO edition_song_links VALUES(?1,?2,?3,?4) ON CONFLICT(edition_id,position,title) DO UPDATE SET payload=excluded.payload", params![edition,position,title,raw]).map_err(db_error)?;
        } else {
            tx.execute(
                "DELETE FROM edition_song_links WHERE edition_id=?1 AND position=?2 AND title=?3",
                params![edition, position, title],
            )
            .map_err(db_error)?;
        }
        tx.commit().map_err(db_error)
    }
}
pub fn validate(connection: &Connection) -> Result<(), AppError> {
    let mut statement = connection
        .prepare("SELECT position,title,payload FROM edition_song_links")
        .map_err(db_error)?;
    let rows = statement
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
            ))
        })
        .map_err(db_error)?;
    for row in rows {
        let (position, title, raw) = row.map_err(db_error)?;
        let link = decode(&raw)?;
        if link.position != position || link.title != title {
            return Err(AppError::new("restore", "备份中的歌曲关联不一致。"));
        }
    }
    Ok(())
}
