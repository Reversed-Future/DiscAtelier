use discatelier_application::LibraryService;
use discatelier_contracts::{CreateCopy, LibraryQuery};
use discatelier_domain::{CopyDraft, EditionDraft, MediumDraft};
use discatelier_storage::SqliteLibrary;
use uuid::Uuid;

fn draft(title: &str, creator: &str) -> CreateCopy {
    CreateCopy {
        request_id: Uuid::new_v4().to_string(),
        existing_edition_id: None,
        cover: None,
        model: None,
        model_token: None,
        edition: Some(EditionDraft {
            category_id: "music".into(),
            title: title.into(),
            creator: creator.into(),
            edition_label: "Japan · Limited".into(),
            barcode: Uuid::new_v4().to_string(),
            catalog_number: "CAT-1".into(),
            media: vec![MediumDraft {
                carrier_id: "cd".into(),
                label: "CD · Stereo".into(),
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

fn query(text: &str) -> LibraryQuery {
    LibraryQuery {
        category_id: "music".into(),
        status: None,
        query: text.into(),
    }
}

#[test]
fn library_search_is_case_aware_for_chinese_and_fuzzy() {
    let dir = tempfile::Builder::new()
        .prefix("discatelier-search-")
        .tempdir()
        .unwrap();
    let mut service = LibraryService::new(SqliteLibrary::open(dir.path()).unwrap());
    service.create(draft("陳奕迅", "陳奕迅")).unwrap();
    service.create(draft("Lemon", "米津玄師")).unwrap();
    service.create(draft("Hello World", "Someone")).unwrap();
    service.create(draft("Other", "Nobody")).unwrap();

    let titles = |text: &str| {
        service
            .list(query(text))
            .unwrap()
            .copies
            .into_iter()
            .map(|copy| copy.edition.title)
            .collect::<Vec<_>>()
    };

    assert_eq!(titles("陈奕迅"), vec!["陳奕迅"]);
    assert_eq!(titles("陳奕迅"), vec!["陳奕迅"]);
    assert_eq!(titles("lem"), vec!["Lemon"]);
    assert_eq!(titles("LEMON"), vec!["Lemon"]);
    assert_eq!(titles("helo"), vec!["Hello World"]);
    assert_eq!(titles("lemon 米津"), vec!["Lemon"]);
    assert!(titles("zzzz").is_empty());
}
