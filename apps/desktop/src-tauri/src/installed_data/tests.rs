use super::*;
use discatelier_application::LibraryService;
use discatelier_contracts::{CreateCopy, LibraryQuery};
use discatelier_storage::SqliteLibrary;
use std::os::windows::fs::OpenOptionsExt;
use tauri::Manager;

fn fixture() -> PathBuf {
    tempfile::Builder::new()
        .prefix("data-directory-")
        .tempdir()
        .unwrap()
        .keep()
}

fn startup(root: &Path) -> io::Result<PathBuf> {
    select(root, &std::env::current_exe()?)
}

#[test]
fn upgrade_moves_the_whole_root_and_reopens_the_collection_and_update_backup() {
    let root = fixture();
    let original = root.join(ORIGINAL);
    let preferred = root.join(PREFERRED);
    let mut library = LibraryService::new(SqliteLibrary::open(&original).unwrap());
    let request: CreateCopy = serde_json::from_value(serde_json::json!({
        "requestId":uuid::Uuid::new_v4().to_string(),
        "edition":{"categoryId":"music","title":"Migration test","creator":"Artist","editionLabel":"CD","barcode":"","catalogNumber":"","media":[{"carrierId":"cd","label":"CD"}]},
        "existingEditionId":null,
        "copy":{"status":"owned","acquiredAt":"","amountMinor":12345,"currency":"JPY","seller":"","purchaseUrl":"","storageLocation":"","notes":""}
    })).unwrap();
    let copy_id = library.create(request).unwrap();
    drop(library);
    let backup = discatelier_storage::backup_for_update(&original)
        .unwrap()
        .unwrap();
    let bytes = fs::read(&backup).unwrap();
    fs::create_dir(original.join("EBWebView")).unwrap();
    fs::write(original.join("EBWebView").join("test-profile"), b"profile").unwrap();
    fs::write(original.join("integration-settings.json"), b"{}").unwrap();

    assert_eq!(startup(&root).unwrap(), preferred);
    assert!(!original.exists());
    assert_eq!(startup(&root).unwrap(), preferred);
    assert_eq!(
        fs::read(preferred.join("EBWebView/test-profile")).unwrap(),
        b"profile"
    );
    assert_eq!(
        fs::read(preferred.join("integration-settings.json")).unwrap(),
        b"{}"
    );
    let mut library = LibraryService::new(SqliteLibrary::open(&preferred).unwrap());
    let list = library
        .list(LibraryQuery {
            category_id: "music".into(),
            ..Default::default()
        })
        .unwrap();
    assert_eq!(list.copies[0].id, copy_id);
    let backups = library.backups().unwrap();
    assert_eq!(backups.len(), 1);
    assert!(Path::new(&backups[0].path).starts_with(preferred.join("backups")));
    assert_eq!(fs::read(&backups[0].path).unwrap(), bytes);
    let snapshot = library.prepare_restore(backups[0].path.clone()).unwrap();
    assert_eq!(snapshot.copies, 1);
    library.restore(snapshot.token).unwrap();
}

#[test]
fn occupied_directory_even_when_empty_file_and_installer_stay_untouched() {
    for kind in ["empty directory", "file", "installation"] {
        let root = fixture();
        let original = root.join(ORIGINAL);
        let preferred = root.join(PREFERRED);
        fs::create_dir_all(original.join("backups")).unwrap();
        fs::write(original.join("backups/test.sqlite3"), b"backup").unwrap();
        if kind == "file" {
            fs::write(&preferred, b"unrelated").unwrap();
        } else {
            fs::create_dir(&preferred).unwrap();
            if kind == "installation" {
                fs::write(preferred.join("uninstall.exe"), b"installer").unwrap();
            }
        }
        assert_eq!(startup(&root).unwrap(), original);
        assert!(!original.join(MARKER).exists());
        assert_eq!(
            fs::read(original.join("backups/test.sqlite3")).unwrap(),
            b"backup"
        );
        match kind {
            "file" => assert_eq!(fs::read(preferred).unwrap(), b"unrelated"),
            "installation" => assert_eq!(
                fs::read(preferred.join("uninstall.exe")).unwrap(),
                b"installer"
            ),
            _ => assert_eq!(fs::read_dir(preferred).unwrap().count(), 0),
        }
    }
}

