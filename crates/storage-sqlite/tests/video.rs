use discatelier_application::LibraryService;
use discatelier_contracts::*;
use discatelier_storage::SqliteLibrary;
use rusqlite::Connection;
use serde_json::{json, to_value};
fn directory() -> std::path::PathBuf {
    tempfile::Builder::new()
        .prefix("discatelier-video-")
        .tempdir()
        .unwrap()
        .keep()
}
fn query() -> LibraryQuery {
    LibraryQuery {
        category_id: "video".into(),
        query: String::new(),
        status: None,
    }
}
fn request() -> CreateCopy {
    serde_json::from_value(json!({"requestId":uuid::Uuid::new_v4().to_string(),"edition":{"categoryId":"video","title":"实体 第1卷","creator":"","editionLabel":"初回版","barcode":"123","catalogNumber":"BD-001","media":[{"carrierId":"bd","label":"第1–2集"}]},"existingEditionId":null,"copy":{"status":"owned","acquiredAt":"2020-01-01","amountMinor":12000,"currency":"JPY","seller":"保留商店","purchaseUrl":"","storageLocation":"书架","notes":"保留备注"}})).unwrap()
}
fn metadata() -> VideoMetadata {
    serde_json::from_value(json!({"work":{"source":"bangumi","externalId":311,"title":"作品","originalTitle":"原名","summary":"作品简介","premiereDate":"2010-01-01","posterUrl":"","episodeCount":12,"genres":["动画"],"people":[{"name":"人员","role":"导演"}]},"physical":{"territory":"日本","releaseDate":"2011-02-03","volume":"第1卷","includedContent":"第1–2集","packaging":"附小册子"}})).unwrap()
}
#[test]
fn video_create_is_atomic_idempotent_and_does_not_replace_physical_fields() {
    let dir = directory();
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    let r = request();
    let encoded = to_value(&r).unwrap();
    let id = service.create_video(r, metadata()).unwrap();
    assert_eq!(
        service
            .create_video(serde_json::from_value(encoded.clone()).unwrap(), metadata())
            .unwrap(),
        id
    );
    let mut changed = metadata();
    changed.physical.volume = "不同卷".into();
    assert!(service
        .create_video(serde_json::from_value(encoded).unwrap(), changed)
        .is_err());
    let item = service.list(query()).unwrap().copies.remove(0);
    assert_eq!(item.edition.title, "实体 第1卷");
    assert_eq!(item.edition.media.len(), 1);
    assert!(item.cover_asset_id.is_none());
    let stored = service.video_metadata(&item.edition_id).unwrap().unwrap();
    assert_eq!(stored.work.unwrap().episode_count, Some(12));
    assert_eq!(stored.physical.included_content, "第1–2集");
    let mut bad = request();
    bad.cover = Some("not an image".into());
    assert!(service.create_video(bad, metadata()).is_err());
    assert_eq!(service.list(query()).unwrap().copies.len(), 1);
}
#[test]
fn attach_existing_edit_conflict_and_restore_preserve_purchase_data() {
    let dir = directory();
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    service.create(request()).unwrap();
    let item = service.list(query()).unwrap().copies.remove(0);
    assert!(service.video_metadata(&item.edition_id).unwrap().is_none());
    let update = UpdateEdition {
        request_id: uuid::Uuid::new_v4().to_string(),
        edition_id: item.edition_id.clone(),
        expected_revision: item.edition_revision,
        edition: item.edition.clone(),
        cover: CoverChange::Keep,
        model: ModelChange::Keep,
    };
    let encoded = to_value(&update).unwrap();
    service.update_video(update, metadata()).unwrap();
    assert!(service
        .update_video(
            UpdateEdition {
                request_id: uuid::Uuid::new_v4().to_string(),
                ..serde_json::from_value(encoded).unwrap()
            },
            metadata()
        )
        .is_err());
    let after = service.list(query()).unwrap().copies.remove(0);
    assert_eq!(to_value(item.copy).unwrap(), to_value(after.copy).unwrap());
    let backup = service.backup().unwrap();
    drop(service);
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    let preview = service.prepare_restore(backup).unwrap();
    service.restore(preview.token).unwrap();
    assert_eq!(
        to_value(service.video_metadata(&item.edition_id).unwrap().unwrap()).unwrap(),
        to_value(metadata()).unwrap()
    );
}
#[test]
fn schema_ten_gets_backup_and_existing_collection_is_unchanged() {
    let dir = directory();
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    service.create(request()).unwrap();
    let before = service.list(query()).unwrap().copies.remove(0);
    drop(service);
    let conn = Connection::open(dir.join("library.sqlite3")).unwrap();
    conn.execute_batch("DROP TABLE optical_bindings; DROP TABLE collection_order; DROP TABLE video_edition_parts; DROP TABLE video_edition_details; DROP TABLE video_work_metadata; DELETE FROM schema_migrations WHERE version>=11; PRAGMA user_version=10;").unwrap();
    drop(conn);
    let service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    let after = service.list(query()).unwrap().copies.remove(0);
    assert_eq!(to_value(before).unwrap(), to_value(after).unwrap());
    let backups = service.backups().unwrap();
    assert_eq!(backups.len(), 1);
    let old = Connection::open(&backups[0].path).unwrap();
    assert_eq!(
        old.pragma_query_value::<i64, _>(None, "user_version", |r| r.get(0))
            .unwrap(),
        10
    );
    assert_eq!(
        old.query_row("SELECT count(*) FROM copies", [], |r| r.get::<_, i64>(0))
            .unwrap(),
        1
    );
}
#[test]
fn extended_work_fields_roundtrip_restore_and_legacy_defaults() {
    let legacy = metadata();
    assert!(legacy.work.as_ref().unwrap().facts.is_empty());
    assert!(legacy.work.as_ref().unwrap().chapters.is_none());
    assert!(legacy.work.as_ref().unwrap().characters.is_empty());
    let old_character = json!({"name":"春日野穹","role":"主角","actors":["田口宏子"],"portraitUrl":"https://lain.bgm.tv/pic/crt/l/2c/78/1152_crt_Unim8.jpg"});
    let decoded: VideoCharacter = serde_json::from_value(old_character.clone()).unwrap();
    assert!(decoded.facts.is_empty());
    assert!(decoded.actor_portraits.is_empty());
    assert_eq!(to_value(decoded).unwrap(), old_character);
    let old_chapter = json!({"id":52323,"group":"本篇","number":"1","title":"悠远的记忆","originalTitle":"ハルカナキオク","airDate":"2010-10-04","duration":"00:26:00"});
    let decoded: VideoChapter = serde_json::from_value(old_chapter.clone()).unwrap();
    assert!(decoded.episode_kind.is_none());
    assert!(decoded.season_number.is_none());
    assert_eq!(to_value(decoded).unwrap(), old_chapter);
    let mut extended = legacy.clone();
    let work = extended.work.as_mut().unwrap();
    work.facts = vec![VideoFact {
        label: "别名".into(),
        values: vec![
            VideoFactValue {
                text: "Yosuga no Sora".into(),
                url: String::new(),
            },
            VideoFactValue {
                text: "緣之空".into(),
                url: String::new(),
            },
        ],
    }];
    work.characters = vec![VideoCharacter {
        avatar: String::new(),
        portrait_url: "https://lain.bgm.tv/pic/crt/l/2c/78/1152_crt_Unim8.jpg".into(),
        name: "春日野穹".into(),
        role: "主角".into(),
        actors: vec!["田口宏子".into()],
        facts: vec![VideoFact {
            label: "身高".into(),
            values: vec![VideoFactValue {
                text: "152cm".into(),
                url: String::new(),
            }],
        }],
        actor_portraits: vec![VideoActorPortrait {
            name: "田口宏子".into(),
            portrait_url: "https://lain.bgm.tv/pic/crt/l/8c/3a/5020_prsn_tP7Ll.jpg?r=1636505739"
                .into(),
        }],
    }];
    work.chapters = Some(vec![VideoChapter {
        episode_kind: Some(0),
        season_number: None,
        id: 52323,
        group: "本篇".into(),
        number: "1".into(),
        title: "悠远的记忆".into(),
        original_title: "ハルカナキオク".into(),
        air_date: "2010-10-04".into(),
        duration: "00:26:00".into(),
        summary: String::new(),
        image_url: String::new(),
    }]);
    let dir = directory();
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    service.create_video(request(), extended.clone()).unwrap();
    let before = service.list(query()).unwrap().copies.remove(0);
    let backup = service.backup().unwrap();
    drop(service);
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    assert_eq!(
        to_value(service.video_metadata(&before.edition_id).unwrap().unwrap()).unwrap(),
        to_value(&extended).unwrap()
    );
    let preview = service.prepare_restore(backup).unwrap();
    service.restore(preview.token).unwrap();
    let after = service.list(query()).unwrap().copies.remove(0);
    assert_eq!(to_value(&before).unwrap(), to_value(after).unwrap());
    assert_eq!(
        to_value(service.video_metadata(&before.edition_id).unwrap().unwrap()).unwrap(),
        to_value(extended).unwrap()
    );
}

