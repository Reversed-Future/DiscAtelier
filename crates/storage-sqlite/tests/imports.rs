use discatelier_application::LibraryService;
use discatelier_contracts::*;
use discatelier_domain::*;
use discatelier_storage::SqliteLibrary;
use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};
use uuid::Uuid;

fn directory() -> std::path::PathBuf {
    tempfile::Builder::new()
        .prefix("discatelier-import-")
        .tempdir()
        .unwrap()
        .keep()
}
fn query(text: &str) -> LibraryQuery {
    LibraryQuery {
        category_id: "music".into(),
        status: None,
        query: text.into(),
    }
}
fn request() -> ImportCopy {
    ImportCopy {
        supplement: None,
        content: EditionContent::default(),
        request: ImportCopyRequest {
            netease_album_id: None,
            request_id: Uuid::new_v4().to_string(),
            token: Uuid::new_v4().to_string(),
            edition: EditionDraft {
                category_id: "music".into(),
                title: "Import test".into(),
                creator: "Artist".into(),
                edition_label: "JP 2020-00-00".into(),
                barcode: "000123".into(),
                catalog_number: "Ab-01".into(),
                media: vec![
                    MediumDraft {
                        carrier_id: "cd".into(),
                        label: "Disc 1".into(),
                    },
                    MediumDraft {
                        carrier_id: "bd".into(),
                        label: "Video".into(),
                    },
                ],
            },
            copy: CopyDraft {
                status: "owned".into(),
                acquired_at: "".into(),
                amount_minor: Some(1200),
                currency: "CNY".into(),
                seller: "Shop A".into(),
                purchase_url: "".into(),
                storage_location: "".into(),
                notes: "".into(),
            },
            model: None,
            model_token: None,
            cover: None,
            existing_edition_id: None,
            expected_revision: None,
        },
        source: EditionSource {
            provider_id: "discogs".into(),
            external_id: "249504".into(),
            fetched_at: "2026-10-20T00:00:00Z".into(),
        },
        identifiers: vec![
            ImportedIdentifier {
                namespace: "identifier".into(),
                kind: "Barcode".into(),
                value: "000123".into(),
                description: "".into(),
            },
            ImportedIdentifier {
                namespace: "identifier".into(),
                kind: "Barcode".into(),
                value: "0 00123".into(),
                description: "Text".into(),
            },
            ImportedIdentifier {
                namespace: "catalog".into(),
                kind: "Second label".into(),
                value: "bB-02".into(),
                description: "".into(),
            },
        ],
    }
}

