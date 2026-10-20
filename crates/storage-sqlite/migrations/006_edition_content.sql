CREATE TABLE edition_content (
    edition_id TEXT PRIMARY KEY REFERENCES editions(id) ON DELETE CASCADE,
    content_json TEXT NOT NULL
);
