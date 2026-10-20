CREATE TABLE assets (
  id TEXT PRIMARY KEY, media_type TEXT NOT NULL,
  byte_length INTEGER NOT NULL CHECK(byte_length BETWEEN 1 AND 8388608),
  data BLOB NOT NULL
);
ALTER TABLE editions ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0);
ALTER TABLE editions ADD COLUMN cover_asset_id TEXT REFERENCES assets(id);
