//! Optional CD metadata is cached separately from device enumeration and playback.
use crate::optical::{verify_disc, OpticalState};
use discatelier_application::OpticalDeviceProvider;
use discatelier_contracts::{AppError, CdTrackMetadata, OpticalKind};
use std::{
    collections::VecDeque,
    path::PathBuf,
    time::{Duration, Instant},
};

#[derive(Default)]
pub(crate) struct Cache {
    entries: VecDeque<Entry>,
}
struct Entry {
    mount: String,
    token: String,
    library: PathBuf,
    time: Instant,
    value: Result<Vec<CdTrackMetadata>, AppError>,
}
impl Cache {
    fn get(
        &self,
        mount: &str,
        token: &str,
        library: &PathBuf,
    ) -> Option<Result<Vec<CdTrackMetadata>, AppError>> {
        self.entries
            .iter()
            .find(|entry| {
                entry.mount == mount
                    && entry.token == token
                    && &entry.library == library
                    && entry.time.elapsed()
                        < Duration::from_secs(if entry.value.is_ok() { 3600 } else { 60 })
            })
            .map(|entry| entry.value.clone())
    }
    fn put(&mut self, entry: Entry) {
        self.entries.retain(|old| old.mount != entry.mount);
        self.entries.push_back(entry);
        while self.entries.len() > 8 {
            self.entries.pop_front();
        }
    }
}

/// A busy metadata lookup must never delay playback or progress checkpoints.
fn cached_title(state: &OpticalState, mount: &str, token: &str, number: u8) -> Option<String> {
    let cache = state.cd_metadata.try_lock().ok()?;
    cache
        .entries
        .iter()
        .find(|entry| entry.mount == mount && entry.token == token)?
        .value
        .as_ref()
        .ok()?
        .iter()
        .find(|track| track.number == number)?
        .title
        .clone()
}

pub(crate) fn decorate_snapshot(
    state: &OpticalState,
    mut snapshot: discatelier_contracts::PlaybackSnapshot,
) -> discatelier_contracts::PlaybackSnapshot {
    if let Some(number) = discatelier_player_vlc::cd_track(&snapshot.source.playlist) {
        if let Some(title) = cached_title(
            state,
            &snapshot.source.mount_point,
            &snapshot.source.media_token,
            number,
        ) {
            snapshot.title = title;
        }
    }
    snapshot
}

#[tauri::command]
pub async fn optical_cd_metadata(
    state: tauri::State<'_, OpticalState>,
    mount_point: String,
    token: String,
    refresh: bool,
) -> Result<Vec<CdTrackMetadata>, AppError> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        // Only metadata requests wait here; cached titles remain readable while
        // VLC is querying the network, and device lists/playback have another gate.
        let _query = state
            .cd_metadata_gate
            .lock()
            .map_err(|_| AppError::new("device", "CD 资料服务不可用。"))?;
        let drives = discatelier_optical_windows::WindowsOptical.enumerate()?;
        let medium = drives
            .into_iter()
            .find(|drive| drive.mount_point == mount_point)
            .and_then(|drive| drive.medium)
            .filter(|medium| medium.token == token && matches!(medium.kind, OpticalKind::AudioCd))
            .ok_or_else(|| AppError::new("mediaChanged", "光盘已变化，请刷新后重试。"))?;
        let playlist = medium
            .playlists
            .first()
            .ok_or_else(|| AppError::new("device", "CD 没有可读取的曲目。"))?;
        let settings = crate::playback_settings::read(&state.directory)?;
        let library = discatelier_player_vlc::configured(&settings)?;
        if !refresh {
            let cached = state
                .cd_metadata
                .lock()
                .map_err(|_| AppError::new("device", "CD 资料服务不可用。"))?
                .get(&mount_point, &token, &library);
            if let Some(value) = cached {
                return value;
            }
        }
        let source = verify_disc(&mount_point, &token, playlist)?;
        let value = discatelier_player_vlc::read_cd_metadata(&library, &source)
            .and_then(|tracks| validate_tracks(tracks, &medium.tracks));
        // Never attach text from the removed disc to the next disc in this drive.
        verify_disc(&mount_point, &token, playlist)?;
        state
            .cd_metadata
            .lock()
            .map_err(|_| AppError::new("device", "CD 资料服务不可用。"))?
            .put(Entry {
                mount: mount_point,
                token,
                library,
                time: Instant::now(),
                value: value.clone(),
            });
        value
    })
    .await
    .map_err(|_| AppError::new("device", "CD 资料读取未完成。"))?
}

