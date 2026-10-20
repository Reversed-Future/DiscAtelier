use crate::{db_error, SqliteLibrary};
use discatelier_application::PlaybackHistoryRepository;
use discatelier_contracts::{AppError, PlaybackPhase, PlaybackRecord};

pub(crate) fn validate_stored(connection: &rusqlite::Connection) -> Result<(), AppError> {
    let mut statement = connection
        .prepare("SELECT id,started_at,payload FROM playback_sessions")
        .map_err(db_error)?;
    let mut rows = statement.query([]).map_err(db_error)?;
    while let Some(row) = rows.next().map_err(db_error)? {
        let id: String = row.get(0).map_err(db_error)?;
        let started_at: String = row.get(1).map_err(db_error)?;
        let payload: String = row.get(2).map_err(db_error)?;
        let record: PlaybackRecord = serde_json::from_str(&payload)
            .map_err(|_| AppError::new("restore", "备份中的播放记录不可读取。"))?;
        if id != record.session_id
            || started_at != record.started_at
            || chrono::DateTime::parse_from_rfc3339(&record.started_at).is_err()
            || chrono::DateTime::parse_from_rfc3339(&record.updated_at).is_err()
            || !record.position_seconds.is_finite()
            || record.position_seconds < 0.0
            || !record.watched_seconds.is_finite()
            || record.watched_seconds < 0.0
            || record
                .duration_seconds
                .is_some_and(|d| !d.is_finite() || d <= 0.0)
            || record.dvd_title.is_some_and(|title| {
                record.source.playlist != "dvd-menu" || !(1..=9999).contains(&title)
            })
        {
            return Err(AppError::new("restore", "备份中的播放记录无效。"));
        }
    }
    Ok(())
}

impl PlaybackHistoryRepository for SqliteLibrary {
    fn save_playback(&mut self, record: &PlaybackRecord) -> Result<(), AppError> {
        let payload = serde_json::to_string(record)
            .map_err(|_| AppError::new("history", "播放记录格式错误。"))?;
        self.connection.execute(
            "INSERT INTO playback_sessions(id,started_at,payload) VALUES(?1,?2,?3) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload",
            rusqlite::params![record.session_id,record.started_at,payload]
        ).map_err(db_error)?;
        Ok(())
    }
    fn playback_history(&self) -> Result<Vec<PlaybackRecord>, AppError> {
        let mut statement = self
            .connection
            .prepare("SELECT payload FROM playback_sessions ORDER BY started_at DESC LIMIT 100")
            .map_err(db_error)?;
        let rows = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(db_error)?;
        rows.map(|row| {
            serde_json::from_str(&row.map_err(db_error)?)
                .map_err(|_| AppError::new("history", "播放记录不可读取。"))
        })
        .collect()
    }
    fn interrupt_playback(&mut self) -> Result<(), AppError> {
        let mut statement=self.connection.prepare("SELECT payload FROM playback_sessions WHERE json_extract(payload,'$.phase') IN ('loading','playing','paused','buffering','stopping')").map_err(db_error)?;
        let rows = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(db_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(db_error)?;
        drop(statement);
        let transaction = self.connection.transaction().map_err(db_error)?;
        for row in rows {
            let mut record: PlaybackRecord = serde_json::from_str(&row)
                .map_err(|_| AppError::new("history", "播放记录不可读取。"))?;
            record.phase = PlaybackPhase::Interrupted;
            let payload = serde_json::to_string(&record)
                .map_err(|_| AppError::new("history", "播放记录格式错误。"))?;
            transaction
                .execute(
                    "UPDATE playback_sessions SET payload=?1 WHERE id=?2",
                    rusqlite::params![payload, record.session_id],
                )
                .map_err(db_error)?;
        }
        transaction.commit().map_err(db_error)
    }
}
