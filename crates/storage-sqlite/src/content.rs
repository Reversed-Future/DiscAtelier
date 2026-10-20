use crate::db_error;
use discatelier_contracts::*;
use rusqlite::{params, Connection, OptionalExtension};

pub fn read(connection: &Connection, edition_id: &str) -> Result<Option<EditionContent>, AppError> {
    let text: Option<String> = connection
        .query_row(
            "SELECT content_json FROM edition_content WHERE edition_id=?1",
            [edition_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(db_error)?;
    text.map(|text| decode(&text)).transpose()
}
fn decode(text: &str) -> Result<EditionContent, AppError> {
    let content: EditionContent =
        serde_json::from_str(text).map_err(|_| AppError::new("storage", "曲目资料无法读取。"))?;
    validate_content(&content)?;
    Ok(content)
}
pub fn insert(
    connection: &Connection,
    edition_id: &str,
    content: &EditionContent,
) -> Result<(), AppError> {
    validate_content(content)?;
    let text = serde_json::to_string(content)
        .map_err(|_| AppError::new("storage", "曲目资料无法保存。"))?;
    connection.execute("INSERT INTO edition_content (edition_id,content_json) VALUES (?1,?2) ON CONFLICT(edition_id) DO NOTHING", params![edition_id,text]).map_err(db_error)?;
    Ok(())
}
/// Fill only missing contents; verify the provider identity again after the network request.
pub fn complete(
    connection: &Connection,
    edition_id: &str,
    source: &EditionSource,
    content: &EditionContent,
) -> Result<(), AppError> {
    let found = connection.query_row("SELECT 1 FROM edition_sources WHERE edition_id=?1 AND provider_id=?2 AND external_id=?3", params![edition_id,source.provider_id,source.external_id], |_| Ok(())).optional().map_err(db_error)?;
    if found.is_none() {
        return Err(AppError::new(
            "conflict",
            "收藏来源已改变，请重新打开详情。",
        ));
    }
    insert(connection, edition_id, content)
}
pub fn validate(connection: &Connection) -> Result<(), AppError> {
    let mut statement = connection
        .prepare("SELECT content_json FROM edition_content")
        .map_err(db_error)?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(db_error)?;
    for row in rows {
        decode(&row.map_err(db_error)?)?;
    }
    Ok(())
}
