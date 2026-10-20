CREATE TABLE edition_supplements (
    edition_id TEXT PRIMARY KEY REFERENCES editions(id),
    payload TEXT NOT NULL CHECK(json_valid(payload))
);
CREATE TABLE assistant_sessions (
    id TEXT PRIMARY KEY,
    updated_at TEXT NOT NULL,
    payload TEXT NOT NULL CHECK(json_valid(payload))
);
