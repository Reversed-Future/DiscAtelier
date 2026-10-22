-- Cover assets are validated in application code up to MAX_COVER_BYTES (15 MiB).
-- SQLite cannot alter a CHECK constraint in place, so rebuild the table while
-- foreign-key enforcement is paused by the migration runner.
CREATE TABLE assets_next (
  id TEXT PRIMARY KEY, media_type TEXT NOT NULL,
  byte_length INTEGER NOT NULL CHECK(byte_length BETWEEN 1 AND 15728640),
  data BLOB NOT NULL
);
INSERT INTO assets_next (id,media_type,byte_length,data)
  SELECT id,media_type,byte_length,data FROM assets;
DROP TABLE assets;
ALTER TABLE assets_next RENAME TO assets;
