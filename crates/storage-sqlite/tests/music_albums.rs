use discatelier_application::LibraryService;
use discatelier_contracts::*;
use discatelier_storage::SqliteLibrary;
use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};

fn query() -> LibraryQuery {
    LibraryQuery {
        category_id: "music".into(),
        ..Default::default()
    }
}
fn request() -> CreateCopy {
    serde_json::from_value(serde_json::json!({"requestId":uuid::Uuid::new_v4().to_string(),"edition":{"categoryId":"music","title":"Physical set","creator":"Artist","editionLabel":"Physical","barcode":"","catalogNumber":"","media":[{"carrierId":"cd","label":"PM"},{"carrierId":"cd","label":"AM"}]},"existingEditionId":null,"copy":{"status":"owned","acquiredAt":"","amountMinor":12300,"currency":"JPY","seller":"Keep seller","purchaseUrl":"","storageLocation":"Shelf","notes":"Keep notes"}})).unwrap()
}
fn album(id: u64, title: &str) -> MusicSupplement {
    serde_json::from_value(serde_json::json!({"albumId":id,"title":title,"artists":["Artist"],"description":format!("{title} introduction"),"company":"Label","publishedAt":1,"tracks":[{"id":id+1,"title":"Song","artists":["Artist"],"disc":"1","number":1,"durationMs":180000}],"links":[]})).unwrap()
}
fn setup() -> (
    std::path::PathBuf,
    LibraryService<SqliteLibrary>,
    LibraryCopy,
) {
    let dir = tempfile::Builder::new()
        .prefix("discatelier-multi-albums-")
        .tempdir()
        .unwrap()
        .keep();
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    service.create(request()).unwrap();
    let item = service.list(query()).unwrap().copies.remove(0);
    let raw = serde_json::json!({"genres":[],"styles":[],"tracks":[{"position":"1-1","title":"Song","duration":"3:00","type_":"track"},{"position":"2-1","title":"Song","duration":"3:00","type_":"track"}]});
    Connection::open(dir.join("library.sqlite3"))
        .unwrap()
        .execute(
            "INSERT INTO edition_content VALUES(?1,?2)",
            params![item.edition_id, raw.to_string()],
        )
        .unwrap();
    (dir, service, item)
}

#[test]
fn multiple_albums_disc_bindings_manual_links_and_purchase_survive_restore() {
    let (dir, mut service, before) = setup();
    let id = &before.edition_id;
    service.save_supplement(id, 1, &album(100, "PM")).unwrap();
    service.save_supplement(id, 2, &album(200, "AM")).unwrap();
    service.save_disc_album(id, 3, "1", Some(100)).unwrap();
    service.save_disc_album(id, 4, "2", Some(200)).unwrap();
    let manual = SongLink {
        position: "2-1".into(),
        title: "Song".into(),
        song: album(900, "Independent").tracks.remove(0),
    };
    service
        .save_song_link(id, 5, "2-1", "Song", Some(&manual))
        .unwrap();
    service.reorder_music_albums(id, 6, &[200, 100]).unwrap();
    assert_eq!(service.disc_albums(id).unwrap().len(), 2);
    let backup = service.backup().unwrap();
    service.remove_music_album(id, 7, 200).unwrap();
    assert_eq!(service.disc_albums(id).unwrap().len(), 1);
    assert_eq!(service.song_links(id).unwrap()[0].song.id, 901);
    let preview = service.prepare_restore(backup).unwrap();
    service.restore(preview.token).unwrap();
    drop(service);
    let service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    let albums = service.music_albums(id).unwrap();
    assert_eq!(
        albums.iter().map(|a| a.album.album_id).collect::<Vec<_>>(),
        vec![200, 100]
    );
    assert_eq!(albums[0].album.description, "AM introduction");
    assert_eq!(albums[1].album.description, "PM introduction");
    assert_eq!(
        service
            .disc_albums(id)
            .unwrap()
            .iter()
            .map(|a| a.album_id)
            .collect::<Vec<_>>(),
        vec![100, 200]
    );
    assert_eq!(service.song_links(id).unwrap()[0].song.id, 901);
    let after = service.list(query()).unwrap();
    assert_eq!(after.copies.len(), 1);
    assert_eq!(after.medium_count, 2);
    assert_eq!(
        serde_json::to_value(&before.edition).unwrap(),
        serde_json::to_value(&after.copies[0].edition).unwrap()
    );
    assert_eq!(
        serde_json::to_value(&before.copy).unwrap(),
        serde_json::to_value(&after.copies[0].copy).unwrap()
    );
}