#[test]
fn locked_original_is_used_then_moved_after_unlock() {
    let root = fixture();
    let original = root.join(ORIGINAL);
    fs::create_dir(&original).unwrap();
    let handle = fs::OpenOptions::new()
        .read(true)
        .share_mode(0)
        .custom_flags(windows_sys::Win32::Storage::FileSystem::FILE_FLAG_BACKUP_SEMANTICS)
        .open(&original)
        .unwrap();
    assert_eq!(startup(&root).unwrap(), original);
    assert!(!root.join(PREFERRED).exists());
    drop(handle);
    assert_eq!(startup(&root).unwrap(), root.join(PREFERRED));
}

#[test]
fn rename_cannot_replace_a_directory_that_appeared_after_inspection() {
    let root = fixture();
    let source = root.join(ORIGINAL);
    let target = root.join(PREFERRED);
    fs::create_dir(&source).unwrap();
    fs::create_dir(&target).unwrap();
    assert!(rename_if_vacant(&source, &target).is_err());
    assert!(source.is_dir());
    assert_eq!(fs::read_dir(target).unwrap().count(), 0);
}

#[test]
fn an_interrupted_migration_retries_with_sqlite_sidecars_intact() {
    let root = fixture();
    let old = root.join(ORIGINAL);
    fs::create_dir(&old).unwrap();
    mark(&old).unwrap();
    for name in [
        "library.sqlite3",
        "library.sqlite3-wal",
        "library.sqlite3-shm",
    ] {
        fs::write(old.join(name), name).unwrap();
    }
    let new = startup(&root).unwrap();
    assert_eq!(new, root.join(PREFERRED));
    for name in [
        "library.sqlite3",
        "library.sqlite3-wal",
        "library.sqlite3-shm",
    ] {
        assert_eq!(fs::read(new.join(name)).unwrap(), name.as_bytes());
    }
}

#[test]
fn custom_installation_inside_original_is_never_moved() {
    let root = fixture();
    let old = root.join(ORIGINAL);
    fs::create_dir_all(old.join("program")).unwrap();
    let executable = old.join("program/discatelier-desktop.exe");
    fs::write(&executable, b"installation").unwrap();
    assert_eq!(select(&root, &executable).unwrap(), old);
    assert_eq!(fs::read(executable).unwrap(), b"installation");
    assert!(!root.join(PREFERRED).exists());
}

#[test]
fn fresh_starts_choose_one_root_without_adopting_an_unmarked_folder() {
    let root = fixture();
    std::thread::scope(|scope| {
        let launches: Vec<_> = (0..4)
            .map(|_| scope.spawn(|| startup(&root).unwrap()))
            .collect();
        for launch in launches {
            assert_eq!(launch.join().unwrap(), root.join(PREFERRED));
        }
    });
    assert!(!root.join(ORIGINAL).exists());
    let occupied = fixture();
    fs::create_dir(occupied.join(PREFERRED)).unwrap();
    assert_eq!(startup(&occupied).unwrap(), occupied.join(ORIGINAL));
    assert_eq!(fs::read_dir(occupied.join(PREFERRED)).unwrap().count(), 0);
}

#[test]
fn tauri_resolves_the_selected_webview_and_library_root_without_changing_identity() {
    for occupied in [false, true] {
        let root = fixture();
        if occupied {
            fs::create_dir(root.join(PREFERRED)).unwrap();
        }
        let mut config: tauri::Config =
            serde_json::from_str(include_str!("../../tauri.conf.json")).unwrap();
        assert_eq!(config.identifier, ORIGINAL);
        set_directory(&mut config, startup(&root).unwrap());
        let mut context = tauri::test::mock_context(tauri::test::noop_assets());
        *context.config_mut() = config;
        let app = tauri::test::mock_builder().build(context).unwrap();
        assert_eq!(app.config().identifier, ORIGINAL);
        let selected = root.join(if occupied { ORIGINAL } else { PREFERRED });
        assert_eq!(app.path().app_local_data_dir().unwrap(), selected);
        assert_eq!(app.path().app_cache_dir().unwrap(), selected);
        assert_eq!(app.path().app_log_dir().unwrap(), selected.join("logs"));
    }
}

#[test]
fn empty_old_folder_does_not_hide_a_migrated_library() {
    let root = fixture();
    let new = startup(&root).unwrap();
    let old = root.join(ORIGINAL);
    fs::write(new.join("library.sqlite3"), b"migrated").unwrap();
    fs::create_dir(&old).unwrap();
    assert_eq!(startup(&root).unwrap(), new);

    fs::write(old.join("library.sqlite3"), b"separate").unwrap();
    assert_eq!(startup(&root).unwrap(), old);
    assert_eq!(fs::read(new.join("library.sqlite3")).unwrap(), b"migrated");
    assert_eq!(fs::read(old.join("library.sqlite3")).unwrap(), b"separate");
}