fn contents() -> EditionContent {
    serde_json::from_str(r#"{"genres":["Rock"],"styles":["J-Rock"],"tracks":[{"position":"CD-1","title":"First","type_":"track"},{"position":"","title":"Live title","type_":"heading"},{"position":"DVD-1","title":"Suite","type_":"index","sub_tracks":[{"position":"1.1","title":"Movement"}]}]}"#).unwrap()
}

fn import_with_music() -> ImportCopy {
    let mut value = request();
    value.request.netease_album_id = Some(42);
    value.supplement = Some(MusicSupplement {
        album_id: 42,
        title: "Album".into(),
        artists: vec!["Artist".into()],
        description: "Introduction".into(),
        company: "Label".into(),
        published_at: 1,
        tracks: vec![],
        links: vec![],
    });
    value
}
#[test]
fn netease_choice_commits_with_import_is_idempotent_and_survives_restore() {
    let dir = directory();
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    let value = import_with_music();
    let id = service.import_copy(value.clone()).unwrap();
    assert_eq!(service.import_copy(value).unwrap(), id);
    let item = service.source_copy("discogs", "249504").unwrap().unwrap();
    assert_eq!(
        service
            .supplement(&item.edition_id)
            .unwrap()
            .unwrap()
            .description,
        "Introduction"
    );
    assert_eq!(service.list(query("")).unwrap().copies.len(), 1);
    let backup = service.backup().unwrap();
    let prepared = service.prepare_restore(backup).unwrap();
    service.restore(prepared.token).unwrap();
    assert_eq!(
        service
            .supplement(&item.edition_id)
            .unwrap()
            .unwrap()
            .album_id,
        42
    );
}
#[test]
fn failed_supplement_insert_rolls_back_the_entire_collection_import() {
    let dir = directory();
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    let connection = Connection::open(dir.join("library.sqlite3")).unwrap();
    connection.execute_batch("CREATE TRIGGER reject_test_supplement BEFORE INSERT ON edition_supplements BEGIN SELECT RAISE(ABORT,'fixture'); END;").unwrap();
    assert!(service.import_copy(import_with_music()).is_err());
    assert!(service.list(query("")).unwrap().copies.is_empty());
    assert!(service.source_copy("discogs", "249504").unwrap().is_none());
}
#[test]
fn import_refuses_a_different_album_than_the_confirmed_choice() {
    let mut service = LibraryService::new(SqliteLibrary::open(&directory()).unwrap());
    let mut value = import_with_music();
    value.request.netease_album_id = Some(43);
    assert!(service.import_copy(value).is_err());
    assert!(service.list(query("")).unwrap().copies.is_empty());
}

#[test]
fn contents_survive_import_edit_restart_and_backup_restore() {
    let dir = directory();
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    let mut value = request();
    value.content = contents();
    let expected = serde_json::to_value(&value.content).unwrap();
    service.import_copy(value).unwrap();
    let item = service.source_copy("discogs", "249504").unwrap().unwrap();
    let mut edition = item.edition.clone();
    edition.title = "Edited locally".into();
    service
        .update_edition(UpdateEdition {
            request_id: Uuid::new_v4().to_string(),
            edition_id: item.edition_id.clone(),
            expected_revision: item.edition_revision,
            edition,
            cover: CoverChange::Keep,
            model: Default::default(),
        })
        .unwrap();
    let backup = service.backup().unwrap();
    drop(service);
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    assert_eq!(
        serde_json::to_value(service.edition_content(&item.edition_id).unwrap().unwrap()).unwrap(),
        expected
    );
    let preview = service.prepare_restore(backup.clone()).unwrap();
    service.restore(preview.token).unwrap();
    assert_eq!(
        serde_json::to_value(service.edition_content(&item.edition_id).unwrap().unwrap()).unwrap(),
        expected
    );
    assert_eq!(
        service
            .source_copy("discogs", "249504")
            .unwrap()
            .unwrap()
            .edition
            .title,
        "Edited locally"
    );
    let conn = Connection::open(backup.clone()).unwrap();
    conn.execute("UPDATE edition_content SET content_json='{}'", [])
        .unwrap();
    assert!(service.prepare_restore(backup).is_err());
}

#[test]
fn old_collection_completion_checks_source_and_never_overwrites_personal_fields() {
    let dir = directory();
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    service.import_copy(request()).unwrap();
    let item = service.source_copy("discogs", "249504").unwrap().unwrap();
    // Simulate a pre-v6 record, which has no edition contents row.
    let conn = Connection::open(dir.join("library.sqlite3")).unwrap();
    conn.execute(
        "DELETE FROM edition_content WHERE edition_id=?1",
        [&item.edition_id],
    )
    .unwrap();
    let mut source = item.source.clone().unwrap();
    source.external_id = "249505".into();
    assert!(service
        .complete_content(&item.edition_id, &source, &contents())
        .is_err());
    assert!(service.edition_content(&item.edition_id).unwrap().is_none());
    service
        .complete_content(&item.edition_id, item.source.as_ref().unwrap(), &contents())
        .unwrap();
    service
        .complete_content(
            &item.edition_id,
            item.source.as_ref().unwrap(),
            &EditionContent::default(),
        )
        .unwrap();
    assert_eq!(
        service
            .edition_content(&item.edition_id)
            .unwrap()
            .unwrap()
            .tracks
            .len(),
        3
    );
    let after = service.source_copy("discogs", "249504").unwrap().unwrap();
    assert_eq!(
        serde_json::to_value(&after).unwrap(),
        serde_json::to_value(&item).unwrap()
    );
}

#[test]
fn schema_five_upgrade_backs_up_existing_collection_before_adding_contents() {
    let dir = directory();
    let conn = Connection::open(dir.join("library.sqlite3")).unwrap();
    conn.execute_batch(
        "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, checksum TEXT NOT NULL);",
    )
    .unwrap();
    for (index, sql) in [
        include_str!("../migrations/001_library.sql"),
        include_str!("../migrations/002_edition_assets.sql"),
        include_str!("../migrations/003_sources.sql"),
        include_str!("../migrations/004_models.sql"),
        include_str!("../migrations/005_playback.sql"),
    ]
    .iter()
    .enumerate()
    {
        conn.execute_batch(sql).unwrap();
        conn.execute(
            "INSERT INTO schema_migrations VALUES (?1,?2)",
            params![
                (index + 1) as i64,
                format!("{:x}", Sha256::digest(sql.as_bytes()))
            ],
        )
        .unwrap();
    }
    conn.pragma_update(None, "user_version", 5).unwrap();
    drop(conn);
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    let backups = service.backups().unwrap();
    assert_eq!(backups.len(), 1);
    let old = Connection::open(&backups[0].path).unwrap();
    assert_eq!(
        old.pragma_query_value::<i64, _>(None, "user_version", |row| row.get(0))
            .unwrap(),
        5
    );
    service.import_copy(request()).unwrap();
    let preview = service.prepare_restore(backups[0].path.clone()).unwrap();
    service.restore(preview.token).unwrap();
    assert!(service.list(query("")).unwrap().copies.is_empty());
}

#[test]
fn import_is_atomic_idempotent_and_reuses_only_the_same_release() {
    let dir = directory();
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    let first = request();
    let id = service.import_copy(first.clone()).unwrap();
    assert_eq!(service.import_copy(first.clone()).unwrap(), id);
    assert_eq!(service.list(query("0 00123")).unwrap().copies.len(), 1);
    assert_eq!(service.list(query("bB-02")).unwrap().copies.len(), 1);
    assert_eq!(service.list(query("BB-02")).unwrap().copies.len(), 0);
    let existing = service.source_copy("discogs", "249504").unwrap().unwrap();
    let mut duplicate = first.clone();
    duplicate.request.request_id = Uuid::new_v4().to_string();
    // A parallel new-version preview cannot silently turn into a second copy.
    assert_eq!(
        service.import_copy(duplicate.clone()).unwrap_err().code,
        "conflict"
    );
    duplicate.request.existing_edition_id = Some(existing.edition_id.clone());
    duplicate.request.expected_revision = Some(existing.edition_revision);
    duplicate.request.copy.amount_minor = Some(2300);
    duplicate.request.copy.seller = "Shop B".into();
    // Duplicate import must never overwrite locally edited edition fields.
    duplicate.request.edition.title = "Must not replace the shared title".into();
    service.import_copy(duplicate).unwrap();
    let copies = service.list(query("")).unwrap();
    assert_eq!(copies.copies.len(), 2);
    assert_eq!(copies.medium_count, 4);
    assert_eq!(copies.amounts["CNY"], "3500");
    assert!(copies
        .copies
        .iter()
        .all(|item| item.edition_id == existing.edition_id && item.edition.title == "Import test"));
    let mut different = request();
    different.source.external_id = "249505".into();
    service.import_copy(different).unwrap();
    let other = service.source_copy("discogs", "249505").unwrap().unwrap();
    assert_ne!(other.edition_id, existing.edition_id);
    drop(service);
    let service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    assert_eq!(service.list(query("")).unwrap().copies.len(), 3);
    assert_eq!(
        service
            .source_copy("discogs", "249504")
            .unwrap()
            .unwrap()
            .source
            .unwrap()
            .fetched_at,
        "2026-10-20T00:00:00Z"
    );
}

#[test]
fn invalid_import_rolls_back_and_shared_revision_conflicts_are_rejected() {
    let dir = directory();
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    let mut invalid = request();
    invalid.request.cover = Some("data:image/png;base64,AAAA".into());
    assert!(service.import_copy(invalid).is_err());
    assert!(service.source_copy("discogs", "249504").unwrap().is_none());
    assert!(service.list(query("")).unwrap().copies.is_empty());
    let mut invalid = request();
    invalid.request.edition.media[0].carrier_id.clear();
    assert!(service.import_copy(invalid).is_err());
    service.import_copy(request()).unwrap();
    let existing = service.source_copy("discogs", "249504").unwrap().unwrap();
    service
        .update_edition(UpdateEdition {
            request_id: Uuid::new_v4().to_string(),
            edition_id: existing.edition_id.clone(),
            expected_revision: existing.edition_revision,
            edition: existing.edition.clone(),
            model: Default::default(),
            cover: CoverChange::Keep,
        })
        .unwrap();
    let mut stale = request();
    stale.request.existing_edition_id = Some(existing.edition_id);
    stale.request.expected_revision = Some(existing.edition_revision);
    assert_eq!(service.import_copy(stale).unwrap_err().code, "conflict");
    assert_eq!(service.list(query("")).unwrap().copies.len(), 1);
}

#[test]
fn restore_preserves_source_identity_and_rejects_invalid_source_records() {
    let dir = directory();
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    service.import_copy(request()).unwrap();
    let backup = service.backup().unwrap();
    let preview = service.prepare_restore(backup.clone()).unwrap();
    service.restore(preview.token).unwrap();
    assert_eq!(service.list(query("bB-02")).unwrap().copies.len(), 1);
    assert!(service.source_copy("discogs", "249504").unwrap().is_some());
    let conn = Connection::open(&backup).unwrap();
    conn.execute(
        "UPDATE edition_sources SET fetched_at=?1",
        params!["broken"],
    )
    .unwrap();
    assert!(service.prepare_restore(backup).is_err());
    assert_eq!(service.list(query("")).unwrap().copies.len(), 1);
}

#[test]
fn schema_two_is_backed_up_before_source_migration() {
    let dir = directory();
    let conn = Connection::open(dir.join("library.sqlite3")).unwrap();
    conn.execute_batch(
        "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, checksum TEXT NOT NULL);",
    )
    .unwrap();
    for (index, sql) in [
        include_str!("../migrations/001_library.sql"),
        include_str!("../migrations/002_edition_assets.sql"),
    ]
    .iter()
    .enumerate()
    {
        conn.execute_batch(sql).unwrap();
        conn.execute(
            "INSERT INTO schema_migrations VALUES (?1,?2)",
            params![
                (index + 1) as i64,
                format!("{:x}", Sha256::digest(sql.as_bytes()))
            ],
        )
        .unwrap();
    }
    conn.pragma_update(None, "user_version", 2).unwrap();
    drop(conn);
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    service.import_copy(request()).unwrap();
    let backups = service.backups().unwrap();
    assert_eq!(backups.len(), 1);
    let backup = Connection::open(&backups[0].path).unwrap();
    assert_eq!(
        backup
            .pragma_query_value::<i64, _>(None, "user_version", |row| row.get(0))
            .unwrap(),
        2
    );
    assert_eq!(service.list(query("")).unwrap().copies.len(), 1);
    let preview = service.prepare_restore(backups[0].path.clone()).unwrap();
    assert_eq!(preview.copies, 0);
    service.restore(preview.token).unwrap();
    service.import_copy(request()).unwrap();
    assert_eq!(service.list(query("")).unwrap().copies.len(), 1);
}
#[test]
fn enrich_old_details_preserves_track_order_and_survives_restore() {
    let dir = directory();
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    let mut imported = request();
    imported.content = contents();
    service.import_copy(imported).unwrap();
    let item = service.source_copy("discogs", "249504").unwrap().unwrap();
    let mut new = contents();
    new.details_loaded = true;
    new.notes = "Original release notes".into();
    new.credits = vec![ReleaseCredit {
        name: "Artist".into(),
        role: "Producer".into(),
        ..Default::default()
    }];
    new.companies = vec![ReleaseCompany {
        name: "Studio".into(),
        entity_type_name: "Recorded At".into(),
        catno: String::new(),
    }];
    new.tracks[0].extraartists = new.credits.clone();
    new.tracks.reverse();
    service
        .complete_content(&item.edition_id, item.source.as_ref().unwrap(), &new)
        .unwrap();
    let saved = service.edition_content(&item.edition_id).unwrap().unwrap();
    assert_eq!(saved.tracks[0].title, "First");
    assert_eq!(saved.tracks[0].extraartists[0].role, "Producer");
    assert_eq!(saved.companies[0].name, "Studio");
    assert!(saved.details_loaded);
    let expected = serde_json::to_value(&saved).unwrap();
    let backup = service.backup().unwrap();
    let preview = service.prepare_restore(backup).unwrap();
    service.restore(preview.token).unwrap();
    assert_eq!(
        serde_json::to_value(service.edition_content(&item.edition_id).unwrap().unwrap()).unwrap(),
        expected
    );
    assert_eq!(
        service
            .source_copy("discogs", "249504")
            .unwrap()
            .unwrap()
            .edition
            .title,
        item.edition.title
    );
}
