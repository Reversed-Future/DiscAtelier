use crate::{db_error, search};
use discatelier_contracts::*;
use discatelier_domain::*;
use rusqlite::{params, Connection};
use std::collections::HashMap;

pub fn list(connection: &Connection, query: &LibraryQuery) -> Result<Vec<LibraryCopy>, AppError> {
    read(connection, query, None)
}
pub(crate) fn edition(
    connection: &Connection,
    edition_id: &str,
) -> Result<Option<LibraryCopy>, AppError> {
    Ok(
        read(connection, &LibraryQuery::default(), Some(edition_id))?
            .into_iter()
            .next(),
    )
}
fn read(
    connection: &Connection,
    query: &LibraryQuery,
    edition_id: Option<&str>,
) -> Result<Vec<LibraryCopy>, AppError> {
    let mut media_statement = connection
        .prepare("SELECT edition_id, carrier_id, label FROM media ORDER BY edition_id, position")
        .map_err(db_error)?;
    let rows = media_statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                MediumDraft {
                    carrier_id: row.get(1)?,
                    label: row.get(2)?,
                },
            ))
        })
        .map_err(db_error)?;
    let mut media: HashMap<String, Vec<MediumDraft>> = HashMap::new();
    for row in rows {
        let (id, medium) = row.map_err(db_error)?;
        media.entry(id).or_default().push(medium);
    }
    let mut statement = connection
        .prepare(
            "SELECT c.id,c.edition_id,c.revision,c.added_at,w.category_id,w.title,w.creator,
          e.edition_label,e.barcode,e.catalog_number,c.status,c.acquired_at,p.amount_minor,
          p.currency,p.seller,p.purchase_url,c.storage_location,c.notes,e.revision,e.cover_asset_id,
          (SELECT count(*) FROM copies related WHERE related.edition_id=e.id),
          s.provider_id,s.external_id,s.fetched_at,e.model_asset_id,
          (SELECT title FROM model_assets WHERE id=e.model_asset_id)
         FROM copies c JOIN editions e ON e.id=c.edition_id JOIN works w ON w.id=e.work_id
         JOIN purchases p ON p.copy_id=c.id
         LEFT JOIN edition_sources s ON s.edition_id=e.id
         LEFT JOIN collection_order o ON o.copy_id=c.id
         WHERE ((?3 IS NULL AND w.category_id=?1) OR (?3 IS NOT NULL AND e.id=?3)) AND (?2 IS NULL OR c.status=?2)
         ORDER BY COALESCE(o.position,-1), c.added_at DESC, c.id",
        )
        .map_err(db_error)?;
    let rows = statement
        .query_map(
            params![query.category_id, query.status, edition_id],
            |row| {
                let edition_id: String = row.get(1)?;
                Ok(LibraryCopy {
                    id: row.get(0)?,
                    edition_id: edition_id.clone(),
                    edition_revision: row.get(18)?,
                    cover_asset_id: row.get(19)?,
                    model_asset_id: row.get(24)?,
                    model_title: row.get(25)?,
                    edition_copy_count: row.get(20)?,
                    revision: row.get(2)?,
                    added_at: row.get(3)?,
                    edition: EditionDraft {
                        category_id: row.get(4)?,
                        title: row.get(5)?,
                        creator: row.get(6)?,
                        edition_label: row.get(7)?,
                        barcode: row.get(8)?,
                        catalog_number: row.get(9)?,
                        media: media.get(&edition_id).cloned().unwrap_or_default(),
                    },
                    copy: CopyDraft {
                        status: row.get(10)?,
                        acquired_at: row.get(11)?,
                        amount_minor: row.get(12)?,
                        currency: row.get(13)?,
                        seller: row.get(14)?,
                        purchase_url: row.get(15)?,
                        storage_location: row.get(16)?,
                        notes: row.get(17)?,
                    },
                    source: row
                        .get::<_, Option<String>>(21)?
                        .map(|provider_id| -> rusqlite::Result<EditionSource> {
                            Ok(EditionSource {
                                provider_id,
                                external_id: row.get(22)?,
                                fetched_at: row.get(23)?,
                            })
                        })
                        .transpose()?,
                })
            },
        )
        .map_err(db_error)?;
    let mut copies = rows
        .map(|row| row.map_err(db_error))
        .collect::<Result<Vec<_>, AppError>>()?;
    let needle = query.query.trim();
    if needle.is_empty() {
        return Ok(copies);
    }
    let mut identifiers_statement = connection
        .prepare("SELECT edition_id, value FROM imported_identifiers")
        .map_err(db_error)?;
    let identifiers = identifiers_statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(db_error)?;
    let mut values: HashMap<String, Vec<String>> = HashMap::new();
    for row in identifiers {
        let (edition_id, value) = row.map_err(db_error)?;
        values.entry(edition_id).or_default().push(value);
    }
    // Tracklists and video chapters are searchable as part of the collected edition,
    // even though they live in separate tables.
    let mut searchable_titles: HashMap<String, Vec<String>> = HashMap::new();
    for titles in [
        crate::content::search_titles(connection)?,
        crate::music_albums::search_titles(connection)?,
        crate::video::search_chapter_titles(connection)?,
    ] {
        for (edition_id, rows) in titles {
            searchable_titles
                .entry(edition_id)
                .or_default()
                .extend(rows);
        }
    }
    copies.retain(|copy| {
        let mut fields = vec![
            copy.edition.title.as_str(),
            copy.edition.creator.as_str(),
            copy.edition.edition_label.as_str(),
            copy.edition.barcode.as_str(),
            copy.edition.catalog_number.as_str(),
            copy.copy.seller.as_str(),
            copy.copy.storage_location.as_str(),
            copy.copy.notes.as_str(),
        ];
        fields.extend(
            copy.edition
                .media
                .iter()
                .map(|medium| medium.label.as_str()),
        );
        if let Some(source) = &copy.source {
            fields.push(source.provider_id.as_str());
            fields.push(source.external_id.as_str());
        }
        if let Some(titles) = searchable_titles.get(&copy.edition_id) {
            fields.extend(titles.iter().map(String::as_str));
        }
        let ids = values
            .get(&copy.edition_id)
            .map(Vec::as_slice)
            .unwrap_or(&[]);
        search::matches(needle, &fields, ids)
    });
    Ok(copies)
}
