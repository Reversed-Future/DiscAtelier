//! Atomic model storage. Models and covers are independent version assets.
pub mod file;
pub mod prepared;
pub mod source;
mod validation;
use crate::db_error;
use discatelier_contracts::AppError;
use rusqlite::{params, Connection, OptionalExtension};
use sha2::{Digest, Sha256};

pub fn save(connection: &Connection, text: &str) -> Result<String, AppError> {
    let _total = crate::profiling::Span::new("model.save_total");
    let metadata =
        crate::profiling::measure("model.validate_total", || validation::validate(text))?;
    let id = crate::profiling::measure("model.sha256", || {
        format!("{:x}", Sha256::digest(text.as_bytes()))
    });
    let _insert = crate::profiling::Span::new("model.sqlite_insert");
    connection.execute(
        "INSERT OR IGNORE INTO model_assets (id,title,byte_length,data,preview) VALUES (?1,?2,?3,?4,?5)",
        params![id, metadata.title, text.len() as i64, text, metadata.preview],
    ).map_err(db_error)?;
    Ok(id)
}

pub fn read(connection: &Connection, id: &str, preview: bool) -> Result<String, AppError> {
    connection
        .query_row(
            if preview {
                "SELECT preview FROM model_assets WHERE id=?1"
            } else {
                "SELECT data FROM model_assets WHERE id=?1"
            },
            [id],
            |row| row.get(0),
        )
        .optional()
        .map_err(db_error)?
        .ok_or_else(|| AppError::new("not_found", "模型文件不存在。"))
}

pub fn validate_stored(connection: &Connection) -> Result<(), AppError> {
    let mut statement = connection
        .prepare("SELECT id,title,byte_length,data,preview FROM model_assets")
        .map_err(db_error)?;
    let mut rows = statement.query([]).map_err(db_error)?;
    while let Some(row) = rows.next().map_err(db_error)? {
        let id: String = row.get(0).map_err(db_error)?;
        let title: String = row.get(1).map_err(db_error)?;
        let length: i64 = row.get(2).map_err(db_error)?;
        let text: String = row.get(3).map_err(db_error)?;
        let preview: String = row.get(4).map_err(db_error)?;
        if text.len() as i64 != length || format!("{:x}", Sha256::digest(text.as_bytes())) != id {
            return Err(AppError::new("restore", "备份中的模型哈希校验失败。"));
        }
        let checked = validation::validate(&text)?;
        if title != checked.title || preview != checked.preview {
            return Err(AppError::new("restore", "备份中的模型资料与文件不一致。"));
        }
    }
    Ok(())
}

// Called only with a native-validated immutable preparation. No parsing or image
// decode is repeated while holding the SQLite write transaction.
pub fn save_prepared(
    connection: &Connection,
    model: &discatelier_contracts::PreparedModel,
) -> Result<String, AppError> {
    let _insert = crate::profiling::Span::new("model.sqlite_insert");
    connection.execute("INSERT OR IGNORE INTO model_assets (id,title,byte_length,data,preview) VALUES (?1,?2,?3,?4,?5)",
        params![model.id, model.title, model.text.len() as i64, model.text.as_ref(), model.preview.as_ref()]).map_err(db_error)?;
    Ok(model.id.clone())
}
pub fn save_input(
    connection: &Connection,
    text: Option<&str>,
    token: Option<&str>,
    prepared: &prepared::PreparedModels,
) -> Result<Option<String>, AppError> {
    match (text, token) {
        (Some(text), None) => save(connection, text).map(Some),
        (None, Some(token)) => save_prepared(connection, prepared.get(token)?).map(Some),
        (None, None) => Ok(None),
        _ => Err(AppError::new("validation", "一次只能选择一个模型来源。")),
    }
}
