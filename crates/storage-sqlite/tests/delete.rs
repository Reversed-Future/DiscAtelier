use base64::{engine::general_purpose::STANDARD, Engine};
use discatelier_application::LibraryService;
use discatelier_contracts::{CreateCopy, DeleteCopy, LibraryQuery};
use discatelier_domain::{CopyDraft, EditionDraft, MediumDraft};
use discatelier_storage::SqliteLibrary;
use rusqlite::Connection;
use uuid::Uuid;

fn directory() -> std::path::PathBuf {
    tempfile::Builder::new()
        .prefix("discatelier-delete-")
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
fn cover(extra_zero: bool) -> String {
    let mut bytes = include_bytes!("../../../apps/desktop/src-tauri/icons/32x32.png").to_vec();
    if extra_zero {
        bytes.push(0);
    }
    format!("data:image/png;base64,{}", STANDARD.encode(bytes))
}
fn copy() -> CopyDraft {
    CopyDraft {
        status: "owned".into(),
        acquired_at: "".into(),
        amount_minor: Some(100),
        currency: "CNY".into(),
        seller: "店铺".into(),
        purchase_url: "".into(),
        storage_location: "".into(),
        notes: "".into(),
    }
}
fn draft(cover: Option<String>) -> CreateCopy {
    CreateCopy {
        request_id: Uuid::new_v4().to_string(),
        existing_edition_id: None,
        cover,
        model: None,
        model_token: None,
        edition: Some(EditionDraft {
            category_id: "music".into(),
            title: "删除测试".into(),
            creator: "作者".into(),
            edition_label: "".into(),
            barcode: Uuid::new_v4().to_string(),
            catalog_number: "DEL-1".into(),
            media: vec![MediumDraft {
                carrier_id: "cd".into(),
                label: "".into(),
            }],
        }),
        copy: copy(),
    }
}
fn another_copy(edition_id: &str) -> CreateCopy {
    CreateCopy {
        request_id: Uuid::new_v4().to_string(),
        existing_edition_id: Some(edition_id.into()),
        cover: None,
        model: None,
        model_token: None,
        edition: None,
        copy: copy(),
    }
}

#[test]
fn deleting_one_copy_keeps_the_shared_edition_and_cover() {
    let dir = directory();
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    let first_id = service.create(draft(Some(cover(false)))).unwrap();
    let first = service
        .list(query())
        .unwrap()
        .copies
        .into_iter()
        .find(|item| item.id == first_id)
        .unwrap();
    let second_id = service.create(another_copy(&first.edition_id)).unwrap();
    let conflict = service
        .delete(DeleteCopy {
            request_id: Uuid::new_v4().to_string(),
            id: first.id.clone(),
            expected_revision: first.revision + 1,
        })
        .unwrap_err();
    assert_eq!(conflict.code, "conflict");
    let request = DeleteCopy {
        request_id: Uuid::new_v4().to_string(),
        id: first.id.clone(),
        expected_revision: first.revision,
    };
    assert_eq!(service.delete(request.clone()).unwrap(), first.id);
    assert_eq!(service.delete(request).unwrap(), first.id);
    let copies = service.list(query()).unwrap().copies;
    assert_eq!(copies.len(), 1);
    assert_eq!(copies[0].id, second_id);
    assert_eq!(copies[0].edition_copy_count, 1);
    assert_eq!(
        service
            .cover(copies[0].cover_asset_id.clone().unwrap())
            .unwrap(),
        cover(false)
    );
    assert!(service
        .delete(DeleteCopy {
            request_id: Uuid::new_v4().to_string(),
            id: first.id.clone(),
            expected_revision: 1,
        })
        .is_err());
}

#[test]
fn deleting_the_last_copy_removes_edition_scoped_data_and_unused_assets() {
    let dir = directory();
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    let first_id = service.create(draft(Some(cover(false)))).unwrap();
    let first = service
        .list(query())
        .unwrap()
        .copies
        .into_iter()
        .find(|item| item.id == first_id)
        .unwrap();
    let shared_id = service.create(draft(Some(cover(false)))).unwrap();
    let shared = service
        .list(query())
        .unwrap()
        .copies
        .into_iter()
        .find(|item| item.id == shared_id)
        .unwrap();
    let orphan_id = service.create(draft(Some(cover(true)))).unwrap();
    let orphan = service
        .list(query())
        .unwrap()
        .copies
        .into_iter()
        .find(|item| item.id == orphan_id)
        .unwrap();
    assert_eq!(first.cover_asset_id, shared.cover_asset_id);
    assert_ne!(first.cover_asset_id, orphan.cover_asset_id);
    drop(service);

    let connection = Connection::open(dir.join("library.sqlite3")).unwrap();
    connection
        .execute(
            "INSERT INTO edition_sources VALUES (?1,'discogs','test-release','2026-10-22')",
            [&first.edition_id],
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO imported_identifiers VALUES (?1,1,'identifier','catno','DEL-1','')",
            [&first.edition_id],
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO edition_content VALUES (?1,'{}')",
            [&first.edition_id],
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO edition_song_links VALUES (?1,'1','Track','{}')",
            [&first.edition_id],
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO video_edition_details VALUES (?1,'{}')",
            [&first.edition_id],
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO video_edition_parts VALUES (?1,'{}')",
            [&first.edition_id],
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO playback_sessions VALUES ('history-1','2026-10-22','{}')",
            [],
        )
        .unwrap();
    drop(connection);

    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    service
        .delete(DeleteCopy {
            request_id: Uuid::new_v4().to_string(),
            id: first.id.clone(),
            expected_revision: first.revision,
        })
        .unwrap();
    service
        .delete(DeleteCopy {
            request_id: Uuid::new_v4().to_string(),
            id: orphan.id.clone(),
            expected_revision: orphan.revision,
        })
        .unwrap();
    assert_eq!(service.list(query()).unwrap().copies.len(), 1);
    assert_eq!(
        service
            .cover(shared.cover_asset_id.clone().unwrap())
            .unwrap(),
        cover(false)
    );
    drop(service);

    let connection = Connection::open(dir.join("library.sqlite3")).unwrap();
    let count = |sql: &str| -> i64 { connection.query_row(sql, [], |row| row.get(0)).unwrap() };
    assert_eq!(
        count(&format!(
            "SELECT count(*) FROM editions WHERE id='{}'",
            first.edition_id
        )),
        0
    );
    assert_eq!(
        count(&format!(
            "SELECT count(*) FROM editions WHERE id='{}'",
            orphan.edition_id
        )),
        0
    );
    assert_eq!(
        count("SELECT count(*) FROM works WHERE title='删除测试'"),
        1
    );
    assert_eq!(
        count(&format!(
            "SELECT count(*) FROM edition_sources WHERE edition_id='{}'",
            first.edition_id
        )),
        0
    );
    assert_eq!(
        count(&format!(
            "SELECT count(*) FROM imported_identifiers WHERE edition_id='{}'",
            first.edition_id
        )),
        0
    );
    assert_eq!(
        count(&format!(
            "SELECT count(*) FROM edition_content WHERE edition_id='{}'",
            first.edition_id
        )),
        0
    );
    assert_eq!(
        count(&format!(
            "SELECT count(*) FROM edition_song_links WHERE edition_id='{}'",
            first.edition_id
        )),
        0
    );
    assert_eq!(
        count(&format!(
            "SELECT count(*) FROM video_edition_details WHERE edition_id='{}'",
            first.edition_id
        )),
        0
    );
    assert_eq!(
        count(&format!(
            "SELECT count(*) FROM video_edition_parts WHERE edition_id='{}'",
            first.edition_id
        )),
        0
    );
    assert_eq!(
        count(&format!(
            "SELECT count(*) FROM assets WHERE id='{}'",
            orphan.cover_asset_id.as_deref().unwrap()
        )),
        0
    );
    assert_eq!(
        count(&format!(
            "SELECT count(*) FROM assets WHERE id='{}'",
            shared.cover_asset_id.as_deref().unwrap()
        )),
        1
    );
    assert_eq!(count("SELECT count(*) FROM playback_sessions"), 1);
}
