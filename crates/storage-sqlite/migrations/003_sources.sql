CREATE TABLE edition_sources (
  edition_id TEXT NOT NULL REFERENCES editions(id),
  provider_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY(provider_id, external_id),
  UNIQUE(edition_id)
);
CREATE TABLE imported_identifiers (
  edition_id TEXT NOT NULL REFERENCES edition_sources(edition_id),
  position INTEGER NOT NULL CHECK(position > 0),
  namespace TEXT NOT NULL CHECK(namespace IN ('identifier','catalog')),
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  description TEXT NOT NULL,
  PRIMARY KEY(edition_id, position)
);
CREATE INDEX imported_identifier_value ON imported_identifiers(value);