#[test]
fn duplicate_refresh_and_stale_requests_cannot_drop_other_albums_or_links() {
    let (dir, mut service, item) = setup();
    let id = &item.edition_id;
    service.save_supplement(id, 1, &album(100, "PM")).unwrap();
    service.save_supplement(id, 2, &album(200, "AM")).unwrap();
    assert!(service
        .save_supplement(id, 1, &album(300, "Wrong"))
        .is_err());
    assert!(service.reorder_music_albums(id, 3, &[100, 100]).is_err());
    assert!(service.reorder_music_albums(id, 3, &[100]).is_err());
    assert!(service.save_disc_album(id, 3, "3", Some(100)).is_err());
    assert!(service.save_disc_album(id, 3, "1", Some(999)).is_err());
    service
        .save_supplement(id, 3, &album(100, "Updated PM"))
        .unwrap();
    assert_eq!(service.music_albums(id).unwrap().len(), 2);
    let raw = Connection::open(dir.join("library.sqlite3")).unwrap();
    raw.execute_batch("CREATE TRIGGER reject_test_album BEFORE INSERT ON edition_music_albums BEGIN SELECT RAISE(ABORT,'test'); END;").unwrap();
    assert!(service
        .save_supplement(id, 4, &album(300, "Failure"))
        .is_err());
    assert_eq!(service.list(query()).unwrap().copies[0].edition_revision, 4);
    assert_eq!(service.music_albums(id).unwrap()[1].album.title, "AM");
}

#[test]
fn schema_nine_migration_preserves_original_bytes_and_fallback_manual_song_identity() {
    let dir = tempfile::Builder::new()
        .prefix("discatelier-multi-migration-")
        .tempdir()
        .unwrap()
        .keep();
    // Build the exact released schema chain, without editing a live user database.
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
        include_str!("../migrations/007_supplements_assistant.sql"),
        include_str!("../migrations/008_catalog_details.sql"),
        include_str!("../migrations/009_song_links.sql"),
    ];
    for (i, sql) in migrations.iter().enumerate() {
        conn.execute_batch(sql).unwrap();
        conn.execute(
            "INSERT INTO schema_migrations VALUES(?1,?2)",
            params![
                i as i64 + 1,
                format!("{:x}", Sha256::digest(sql.as_bytes()))
            ],
        )
        .unwrap();
    }
    conn.pragma_update(None, "user_version", 9).unwrap();
    drop(conn);
    // Create a valid physical record using the current service, then reconstruct
    // just the old association schema to exercise an authentic v9 upgrade.
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    service.create_music(request(), album(100, "PM")).unwrap();
    let item = service.list(query()).unwrap().copies.remove(0);
    let id = &item.edition_id;
    let manual = SongLink {
        position: "1-1".into(),
        title: "Song".into(),
        song: album(900, "Override").tracks.remove(0),
    };
    service
        .save_song_link(id, 1, "1-1", "Song", Some(&manual))
        .unwrap();
    drop(service);
    let conn = Connection::open(dir.join("library.sqlite3")).unwrap();
    let old: String = conn
        .query_row(
            "SELECT payload FROM edition_supplements WHERE edition_id=?1",
            [id],
            |r| r.get(0),
        )
        .unwrap();
    conn.execute_batch("DROP TABLE video_edition_details; DROP TABLE video_work_metadata; DROP TRIGGER music_album_import_insert; DROP TRIGGER music_album_import_update; DROP TABLE edition_disc_albums; DROP TABLE edition_music_albums; DELETE FROM schema_migrations WHERE version>=10; PRAGMA user_version=9;").unwrap();
    drop(conn);
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    let conn = Connection::open(dir.join("library.sqlite3")).unwrap();
    let migrated: String = conn
        .query_row(
            "SELECT payload FROM edition_music_albums WHERE edition_id=?1",
            [id],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(old, migrated);
    assert!(service.music_albums(id).unwrap()[0].legacy_positions);
    assert_eq!(service.song_links(id).unwrap()[0].song.id, 901);
    service.save_supplement(id, 2, &album(200, "AM")).unwrap();
    service.reorder_music_albums(id, 3, &[200, 100]).unwrap();
    assert_eq!(service.song_links(id).unwrap()[0].song.id, 901);
    let backup = service
        .backups()
        .unwrap()
        .into_iter()
        .find(|b| b.name.starts_with("before-schema-9-"))
        .unwrap();
    assert_eq!(
        Connection::open(backup.path)
            .unwrap()
            .pragma_query_value::<i64, _>(None, "user_version", |r| r.get(0))
            .unwrap(),
        9
    );
}

#[test]
fn restoration_rejects_album_id_payload_mismatch() {
    let (dir, mut service, item) = setup();
    service
        .save_supplement(&item.edition_id, 1, &album(100, "PM"))
        .unwrap();
    Connection::open(dir.join("library.sqlite3"))
        .unwrap()
        .execute("UPDATE edition_music_albums SET album_id=999", [])
        .unwrap();
    let backup = service.backup().unwrap();
    assert!(service.prepare_restore(backup).is_err());
}
