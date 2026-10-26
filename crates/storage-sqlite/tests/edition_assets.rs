use base64::{engine::general_purpose::STANDARD, Engine};
use discatelier_application::LibraryService;
use discatelier_contracts::{CoverChange, CreateCopy, LibraryQuery, UpdateEdition};
use discatelier_domain::{CopyDraft, EditionDraft, MediumDraft};
use discatelier_storage::SqliteLibrary;
use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};
use uuid::Uuid;

fn directory() -> std::path::PathBuf {
    tempfile::Builder::new()
        .prefix("discatelier-assets-")
        .tempdir()
        .unwrap()
        .keep()
}
fn query() -> LibraryQuery {
    LibraryQuery {
        category_id: "music".into(),
        status: None,
        query: "".into(),
    }
}
fn cover() -> String {
    format!(
        "data:image/png;base64,{}",
        STANDARD.encode(include_bytes!(
            "../../../apps/desktop/src-tauri/icons/32x32.png"
        ))
    )
}
fn large_cover() -> String {
    let mut bytes = include_bytes!("../../../apps/desktop/src-tauri/icons/32x32.png").to_vec();
    bytes.resize(10 * 1024 * 1024, 0);
    format!("data:image/png;base64,{}", STANDARD.encode(bytes))
}
fn draft() -> CreateCopy {
    CreateCopy {
        request_id: Uuid::new_v4().to_string(),
        existing_edition_id: None,
        model: None,
        model_token: None,
        cover: Some(cover()),
        edition: Some(EditionDraft {
            category_id: "music".into(),
            title: "原名称".into(),
            creator: "作者".into(),
            edition_label: "".into(),
            barcode: "00001".into(),
            catalog_number: "Ab-01".into(),
            media: vec![MediumDraft {
                carrier_id: "cd".into(),
                label: "".into(),
            }],
        }),
        copy: CopyDraft {
            status: "owned".into(),
            acquired_at: "".into(),
            amount_minor: Some(100),
            currency: "CNY".into(),
            seller: "原店铺".into(),
            purchase_url: "".into(),
            storage_location: "".into(),
            notes: "".into(),
        },
    }
}
#[test]
fn edition_edits_share_metadata_not_purchases_and_reject_stale_revision() {
    let dir = directory();
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    service.create(draft()).unwrap();
    let first = service.list(query()).unwrap().copies.remove(0);
    let mut duplicate = draft();
    duplicate.edition = None;
    duplicate.cover = None;
    duplicate.existing_edition_id = Some(first.edition_id.clone());
    duplicate.copy.seller = "另一店铺".into();
    duplicate.copy.amount_minor = Some(900);
    service.create(duplicate).unwrap();
    let mut edition = first.edition.clone();
    edition.title = "新名称".into();
    edition.media.push(MediumDraft {
        carrier_id: "bd".into(),
        label: "演出".into(),
    });
    let request = UpdateEdition {
        request_id: Uuid::new_v4().to_string(),
        edition_id: first.edition_id.clone(),
        expected_revision: 1,
        edition,
        model: Default::default(),
        cover: CoverChange::Keep,
    };
    service.update_edition(request.clone()).unwrap();
    service.update_edition(request.clone()).unwrap();
    assert_eq!(
        service
            .update_edition(UpdateEdition {
                request_id: Uuid::new_v4().to_string(),
                ..request
            })
            .unwrap_err()
            .code,
        "conflict"
    );
    let result = service.list(query()).unwrap();
    assert!(result
        .copies
        .iter()
        .all(|copy| copy.edition.title == "新名称"
            && copy.edition_revision == 2
            && copy.edition_copy_count == 2));
    assert_eq!(result.medium_count, 4);
    assert_eq!(result.amounts["CNY"], "1000");
    assert_eq!(
        result
            .copies
            .iter()
            .find(|copy| copy.id == first.id)
            .unwrap()
            .copy
            .seller,
        "原店铺"
    );
    assert_eq!(
        result
            .copies
            .iter()
            .find(|copy| copy.id != first.id)
            .unwrap()
            .copy
            .seller,
        "另一店铺"
    );
    let connection = Connection::open(dir.join("library.sqlite3")).unwrap();
    let count: i64 = connection
        .query_row("SELECT count(*) FROM assets", [], |row| row.get(0))
        .unwrap();
    assert_eq!(count, 1);
}
#[test]
fn cover_survives_restart_and_is_included_in_backup() {
    let dir = directory();
    let asset_id;
    {
        let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
        service.create(draft()).unwrap();
        service.create(draft()).unwrap();
        asset_id = service.list(query()).unwrap().copies[0]
            .cover_asset_id
            .clone()
            .unwrap();
        let backup = Connection::open(service.backup().unwrap()).unwrap();
        let data: Vec<u8> = backup
            .query_row("SELECT data FROM assets WHERE id=?1", [&asset_id], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(format!("{:x}", Sha256::digest(data)), asset_id);
        assert_eq!(
            backup
                .query_row::<i64, _, _>("SELECT count(*) FROM assets", [], |row| row.get(0))
                .unwrap(),
            1
        );
    }
    let service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    assert_eq!(service.cover(asset_id).unwrap(), cover());
}
#[test]
fn bad_cover_is_atomic_and_removal_does_not_destroy_original_asset() {
    let mut service = LibraryService::new(SqliteLibrary::open(&directory()).unwrap());
    let mut bad = draft();
    bad.cover = Some("data:image/png;base64,bm90LWFuLWltYWdl".into());
    assert_eq!(service.create(bad).unwrap_err().code, "validation");
    assert!(service.list(query()).unwrap().copies.is_empty());
    service.create(draft()).unwrap();
    let first = service.list(query()).unwrap().copies.remove(0);
    let invalid = UpdateEdition {
        request_id: Uuid::new_v4().to_string(),
        edition_id: first.edition_id.clone(),
        expected_revision: 1,
        edition: EditionDraft {
            title: "不应提交".into(),
            ..first.edition.clone()
        },
        model: Default::default(),
        cover: CoverChange::Replace {
            data_url: "data:image/svg+xml;base64,PHN2Zy8+".into(),
        },
    };
    assert_eq!(
        service.update_edition(invalid).unwrap_err().code,
        "validation"
    );
    assert_eq!(
        service.list(query()).unwrap().copies[0].edition.title,
        "原名称"
    );
    service
        .update_edition(UpdateEdition {
            request_id: Uuid::new_v4().to_string(),
            edition_id: first.edition_id,
            expected_revision: 1,
            edition: first.edition,
            model: Default::default(),
            cover: CoverChange::Remove,
        })
        .unwrap();
    assert!(service.list(query()).unwrap().copies[0]
        .cover_asset_id
        .is_none());
    assert_eq!(
        service.cover(first.cover_asset_id.unwrap()).unwrap(),
        cover()
    );
}
#[test]
fn v1_database_is_backed_up_before_migration() {
    let dir = directory();
    let connection = Connection::open(dir.join("library.sqlite3")).unwrap();
    let sql = include_str!("../migrations/001_library.sql");
    connection.execute_batch(sql).unwrap();
    connection.execute_batch("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY,checksum TEXT NOT NULL); PRAGMA user_version=1;").unwrap();
    connection
        .execute(
            "INSERT INTO schema_migrations VALUES (1,?1)",
            [format!("{:x}", Sha256::digest(sql.as_bytes()))],
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO works VALUES ('w','music','旧库收藏','旧作者')",
            [],
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO editions VALUES ('e','w','','00001','Ab-01')",
            [],
        )
        .unwrap();
    connection
        .execute("INSERT INTO media VALUES ('m','e',1,'cd','')", [])
        .unwrap();
    connection
        .execute(
            "INSERT INTO copies VALUES ('c','e','owned','2026-10-20','','','',1)",
            [],
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO purchases VALUES ('c',100,'CNY','旧店铺','')",
            [],
        )
        .unwrap();
    drop(connection);
    let service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    assert_eq!(
        service.list(query()).unwrap().copies[0].edition.title,
        "旧库收藏"
    );
    let backups = std::fs::read_dir(dir.join("backups"))
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap();
    assert_eq!(backups.len(), 1);
    let backup = Connection::open(backups[0].path()).unwrap();
    assert_eq!(
        backup
            .pragma_query_value::<i64, _>(None, "user_version", |row| row.get(0))
            .unwrap(),
        1
    );
    assert_eq!(
        backup
            .query_row::<String, _, _>("SELECT seller FROM purchases", [], |row| row.get(0))
            .unwrap(),
        "旧店铺"
    );
    drop(backup);
    drop(service);
    SqliteLibrary::open(&dir).unwrap();
    assert_eq!(std::fs::read_dir(dir.join("backups")).unwrap().count(), 1);
}

#[test]
fn restore_preserves_covers_and_saves_current_library_before_replacement() {
    let dir = directory();
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    service.create(draft()).unwrap();
    let backup = service.backup().unwrap();
    service.create(draft()).unwrap();
    let preview = service.prepare_restore(backup).unwrap();
    assert_eq!((preview.copies, preview.assets), (1, 1));
    let previous = service.restore(preview.token.clone()).unwrap();
    assert!(service.restore(preview.token).is_err());
    assert_eq!(service.list(query()).unwrap().copies.len(), 1);
    let original = Connection::open(previous).unwrap();
    assert_eq!(
        original
            .query_row::<i64, _, _>("SELECT count(*) FROM copies", [], |row| row.get(0))
            .unwrap(),
        2
    );
    drop(service);
    let service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    let copies = service.list(query()).unwrap().copies;
    assert_eq!(copies.len(), 1);
    assert_eq!(
        service
            .cover(copies[0].cover_asset_id.clone().unwrap())
            .unwrap(),
        cover()
    );
}

#[test]
fn restore_rejects_stale_preview_corrupt_assets_and_foreign_schema() {
    let dir = directory();
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    service.create(draft()).unwrap();
    let backup = service.backup().unwrap();
    let preview = service.prepare_restore(backup.clone()).unwrap();
    service.create(draft()).unwrap();
    assert!(service.restore(preview.token).is_err());
    let connection = Connection::open(&backup).unwrap();
    connection
        .execute("UPDATE assets SET data=zeroblob(byte_length)", [])
        .unwrap();
    assert!(service.prepare_restore(backup).is_err());
    assert_eq!(service.list(query()).unwrap().copies.len(), 2);
    let second = service.backup().unwrap();
    let connection = Connection::open(&second).unwrap();
    connection
        .execute_batch("CREATE TRIGGER unknown_trigger AFTER INSERT ON works BEGIN SELECT 1; END;")
        .unwrap();
    assert!(service.prepare_restore(second).is_err());
    assert_eq!(service.list(query()).unwrap().copies.len(), 2);
}

#[test]
fn schema_thirteen_migrates_asset_limit_and_accepts_large_covers() {
    let dir = directory();
    let connection = Connection::open(dir.join("library.sqlite3")).unwrap();
    connection
        .execute_batch(
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
        include_str!("../migrations/010_music_albums.sql"),
        include_str!("../migrations/011_video_metadata.sql"),
        include_str!("../migrations/012_video_parts.sql"),
        include_str!("../migrations/013_collection_order.sql"),
    ];
    for (index, sql) in migrations.iter().enumerate() {
        connection.execute_batch(sql).unwrap();
        connection
            .execute(
                "INSERT INTO schema_migrations VALUES (?1,?2)",
                params![
                    (index + 1) as i64,
                    format!("{:x}", Sha256::digest(sql.as_bytes()))
                ],
            )
            .unwrap();
    }
    connection.pragma_update(None, "user_version", 13).unwrap();
    let legacy = include_bytes!("../../../apps/desktop/src-tauri/icons/32x32.png");
    let legacy_id = format!("{:x}", Sha256::digest(legacy.as_slice()));
    connection
        .execute(
            "INSERT INTO assets VALUES (?1,'image/png',?2,?3)",
            params![legacy_id, legacy.len() as i64, legacy],
        )
        .unwrap();
    drop(connection);

    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    assert!(service
        .cover(legacy_id)
        .unwrap()
        .starts_with("data:image/png;base64,"));
    let mut request = draft();
    request.cover = Some(large_cover());
    let id = service.create(request).unwrap();
    let copy = service
        .list(query())
        .unwrap()
        .copies
        .into_iter()
        .find(|copy| copy.id == id)
        .unwrap();
    assert!(service.cover(copy.cover_asset_id.unwrap()).unwrap().len() > 10 * 1024 * 1024);
    assert_eq!(std::fs::read_dir(dir.join("backups")).unwrap().count(), 1);

    let connection = Connection::open(dir.join("library.sqlite3")).unwrap();
    assert_eq!(
        connection
            .pragma_query_value::<i64, _>(None, "user_version", |row| row.get(0))
            .unwrap(),
        16
    );
    assert_eq!(
        connection
            .query_row::<i64, _, _>("SELECT count(*) FROM pragma_foreign_key_check", [], |row| {
                row.get(0)
            })
            .unwrap(),
        0
    );
}

#[test]
fn restore_uses_validated_snapshot_even_if_source_file_changes() {
    let mut service = LibraryService::new(SqliteLibrary::open(&directory()).unwrap());
    service.create(draft()).unwrap();
    let backup = service.backup().unwrap();
    let preview = service.prepare_restore(backup.clone()).unwrap();
    let connection = Connection::open(backup).unwrap();
    connection
        .execute("UPDATE works SET title='changed after preview'", [])
        .unwrap();
    service.restore(preview.token).unwrap();
    assert_eq!(
        service.list(query()).unwrap().copies[0].edition.title,
        "原名称"
    );
}
