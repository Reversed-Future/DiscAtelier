CREATE TABLE video_edition_parts (
    edition_id TEXT PRIMARY KEY REFERENCES editions(id) ON DELETE CASCADE,
    payload TEXT NOT NULL
);
