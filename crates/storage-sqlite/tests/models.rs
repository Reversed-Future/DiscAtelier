use base64::{engine::general_purpose::STANDARD, Engine};
use discatelier_application::LibraryService;
use discatelier_contracts::*;
use discatelier_domain::*;
use discatelier_storage::SqliteLibrary;
use rusqlite::Connection;
use serde_json::json;
use uuid::Uuid;

fn model() -> String {
    let cover = format!(
        "data:image/png;base64,{}",
        STANDARD.encode(include_bytes!(
            "../../../apps/desktop/src-tauri/icons/32x32.png"
        ))
    );
    json!({
        "format": "atelier-interactive-model", "version": 2, "id": "storage-test",
        "title": "Storage fixture", "creator": "Test", "cover": cover,
        "scene": {"up": "Z", "textures": [], "materials": [], "geometries": [], "nodes": [
            {"id": "root", "parent": null, "position": [0,0,0], "quaternion": [0,0,0,1], "scale": [1,1,1]}
        ]},
        "initialState": "closed", "states": [{"id": "closed", "focus": [], "clicks": []}], "actions": []
    }).to_string()
}
fn request() -> CreateCopy {
    CreateCopy {
        request_id: Uuid::new_v4().to_string(),
        existing_edition_id: None,
        cover: None,
        model: Some(model()),
        model_token: None,
        edition: Some(EditionDraft {
            category_id: "music".into(),
            title: "Test".into(),
            creator: "Test".into(),
            edition_label: "".into(),
            barcode: "".into(),
            catalog_number: "".into(),
            media: vec![MediumDraft {
                carrier_id: "cd".into(),
                label: "".into(),
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
fn query() -> LibraryQuery {
    LibraryQuery {
        category_id: "music".into(),
        ..Default::default()
    }
}
fn directory() -> std::path::PathBuf {
    tempfile::Builder::new()
        .prefix("discatelier-models-")
        .tempdir()
        .unwrap()
        .keep()
}

#[test]
fn models_are_shared_idempotent_and_restored_after_removal() {
    let dir = directory();
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    let request = request();
    service.create(request.clone()).unwrap();
    service.create(request.clone()).unwrap();
    let first = service.list(query()).unwrap().copies.remove(0);
    let model_id = first.model_asset_id.clone().unwrap();
    assert_eq!(service.model(model_id.clone(), false).unwrap(), model());
    let duplicate = CreateCopy {
        request_id: Uuid::new_v4().to_string(),
        existing_edition_id: Some(first.edition_id.clone()),
        edition: None,
        model: None,
        model_token: None,
        ..request
    };
    service.create(duplicate).unwrap();
    assert!(service
        .list(query())
        .unwrap()
        .copies
        .iter()
        .all(|copy| copy.model_asset_id.as_ref() == Some(&model_id)));
    let backup = service.backup().unwrap();
    let edit = UpdateEdition {
        request_id: Uuid::new_v4().to_string(),
        edition_id: first.edition_id,
        expected_revision: first.edition_revision,
        edition: first.edition,
        cover: CoverChange::Keep,
        model: ModelChange::Remove,
    };
    service.update_edition(edit.clone()).unwrap();
    assert!(service
        .list(query())
        .unwrap()
        .copies
        .iter()
        .all(|copy| copy.model_asset_id.is_none()));
    assert_eq!(
        service
            .update_edition(UpdateEdition {
                request_id: Uuid::new_v4().to_string(),
                ..edit
            })
            .unwrap_err()
            .code,
        "conflict"
    );
    let preview = service.prepare_restore(backup).unwrap();
    assert_eq!((preview.copies, preview.models), (2, 1));
    service.restore(preview.token).unwrap();
    drop(service);
    let service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    assert!(service
        .list(query())
        .unwrap()
        .copies
        .iter()
        .all(|copy| copy.model_asset_id.as_ref() == Some(&model_id)));
    assert_eq!(service.model(model_id, false).unwrap(), model());
}

#[test]
fn malformed_external_oversize_and_cyclic_models_never_commit() {
    let mut service = LibraryService::new(SqliteLibrary::open(&directory()).unwrap());
    let mut external: serde_json::Value = serde_json::from_str(&model()).unwrap();
    external["cover"] = json!("https://example.com/image.png");
    let mut cyclic: serde_json::Value = serde_json::from_str(&model()).unwrap();
    cyclic["scene"]["nodes"][0]["parent"] = json!("root");
    for text in [
        "{}".into(),
        external.to_string(),
        cyclic.to_string(),
        " ".repeat(50 * 1024 * 1024 + 1),
    ] {
        let mut request = request();
        request.model = Some(text);
        assert!(service.create(request).is_err());
        assert!(service.list(query()).unwrap().copies.is_empty());
    }
}

#[test]
fn corrupt_backup_model_is_rejected_before_live_library_changes() {
    let mut service = LibraryService::new(SqliteLibrary::open(&directory()).unwrap());
    service.create(request()).unwrap();
    let backup = service.backup().unwrap();
    let connection = Connection::open(&backup).unwrap();
    connection
        .execute("UPDATE model_assets SET data='{}'", [])
        .unwrap();
    assert!(service.prepare_restore(backup).is_err());
    let first = service.list(query()).unwrap().copies.remove(0);
    assert_eq!(
        service.model(first.model_asset_id.unwrap(), false).unwrap(),
        model()
    );
}

#[test]
fn native_preparation_is_an_immutable_snapshot_and_retry_survives_release() {
    let dir = directory();
    let path = dir.join("snapshot.ateliermodel");
    std::fs::write(&path, model()).unwrap();
    let asset = discatelier_storage::prepare_model_file(&path).unwrap();
    let expected_id = asset.id.clone();
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    let prepared = service.stage_model(asset).unwrap();
    std::fs::write(&path, "{}").unwrap();
    assert_eq!(
        service
            .prepared_model_data(&prepared.token)
            .unwrap()
            .as_ref(),
        model()
    );
    let mut request = request();
    request.model = None;
    request.model_token = Some(prepared.token.clone());
    let saved = service.create(request.clone()).unwrap();
    service.release_model(&prepared.token).unwrap();
    assert!(service.prepared_model_data(&prepared.token).is_err());
    assert_eq!(service.create(request.clone()).unwrap(), saved);
    assert_eq!(
        service.list(query()).unwrap().copies[0]
            .model_asset_id
            .as_ref(),
        Some(&expected_id)
    );
    request.request_id = Uuid::new_v4().to_string();
    assert!(service.create(request).is_err());
    assert_eq!(service.list(query()).unwrap().copies.len(), 1);
    assert_eq!(service.model(expected_id, false).unwrap(), model());
}

#[test]
fn cancelled_preparation_and_dual_model_sources_cannot_write() {
    let dir = directory();
    let path = dir.join("cancel.ateliermodel");
    std::fs::write(&path, model()).unwrap();
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    let prepared = service
        .stage_model(discatelier_storage::prepare_model_file(&path).unwrap())
        .unwrap();
    let mut request = request();
    request.model_token = Some(prepared.token.clone());
    assert!(service.create(request.clone()).is_err());
    assert!(service.list(query()).unwrap().copies.is_empty());
    service.release_model(&prepared.token).unwrap();
    request.model = None;
    assert!(service.create(request).is_err());
    assert!(service.list(query()).unwrap().copies.is_empty());
    let wrong = dir.join("wrong.json");
    std::fs::write(&wrong, model()).unwrap();
    assert!(discatelier_storage::prepare_model_file(&wrong).is_err());
}

#[test]
fn v3_prepared_import_survives_backup_and_restore() {
    let dir = directory();
    let cover: serde_json::Value =
        serde_json::from_str::<serde_json::Value>(&model()).unwrap()["cover"].clone();
    let profiles: serde_json::Value = serde_json::from_str(include_str!(
        "../../../packages/atelier-model-runtime/shared/assembly-profiles.json"
    ))
    .unwrap();
    let textures: Vec<_> = profiles["nafelibeta2"]["textures"]
        .as_array()
        .unwrap()
        .iter()
        .map(|id| json!({"id":id,"image":"image"}))
        .collect();
    let text=json!({"format":"atelier-interactive-model","version":3,"id":"v3-test","title":"V3 fixture","creator":"Test","cover":cover,"rig":"album-assembly-v1","runtimeVersion":1,"profile":"nafelibeta2","images":[{"id":"image","image":cover}],"textures":textures,"data":{}}).to_string();
    let path = dir.join("v3.ateliermodel");
    std::fs::write(&path, &text).unwrap();
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    let asset = discatelier_storage::prepare_model_file(&path).unwrap();
    let id = asset.id.clone();
    let prepared = service.stage_model(asset).unwrap();
    let mut request = request();
    request.model = None;
    request.model_token = Some(prepared.token);
    service.create(request).unwrap();
    let backup = service.backup().unwrap();
    let preview = service.prepare_restore(backup).unwrap();
    assert_eq!((preview.copies, preview.models), (1, 1));
    service.restore(preview.token).unwrap();
    drop(service);
    let service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    assert_eq!(service.model(id, false).unwrap(), text);
}
