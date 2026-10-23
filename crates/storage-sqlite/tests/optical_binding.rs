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