fn validate_tracks(
    tracks: Vec<CdTrackMetadata>,
    physical: &[discatelier_contracts::CdTrack],
) -> Result<Vec<CdTrackMetadata>, AppError> {
    let mut seen = std::collections::BTreeSet::new();
    if tracks.iter().any(|track| {
        !physical.iter().any(|actual| actual.number == track.number)
            || !seen.insert(track.number)
            || track
                .track_total
                .is_some_and(|total| total < track.number || total > 99)
    }) {
        return Err(AppError::new("device", "CD 资料与实际曲号不一致。"));
    }
    Ok(tracks)
}

#[cfg(test)]
mod tests {
    use super::*;
    use discatelier_contracts::CdTrack;
    #[test]
    fn playback_title_uses_disc_and_track_without_waiting_for_metadata_queries() {
        let state = std::sync::Arc::new(crate::optical::OpticalService::new(PathBuf::from(
            "metadata-test-unused",
        )));
        state.cd_metadata.lock().unwrap().put(Entry {
            mount: "F:".into(),
            token: "disc".into(),
            library: PathBuf::from("test-library"),
            time: Instant::now(),
            value: Ok(vec![CdTrackMetadata {
                number: 2,
                title: Some("Second".into()),
                ..Default::default()
            }]),
        });
        let _query = state.cd_metadata_gate.lock().unwrap();
        assert_eq!(
            cached_title(&state, "F:", "disc", 2).as_deref(),
            Some("Second")
        );
        assert_eq!(cached_title(&state, "F:", "removed-disc", 2), None);
        assert_eq!(cached_title(&state, "F:", "disc", 1), None);
        let _cache = state.cd_metadata.lock().unwrap();
        assert_eq!(cached_title(&state, "F:", "disc", 2), None);
    }
    #[test]
    fn metadata_is_matched_by_physical_number_and_rejects_duplicates() {
        let physical = vec![CdTrack {
            number: 2,
            duration_seconds: 100.0,
        }];
        let track = CdTrackMetadata {
            number: 2,
            title: Some("Second".into()),
            ..Default::default()
        };
        assert_eq!(
            validate_tracks(vec![track.clone()], &physical).unwrap()[0].number,
            2
        );
        assert!(validate_tracks(vec![track.clone(), track.clone()], &physical).is_err());
        assert!(validate_tracks(vec![CdTrackMetadata { number: 1, ..track }], &physical).is_err());
    }
    #[test]
    fn cache_separates_disc_and_library_and_replaces_removed_disc() {
        let mut cache = Cache::default();
        let library = PathBuf::from("test-library");
        cache.put(Entry {
            mount: "F:".into(),
            token: "first".into(),
            library: library.clone(),
            time: Instant::now(),
            value: Ok(vec![]),
        });
        assert!(cache.get("F:", "first", &library).is_some());
        assert!(cache.get("F:", "second", &library).is_none());
        assert!(cache
            .get("F:", "first", &PathBuf::from("changed-library"))
            .is_none());
        cache.put(Entry {
            mount: "F:".into(),
            token: "second".into(),
            library: library.clone(),
            time: Instant::now(),
            value: Ok(vec![]),
        });
        assert!(cache.get("F:", "first", &library).is_none());
        cache.entries[0].time = Instant::now() - Duration::from_secs(3601);
        assert!(cache.get("F:", "second", &library).is_none());
    }
}
