use crate::{db_error, SqliteLibrary};
use discatelier_application::ExtensionRepository;
use discatelier_contracts::{validate_supplement, AppError, MusicSupplement};
use rusqlite::{params, OptionalExtension};

impl ExtensionRepository for SqliteLibrary {
    fn create_music(
        &mut self,
        request: &discatelier_contracts::CreateCopy,
        album: &MusicSupplement,
    ) -> Result<String, AppError> {
        crate::create_music::create(&mut self.connection, request, album, &self.prepared_models)
    }
    fn supplement(&self, edition: &str) -> Result<Option<MusicSupplement>, AppError> {
        Ok(crate::music_albums::read(&self.connection, edition)?
            .into_iter()
            .next()
            .map(|a| a.album))
    }
    fn disc_albums(
        &self,
        edition: &str,
    ) -> Result<Vec<discatelier_contracts::DiscAlbumLink>, AppError> {
        crate::disc_albums::read(&self.connection, edition)
    }
    fn save_disc_album(
        &mut self,
        edition: &str,
        revision: i64,
        disc_key: &str,
        album_id: Option<u64>,
    ) -> Result<(), AppError> {
        crate::disc_albums::save(&mut self.connection, edition, revision, disc_key, album_id)
    }
    fn music_albums(
        &self,
        edition: &str,
    ) -> Result<Vec<discatelier_contracts::LinkedMusicAlbum>, AppError> {
        crate::music_albums::read(&self.connection, edition)
    }
    fn write_music_albums(
        &mut self,
        edition: &str,
        revision: i64,
        albums: &[discatelier_contracts::LinkedMusicAlbum],
    ) -> Result<(), AppError> {
        crate::music_albums::write(&mut self.connection, edition, revision, albums)
    }
    fn save_supplement(
        &mut self,
        edition: &str,
        revision: i64,
        value: &MusicSupplement,
    ) -> Result<(), AppError> {
        validate_supplement(value)?;
        let mut albums = self.music_albums(edition)?;
        if let Some(entry) = albums
            .iter_mut()
            .find(|a| a.album.album_id == value.album_id)
        {
            let links = entry.album.links.clone();
            entry.album = value.clone();
            for link in links {
                if entry.album.tracks.iter().any(|t| t.id == link.song_id)
                    && !entry
                        .album
                        .links
                        .iter()
                        .any(|l| l.position == link.position && l.title == link.title)
                {
                    entry.album.links.push(link);
                }
            }
        } else {
            albums.push(discatelier_contracts::LinkedMusicAlbum {
                album: value.clone(),
                legacy_positions: false,
            });
        }
        self.write_music_albums(edition, revision, &albums)
    }
    fn assistant_load(&self) -> Result<Option<String>, AppError> {
        self.connection
            .query_row(
                "SELECT payload FROM assistant_sessions ORDER BY updated_at DESC LIMIT 1",
                [],
                |r| r.get(0),
            )
            .optional()
            .map_err(db_error)
    }
    fn assistant_save(&mut self, id: &str, payload: &str) -> Result<(), AppError> {
        self.connection.execute("INSERT INTO assistant_sessions(id,updated_at,payload) VALUES(?1,?2,?3) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at,payload=excluded.payload", params![id,chrono::Utc::now().to_rfc3339(),payload]).map_err(db_error)?;
        Ok(())
    }
}
pub fn validate(connection: &rusqlite::Connection) -> Result<(), AppError> {
    let mut statement = connection
        .prepare("SELECT payload FROM edition_supplements")
        .map_err(db_error)?;
    let rows = statement
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(db_error)?;
    for row in rows {
        let value: MusicSupplement = serde_json::from_str(&row.map_err(db_error)?)
            .map_err(|_| AppError::new("restore", "备份补充资料无效。"))?;
        validate_supplement(&value)?;
    }
    let mut statement = connection
        .prepare("SELECT id,payload FROM assistant_sessions")
        .map_err(db_error)?;
    let rows = statement
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))
        .map_err(db_error)?;
    for row in rows {
        let (id, payload) = row.map_err(db_error)?;
        let value: serde_json::Value = serde_json::from_str(&payload)
            .map_err(|_| AppError::new("restore", "备份会话无效。"))?;
        if payload.len() > 1024 * 1024 || value.get("id").and_then(|v| v.as_str()) != Some(&id) {
            return Err(AppError::new("restore", "备份会话无效。"));
        }
    }
    Ok(())
}
