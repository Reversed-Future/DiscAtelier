use discatelier_application::LibraryService;
use discatelier_contracts::CreateCopy;
use discatelier_domain::{CopyDraft, EditionDraft, MediumDraft};
use discatelier_storage::SqliteLibrary;
use uuid::Uuid;

fn draft() -> CreateCopy {
    CreateCopy {
        request_id: Uuid::new_v4().to_string(),
        existing_edition_id: None,
        cover: None,
        model: None,
        model_token: None,
        edition: Some(EditionDraft {
            category_id: "video".into(),
            title: "光盘关联测试".into(),
            creator: "创作者".into(),
            edition_label: "测试版".into(),
            barcode: Uuid::new_v4().to_string(),
            catalog_number: "OPT-1".into(),
            media: vec![MediumDraft {
                carrier_id: "bd".into(),
                label: "TEST_DISC".into(),
            }],
        }),
        copy: CopyDraft {
            status: "owned".into(),
            acquired_at: "".into(),
            amount_minor: None,
            currency: "CNY".into(),
            seller: "".into(),
            purchase_url: "".into(),
            storage_location: "".into(),
            notes: "".into(),
        },
    }
}

#[test]
fn optical_binding_is_upserted_and_removed() {
    let dir = tempfile::Builder::new()
        .prefix("discatelier-optical-binding-")
        .tempdir()
        .unwrap();
    let mut service = LibraryService::new(SqliteLibrary::open(dir.path()).unwrap());
    let copy_id = service.create(draft()).unwrap();
    assert!(service.optical_binding("token-1").unwrap().is_none());
    service
        .save_optical_binding("token-1", &copy_id, "TEST_DISC")
        .unwrap();
    let binding = service.optical_binding("token-1").unwrap().unwrap();
    assert_eq!(binding.copy_id, copy_id);
    assert_eq!(binding.title, "光盘关联测试");
    assert_eq!(binding.label, "TEST_DISC");
    service
        .save_optical_binding("token-1", &copy_id, "UPDATED_DISC")
        .unwrap();
    assert_eq!(
        service.optical_binding("token-1").unwrap().unwrap().label,
        "UPDATED_DISC"
    );
    assert!(service
        .save_optical_binding("token-2", "missing-copy", "X")
        .is_err());
    service.remove_optical_binding("token-1").unwrap();
    assert!(service.optical_binding("token-1").unwrap().is_none());
}

#[test]
fn disc_binding_validates_key_supports_correction_and_survives_reopen() {
    use discatelier_contracts::{EditionContent, LibraryQuery};
    let dir = tempfile::tempdir().unwrap();
    let mut service = LibraryService::new(SqliteLibrary::open(dir.path()).unwrap());
    let mut request = draft();
    request.edition.as_mut().unwrap().media = vec![
        MediumDraft {
            carrier_id: "cd".into(),
            label: "CD".into(),
        },
        MediumDraft {
            carrier_id: "bd".into(),
            label: "BD1".into(),
        },
        MediumDraft {
            carrier_id: "bd".into(),
            label: "BD2".into(),
        },
    ];
    let copy_id = service.create(request).unwrap();
    let item = service
        .list(LibraryQuery {
            category_id: "video".into(),
            status: None,
            query: String::new(),
        })
        .unwrap()
        .copies
        .remove(0);
    let tracks = serde_json::from_value(serde_json::json!([
        {"title":"CD", "type_":"heading"}, {"title":"Song", "position":"CD-1"},
        {"title":"Live one", "type_":"heading"}, {"title":"Opening", "position":"BD1-1"},
        {"title":"Live two", "type_":"heading"}, {"title":"Opening", "position":"BD2-1"}
    ]))
    .unwrap();
    service
        .save_edited_content(
            &item.edition_id,
            &EditionContent {
                tracks,
                ..Default::default()
            },
        )
        .unwrap();
    service
        .save_optical_disc_binding("disc", &copy_id, "BD", Some("BD1"))
        .unwrap();
    assert_eq!(
        service
            .optical_binding("disc")
            .unwrap()
            .unwrap()
            .disc_label
            .as_deref(),
        Some("Disc 2. Live one")
    );
    assert!(service
        .save_optical_disc_binding("disc", &copy_id, "BD", Some("BD3"))
        .is_err());
    assert_eq!(
        service
            .optical_binding("disc")
            .unwrap()
            .unwrap()
            .disc_key
            .as_deref(),
        Some("BD1")
    );
    service
        .save_optical_disc_binding("disc", &copy_id, "BD", Some("BD2"))
        .unwrap();
    drop(service);
    let mut service = LibraryService::new(SqliteLibrary::open(dir.path()).unwrap());
    let saved = service.optical_binding("disc").unwrap().unwrap();
    assert_eq!(saved.disc_key.as_deref(), Some("BD2"));
    assert_eq!(saved.disc_label.as_deref(), Some("Disc 3. Live two"));
    service
        .save_optical_binding("disc", &copy_id, "BD")
        .unwrap();
    assert!(service
        .optical_binding("disc")
        .unwrap()
        .unwrap()
        .disc_key
        .is_none());
}

#[test]
fn schema_fifteen_binding_is_preserved_and_backed_up_before_upgrade() {
    let dir = tempfile::tempdir().unwrap();
    let mut service = LibraryService::new(SqliteLibrary::open(dir.path()).unwrap());
    let copy_id = service.create(draft()).unwrap();
    service
        .save_optical_binding("old-disc", &copy_id, "OLD")
        .unwrap();
    drop(service);
    let connection = rusqlite::Connection::open(dir.path().join("library.sqlite3")).unwrap();
    connection.execute_batch("ALTER TABLE optical_bindings DROP COLUMN disc_key; ALTER TABLE optical_bindings DROP COLUMN disc_label; DELETE FROM schema_migrations WHERE version=16; PRAGMA user_version=15;").unwrap();
    drop(connection);
    let service = LibraryService::new(SqliteLibrary::open(dir.path()).unwrap());
    let saved = service.optical_binding("old-disc").unwrap().unwrap();
    assert_eq!(saved.copy_id, copy_id);
    assert_eq!(saved.label, "OLD");
    assert!(saved.disc_key.is_none());
    let backups: Vec<_> = std::fs::read_dir(dir.path().join("backups"))
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .collect();
    assert_eq!(backups.len(), 1);
    let backup = rusqlite::Connection::open(&backups[0]).unwrap();
    assert_eq!(
        backup
            .pragma_query_value::<u32, _>(None, "user_version", |row| row.get(0))
            .unwrap(),
        15
    );
    let saved_id: String = backup
        .query_row(
            "SELECT copy_id FROM optical_bindings WHERE media_token='old-disc'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(saved_id, copy_id);
}
