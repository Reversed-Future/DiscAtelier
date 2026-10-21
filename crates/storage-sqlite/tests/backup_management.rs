use discatelier_storage::backup_management::{delete_one, inventory};
use std::{fs, path::PathBuf};

fn directory() -> PathBuf {
    let path = tempfile::Builder::new()
        .prefix("discatelier-backup-management-")
        .tempdir()
        .unwrap()
        .keep();
    fs::create_dir(path.join("backups")).unwrap();
    path
}

#[test]
fn inventory_counts_complete_partial_and_auxiliary_files_without_reading_database() {
    let dir = directory();
    fs::write(dir.join("library.sqlite3"), b"unreadable future database").unwrap();
    fs::write(dir.join("backups/library-test.sqlite3"), [1; 12]).unwrap();
    fs::write(dir.join("backups/before-update-test.partial"), [2; 7]).unwrap();
    fs::write(dir.join("backups/notes.txt"), [3; 5]).unwrap();
    fs::create_dir(dir.join("backups/nested.sqlite3")).unwrap();
    let result = inventory(&dir).unwrap();
    assert_eq!(result.total_bytes, 24);
    assert_eq!(result.other_bytes, 5);
    assert_eq!(result.entries.len(), 2);
    assert_eq!(result.entries.iter().filter(|e| e.incomplete).count(), 1);
}

#[test]
fn deletes_only_selected_file_and_preserves_live_collection_and_other_backups() {
    let dir = directory();
    fs::write(dir.join("library.sqlite3"), b"collection").unwrap();
    fs::write(dir.join("backups/one.sqlite3"), b"one").unwrap();
    fs::write(dir.join("backups/two.sqlite3"), b"two").unwrap();
    let entry = inventory(&dir)
        .unwrap()
        .entries
        .into_iter()
        .find(|e| e.name == "one.sqlite3")
        .unwrap();
    delete_one(&dir, &entry.name, &entry.stamp).unwrap();
    assert!(!dir.join("backups/one.sqlite3").exists());
    assert_eq!(fs::read(dir.join("backups/two.sqlite3")).unwrap(), b"two");
    assert_eq!(
        fs::read(dir.join("library.sqlite3")).unwrap(),
        b"collection"
    );
    assert!(delete_one(&dir, &entry.name, &entry.stamp).is_err());
}

#[test]
fn rejects_traversal_absolute_paths_streams_and_non_backup_files() {
    let dir = directory();
    fs::write(dir.join("library.sqlite3"), b"collection").unwrap();
    fs::write(dir.join("backups/notes.txt"), b"notes").unwrap();
    for name in [
        "../library.sqlite3",
        "..\\library.sqlite3",
        "C:\\library.sqlite3",
        "/library.sqlite3",
        "x:one.sqlite3",
        "notes.txt",
        "one.sqlite3.",
        "one.sqlite3 ",
    ] {
        assert!(delete_one(&dir, name, "").is_err(), "{name}");
    }
    assert_eq!(
        fs::read(dir.join("library.sqlite3")).unwrap(),
        b"collection"
    );
    assert_eq!(fs::read(dir.join("backups/notes.txt")).unwrap(), b"notes");
}

#[test]
fn rejects_stale_selection_and_open_sqlite_auxiliary_files() {
    let dir = directory();
    fs::write(dir.join("backups/one.sqlite3"), b"one").unwrap();
    let entry = inventory(&dir).unwrap().entries.remove(0);
    fs::write(dir.join("backups/one.sqlite3"), b"modified").unwrap();
    assert_eq!(
        delete_one(&dir, &entry.name, &entry.stamp)
            .unwrap_err()
            .code,
        "backup_changed"
    );
    let entry = inventory(&dir).unwrap().entries.remove(0);
    fs::write(dir.join("backups/one.sqlite3-wal"), b"active").unwrap();
    assert_eq!(
        delete_one(&dir, &entry.name, &entry.stamp)
            .unwrap_err()
            .code,
        "backup_busy"
    );
    assert_eq!(
        fs::read(dir.join("backups/one.sqlite3")).unwrap(),
        b"modified"
    );
}

#[test]
fn unfinished_backup_can_be_explicitly_deleted_but_not_its_directory() {
    let dir = directory();
    fs::write(dir.join("backups/unfinished.partial"), b"incomplete").unwrap();
    let entry = inventory(&dir).unwrap().entries.remove(0);
    delete_one(&dir, &entry.name, &entry.stamp).unwrap();
    assert_eq!(inventory(&dir).unwrap().total_bytes, 0);
    assert!(dir.join("backups").is_dir());
}

#[test]
fn missing_backup_folder_is_empty_and_never_created_by_management() {
    let dir = tempfile::Builder::new()
        .prefix("discatelier-no-backups-")
        .tempdir()
        .unwrap()
        .keep();
    assert!(inventory(&dir).unwrap().entries.is_empty());
    assert!(delete_one(&dir, "one.sqlite3", "").is_err());
    assert!(!dir.join("backups").exists());
}

#[cfg(windows)]
#[test]
fn file_open_without_delete_sharing_is_not_forced_closed_or_deleted() {
    use std::os::windows::fs::OpenOptionsExt;
    let dir = directory();
    let path = dir.join("backups/one.partial");
    fs::write(&path, b"in use").unwrap();
    let _handle = fs::OpenOptions::new()
        .read(true)
        .share_mode(1)
        .open(&path)
        .unwrap();
    let entry = inventory(&dir).unwrap().entries.remove(0);
    assert_eq!(
        delete_one(&dir, &entry.name, &entry.stamp)
            .unwrap_err()
            .code,
        "backup_delete"
    );
    assert_eq!(fs::read(&path).unwrap(), b"in use");
}
