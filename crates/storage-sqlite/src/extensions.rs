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
        let raw: Option<String> = self
            .connection
            .query_row(
                "SELECT payload FROM edition_supplements WHERE edition_id=?1",
                [edition],
                |r| r.get(0),
            )
            .optional()
            .map_err(db_error)?;
        raw.map(|s| {
            serde_json::from_str(&s).map_err(|_| AppError::new("storage", "补充资料不可读取。"))
        })
        .transpose()
    }
    fn save_supplement(
        &mut self,
        edition: &str,
        revision: i64,
        value: &MusicSupplement,
    ) -> Result<(), AppError> {
        validate_supplement(value)?;
        let payload = serde_json::to_string(value)
            .map_err(|_| AppError::new("storage", "补充资料不可保存。"))?;
        let tx = self.connection.transaction().map_err(db_error)?;
        let changed = tx.execute("UPDATE editions SET revision=revision+1 WHERE id=?1 AND revision=?2 AND work_id IN (SELECT id FROM works WHERE category_id='music')", params![edition,revision]).map_err(db_error)?;
        if changed != 1 {
            return Err(AppError::new(
                "conflict",
                "收藏资料已改变，请重新打开详情。",
            ));
        }
        tx.execute("INSERT INTO edition_supplements(edition_id,payload) VALUES(?1,?2) ON CONFLICT(edition_id) DO UPDATE SET payload=excluded.payload", params![edition,payload]).map_err(db_error)?;
        tx.commit().map_err(db_error)
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
