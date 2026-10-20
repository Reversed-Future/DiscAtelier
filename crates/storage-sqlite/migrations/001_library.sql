CREATE TABLE works (
  id TEXT PRIMARY KEY, category_id TEXT NOT NULL, title TEXT NOT NULL, creator TEXT NOT NULL
);
CREATE TABLE editions (
  id TEXT PRIMARY KEY, work_id TEXT NOT NULL REFERENCES works(id),
  edition_label TEXT NOT NULL, barcode TEXT NOT NULL, catalog_number TEXT NOT NULL
);
CREATE INDEX edition_barcode ON editions(barcode);
CREATE INDEX edition_catalog_number ON editions(catalog_number);
CREATE TABLE media (
  id TEXT PRIMARY KEY, edition_id TEXT NOT NULL REFERENCES editions(id),
  position INTEGER NOT NULL CHECK(position > 0), carrier_id TEXT NOT NULL, label TEXT NOT NULL,
  UNIQUE(edition_id, position)
);
CREATE TABLE copies (
  id TEXT PRIMARY KEY, edition_id TEXT NOT NULL REFERENCES editions(id),
  status TEXT NOT NULL CHECK(status IN ('owned','wanted','transit')),
  added_at TEXT NOT NULL, acquired_at TEXT NOT NULL, storage_location TEXT NOT NULL,
  notes TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision > 0)
);
CREATE INDEX copy_edition ON copies(edition_id);
CREATE INDEX copy_status ON copies(status);
CREATE TABLE purchases (
  copy_id TEXT PRIMARY KEY REFERENCES copies(id),
  amount_minor INTEGER CHECK(amount_minor IS NULL OR amount_minor BETWEEN 0 AND 9000000000000),
  currency TEXT NOT NULL CHECK(currency IN ('CNY','HKD','JPY')),
  seller TEXT NOT NULL, purchase_url TEXT NOT NULL
);
CREATE TABLE write_receipts (
  request_id TEXT PRIMARY KEY, payload_hash TEXT NOT NULL, result_id TEXT NOT NULL
);
