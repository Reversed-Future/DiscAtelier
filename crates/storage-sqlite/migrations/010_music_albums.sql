-- Preserve the original payload and fallback track identities during migration.
CREATE TABLE edition_music_albums (
    edition_id TEXT NOT NULL REFERENCES editions(id),
    album_id INTEGER NOT NULL,
    ordinal INTEGER NOT NULL CHECK(ordinal >= 0),
    legacy_positions INTEGER NOT NULL CHECK(legacy_positions IN (0,1)),
    payload TEXT NOT NULL CHECK(json_valid(payload)),
    PRIMARY KEY(edition_id, album_id)
);
INSERT INTO edition_music_albums
SELECT edition_id, json_extract(payload,'$.albumId'), 0, 1, payload FROM edition_supplements;
CREATE TABLE edition_disc_albums (
    edition_id TEXT NOT NULL,
    disc_key TEXT NOT NULL,
    album_id INTEGER NOT NULL,
    PRIMARY KEY(edition_id,disc_key),
    FOREIGN KEY(edition_id,album_id) REFERENCES edition_music_albums(edition_id,album_id) ON DELETE CASCADE
);
-- Existing atomic Discogs/manual import paths still write this table. Bridge
-- those writes without replacing any other linked digital album.
CREATE TRIGGER music_album_import_insert AFTER INSERT ON edition_supplements BEGIN
    INSERT INTO edition_music_albums VALUES(NEW.edition_id,json_extract(NEW.payload,'$.albumId'),
        COALESCE((SELECT MAX(ordinal)+1 FROM edition_music_albums WHERE edition_id=NEW.edition_id),0),1,NEW.payload)
    ON CONFLICT(edition_id,album_id) DO UPDATE SET payload=excluded.payload;
END;
CREATE TRIGGER music_album_import_update AFTER UPDATE OF payload ON edition_supplements BEGIN
    INSERT INTO edition_music_albums VALUES(NEW.edition_id,json_extract(NEW.payload,'$.albumId'),
        COALESCE((SELECT MAX(ordinal)+1 FROM edition_music_albums WHERE edition_id=NEW.edition_id),0),0,NEW.payload)
    ON CONFLICT(edition_id,album_id) DO UPDATE SET payload=excluded.payload;
END;
