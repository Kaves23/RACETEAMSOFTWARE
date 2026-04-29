-- 073_drive_imports.sql
-- Google Drive folder watcher — config + imported files registry

-- ── Singleton config row (one per deployment) ─────────────────────────────
CREATE TABLE IF NOT EXISTS drive_config (
  id             INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  folder_id      TEXT,
  folder_name    TEXT,
  access_token   TEXT,
  refresh_token  TEXT,
  token_expiry   TIMESTAMPTZ,
  last_sync_at   TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO drive_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ── One row per file discovered in the watched folder ─────────────────────
CREATE TABLE IF NOT EXISTS drive_imports (
  id               SERIAL PRIMARY KEY,
  drive_file_id    TEXT        NOT NULL UNIQUE,
  filename         TEXT        NOT NULL,
  file_type        TEXT,                          -- xrk, xrz, csv, rs3a, mov, pdf …
  mime_type        TEXT,
  drive_link       TEXT,                          -- webViewLink from Drive API
  file_size        BIGINT,                        -- bytes
  file_modified_at TIMESTAMPTZ,                   -- Drive modifiedTime
  imported_at      TIMESTAMPTZ DEFAULT NOW(),
  event_id         TEXT        REFERENCES events(id) ON DELETE SET NULL,
  status           TEXT        NOT NULL DEFAULT 'new',  -- new | reviewed | skipped
  notes            TEXT,
  -- CSV/TXT export metadata (Race Studio 3 channel exports)
  csv_headers      JSONB,
  csv_row_count    INTEGER,
  csv_preview      JSONB   -- first 5 rows as array-of-arrays
);

CREATE INDEX IF NOT EXISTS drive_imports_event_id_idx      ON drive_imports(event_id);
CREATE INDEX IF NOT EXISTS drive_imports_status_idx        ON drive_imports(status);
CREATE INDEX IF NOT EXISTS drive_imports_file_modified_idx ON drive_imports(file_modified_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS drive_imports_file_type_idx     ON drive_imports(file_type);
