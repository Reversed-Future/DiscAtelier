use crate::db_error;
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
         WHERE ((?4 IS NULL AND w.category_id=?1) OR (?4 IS NOT NULL AND e.id=?4)) AND (?2 IS NULL OR c.status=?2)
           AND (?3='' OR instr(w.title,?3)>0 OR instr(w.creator,?3)>0 OR instr(e.barcode,?3)>0
             OR instr(e.catalog_number,?3)>0 OR instr(e.edition_label,?3)>0
             OR instr(p.seller,?3)>0 OR instr(c.notes,?3)>0 OR instr(c.storage_location,?3)>0
             OR EXISTS(SELECT 1 FROM imported_identifiers i WHERE i.edition_id=e.id AND instr(i.value,?3)>0))
         ORDER BY COALESCE(o.position,-1), c.added_at DESC, c.id",
        )
        .map_err(db_error)?;
    let rows = statement
        .query_map(
            params![query.category_id, query.status, query.query, edition_id],
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
    rows.map(|row| row.map_err(db_error)).collect()
}
