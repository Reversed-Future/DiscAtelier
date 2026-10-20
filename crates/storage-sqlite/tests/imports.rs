use discatelier_application::LibraryService;
use discatelier_contracts::*;
use discatelier_domain::*;
use discatelier_storage::SqliteLibrary;
use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};
use uuid::Uuid;

fn directory() -> std::path::PathBuf {
    tempfile::Builder::new()
        .prefix("discatelier-import-")
        .tempdir()
        .unwrap()
        .keep()
}
fn query(text: &str) -> LibraryQuery {
    LibraryQuery {
        category_id: "music".into(),
        status: None,
        query: text.into(),
    }
}
fn request() -> ImportCopy {
    ImportCopy {
        request: ImportCopyRequest {
            request_id: Uuid::new_v4().to_string(),
            token: Uuid::new_v4().to_string(),
            edition: EditionDraft {
                category_id: "music".into(),
                title: "Import test".into(),
                creator: "Artist".into(),
                edition_label: "JP 2020-00-00".into(),
                barcode: "000123".into(),
                catalog_number: "Ab-01".into(),
                media: vec![
                    MediumDraft {
                        carrier_id: "cd".into(),
                        label: "Disc 1".into(),
                    },
                    MediumDraft {
                        carrier_id: "bd".into(),
                        label: "Video".into(),
                    },
                ],
            },
            copy: CopyDraft {
                status: "owned".into(),
                acquired_at: "".into(),
                amount_minor: Some(1200),
                currency: "CNY".into(),
                seller: "Shop A".into(),
                purchase_url: "".into(),
                storage_location: "".into(),
                notes: "".into(),
            },
            model: None,
            model_token: None,
            cover: None,
            existing_edition_id: None,
            expected_revision: None,
        },
        source: EditionSource {
            provider_id: "discogs".into(),
            external_id: "249504".into(),
            fetched_at: "2026-10-20T00:00:00Z".into(),
        },
        identifiers: vec![
            ImportedIdentifier {
                namespace: "identifier".into(),
                kind: "Barcode".into(),
                value: "000123".into(),
                description: "".into(),
            },
            ImportedIdentifier {
                namespace: "identifier".into(),
                kind: "Barcode".into(),
                value: "0 00123".into(),
                description: "Text".into(),
            },
            ImportedIdentifier {
                namespace: "catalog".into(),
                kind: "Second label".into(),
                value: "bB-02".into(),
                description: "".into(),
            },
        ],
    }
}

#[test]
fn import_is_atomic_idempotent_and_reuses_only_the_same_release() {
    let dir = directory();
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    let first = request();
    let id = service.import_copy(first.clone()).unwrap();
    assert_eq!(service.import_copy(first.clone()).unwrap(), id);
    assert_eq!(service.list(query("0 00123")).unwrap().copies.len(), 1);
    assert_eq!(service.list(query("bB-02")).unwrap().copies.len(), 1);
    assert_eq!(service.list(query("BB-02")).unwrap().copies.len(), 0);
    let existing = service.source_copy("discogs", "249504").unwrap().unwrap();
    let mut duplicate = first.clone();
    duplicate.request.request_id = Uuid::new_v4().to_string();
    // A parallel new-version preview cannot silently turn into a second copy.
    assert_eq!(
        service.import_copy(duplicate.clone()).unwrap_err().code,
        "conflict"
    );
    duplicate.request.existing_edition_id = Some(existing.edition_id.clone());
    duplicate.request.expected_revision = Some(existing.edition_revision);
    duplicate.request.copy.amount_minor = Some(2300);
    duplicate.request.copy.seller = "Shop B".into();
    // Duplicate import must never overwrite locally edited edition fields.
    duplicate.request.edition.title = "Must not replace the shared title".into();
    service.import_copy(duplicate).unwrap();
    let copies = service.list(query("")).unwrap();
    assert_eq!(copies.copies.len(), 2);
    assert_eq!(copies.medium_count, 4);
    assert_eq!(copies.amounts["CNY"], "3500");
    assert!(copies
        .copies
        .iter()
        .all(|item| item.edition_id == existing.edition_id && item.edition.title == "Import test"));
    let mut different = request();
    different.source.external_id = "249505".into();
    service.import_copy(different).unwrap();
    let other = service.source_copy("discogs", "249505").unwrap().unwrap();
    assert_ne!(other.edition_id, existing.edition_id);
    drop(service);
    let service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    assert_eq!(service.list(query("")).unwrap().copies.len(), 3);
    assert_eq!(
        service
            .source_copy("discogs", "249504")
            .unwrap()
            .unwrap()
            .source
            .unwrap()
            .fetched_at,
        "2026-10-20T00:00:00Z"
    );
}

