use discatelier_application::LibraryService;
use discatelier_contracts::*;
use discatelier_storage::SqliteLibrary;
use rusqlite::Connection;

fn directory() -> std::path::PathBuf {
    tempfile::Builder::new()
        .prefix("discatelier-create-music-")
        .tempdir()
        .unwrap()
        .keep()
}
fn request() -> CreateCopy {
    serde_json::from_value(serde_json::json!({
        "requestId":uuid::Uuid::new_v4().to_string(),
        "edition":{"categoryId":"music","title":"Private edition","creator":"Artist","editionLabel":"Handmade","barcode":"","catalogNumber":"LOCAL-1","media":[{"carrierId":"cd","label":"Physical disc"}]},
        "existingEditionId":null,
        "copy":{"status":"owned","acquiredAt":"","amountMinor":2000,"currency":"CNY","seller":"Artist","purchaseUrl":"","storageLocation":"Shelf","notes":"Keep purchase"}
    })).unwrap()
}
fn album() -> MusicSupplement {
    serde_json::from_value(serde_json::json!({"albumId":42,"title":"Digital album","artists":["Artist"],"description":"Album introduction","company":"Digital label","publishedAt":1,
        "tracks":[{"id":99,"title":"Song","artists":["Artist"],"disc":"1","number":1,"durationMs":180000}]})).unwrap()
}
fn query() -> LibraryQuery {
    LibraryQuery {
        category_id: "music".into(),
        status: None,
        query: String::new(),
    }
}

#[test]
fn manual_music_import_is_atomic_idempotent_and_survives_backup_restore() {
    let dir = directory();
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    let input = request();
    let id = service.create_music(input.clone(), album()).unwrap();
    assert_eq!(service.create_music(input.clone(), album()).unwrap(), id);
    let mut changed = album();
    changed.album_id = 43;
    assert_eq!(
        service.create_music(input, changed).unwrap_err().code,
        "conflict"
    );
    let snapshot = service.list(query()).unwrap();
    assert_eq!(snapshot.copies.len(), 1);
    let item = &snapshot.copies[0];
    assert!(item.source.is_none()); // No invented Discogs source.
    assert_eq!(item.edition.catalog_number, "LOCAL-1");
    assert_eq!(item.copy.amount_minor, Some(2000));
    assert_eq!(
        service
            .supplement(&item.edition_id)
            .unwrap()
            .unwrap()
            .tracks[0]
            .id,
        99
    );
    let backup = service.backup().unwrap();
    let preview = service.prepare_restore(backup).unwrap();
    service.restore(preview.token).unwrap();
    drop(service);
    let service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    assert_eq!(
        service
            .supplement(&item.edition_id)
            .unwrap()
            .unwrap()
            .description,
        "Album introduction"
    );
}

#[test]
fn supplement_write_failure_rolls_back_the_entire_manual_import() {
    let dir = directory();
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    let raw = Connection::open(dir.join("library.sqlite3")).unwrap();
    raw.execute_batch("CREATE TRIGGER reject_music BEFORE INSERT ON edition_supplements BEGIN SELECT RAISE(ABORT,'test failure'); END;").unwrap();
    assert!(service.create_music(request(), album()).is_err());
    assert!(service.list(query()).unwrap().copies.is_empty());
    for table in ["works", "editions", "media", "copies", "write_receipts"] {
        assert_eq!(
            raw.query_row(&format!("SELECT count(*) FROM {table}"), [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
    }
}

#[test]
fn manual_import_rejects_invalid_supplement_and_existing_edition() {
    let dir = directory();
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    let mut invalid = album();
    invalid.album_id = 0;
    assert!(service.create_music(request(), invalid).is_err());
    let input = request();
    service.create(input).unwrap();
    let item = service.list(query()).unwrap().copies.remove(0);
    let mut input = request();
    input.edition = None;
    input.existing_edition_id = Some(item.edition_id);
    assert!(service.create_music(input, album()).is_err());
    assert_eq!(service.list(query()).unwrap().copies.len(), 1);
}
