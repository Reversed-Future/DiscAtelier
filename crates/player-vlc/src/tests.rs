use super::*;
use serde_json::json;
pub(crate) fn snapshot() -> PlaybackSnapshot {
    serde_json::from_value(json!({
        "sessionId":"dvd-test", "source":{"mountPoint":"F:","mediaToken":"fixture","playlist":"dvd-menu","label":"DVD"},
        "title":"DVD","startedAt":"2026-10-21T00:00:00Z","updatedAt":"2026-10-21T00:00:00Z",
        "phase":"playing","positionSeconds":50.0,"durationSeconds":100.0,"watchedSeconds":2.0,
        "completed":false,"paused":false,"seeking":false,"seekable":true,"audioTracks":[],
        "selectedAudio":null,"dvdTitle":2,"dvdMenu":false,"error":null
    })).unwrap()
}
#[test]
fn optical_route_rejects_files_networks_and_command_fragments() {
    let mut source = snapshot().source;
    assert_eq!(dvd_location(&source).unwrap(), "dvdnav:///F:/");
    for invalid in [
        "F:\\movie.mkv",
        "dvd:///F:/",
        "https://example.com",
        "F:@2",
        "F: --sout=file",
        "\\\\server\\disc",
        "f:",
        "F:/",
        "",
    ] {
        source.mount_point = invalid.into();
        assert!(dvd_location(&source).is_err(), "{invalid}");
    }
    source.mount_point = "F:".into();
    source.playlist = "00000.mpls".into();
    assert!(dvd_location(&source).is_err());
}
#[test]
fn resume_requires_a_content_title_and_bounded_time() {
    assert!(validate_resume(0.0, None).is_ok());
    assert!(validate_resume(50.0, Some(2)).is_ok());
    for (time, title) in [
        (50.0, None),
        (0.0, Some(0)),
        (0.0, Some(-1)),
        (0.0, Some(10000)),
        (f64::NAN, Some(1)),
        (f64::INFINITY, Some(1)),
        (-1.0, Some(1)),
        (604801.0, Some(1)),
    ] {
        assert!(validate_resume(time, title).is_err());
    }
}
#[test]
fn menu_and_unseekable_content_reject_seeking() {
    let mut s = snapshot();
    assert!(player::validate_seek(&s, 50.0).is_ok());
    for time in [-1.0, 101.0, f64::NAN, f64::INFINITY] {
        assert!(player::validate_seek(&s, time).is_err());
    }
    s.dvd_menu = true;
    assert!(player::validate_seek(&s, 50.0).is_err());
    s.dvd_menu = false;
    s.seekable = false;
    assert!(player::validate_seek(&s, 50.0).is_err());
}
#[test]
fn older_settings_and_bd_records_remain_readable() {
    let settings: PlaybackSettings =
        serde_json::from_value(json!({"mpvExecutable":"","makeMkvLibrary":""})).unwrap();
    assert_eq!(settings.vlc_library, "");
    let mut old = serde_json::to_value(PlaybackRecord::from(&snapshot())).unwrap();
    old.as_object_mut().unwrap().remove("dvdTitle");
    let record: PlaybackRecord = serde_json::from_value(old).unwrap();
    assert_eq!(record.dvd_title, None);
}
#[test]
fn only_typed_menu_directions_are_accepted() {
    for direction in ["activate", "up", "down", "left", "right", "root"] {
        assert!(serde_json::from_value::<PlaybackControl>(
            json!({"action":"menu","direction":direction})
        )
        .is_ok());
    }
    assert!(serde_json::from_value::<PlaybackControl>(
        json!({"action":"menu","direction":"eject"})
    )
    .is_err());
    assert!(serde_json::from_value::<PlaybackControl>(
        json!({"action":"menu","direction":"root","path":"F:"})
    )
    .is_err());
}
