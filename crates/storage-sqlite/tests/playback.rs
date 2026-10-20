use discatelier_application::LibraryService;
use discatelier_contracts::{PlaybackPhase, PlaybackRecord, PlaybackSource};
use discatelier_storage::SqliteLibrary;

fn record() -> PlaybackRecord {
    PlaybackRecord {
        session_id: "playback-test-session".into(),
        source: PlaybackSource {
            mount_point: "F:".into(),
            media_token: "test-medium".into(),
            playlist: "00000.mpls".into(),
            label: "Test disc".into(),
        },
        title: "Test playback".into(),
        started_at: "2026-10-21T00:00:00Z".into(),
        updated_at: "2026-10-21T00:00:10Z".into(),
        phase: PlaybackPhase::Playing,
        position_seconds: 600.0,
        duration_seconds: Some(1000.0),
        watched_seconds: 10.0,
        completed: false,
        selected_audio: Some(2),
        dvd_title: None,
    }
}

#[test]
fn checkpoints_update_one_session_and_restart_preserves_position() {
    let dir = tempfile::Builder::new()
        .prefix("discatelier-playback-")
        .tempdir()
        .unwrap()
        .keep();
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    let mut row = record();
    service.save_playback(&row).unwrap();
    row.position_seconds = 605.0;
    row.watched_seconds = 15.0;
    service.save_playback(&row).unwrap();
    assert_eq!(service.playback_history().unwrap().len(), 1);
    drop(service);
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    service.interrupt_playback().unwrap();
    let restored = service.playback_history().unwrap().remove(0);
    assert_eq!(restored.phase, PlaybackPhase::Interrupted);
    assert_eq!(restored.position_seconds, 605.0);
    assert_eq!(restored.watched_seconds, 15.0);
    assert_eq!(restored.updated_at, row.updated_at);
    assert_eq!(restored.selected_audio, Some(2));
    assert!(!restored.completed);
    service.interrupt_playback().unwrap();
    assert_eq!(service.playback_history().unwrap().len(), 1);
}

#[test]
fn dvd_title_survives_checkpoint_and_restart() {
    let dir = tempfile::Builder::new()
        .prefix("discatelier-dvd-history-")
        .tempdir()
        .unwrap()
        .keep();
    let mut row = record();
    row.source.playlist = "dvd-menu".into();
    row.dvd_title = Some(2);
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    service.save_playback(&row).unwrap();
    drop(service);
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    service.interrupt_playback().unwrap();
    let restored = service.playback_history().unwrap().remove(0);
    assert_eq!(restored.dvd_title, Some(2));
    assert_eq!(restored.position_seconds, 600.0);
    assert_eq!(restored.phase, PlaybackPhase::Interrupted);
}

#[test]
fn invalid_dvd_title_in_backup_is_rejected() {
    let dir = tempfile::Builder::new()
        .prefix("discatelier-dvd-restore-")
        .tempdir()
        .unwrap()
        .keep();
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    service.save_playback(&record()).unwrap();
    let backup = service.backup().unwrap();
    let damaged = rusqlite::Connection::open(&backup).unwrap();
    damaged.execute(
        "UPDATE playback_sessions SET payload=json_set(payload,'$.source.playlist','dvd-menu','$.dvdTitle',0)", []
    ).unwrap();
    drop(damaged);
    assert_eq!(service.prepare_restore(backup).unwrap_err().code, "restore");
    assert_eq!(service.playback_history().unwrap()[0].dvd_title, None);
}

#[test]
fn backup_restore_keeps_history_and_terminal_records_are_not_interrupted() {
    let dir = tempfile::Builder::new()
        .prefix("discatelier-playback-")
        .tempdir()
        .unwrap()
        .keep();
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    let mut row = record();
    row.phase = PlaybackPhase::Stopped;
    service.save_playback(&row).unwrap();
    let backup = service.backup().unwrap();
    row.position_seconds = 900.0;
    service.save_playback(&row).unwrap();
    let preview = service.prepare_restore(backup).unwrap();
    service.restore(preview.token).unwrap();
    service.interrupt_playback().unwrap();
    let restored = service.playback_history().unwrap().remove(0);
    assert_eq!(restored.position_seconds, 600.0);
    assert_eq!(restored.watched_seconds, 10.0);
    assert_eq!(restored.phase, PlaybackPhase::Stopped);
    assert_eq!(restored.selected_audio, Some(2));
}

#[test]
fn malformed_history_is_rejected_before_replacing_live_library() {
    let dir = tempfile::Builder::new()
        .prefix("discatelier-playback-")
        .tempdir()
        .unwrap()
        .keep();
    let mut service = LibraryService::new(SqliteLibrary::open(&dir).unwrap());
    service.save_playback(&record()).unwrap();
    let backup = service.backup().unwrap();
    let damaged = rusqlite::Connection::open(&backup).unwrap();
    damaged
        .execute("UPDATE playback_sessions SET payload='{}'", [])
        .unwrap();
    drop(damaged);
    assert_eq!(service.prepare_restore(backup).unwrap_err().code, "restore");
    assert_eq!(
        service.playback_history().unwrap()[0].position_seconds,
        600.0
    );
}
