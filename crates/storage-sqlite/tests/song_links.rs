use discatelier_application::LibraryService;
use discatelier_contracts::*;
use discatelier_storage::SqliteLibrary;
use rusqlite::Connection;

fn query() -> LibraryQuery {
    LibraryQuery {
        category_id: "music".into(),
        ..Default::default()
    }
}
fn request() -> CreateCopy {
    serde_json::from_value(serde_json::json!({"requestId":uuid::Uuid::new_v4().to_string(),"edition":{"categoryId":"music","title":"Collection","creator":"Artist","editionLabel":"Physical","barcode":"","catalogNumber":"","media":[{"carrierId":"cd","label":"CD"}]},"existingEditionId":null,"copy":{"status":"owned","acquiredAt":"","amountMinor":1200,"currency":"CNY","seller":"Keep seller","purchaseUrl":"","storageLocation":"Shelf","notes":"Keep notes"}})).unwrap()
}
fn link(id: u64) -> SongLink {
    serde_json::from_value(serde_json::json!({"position":"1","title":"Physical song","song":{"id":id,"title":"External song","artists":["Artist"],"disc":"1","number":1,"durationMs":180000}})).unwrap()
}
fn album() -> MusicSupplement {
    serde_json::from_value(serde_json::json!({"albumId":100,"title":"Other album","artists":[],"description":"Keep introduction","company":"","publishedAt":0,"tracks":[{"id":77,"title":"Album song","artists":[],"disc":"1","number":1,"durationMs":180000}],"links":[]})).unwrap()
}
fn setup() -> (
    std::path::PathBuf,
    LibraryService<SqliteLibrary>,
    LibraryCopy,
) {
    let dir = tempfile::Builder::new()
        .prefix("discatelier-song-links-")
        .tempdir()
        .unwrap()
        .keep();
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    service.create(request()).unwrap();
    let item = service.list(query()).unwrap().copies.remove(0);
    let content = serde_json::json!({"genres":[],"styles":[],"tracks":[{"position":"1","title":"Physical song","duration":"3:00","type_":"track"}]});
    Connection::open(dir.join("library.sqlite3"))
        .unwrap()
        .execute(
            "INSERT INTO edition_content VALUES(?1,?2)",
            rusqlite::params![item.edition_id, content.to_string()],
        )
        .unwrap();
    (dir, service, item)
}

#[test]
fn standalone_links_survive_reopen_album_replacement_and_restore_without_changing_collection() {
    let (dir, mut service, before) = setup();
    let linked = link(42);
    service
        .save_song_link(&before.edition_id, 1, "1", "Physical song", Some(&linked))
        .unwrap();
    assert!(service.supplement(&before.edition_id).unwrap().is_none());
    assert!(service
        .save_song_link(&before.edition_id, 1, "1", "Physical song", Some(&link(43)))
        .is_err());
    assert!(service
        .save_song_link(&before.edition_id, 2, "1", "Changed", None)
        .is_err());
    service
        .save_supplement(&before.edition_id, 2, &album())
        .unwrap();
    let mut replacement = album();
    replacement.album_id = 101;
    service
        .save_supplement(&before.edition_id, 3, &replacement)
        .unwrap();
    assert_eq!(
        service.song_links(&before.edition_id).unwrap()[0].song.id,
        42
    );
    let backup = service.backup().unwrap();
    service
        .save_song_link(&before.edition_id, 4, "1", "Physical song", None)
        .unwrap();
    assert!(service.song_links(&before.edition_id).unwrap().is_empty());
    let preview = service.prepare_restore(backup).unwrap();
    service.restore(preview.token).unwrap();
    drop(service);
    let service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    assert_eq!(
        service.song_links(&before.edition_id).unwrap()[0].song.id,
        42
    );
    let after = service.list(query()).unwrap().copies.remove(0);
    assert_eq!(
        serde_json::to_value(before.edition).unwrap(),
        serde_json::to_value(after.edition).unwrap()
    );
    assert_eq!(
        serde_json::to_value(before.copy).unwrap(),
        serde_json::to_value(after.copy).unwrap()
    );
}

#[test]
fn failed_link_write_rolls_back_revision_and_backup_rejects_inconsistent_link() {
    let (dir, mut service, item) = setup();
    let conn = Connection::open(dir.join("library.sqlite3")).unwrap();
    conn.execute_batch("CREATE TRIGGER reject_link BEFORE INSERT ON edition_song_links BEGIN SELECT RAISE(ABORT,'test failure'); END;").unwrap();
    assert!(service
        .save_song_link(&item.edition_id, 1, "1", "Physical song", Some(&link(42)))
        .is_err());
    assert_eq!(service.list(query()).unwrap().copies[0].edition_revision, 1);
    conn.execute_batch("DROP TRIGGER reject_link;").unwrap();
    service
        .save_song_link(&item.edition_id, 1, "1", "Physical song", Some(&link(42)))
        .unwrap();
    conn.execute("UPDATE edition_song_links SET title='wrong'", [])
        .unwrap();
    let backup = service.backup().unwrap();
    assert!(service.prepare_restore(backup).is_err());
}

#[test]
fn migration_backs_up_schema_eight_and_preserves_legacy_links() {
    let (dir, mut service, item) = setup();
    let mut saved = album();
    saved.links.push(SupplementLink {
        position: "1".into(),
        title: "Physical song".into(),
        song_id: 77,
    });
    service
        .save_supplement(&item.edition_id, 1, &saved)
        .unwrap();
    drop(service);
    let conn = Connection::open(dir.join("library.sqlite3")).unwrap();
    conn.execute_batch("DROP TABLE collection_order; DROP TABLE video_edition_parts; DROP TABLE video_edition_details; DROP TABLE video_work_metadata; DROP TRIGGER music_album_import_insert; DROP TRIGGER music_album_import_update; DROP TABLE edition_disc_albums; DROP TABLE edition_music_albums; DROP TABLE edition_song_links; DELETE FROM schema_migrations WHERE version>=9; PRAGMA user_version=8;").unwrap();
    drop(conn);
    let conn = Connection::open(dir.join("library.sqlite3")).unwrap();
    conn.execute(
        "INSERT INTO edition_supplements VALUES(?1,?2)",
        rusqlite::params![item.edition_id, serde_json::to_string(&saved).unwrap()],
    )
    .unwrap();
    drop(conn);
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    let backups = service.backups().unwrap();
    assert_eq!(backups.len(), 1);
    let old = Connection::open(&backups[0].path).unwrap();
    assert_eq!(
        old.pragma_query_value::<i64, _>(None, "user_version", |r| r.get(0))
            .unwrap(),
        8
    );
    assert_eq!(service.song_links(&item.edition_id).unwrap()[0].song.id, 77);
    service
        .save_song_link(&item.edition_id, 2, "1", "Physical song", None)
        .unwrap();
    assert!(service.song_links(&item.edition_id).unwrap().is_empty());
    assert!(service
        .supplement(&item.edition_id)
        .unwrap()
        .unwrap()
        .links
        .is_empty());
}