#[test]
fn merging_sources_keeps_legacy_work_purchase_and_gallery_through_restore() {
    let dir = directory();
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    let old = metadata();
    service.create_video(request(), old.clone()).unwrap();
    let before = service.list(query()).unwrap().copies.remove(0);
    let conn = Connection::open(dir.join("library.sqlite3")).unwrap();
    let payload: String = conn
        .query_row("SELECT payload FROM video_work_metadata", [], |r| r.get(0))
        .unwrap();
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&payload).unwrap(),
        to_value(&old.work).unwrap()
    );
    drop(conn);
    let mut merged = old.clone();
    let mut tmdb = old.work.as_ref().unwrap().clone();
    tmdb.source = VideoSource::TmdbTv;
    tmdb.summary = "TMDB 的另一份简介".into();
    tmdb.chapters = Some(vec![VideoChapter {
        episode_kind: None,
        season_number: Some(1),
        id: 63056,
        group: "第一季".into(),
        number: "1".into(),
        title: "第一集".into(),
        original_title: "Episode 1".into(),
        air_date: "2011-04-17".into(),
        duration: "62 分钟".into(),
        summary: "单集简介".into(),
        image_url: "https://image.tmdb.org/t/p/w500/9hGF3WUkBf7cSjMg0cdMDHJkByd.jpg".into(),
    }]);
    tmdb.images = Some(vec![VideoImage {
        kind: VideoImageKind::Poster,
        url: "https://image.tmdb.org/t/p/original/poster.jpg".into(),
        preview_url: "https://image.tmdb.org/t/p/w500/poster.jpg".into(),
        width: 500,
        height: 750,
        language: "ja".into(),
    }]);
    merged.additional_works.push(tmdb);
    let update = UpdateEdition {
        request_id: uuid::Uuid::new_v4().to_string(),
        edition_id: before.edition_id.clone(),
        expected_revision: before.edition_revision,
        edition: before.edition.clone(),
        cover: CoverChange::Keep,
        model: ModelChange::Keep,
    };
    let encoded = to_value(&update).unwrap();
    service.update_video(update, merged.clone()).unwrap();
    let stored = service.video_metadata(&before.edition_id).unwrap().unwrap();
    assert_eq!(to_value(&stored).unwrap(), to_value(&merged).unwrap());
    assert_eq!(
        to_value(&stored.work).unwrap(),
        to_value(&old.work).unwrap()
    );
    assert!(service
        .update_video(
            UpdateEdition {
                request_id: uuid::Uuid::new_v4().to_string(),
                ..serde_json::from_value(encoded).unwrap()
            },
            old.clone()
        )
        .is_err());
    let after = service.list(query()).unwrap().copies.remove(0);
    assert_eq!(
        to_value(&before.copy).unwrap(),
        to_value(&after.copy).unwrap()
    );
    assert_eq!(
        to_value(&before.edition).unwrap(),
        to_value(&after.edition).unwrap()
    );
    assert_eq!(before.cover_asset_id, after.cover_asset_id);
    let backup = service.backup().unwrap();
    drop(service);
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    let restore = service.prepare_restore(backup).unwrap();
    service.restore(restore.token).unwrap();
    assert_eq!(
        to_value(service.video_metadata(&before.edition_id).unwrap().unwrap()).unwrap(),
        to_value(&merged).unwrap()
    );
}

