CREATE TABLE playback_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    started_at TEXT NOT NULL,
    payload TEXT NOT NULL CHECK(json_valid(payload))
);
CREATE INDEX playback_sessions_recent ON playback_sessions(started_at DESC);
