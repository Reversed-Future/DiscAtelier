CREATE TABLE optical_bindings (
  media_token TEXT PRIMARY KEY,
  copy_id TEXT NOT NULL REFERENCES copies(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX optical_binding_copy ON optical_bindings(copy_id);
