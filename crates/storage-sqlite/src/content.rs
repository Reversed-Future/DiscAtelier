use crate::db_error;
use discatelier_contracts::*;
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::HashMap;

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
fn collect_titles(rows: &[ReleaseTrack], output: &mut Vec<String>) {
    for row in rows {
        output.push(row.title.clone());
        collect_titles(&row.sub_tracks, output);
    }
}

/// Track titles are searchable for editions imported with a metadata tracklist.
pub(crate) fn search_titles(
    connection: &Connection,
) -> Result<HashMap<String, Vec<String>>, AppError> {
    let mut statement = connection
        .prepare("SELECT edition_id,content_json FROM edition_content")
        .map_err(db_error)?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(db_error)?;
    let mut result = HashMap::new();
    for row in rows {
        let (edition_id, text) = row.map_err(db_error)?;
        // A malformed old content row must not break every library search.
        if let Ok(content) = decode(&text) {
            let mut titles = Vec::new();
            collect_titles(&content.tracks, &mut titles);
            result.insert(edition_id, titles);
        }
    }
    Ok(result)
}

fn decode(text: &str) -> Result<EditionContent, AppError> {
    let content: EditionContent =
        serde_json::from_str(text).map_err(|_| AppError::new("storage", "曲目资料无法读取。"))?;
    validate_content(&content)?;
    Ok(content)
}
/// Replace a tracklist after the user has manually edited fetched metadata.
pub fn replace(
    connection: &Connection,
    edition_id: &str,
    content: &EditionContent,
) -> Result<(), AppError> {
    validate_content(content)?;
    let count: u32 = connection
        .query_row(
            "SELECT COUNT(*) FROM media WHERE edition_id=?1",
            [edition_id],
            |row| row.get(0),
        )
        .map_err(db_error)?;
    fn within_media(rows: &[ReleaseTrack], count: u32) -> bool {
        rows.iter().all(|row| {
            row.disc_number
                .is_none_or(|number| u32::from(number) <= count)
                && within_media(&row.sub_tracks, count)
        })
    }
    if !within_media(&content.tracks, count) {
        return Err(AppError::new(
            "validation",
            "所属 Disc 超出本版本的实体载体数量，请先核对版本载体。",
        ));
    }
    let text = serde_json::to_string(content)
        .map_err(|_| AppError::new("storage", "曲目资料无法保存。"))?;
    connection
        .execute(
            "INSERT INTO edition_content (edition_id,content_json) VALUES (?1,?2) \
             ON CONFLICT(edition_id) DO UPDATE SET content_json=excluded.content_json",
            params![edition_id, text],
        )
        .map_err(db_error)?;
    Ok(())
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
    if let Some(mut saved) = read(connection, edition_id)? {
        if !saved.details_loaded && content.details_loaded {
            // Enrich existing contents without replacing the original track list.
            fn enrich(old: &mut [ReleaseTrack], new: &[ReleaseTrack]) {
                for row in old {
                    let matches: Vec<_> = new
                        .iter()
                        .filter(|n| n.position == row.position && n.title == row.title)
                        .collect();
                    if let [entry] = matches.as_slice() {
                        row.extraartists = entry.extraartists.clone();
                        enrich(&mut row.sub_tracks, &entry.sub_tracks);
                    }
                }
            }
            enrich(&mut saved.tracks, &content.tracks);
            saved.credits = content.credits.clone();
            saved.companies = content.companies.clone();
            saved.notes = content.notes.clone();
            saved.details_loaded = true;
            validate_content(&saved)?;
            let text = serde_json::to_string(&saved)
                .map_err(|_| AppError::new("storage", "资料无法保存。"))?;
            connection
                .execute(
                    "UPDATE edition_content SET content_json=?2 WHERE edition_id=?1",
                    params![edition_id, text],
                )
                .map_err(db_error)?;
        }
        Ok(())
    } else {
        insert(connection, edition_id, content)
    }
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
