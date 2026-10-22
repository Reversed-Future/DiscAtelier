use crate::{db_error, io_error, migrations};
use discatelier_contracts::{AppError, BackupEntry, RestorePreview};
use rusqlite::{
    backup::{Backup, StepResult},
    Connection, OpenFlags,
};
use sha2::{Digest, Sha256};
use std::path::Path;

pub struct PreparedRestore {
    pub connection: Connection,
    token: String,
    stamp: (u64, i64),
}
impl PreparedRestore {
    pub fn check(&self, live: &Connection, token: &str) -> Result<(), AppError> {
        if token != self.token || stamp(live)? != self.stamp {
            return Err(invalid("检查后收藏库已改变，请重新检查备份。"));
        }
        Ok(())
    }
}
fn stamp(connection: &Connection) -> Result<(u64, i64), AppError> {
    Ok((
        connection.total_changes(),
        connection
            .pragma_query_value(None, "data_version", |row| row.get(0))
            .map_err(db_error)?,
    ))
}
pub fn copy(source: &Connection, destination: &mut Connection) -> Result<(), AppError> {
    let backup = Backup::new(source, destination).map_err(db_error)?;
    // One SQLite backup step commits atomically; busy/locked leaves the destination intact.
    match backup.step(-1).map_err(db_error)? {
        StepResult::Done => Ok(()),
        _ => Err(invalid("数据库正在使用，请稍后重新检查备份。")),
    }
}
pub fn backups(directory: &Path) -> Result<Vec<BackupEntry>, AppError> {
    let directory = directory.join("backups");
    if !directory.exists() {
        return Ok(vec![]);
    }
    let mut entries = Vec::new();
    for entry in std::fs::read_dir(directory).map_err(io_error)? {
        let entry = entry.map_err(io_error)?;
        if entry.file_type().map_err(io_error)?.is_file()
            && entry
                .path()
                .extension()
                .is_some_and(|value| value == "sqlite3")
        {
            entries.push(BackupEntry {
                name: entry.file_name().to_string_lossy().into_owned(),
                path: entry.path().to_string_lossy().into_owned(),
                byte_length: entry.metadata().map_err(io_error)?.len(),
            });
        }
    }
    entries.sort_by(|left, right| right.name.cmp(&left.name));
    Ok(entries)
}
type SchemaRow = (String, String, String, Option<String>);
fn schema(connection: &Connection) -> Result<Vec<SchemaRow>, AppError> {
    let mut statement = connection
        .prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name")
        .map_err(db_error)?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })
        .map_err(db_error)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(db_error)
}
pub fn prepare(
    live: &Connection,
    directory: &Path,
    path: &str,
) -> Result<(PreparedRestore, RestorePreview), AppError> {
    let path = Path::new(path);
    if !path.is_absolute() || !path.is_file() {
        return Err(invalid("请选择已有备份文件的完整路径。"));
    }
    let source = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|_| invalid("无法打开备份文件。"))?;
    source
        .pragma_update(None, "trusted_schema", false)
        .map_err(db_error)?;
    let version: i64 = source
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(db_error)?;
    if version < 1 {
        return Err(invalid("该文件不是 DiscAtelier 收藏备份。"));
    }
    let integrity: String = source
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .map_err(db_error)?;
    if integrity != "ok" {
        return Err(invalid("备份完整性检查失败。"));
    }
    let mut staged = Connection::open_in_memory().map_err(db_error)?;
    copy(&source, &mut staged)?;
    staged
        .pragma_update(None, "trusted_schema", false)
        .map_err(db_error)?;
    migrations::apply(&mut staged, directory)?;
    let mut reference = Connection::open_in_memory().map_err(db_error)?;
    migrations::apply(&mut reference, directory)?;
    if schema(&staged)? != schema(&reference)? {
        return Err(invalid("备份结构与本程序不一致。"));
    }
    if staged
        .prepare("PRAGMA foreign_key_check")
        .map_err(db_error)?
        .exists([])
        .map_err(db_error)?
    {
        return Err(invalid("备份中的关联记录不完整。"));
    }
    // Validate original image bytes, including assets no longer referenced by an edition.
    {
        let mut statement = staged
            .prepare("SELECT id,byte_length,data FROM assets")
            .map_err(db_error)?;
        let mut rows = statement.query([]).map_err(db_error)?;
        while let Some(row) = rows.next().map_err(db_error)? {
            let id: String = row.get(0).map_err(db_error)?;
            let length: i64 = row.get(1).map_err(db_error)?;
            let bytes: Vec<u8> = row.get(2).map_err(db_error)?;
            if bytes.len() as i64 != length || format!("{:x}", Sha256::digest(&bytes)) != id {
                return Err(invalid("备份中的封面哈希校验失败。"));
            }
            crate::artwork::decode(&crate::artwork::read(&staged, &id)?)?;
        }
    }
    crate::models::validate_stored(&staged)?;
    let mut checked_copies = 0_i64;
    crate::imports::validate(&staged)?;
    crate::content::validate(&staged)?;
    crate::playback::validate_stored(&staged)?;
    crate::extensions::validate(&staged)?;
    crate::music_albums::validate(&staged)?;
    crate::song_links::validate(&staged)?;
    crate::video::validate(&staged)?;
    for category in discatelier_domain::categories() {
        for item in crate::reads::list(
            &staged,
            &discatelier_contracts::LibraryQuery {
                category_id: category.id,
                status: None,
                query: String::new(),
            },
        )? {
            discatelier_domain::validate_edition(&item.edition).map_err(|value| invalid(&value))?;
            discatelier_domain::validate_copy(&item.copy).map_err(|value| invalid(&value))?;
            checked_copies += 1;
        }
    }
    let token = uuid::Uuid::new_v4().to_string();
    let preview = RestorePreview {
        token: token.clone(),
        models: staged
            .query_row("SELECT count(*) FROM model_assets", [], |row| row.get(0))
            .map_err(db_error)?,
        copies: staged
            .query_row("SELECT count(*) FROM copies", [], |row| row.get(0))
            .map_err(db_error)?,
        editions: staged
            .query_row("SELECT count(*) FROM editions", [], |row| row.get(0))
            .map_err(db_error)?,
        assets: staged
            .query_row("SELECT count(*) FROM assets", [], |row| row.get(0))
            .map_err(db_error)?,
    };
    if checked_copies != preview.copies {
        return Err(invalid("备份中有不支持的品类或缺失的购买记录。"));
    }
    Ok((
        PreparedRestore {
            connection: staged,
            token,
            stamp: stamp(live)?,
        },
        preview,
    ))
}
fn invalid(message: &str) -> AppError {
    AppError::new("restore", message)
}
