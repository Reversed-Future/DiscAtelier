use crate::{db_error, io_error};
use discatelier_contracts::AppError;
use rusqlite::{
    backup::{Backup, StepResult},
    Connection, OpenFlags,
};
use std::{fs::OpenOptions, path::Path, time::Duration};

/// Snapshot SQLite pages, including committed WAL data, without opening the
/// application's schema or running migrations. A newer schema must not prevent
/// upgrading the application that needs to read it.
pub fn backup_for_update(directory: &Path) -> Result<Option<String>, AppError> {
    let database = directory.join("library.sqlite3");
    if !database.try_exists().map_err(io_error)? {
        return Ok(None);
    }
    let source = Connection::open_with_flags(&database, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(db_error)?;
    source
        .busy_timeout(Duration::from_secs(5))
        .map_err(db_error)?;
    source
        .pragma_update(None, "trusted_schema", false)
        .map_err(db_error)?;
    let backups = directory.join("backups");
    std::fs::create_dir_all(&backups).map_err(io_error)?;
    let name = format!(
        "before-update-{}-{}",
        chrono::Utc::now().format("%Y%m%d-%H%M%S"),
        uuid::Uuid::new_v4()
    );
    let staging = backups.join(format!("{name}.partial"));
    let completed = backups.join(format!("{name}.sqlite3"));
    // Never overwrite a previous backup. Failed snapshots remain .partial and
    // are excluded from the list of restorable backups.
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&staging)
        .map_err(io_error)?;
    let mut destination = Connection::open_with_flags(&staging, OpenFlags::SQLITE_OPEN_READ_WRITE)
        .map_err(db_error)?;
    {
        let backup = Backup::new(&source, &mut destination).map_err(db_error)?;
        if !matches!(backup.step(-1).map_err(db_error)?, StepResult::Done) {
            return Err(AppError::new(
                "backup",
                "收藏库正在写入，备份未完成，请稍后重试更新。",
            ));
        }
    }
    destination
        .pragma_update(None, "trusted_schema", false)
        .map_err(db_error)?;
    let integrity: String = destination
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .map_err(db_error)?;
    if integrity != "ok" {
        return Err(AppError::new(
            "backup",
            "升级前备份完整性检查失败，已停止安装。",
        ));
    }
    destination.close().map_err(|(_, e)| db_error(e))?;
    OpenOptions::new()
        .write(true)
        .open(&staging)
        .map_err(io_error)?
        .sync_all()
        .map_err(io_error)?;
    std::fs::rename(&staging, &completed).map_err(io_error)?;
    Ok(Some(completed.to_string_lossy().into_owned()))
}
