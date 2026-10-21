use super::{
    actions::{Action, Images, PreparedAction},
    *,
};
use base64::Engine;
use discatelier_agent_harness::ActionPreview;
use discatelier_application::LibraryService;
use discatelier_contracts::*;
use discatelier_storage::SqliteLibrary;
use serde_json::json;
use std::{
    sync::Mutex,
    time::{Duration, Instant},
};

fn library() -> LibraryState {
    let dir = std::env::temp_dir().join(format!(
        "discatelier-agent-actions-{}",
        uuid::Uuid::new_v4()
    ));
    Arc::new(Mutex::new(Ok(LibraryService::new(
        SqliteLibrary::open(&dir).unwrap(),
    ))))
}
fn request() -> CreateCopy {
    serde_json::from_value(json!({"requestId":uuid::Uuid::new_v4().to_string(),"edition":{"categoryId":"music","title":"Fixture","creator":"Artist","editionLabel":"","barcode":"","catalogNumber":"","media":[{"carrierId":"cd","label":""}]},"existingEditionId":null,"copy":{"status":"wanted","acquiredAt":"","amountMinor":null,"currency":"CNY","seller":"","purchaseUrl":"","storageLocation":"","notes":""}})).unwrap()
}
fn query() -> LibraryQuery {
    LibraryQuery {
        category_id: "music".into(),
        ..Default::default()
    }
}
fn arm(library: &LibraryState, state: &AgentState, action: Action) -> Session {
    let preview = ActionPreview {
        id: uuid::Uuid::new_v4().to_string(),
        title: "Fixture".into(),
        kind: match action {
            Action::Create { .. } | Action::Import(_) => "add",
            Action::Supplement { .. } => "supplement",
            Action::Cover(_) => "cover",
        }
        .into(),
        changes: vec![],
        has_images: false,
    };
    let session = Session {
        action: Some(preview.clone()),
        phase: "confirmation".into(),
        ..Default::default()
    };
    *state.prepared.lock().unwrap() = Some(PreparedAction {
        preview,
        action,
        images: Images::default(),
        created: Instant::now(),
    });
    save(library, &session).unwrap();
    session
}
fn decide(
    library: &LibraryState,
    state: &AgentState,
    session: &Session,
    approve: bool,
) -> Result<Session, AppError> {
    decisions::decide_action(
        library,
        state,
        &session.id,
        &session.action.as_ref().unwrap().id,
        approve,
    )
}
fn album() -> MusicSupplement {
    serde_json::from_value(json!({"albumId":123,"title":"Fixture","artists":["Artist"],"description":"new intro","company":"Publisher","publishedAt":0,"tracks":[{"id":456,"title":"Song","artists":["Artist"],"disc":"1","number":1,"durationMs":1000}],"links":[]})).unwrap()
}
#[test]
fn add_requires_exact_confirmation_and_is_once_only() {
    let library = library();
    let state = AgentState::default();
    let s = arm(
        &library,
        &state,
        Action::Create {
            request: Box::new(request()),
            album: Some(album()),
        },
    );
    assert_eq!(
        host::with_library(&library, |s| s.list(query()))
            .unwrap()
            .copies
            .len(),
        0
    );
    assert!(decisions::decide_action(&library, &state, &s.id, "wrong", true).is_err());
    decide(&library, &state, &s, false).unwrap();
    assert_eq!(
        host::with_library(&library, |s| s.list(query()))
            .unwrap()
            .copies
            .len(),
        0
    );
    let s = arm(
        &library,
        &state,
        Action::Create {
            request: Box::new(request()),
            album: Some(album()),
        },
    );
    decide(&library, &state, &s, true).unwrap();
    assert!(decide(&library, &state, &s, true).is_err());
    let items = host::with_library(&library, |s| s.list(query())).unwrap();
    assert_eq!(items.copies.len(), 1);
    assert_eq!(
        host::with_library(&library, |s| s.supplement(&items.copies[0].edition_id))
            .unwrap()
            .unwrap()
            .description,
        "new intro"
    );
}
#[test]
fn expired_or_restart_preview_cannot_write_but_can_be_cancelled() {
    let library = library();
    let state = AgentState::default();
    let s = arm(
        &library,
        &state,
        Action::Create {
            request: Box::new(request()),
            album: None,
        },
    );
    state.prepared.lock().unwrap().as_mut().unwrap().created =
        Instant::now() - Duration::from_secs(1801);
    assert!(decide(&library, &state, &s, true).is_err());
    *state.prepared.lock().unwrap() = None;
    assert!(decide(&library, &state, &s, true).is_err());
    decide(&library, &state, &s, false).unwrap();
    assert!(host::with_library(&library, |s| s.list(query()))
        .unwrap()
        .copies
        .is_empty());
}
#[test]
fn supplement_conflict_keeps_newer_data_and_cancel_is_read_only() {
    let library = library();
    let state = AgentState::default();
    host::with_library(&library, |s| s.create(request())).unwrap();
    let item = host::with_library(&library, |s| s.list(query()))
        .unwrap()
        .copies
        .remove(0);
    let s = arm(
        &library,
        &state,
        Action::Supplement {
            edition: item.edition_id.clone(),
            revision: item.edition_revision,
            album: album(),
        },
    );
    decide(&library, &state, &s, false).unwrap();
    assert!(
        host::with_library(&library, |s| s.supplement(&item.edition_id))
            .unwrap()
            .is_none()
    );
    let s = arm(
        &library,
        &state,
        Action::Supplement {
            edition: item.edition_id.clone(),
            revision: item.edition_revision,
            album: album(),
        },
    );
    let mut newer = album();
    newer.description = "user edit".into();
    host::with_library(&library, |s| {
        s.save_supplement(&item.edition_id, item.edition_revision, &newer)
    })
    .unwrap();
    assert!(decide(&library, &state, &s, true).is_err());
    assert_eq!(
        host::with_library(&library, |s| s.supplement(&item.edition_id))
            .unwrap()
            .unwrap()
            .description,
        "user edit"
    );
}
#[test]
fn cover_confirmation_preserves_edition_and_refuses_stale_revision() {
    let library = library();
    let state = AgentState::default();
    host::with_library(&library, |s| s.create(request())).unwrap();
    let item = host::with_library(&library, |s| s.list(query()))
        .unwrap()
        .copies
        .remove(0);
    let request = UpdateEdition {
        request_id: uuid::Uuid::new_v4().to_string(),
        edition_id: item.edition_id,
        expected_revision: item.edition_revision,
        edition: item.edition,
        cover: CoverChange::Replace {
            data_url: format!(
                "data:image/png;base64,{}",
                base64::engine::general_purpose::STANDARD
                    .encode(include_bytes!("../../icons/32x32.png"))
            ),
        },
        model: ModelChange::Keep,
    };
    let s = arm(&library, &state, Action::Cover(request.clone()));
    assert!(host::with_library(&library, |s| s.list(query()))
        .unwrap()
        .copies[0]
        .cover_asset_id
        .is_none());
    decide(&library, &state, &s, true).unwrap();
    let saved = host::with_library(&library, |s| s.list(query()))
        .unwrap()
        .copies
        .remove(0);
    assert!(saved.cover_asset_id.is_some());
    assert_eq!(saved.edition.title, "Fixture");
    assert_eq!(saved.copy.status, "wanted");
    let mut stale = request;
    stale.request_id = uuid::Uuid::new_v4().to_string();
    let s = arm(&library, &state, Action::Cover(stale));
    assert!(decide(&library, &state, &s, true).is_err());
}
