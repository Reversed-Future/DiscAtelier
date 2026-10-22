use discatelier_application::LibraryService;
use discatelier_contracts::{CreateCopy, LibraryQuery, UpdateCopy};
use discatelier_domain::{CopyDraft, EditionDraft, MediumDraft};
use discatelier_storage::SqliteLibrary;
use uuid::Uuid;

fn request() -> CreateCopy {
    CreateCopy {
        model: None,
        model_token: None,
        cover: None,
        request_id: Uuid::new_v4().to_string(),
        existing_edition_id: None,
        edition: Some(EditionDraft {
            category_id: "music".into(),
            title: "测试发行".into(),
            creator: "作者".into(),
            edition_label: "初回".into(),
            barcode: "0001234567890".into(),
            catalog_number: "AbC-0001".into(),
            media: vec![
                MediumDraft {
                    carrier_id: "cd".into(),
                    label: "音乐".into(),
                },
                MediumDraft {
                    carrier_id: "bd".into(),
                    label: "现场".into(),
                },
            ],
        }),
        copy: CopyDraft {
            status: "owned".into(),
            acquired_at: "2026-10-20".into(),
            amount_minor: Some(9990),
            currency: "CNY".into(),
            seller: "店铺".into(),
            purchase_url: "https://example.com/item".into(),
            storage_location: "书架".into(),
            notes: "".into(),
        },
    }
}
fn query() -> LibraryQuery {
    LibraryQuery {
        category_id: "music".into(),
        status: None,
        query: "".into(),
    }
}
// Keep test directories as reviewable evidence; no recursive cleanup.
fn database() -> std::path::PathBuf {
    tempfile::Builder::new()
        .prefix("discatelier-test-")
        .tempdir()
        .unwrap()
        .keep()
}