#[test]
fn invalid_import_rolls_back_and_shared_revision_conflicts_are_rejected() {
    let dir = directory();
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    let mut invalid = request();
    invalid.request.cover = Some("data:image/png;base64,AAAA".into());
    assert!(service.import_copy(invalid).is_err());
    assert!(service.source_copy("discogs", "249504").unwrap().is_none());
    assert!(service.list(query("")).unwrap().copies.is_empty());
    let mut invalid = request();
    invalid.request.edition.media[0].carrier_id.clear();
    assert!(service.import_copy(invalid).is_err());
    service.import_copy(request()).unwrap();
    let existing = service.source_copy("discogs", "249504").unwrap().unwrap();
    service
        .update_edition(UpdateEdition {
            request_id: Uuid::new_v4().to_string(),
            edition_id: existing.edition_id.clone(),
            expected_revision: existing.edition_revision,
            edition: existing.edition.clone(),
            model: Default::default(),
            cover: CoverChange::Keep,
        })
        .unwrap();
    let mut stale = request();
    stale.request.existing_edition_id = Some(existing.edition_id);
    stale.request.expected_revision = Some(existing.edition_revision);
    assert_eq!(service.import_copy(stale).unwrap_err().code, "conflict");
    assert_eq!(service.list(query("")).unwrap().copies.len(), 1);
}

#[test]
fn restore_preserves_source_identity_and_rejects_invalid_source_records() {
    let dir = directory();
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    service.import_copy(request()).unwrap();
    let backup = service.backup().unwrap();
    let preview = service.prepare_restore(backup.clone()).unwrap();
    service.restore(preview.token).unwrap();
    assert_eq!(service.list(query("bB-02")).unwrap().copies.len(), 1);
    assert!(service.source_copy("discogs", "249504").unwrap().is_some());
    let conn = Connection::open(&backup).unwrap();
    conn.execute(
        "UPDATE edition_sources SET fetched_at=?1",
        params!["broken"],
    )
    .unwrap();
    assert!(service.prepare_restore(backup).is_err());
    assert_eq!(service.list(query("")).unwrap().copies.len(), 1);
}

#[test]
fn schema_two_is_backed_up_before_source_migration() {
    let dir = directory();
    let conn = Connection::open(dir.join("library.sqlite3")).unwrap();
    conn.execute_batch(
        "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, checksum TEXT NOT NULL);",
    )
    .unwrap();
    for (index, sql) in [
        include_str!("../migrations/001_library.sql"),
        include_str!("../migrations/002_edition_assets.sql"),
    ]
    .iter()
    .enumerate()
    {
        conn.execute_batch(sql).unwrap();
        conn.execute(
            "INSERT INTO schema_migrations VALUES (?1,?2)",
            params![
                (index + 1) as i64,
                format!("{:x}", Sha256::digest(sql.as_bytes()))
            ],
        )
        .unwrap();
    }
    conn.pragma_update(None, "user_version", 2).unwrap();
    drop(conn);
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    service.import_copy(request()).unwrap();
    let backups = service.backups().unwrap();
    assert_eq!(backups.len(), 1);
    let backup = Connection::open(&backups[0].path).unwrap();
    assert_eq!(
        backup
            .pragma_query_value::<i64, _>(None, "user_version", |row| row.get(0))
            .unwrap(),
        2
    );
    assert_eq!(service.list(query("")).unwrap().copies.len(), 1);
    let preview = service.prepare_restore(backups[0].path.clone()).unwrap();
    assert_eq!(preview.copies, 0);
    service.restore(preview.token).unwrap();
    service.import_copy(request()).unwrap();
    assert_eq!(service.list(query("")).unwrap().copies.len(), 1);
}
