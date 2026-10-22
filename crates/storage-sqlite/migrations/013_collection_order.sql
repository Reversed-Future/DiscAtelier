CREATE TABLE collection_order (
    copy_id TEXT PRIMARY KEY REFERENCES copies(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK(position >= 0)
);