#[test]
fn restart_preserves_version_media_identifiers_and_purchase() {
    let directory = database();
    let id;
    {
        let mut service = LibraryService::new(SqliteLibrary::open(&directory).unwrap());
        id = service.create(request()).unwrap();
    }
    let service = LibraryService::new(SqliteLibrary::open(&directory).unwrap());
    let snapshot = service.list(query()).unwrap();
    assert_eq!(snapshot.copies.len(), 1);
    assert_eq!(snapshot.copies[0].id, id);
    assert_eq!(snapshot.copies[0].edition.barcode, "0001234567890");
    assert_eq!(snapshot.copies[0].edition.catalog_number, "AbC-0001");
    assert_eq!(snapshot.medium_count, 2);
    assert_eq!(snapshot.amounts["CNY"], "9990");
    assert_eq!(snapshot.copies[0].copy.acquired_at, "2026-10-20");
}
#[test]
fn duplicate_retries_are_idempotent_and_payload_reuse_is_rejected() {
    let mut service = LibraryService::new(SqliteLibrary::open(&database()).unwrap());
    let mut input = request();
    let id = service.create(input.clone()).unwrap();
    assert_eq!(service.create(input.clone()).unwrap(), id);
    input.copy.seller = "另一店铺".into();
    assert_eq!(service.create(input).unwrap_err().code, "conflict");
    assert_eq!(service.list(query()).unwrap().copies.len(), 1);
}
#[test]
fn copies_are_independent_and_stale_edits_cannot_overwrite() {
    let mut service = LibraryService::new(SqliteLibrary::open(&database()).unwrap());
    let first = service.create(request()).unwrap();
    let item = service.list(query()).unwrap().copies.remove(0);
    let mut duplicate = request();
    duplicate.edition = None;
    duplicate.existing_edition_id = Some(item.edition_id.clone());
    duplicate.copy.currency = "HKD".into();
    duplicate.copy.amount_minor = Some(0);
    service.create(duplicate).unwrap();
    let mut changed = item.copy;
    changed.seller = "新店铺".into();
    let edit = UpdateCopy {
        request_id: Uuid::new_v4().to_string(),
        id: first.clone(),
        expected_revision: 1,
        copy: changed,
    };
    service.update(edit.clone()).unwrap();
    service.update(edit.clone()).unwrap();
    let stale = UpdateCopy {
        request_id: Uuid::new_v4().to_string(),
        ..edit
    };
    assert_eq!(service.update(stale).unwrap_err().code, "conflict");
    let snapshot = service.list(query()).unwrap();
    assert_eq!(snapshot.copies.len(), 2);
    assert!(snapshot
        .copies
        .iter()
        .all(|copy| copy.edition_id == item.edition_id));
    assert_eq!(
        snapshot
            .copies
            .iter()
            .find(|copy| copy.id != first)
            .unwrap()
            .copy
            .seller,
        "店铺"
    );
    assert_eq!(snapshot.amounts["HKD"], "0");
}
#[test]
fn status_price_and_exact_search_rules() {
    let mut service = LibraryService::new(SqliteLibrary::open(&database()).unwrap());
    for (status, price) in [
        ("owned", None),
        ("owned", Some(0)),
        ("wanted", Some(1000)),
        ("transit", Some(2000)),
    ] {
        let mut value = request();
        value.copy.status = status.into();
        value.copy.amount_minor = price;
        service.create(value).unwrap();
    }
    let snapshot = service.list(query()).unwrap();
    assert_eq!(snapshot.owned_count, 2);
    assert_eq!(snapshot.unpriced_count, 1);
    assert_eq!(snapshot.amounts["CNY"], "0");
    assert_eq!(
        service
            .list(LibraryQuery {
                query: "AbC-0001".into(),
                ..query()
            })
            .unwrap()
            .copies
            .len(),
        4
    );
    assert_eq!(
        service
            .list(LibraryQuery {
                query: "abc-0001".into(),
                ..query()
            })
            .unwrap()
            .copies
            .len(),
        0
    );
    assert_eq!(
        service
            .list(LibraryQuery {
                query: "%' OR 1=1 --".into(),
                ..query()
            })
            .unwrap()
            .copies
            .len(),
        0
    );
    assert_eq!(
        service
            .list(LibraryQuery {
                status: Some("wanted".into()),
                ..query()
            })
            .unwrap()
            .copies
            .len(),
        1
    );
}
#[test]
fn invalid_data_is_rejected_before_any_write() {
    let mut service = LibraryService::new(SqliteLibrary::open(&database()).unwrap());
    let mut bad = request();
    bad.copy.acquired_at = "2026-02-30".into();
    assert_eq!(service.create(bad).unwrap_err().code, "validation");
    let mut bad = request();
    bad.copy.purchase_url = "javascript:alert(1)".into();
    assert_eq!(service.create(bad).unwrap_err().code, "validation");
    let mut bad = request();
    bad.copy.amount_minor = Some(-1);
    assert_eq!(service.create(bad).unwrap_err().code, "validation");
    assert_eq!(service.list(query()).unwrap().copies.len(), 0);
}
#[test]
fn missing_edition_rolls_back_and_backup_is_consistent() {
    let directory = database();
    let mut service = LibraryService::new(SqliteLibrary::open(&directory).unwrap());
    let mut bad = request();
    bad.edition = None;
    bad.existing_edition_id = Some(Uuid::new_v4().to_string());
    assert_eq!(service.create(bad).unwrap_err().code, "not_found");
    service.create(request()).unwrap();
    let path = service.backup().unwrap();
    let backup = rusqlite::Connection::open(path).unwrap();
    let integrity: String = backup
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .unwrap();
    assert_eq!(integrity, "ok");
    let count: i64 = backup
        .query_row("SELECT count(*) FROM copies", [], |row| row.get(0))
        .unwrap();
    assert_eq!(count, 1);
}
#[test]
fn future_and_modified_schemas_are_refused() {
    let directory = database();
    drop(SqliteLibrary::open(&directory).unwrap());
    let connection = rusqlite::Connection::open(directory.join("library.sqlite3")).unwrap();
    connection.pragma_update(None, "user_version", 99).unwrap();
    assert!(SqliteLibrary::open(&directory).is_err());
    connection.pragma_update(None, "user_version", 1).unwrap();
    connection
        .execute("UPDATE schema_migrations SET checksum='modified'", [])
        .unwrap();
    assert!(SqliteLibrary::open(&directory).is_err());
}
#[test]
fn manual_order_survives_reopen_and_backup_without_editing_collection_fields() {
    let dir = database();
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    for _ in 0..3 {
        service.create(request()).unwrap();
    }
    let before = service.list(query()).unwrap().copies;
    let ids: Vec<String> = before.iter().map(|x| x.id.clone()).collect();
    service.move_copy(&ids[2], Some(&ids[0])).unwrap();
    let expected = vec![ids[2].clone(), ids[0].clone(), ids[1].clone()];
    assert_eq!(
        service
            .list(query())
            .unwrap()
            .copies
            .iter()
            .map(|x| x.id.clone())
            .collect::<Vec<_>>(),
        expected
    );
    let backup = service.backup().unwrap();
    service.move_copy(&ids[2], None).unwrap();
    drop(service);
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    let restore = service.prepare_restore(backup).unwrap();
    service.restore(restore.token).unwrap();
    let after = service.list(query()).unwrap().copies;
    assert_eq!(
        after.iter().map(|x| x.id.clone()).collect::<Vec<_>>(),
        expected
    );
    for item in after {
        assert_eq!(
            serde_json::to_value(&item).unwrap(),
            serde_json::to_value(before.iter().find(|old| old.id == item.id).unwrap()).unwrap()
        );
    }
    assert!(service
        .move_copy(&ids[0], Some(&Uuid::new_v4().to_string()))
        .is_err());
    assert_eq!(
        service
            .list(query())
            .unwrap()
            .copies
            .iter()
            .map(|x| x.id.clone())
            .collect::<Vec<_>>(),
        expected
    );
}

#[test]
fn ordering_does_not_cross_categories_or_drop_unfiltered_items() {
    let dir = database();
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    for _ in 0..3 {
        service.create(request()).unwrap();
    }
    let before = service.list(query()).unwrap().copies;
    let mut video = request();
    video.edition.as_mut().unwrap().category_id = "video".into();
    let video_id = service.create(video).unwrap();
    assert!(service.move_copy(&before[0].id, Some(&video_id)).is_err());
    service
        .move_copy(&before[2].id, Some(&before[0].id))
        .unwrap();
    let after = service.list(query()).unwrap().copies;
    assert_eq!(after.len(), 3);
    assert_eq!(after[0].id, before[2].id);
    assert_eq!(after[2].id, before[1].id);
}
