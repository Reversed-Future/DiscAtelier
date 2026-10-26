use discatelier_application::LibraryService;
use discatelier_contracts::{CreateCopy, EditionContent, LibraryQuery, MusicSupplement};
use discatelier_storage::SqliteLibrary;
use rusqlite::{params, Connection};

#[test]
fn old_source_sections_split_without_rewriting_and_keep_previous_album_choice() {
    let dir = tempfile::tempdir().unwrap();
    let mut service = LibraryService::new(SqliteLibrary::open(dir.path()).unwrap());
    let draft: CreateCopy = serde_json::from_value(serde_json::json!({
        "requestId":uuid::Uuid::new_v4().to_string(),"existingEditionId":null,
        "edition":{"categoryId":"music","title":"Source sections","creator":"Artist","editionLabel":"CD + BD","barcode":"","catalogNumber":"","media":[{"carrierId":"cd","label":"CD"},{"carrierId":"bd","label":"BD"}]},
        "copy":{"status":"owned","acquiredAt":"","amountMinor":12300,"currency":"JPY","seller":"Keep seller","purchaseUrl":"","storageLocation":"Shelf","notes":"Keep notes"}
    })).unwrap();
    service.create(draft).unwrap();
    let before = service
        .list(LibraryQuery {
            category_id: "music".into(),
            ..Default::default()
        })
        .unwrap()
        .copies
        .remove(0);
    let edition = &before.edition_id;
    let original = serde_json::json!({"genres":[],"styles":[],"tracks":[
        {"title":"Main","type_":"heading"},{"title":"Opening","position":"opaque-main"},
        {"title":"Live","type_":"heading"},{"title":"Opening","position":"opaque-live"}
    ]})
    .to_string();
    let raw = Connection::open(dir.path().join("library.sqlite3")).unwrap();
    raw.execute(
        "INSERT INTO edition_content VALUES(?1,?2)",
        params![edition, original],
    )
    .unwrap();
    let album: MusicSupplement = serde_json::from_value(serde_json::json!({"albumId":100,"title":"Main","artists":["Artist"],"description":"Keep description","company":"Label","publishedAt":1,"tracks":[{"id":101,"title":"Opening","artists":["Artist"],"disc":"1","number":1,"durationMs":180000}],"links":[]})).unwrap();
    service.save_supplement(edition, 1, &album).unwrap();
    raw.execute(
        "INSERT INTO edition_disc_albums VALUES(?1,'unassigned',100)",
        [edition],
    )
    .unwrap();
    assert_eq!(
        service
            .edition_discs(edition)
            .unwrap()
            .iter()
            .map(|disc| disc.key.as_str())
            .collect::<Vec<_>>(),
        ["section:1", "section:2"]
    );
    let links = service.disc_albums(edition).unwrap();
    assert_eq!(links.len(), 2);
    assert!(links.iter().all(|link| link.album_id == 100));
    let unchanged: String = raw
        .query_row(
            "SELECT content_json FROM edition_content WHERE edition_id=?1",
            [edition],
            |row| row.get(0),
        )
        .unwrap();
    assert_eq!(unchanged, original);
    drop(raw);
    service
        .save_disc_album(edition, 2, "section:2", None)
        .unwrap();
    let links = service.disc_albums(edition).unwrap();
    assert_eq!(links.len(), 1);
    assert_eq!(links[0].disc_key, "section:1");
    assert_eq!(links[0].album_id, 100);

    let mut content = service.edition_content(edition).unwrap().unwrap();
    content.tracks[1].disc_number = Some(1);
    content.tracks[3].disc_number = Some(2);
    content.tracks[2].heading_kind = Some("disc".into());
    service.save_edited_content(edition, &content).unwrap();
    let mut invalid: EditionContent = content.clone();
    invalid.tracks[1].disc_number = Some(0);
    assert!(service.save_edited_content(edition, &invalid).is_err());
    invalid.tracks[1].disc_number = Some(3);
    assert!(service.save_edited_content(edition, &invalid).is_err());
    invalid.tracks[1].disc_number = Some(1);
    invalid.tracks[1].heading_kind = Some("section".into());
    assert!(service.save_edited_content(edition, &invalid).is_err());
    assert_eq!(
        service.edition_content(edition).unwrap().unwrap().tracks[1].position,
        "opaque-main"
    );
    let second_disc = service
        .edition_discs(edition)
        .unwrap()
        .into_iter()
        .find(|disc| disc.label.starts_with("Disc 2."))
        .unwrap()
        .key;
    assert_eq!(service.disc_albums(edition).unwrap()[0].album_id, 100);
    let raw = Connection::open(dir.path().join("library.sqlite3")).unwrap();
    raw.execute(
        "UPDATE edition_disc_albums SET disc_key='manual:1' WHERE edition_id=?1",
        [edition],
    )
    .unwrap();
    drop(raw);
    assert_eq!(
        service.disc_albums(edition).unwrap()[0].disc_key,
        "section:1"
    );
    service
        .save_disc_album(edition, 3, "section:1", None)
        .unwrap();
    assert!(service.disc_albums(edition).unwrap().is_empty());
    service
        .save_optical_disc_binding("synthetic-disc", &before.id, "BD", Some(&second_disc))
        .unwrap();
    let backup = service.backup().unwrap();
    let preview = service.prepare_restore(backup).unwrap();
    service.restore(preview.token).unwrap();
    drop(service);
    let service = LibraryService::new(SqliteLibrary::open(dir.path()).unwrap());
    let restored = service.edition_content(edition).unwrap().unwrap();
    assert_eq!(restored.tracks[1].disc_number, Some(1));
    assert_eq!(restored.tracks[3].disc_number, Some(2));
    assert_eq!(restored.tracks[3].position, "opaque-live");
    assert_eq!(restored.tracks[2].heading_kind.as_deref(), Some("disc"));
    assert_eq!(
        service
            .optical_binding("synthetic-disc")
            .unwrap()
            .unwrap()
            .disc_key
            .as_deref(),
        Some(second_disc.as_str())
    );
    let after = service
        .list(LibraryQuery {
            category_id: "music".into(),
            ..Default::default()
        })
        .unwrap()
        .copies
        .remove(0);
    assert_eq!(
        serde_json::to_value(before.copy).unwrap(),
        serde_json::to_value(after.copy).unwrap()
    );
}
