use discatelier_storage::{backup_for_update, SqliteLibrary};
use rusqlite::Connection;
use std::path::PathBuf;

fn directory() -> PathBuf {
    tempfile::Builder::new()
        .prefix("discatelier-update-backup-")
        .tempdir()
        .unwrap()
        .keep()
}

#[test]
fn newer_schema_snapshot_includes_wal_and_never_changes_source() {
    let dir = directory();
    let database = dir.join("library.sqlite3");
    let source = Connection::open(&database).unwrap();
    source.pragma_update(None, "journal_mode", "WAL").unwrap();
    source.pragma_update(None, "wal_autocheckpoint", 0).unwrap();
    source.pragma_update(None, "user_version", 99).unwrap();
    source.execute_batch("CREATE TABLE future_collection(id INTEGER PRIMARY KEY, data BLOB); INSERT INTO future_collection VALUES(1, x'000102feff');").unwrap();
    assert_eq!(SqliteLibrary::open(&dir).err().unwrap().code, "schema");
    let before = std::fs::read(&database).unwrap();
    let wal_before = std::fs::read(dir.join("library.sqlite3-wal")).unwrap();
    let saved = backup_for_update(&dir).unwrap().unwrap();
    assert_eq!(std::fs::read(&database).unwrap(), before);
    assert_eq!(
        std::fs::read(dir.join("library.sqlite3-wal")).unwrap(),
        wal_before
    );
    let snapshot = Connection::open(saved).unwrap();
    assert_eq!(
        snapshot
            .pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))
            .unwrap(),
        99
    );
    assert_eq!(
        snapshot
            .query_row("SELECT data FROM future_collection WHERE id=1", [], |r| r
                .get::<_, Vec<
                u8,
            >>(
                0
            ))
            .unwrap(),
        [0, 1, 2, 254, 255]
    );
    drop(snapshot);
    let second = backup_for_update(&dir).unwrap().unwrap();
    assert!(std::path::Path::new(&second).exists());
    assert_eq!(std::fs::read_dir(dir.join("backups")).unwrap().count(), 2);
}

#[test]
fn unreadable_or_corrupt_database_and_unwritable_backup_destination_stop_update() {
    let dir = directory();
    let path = dir.join("library.sqlite3");
    std::fs::write(&path, b"not a sqlite database").unwrap();
    assert!(backup_for_update(&dir).is_err());
    assert_eq!(std::fs::read(&path).unwrap(), b"not a sqlite database");
    let dir = directory();
    let source = Connection::open(dir.join("library.sqlite3")).unwrap();
    source
        .execute_batch("CREATE TABLE items(id INTEGER);")
        .unwrap();
    std::fs::write(dir.join("backups"), b"existing file must not be replaced").unwrap();
    assert!(backup_for_update(&dir).is_err());
    assert_eq!(
        std::fs::read(dir.join("backups")).unwrap(),
        b"existing file must not be replaced"
    );
}

#[test]
fn missing_database_is_not_created_by_update_backup() {
    let dir = directory();
    assert!(backup_for_update(&dir).unwrap().is_none());
    assert!(!dir.join("library.sqlite3").exists());
    assert!(!dir.join("backups").exists());
}
