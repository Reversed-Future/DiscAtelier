use discatelier_application::LibraryService;
use discatelier_contracts::*;
use discatelier_storage::SqliteLibrary;
use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};

fn directory() -> std::path::PathBuf {
    tempfile::Builder::new()
        .prefix("discatelier-extensions-")
        .tempdir()
        .unwrap()
        .keep()
}
fn query() -> LibraryQuery {
    LibraryQuery {
        category_id: "music".into(),
        query: String::new(),
        status: None,
    }
}
#[test]
fn supplements_preserve_editions_reject_conflicts_and_survive_restore() {
    let dir = directory();
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    let request: CreateCopy=serde_json::from_value(serde_json::json!({"requestId":uuid::Uuid::new_v4().to_string(),"edition":{"categoryId":"music","title":"Physical edition","creator":"Artist","editionLabel":"First press","barcode":"123","catalogNumber":"TEST-1","media":[{"carrierId":"cd","label":"Disc 1"}]},"existingEditionId":null,"copy":{"status":"owned","acquiredAt":"","amountMinor":12300,"currency":"JPY","seller":"Private shop","purchaseUrl":"","storageLocation":"Shelf","notes":"Keep this"}})).unwrap();
    service.create(request).unwrap();
    let before = service.list(query()).unwrap().copies.remove(0);
    let value = MusicSupplement {
        album_id: 42,
        title: "Digital album".into(),
        artists: vec!["Artist".into()],
        description: "Info".into(),
        company: "Company".into(),
        published_at: 1,
        tracks: vec![SupplementTrack {
            id: 99,
            title: "Song".into(),
            artists: vec![],
            disc: "1".into(),
            number: 1,
            duration_ms: 180000,
        }],
        links: vec![SupplementLink {
            position: "CD-1".into(),
            title: "Discogs Song".into(),
            song_id: 99,
        }],
    };
    service
        .save_supplement(&before.edition_id, before.edition_revision, &value)
        .unwrap();
    assert!(service
        .save_supplement(&before.edition_id, before.edition_revision, &value)
        .is_err());
    let id = uuid::Uuid::new_v4().to_string();
    let session = serde_json::json!({"id":id,"messages":[]});
    service.assistant_save(&id, &session.to_string()).unwrap();
    let backup = service.backup().unwrap();
    drop(service);
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    let after = service.list(query()).unwrap().copies.remove(0);
    assert_eq!(
        serde_json::to_value(&before.edition).unwrap(),
        serde_json::to_value(&after.edition).unwrap()
    );
    assert_eq!(
        serde_json::to_value(&before.copy).unwrap(),
        serde_json::to_value(&after.copy).unwrap()
    );
    assert_eq!(after.edition_revision, before.edition_revision + 1);
    let preview = service.prepare_restore(backup).unwrap();
    service.restore(preview.token).unwrap();
    assert_eq!(
        service
            .supplement(&before.edition_id)
            .unwrap()
            .unwrap()
            .links[0]
            .song_id,
        99
    );
    assert_eq!(
        service
            .supplement(&before.edition_id)
            .unwrap()
            .unwrap()
            .title,
        "Digital album"
    );
    assert_eq!(
        service.assistant_load().unwrap().unwrap(),
        session.to_string()
    );
}
#[test]
fn schema_seven_gets_a_backup_before_expanded_json_contracts() {
    let dir = directory();
    drop(SqliteLibrary::open(&dir).unwrap());
    let conn = Connection::open(dir.join("library.sqlite3")).unwrap();
    conn.execute_batch("DROP TABLE collection_order; DROP TABLE video_edition_parts; DROP TABLE video_edition_details; DROP TABLE video_work_metadata; DROP TRIGGER music_album_import_insert; DROP TRIGGER music_album_import_update; DROP TABLE edition_disc_albums; DROP TABLE edition_music_albums; DROP TABLE edition_song_links;").unwrap();
    conn.execute("DELETE FROM schema_migrations WHERE version>=8", [])
        .unwrap();
    conn.pragma_update(None, "user_version", 7).unwrap();
    drop(conn);
    let service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    let backups = service.backups().unwrap();
    assert_eq!(backups.len(), 1);
    let old = Connection::open(&backups[0].path).unwrap();
    assert_eq!(
        old.pragma_query_value::<i64, _>(None, "user_version", |r| r.get(0))
            .unwrap(),
        7
    );
    let new = Connection::open(dir.join("library.sqlite3")).unwrap();
    assert_eq!(
        new.pragma_query_value::<i64, _>(None, "user_version", |r| r.get(0))
            .unwrap(),
        14
    );
}
#[test]
fn schema_six_is_backed_up_before_extensions_are_added() {
    let dir = directory();
    let conn = Connection::open(dir.join("library.sqlite3")).unwrap();
    conn.execute_batch(
        "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, checksum TEXT NOT NULL);",
    )
    .unwrap();
    let migrations = [
        include_str!("../migrations/001_library.sql"),
        include_str!("../migrations/002_edition_assets.sql"),
        include_str!("../migrations/003_sources.sql"),
        include_str!("../migrations/004_models.sql"),
        include_str!("../migrations/005_playback.sql"),
        include_str!("../migrations/006_edition_content.sql"),
    ];
    for (i, sql) in migrations.iter().enumerate() {
        conn.execute_batch(sql).unwrap();
        conn.execute(
            "INSERT INTO schema_migrations VALUES(?1,?2)",
            params![
                (i + 1) as i64,
                format!("{:x}", Sha256::digest(sql.as_bytes()))
            ],
        )
        .unwrap();
    }
    conn.pragma_update(None, "user_version", 6).unwrap();
    drop(conn);
    let service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    let backups = service.backups().unwrap();
    assert_eq!(backups.len(), 1);
    let old = Connection::open(&backups[0].path).unwrap();
    assert_eq!(
        old.pragma_query_value::<i64, _>(None, "user_version", |r| r.get(0))
            .unwrap(),
        6
    );
    let new = Connection::open(dir.join("library.sqlite3")).unwrap();
    assert_eq!(
        new.pragma_query_value::<i64, _>(None, "user_version", |r| r.get(0))
            .unwrap(),
        14
    );
}
