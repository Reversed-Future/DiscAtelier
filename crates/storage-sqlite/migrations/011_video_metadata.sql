CREATE TABLE video_work_metadata (
    work_id TEXT PRIMARY KEY REFERENCES works(id) ON DELETE CASCADE,
    payload TEXT NOT NULL
);
CREATE TABLE video_edition_details (
    edition_id TEXT PRIMARY KEY REFERENCES editions(id) ON DELETE CASCADE,
    payload TEXT NOT NULL
);
