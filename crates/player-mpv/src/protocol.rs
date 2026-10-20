use discatelier_application::PlaybackProgress;
use discatelier_contracts::{AudioTrack, PlaybackPhase, PlaybackSnapshot};
use serde_json::Value;

pub struct PlaybackState {
    pub snapshot: PlaybackSnapshot,
    pub progress: PlaybackProgress,
    pub loaded: bool,
    pub core_idle: bool,
}

impl PlaybackState {
    pub fn event(&mut self, value: &Value, elapsed: f64) {
        match value["event"].as_str() {
            Some("file-loaded") => {
                self.loaded = true;
            }
            Some("seek") => {
                self.snapshot.seeking = true;
                self.progress.reset_sample();
            }
            Some("playback-restart") => {
                self.snapshot.seeking = false;
                self.progress.reset_sample();
            }
            Some("property-change") => {
                let data = &value["data"];
                match value["name"].as_str() {
                    Some("time-pos") => {
                        if let Some(position) = data.as_f64().filter(|p| p.is_finite() && *p >= 0.0)
                        {
                            self.progress.sample(
                                position,
                                elapsed,
                                self.loaded
                                    && !self.core_idle
                                    && !self.snapshot.paused
                                    && !self.snapshot.seeking,
                            );
                            self.snapshot.position_seconds = position;
                            self.snapshot.watched_seconds = self.progress.watched();
                        }
                    }
                    Some("duration") => {
                        if let Some(duration) = data.as_f64().filter(|d| d.is_finite() && *d > 0.0)
                        {
                            self.snapshot.duration_seconds = Some(duration);
                        }
                    }
                    Some("pause") => {
                        if let Some(paused) = data.as_bool() {
                            self.snapshot.paused = paused;
                            self.progress.reset_sample();
                        }
                    }
                    Some("core-idle") => {
                        if let Some(idle) = data.as_bool() {
                            self.core_idle = idle;
                            self.progress.reset_sample();
                        }
                    }
                    Some("seeking") => {
                        if let Some(seeking) = data.as_bool() {
                            self.snapshot.seeking = seeking;
                            self.progress.reset_sample();
                        }
                    }
                    Some("seekable") => {
                        self.snapshot.seekable = data.as_bool().unwrap_or(false);
                    }
                    Some("media-title") => {
                        if let Some(title) = data.as_str().filter(|s| !s.is_empty()) {
                            self.snapshot.title = title.into();
                        }
                    }
                    Some("track-list") => {
                        // MPV clears its track list on unload; retain the final selection for history.
                        if let Some(tracks) = data.as_array().filter(|tracks| !tracks.is_empty()) {
                            self.snapshot.audio_tracks = tracks
                                .iter()
                                .filter(|t| t["type"] == "audio")
                                .filter_map(|t| {
                                    Some(AudioTrack {
                                        id: t["id"].as_i64()?,
                                        title: t["title"].as_str().unwrap_or("").into(),
                                        language: t["lang"].as_str().unwrap_or("").into(),
                                        codec: t["codec"].as_str().unwrap_or("").into(),
                                        channels: t["demux-channel-count"].as_u64(),
                                        selected: t["selected"].as_bool().unwrap_or(false),
                                    })
                                })
                                .collect();
                            self.snapshot.selected_audio = self
                                .snapshot
                                .audio_tracks
                                .iter()
                                .find(|t| t.selected)
                                .map(|t| t.id);
                        }
                    }
                    _ => {}
                }
            }
            Some("end-file") => match value["reason"].as_str() {
                Some("eof") => {
                    self.snapshot.phase = PlaybackPhase::Ended;
                    self.snapshot.completed = self
                        .progress
                        .completed(self.snapshot.duration_seconds, true);
                }
                Some("error") => {
                    self.snapshot.phase = PlaybackPhase::Failed;
                    self.snapshot.error = Some(format!(
                        "播放失败：{}",
                        value["file_error"].as_str().unwrap_or("光盘读取未完成")
                    ));
                }
                _ => self.snapshot.phase = PlaybackPhase::Stopped,
            },
            Some("shutdown") if self.snapshot.phase.active() => {
                self.snapshot.phase = PlaybackPhase::Stopped;
            }
            _ => {}
        }
        if self.snapshot.phase.active() && self.snapshot.phase != PlaybackPhase::Stopping {
            self.snapshot.phase = if !self.loaded {
                PlaybackPhase::Loading
            } else if self.snapshot.paused {
                PlaybackPhase::Paused
            } else if self.core_idle || self.snapshot.seeking {
                PlaybackPhase::Buffering
            } else {
                PlaybackPhase::Playing
            };
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn unloading_preserves_history_fields_and_seeking_to_eof_is_not_completion() {
        let snapshot: PlaybackSnapshot = serde_json::from_value(json!({
            "sessionId":"test-session",
            "source":{"mountPoint":"F:","mediaToken":"test","playlist":"00000.mpls","label":"Test"},
            "title":"Test","startedAt":"2026-10-21T00:00:00Z","updatedAt":"2026-10-21T00:00:00Z",
            "phase":"playing","positionSeconds":0.0,"durationSeconds":null,"watchedSeconds":0.0,
            "completed":false,"paused":false,"seeking":false,"seekable":true,
            "audioTracks":[],"selectedAudio":null,"error":null
        }))
        .unwrap();
        let mut state = PlaybackState {
            snapshot,
            progress: PlaybackProgress::default(),
            loaded: true,
            core_idle: false,
        };
        state.event(
            &json!({"event":"property-change","name":"duration","data":1000.0}),
            0.0,
        );
        state.event(&json!({"event":"property-change","name":"track-list","data":[{"type":"audio","id":2,"selected":true,"lang":"jpn","codec":"pcm_bluray","demux-channel-count":2}]}), 0.0);
        state.event(&json!({"event":"seek"}), 0.0);
        state.event(
            &json!({"event":"property-change","name":"time-pos","data":999.9}),
            1.0,
        );
        state.event(&json!({"event":"end-file","reason":"eof"}), 1.1);
        state.event(
            &json!({"event":"property-change","name":"track-list","data":[]}),
            1.2,
        );
        state.event(&json!({"event":"property-change","name":"duration"}), 1.2);
        state.event(&json!({"event":"property-change","name":"time-pos"}), 1.2);
        state.event(&json!({"event":"shutdown"}), 1.2);
        assert_eq!(state.snapshot.phase, PlaybackPhase::Ended);
        assert_eq!(state.snapshot.selected_audio, Some(2));
        assert_eq!(state.snapshot.duration_seconds, Some(1000.0));
        assert_eq!(state.snapshot.position_seconds, 999.9);
        assert!(!state.snapshot.completed);
        assert_eq!(state.snapshot.watched_seconds, 0.0);
    }
}
