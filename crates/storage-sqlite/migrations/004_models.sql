CREATE TABLE model_assets (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    byte_length INTEGER NOT NULL CHECK(byte_length > 0 AND byte_length <= 52428800),
    data TEXT NOT NULL,
    preview TEXT NOT NULL
);
ALTER TABLE editions ADD COLUMN model_asset_id TEXT REFERENCES model_assets(id);
