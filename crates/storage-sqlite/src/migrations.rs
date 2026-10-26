use crate::db_error;
use discatelier_contracts::AppError;
use rusqlite::Connection;
use sha2::{Digest, Sha256};
use std::path::Path;

const MIGRATIONS: [&str; 16] = [
    include_str!("../migrations/001_library.sql"),
    include_str!("../migrations/002_edition_assets.sql"),
    include_str!("../migrations/003_sources.sql"),
    include_str!("../migrations/004_models.sql"),
    include_str!("../migrations/005_playback.sql"),
    include_str!("../migrations/006_edition_content.sql"),
    include_str!("../migrations/007_supplements_assistant.sql"),
    include_str!("../migrations/008_catalog_details.sql"),
    include_str!("../migrations/009_song_links.sql"),
    include_str!("../migrations/010_music_albums.sql"),
    include_str!("../migrations/011_video_metadata.sql"),
    include_str!("../migrations/012_video_parts.sql"),
    include_str!("../migrations/013_collection_order.sql"),
    include_str!("../migrations/014_cover_size.sql"),
    include_str!("../migrations/015_optical_bindings.sql"),
    include_str!("../migrations/016_optical_disc.sql"),
];
pub fn apply(connection: &mut Connection, directory: &Path) -> Result<(), AppError> {
    let version: i64 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(db_error)?;
    if version < 0 || version > MIGRATIONS.len() as i64 {
        return Err(AppError::new(
            "schema",
            "此数据库由更新版本创建，请使用更新的 DiscAtelier。",
        ));
    }
    if version > 0 {
        let mut statement = connection
            .prepare("SELECT version,checksum FROM schema_migrations ORDER BY version")
            .map_err(db_error)?;
        let rows = statement
            .query_map([], |row| {
                Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(db_error)?;
        let applied = rows.collect::<Result<Vec<_>, _>>().map_err(db_error)?;
        if applied.len() != version as usize {
            return Err(AppError::new("schema", "数据库迁移记录缺失。"));
        }
        for (index, (number, checksum)) in applied.iter().enumerate() {
            if *number != index as i64 + 1
                || *checksum != format!("{:x}", Sha256::digest(MIGRATIONS[index].as_bytes()))
            {
                return Err(AppError::new("schema", "数据库迁移校验失败，已停止打开。"));
            }
        }
    }
    if version == MIGRATIONS.len() as i64 {
        return Ok(());
    }
    if version > 0 {
        let backups = directory.join("backups");
        std::fs::create_dir_all(&backups).map_err(crate::io_error)?;
        let path = backups.join(format!(
            "before-schema-{version}-{}.sqlite3",
            uuid::Uuid::new_v4()
        ));
        connection
            .backup(rusqlite::MAIN_DB, path, None)
            .map_err(db_error)?;
    }
    // Rebuilding a referenced table (cover assets) needs foreign-key checks
    // paused; every pending migration runs in one transaction and the result
    // is checked before commit.
    connection
        .pragma_update(None, "foreign_keys", "OFF")
        .map_err(db_error)?;
    let result = migrate(connection, version);
    connection
        .pragma_update(None, "foreign_keys", "ON")
        .map_err(db_error)?;
    result
}
fn migrate(connection: &mut Connection, version: i64) -> Result<(), AppError> {
    let transaction = connection.transaction().map_err(db_error)?;
    transaction.execute_batch("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, checksum TEXT NOT NULL);").map_err(db_error)?;
    for (index, sql) in MIGRATIONS.iter().enumerate().skip(version as usize) {
        let number = index as i64 + 1;
        transaction.execute_batch(sql).map_err(db_error)?;
        let checksum = format!("{:x}", Sha256::digest(sql.as_bytes()));
        transaction
            .execute(
                "INSERT INTO schema_migrations VALUES (?1,?2)",
                rusqlite::params![number, checksum],
            )
            .map_err(db_error)?;
        transaction
            .pragma_update(None, "user_version", number)
            .map_err(db_error)?;
    }
    let violations: i64 = transaction
        .query_row("SELECT count(*) FROM pragma_foreign_key_check", [], |row| {
            row.get(0)
        })
        .map_err(db_error)?;
    if violations != 0 {
        return Err(AppError::new("schema", "数据库外键校验失败，迁移已回滚。"));
    }
    transaction.commit().map_err(db_error)
}