#[test]
fn source_validation_rejects_duplicates_or_orphans_and_keeps_old_serialization() {
    let old = metadata();
    assert!(!to_value(&old)
        .unwrap()
        .as_object()
        .unwrap()
        .contains_key("additionalWorks"));
    let mut bad = old.clone();
    bad.additional_works.push(old.work.clone().unwrap());
    assert!(validate_video(&bad).is_err());
    bad.work = None;
    assert!(validate_video(&bad).is_err());
    let mut valid = old.clone();
    let mut additional = old.work.unwrap();
    additional.source = VideoSource::TmdbTv;
    valid.additional_works.push(additional);
    assert!(validate_video(&valid).is_ok());
}
#[test]
fn parts_are_explicit_and_preserved_with_purchase_through_restore() {
    let dir = directory();
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    let mut value = metadata();
    let mut back = value.work.clone().unwrap();
    back.external_id = 312;
    back.title = "后编".into();
    value.additional_works.push(back);
    value.parts = serde_json::from_value(json!([
      {"id":"front","label":"前编","sourceKeys":["bangumi:311"],"coverSourceKey":"bangumi:311"},
      {"id":"back","label":"后编","sourceKeys":["bangumi:312"],"coverSourceKey":"bangumi:312"}
    ]))
    .unwrap();
    service.create_video(request(), value.clone()).unwrap();
    let item = service.list(query()).unwrap().copies.remove(0);
    assert_eq!(service.list(query()).unwrap().copies.len(), 1);
    let backup = service.backup().unwrap();
    let mut invalid = value.clone();
    invalid.parts[1].source_keys = vec!["bangumi:311".into()];
    let update = UpdateEdition {
        request_id: uuid::Uuid::new_v4().to_string(),
        edition_id: item.edition_id.clone(),
        expected_revision: item.edition_revision,
        edition: item.edition.clone(),
        cover: CoverChange::Keep,
        model: ModelChange::Keep,
    };
    assert!(service.update_video(update, invalid).is_err());
    drop(service);
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    let restore = service.prepare_restore(backup).unwrap();
    service.restore(restore.token).unwrap();
    assert_eq!(
        to_value(service.video_metadata(&item.edition_id).unwrap().unwrap()).unwrap(),
        to_value(value).unwrap()
    );
    assert_eq!(
        to_value(service.list(query()).unwrap().copies[0].copy.clone()).unwrap(),
        to_value(item.copy).unwrap()
    );
}

#[test]
fn schema_eleven_migrates_with_backup_and_no_automatic_parts() {
    let dir = directory();
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    service.create_video(request(), metadata()).unwrap();
    let before = service.list(query()).unwrap().copies.remove(0);
    drop(service);
    let connection = Connection::open(dir.join("library.sqlite3")).unwrap();
    connection.execute_batch("DROP TABLE optical_bindings; DROP TABLE collection_order; DROP TABLE video_edition_parts; DELETE FROM schema_migrations WHERE version>=12; PRAGMA user_version=11;").unwrap();
    drop(connection);
    let service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    assert!(service
        .video_metadata(&before.edition_id)
        .unwrap()
        .unwrap()
        .parts
        .is_empty());
    assert_eq!(
        to_value(service.list(query()).unwrap().copies.remove(0)).unwrap(),
        to_value(before).unwrap()
    );
    let backups = service.backups().unwrap();
    assert_eq!(backups.len(), 1);
    let old = Connection::open(&backups[0].path).unwrap();
    assert_eq!(
        old.pragma_query_value::<i64, _>(None, "user_version", |row| row.get(0))
            .unwrap(),
        11
    );
}
