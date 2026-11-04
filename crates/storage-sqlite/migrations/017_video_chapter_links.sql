CREATE TABLE video_edition_chapter_links (
    edition_id TEXT PRIMARY KEY REFERENCES editions(id) ON DELETE CASCADE,
    payload TEXT NOT NULL
);
