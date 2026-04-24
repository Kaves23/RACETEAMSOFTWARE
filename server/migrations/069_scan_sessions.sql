-- 069_scan_sessions.sql
-- Persist mobile scan sessions so receipts can be recalled

CREATE TABLE IF NOT EXISTS scan_sessions (
  id              TEXT        PRIMARY KEY,
  mode            TEXT        NOT NULL CHECK (mode IN ('load', 'unload')),
  truck_id        TEXT        REFERENCES trucks(id) ON DELETE SET NULL,
  truck_name      TEXT,
  started_at      TIMESTAMPTZ NOT NULL,
  finished_at     TIMESTAMPTZ NOT NULL,
  total_scanned   INTEGER     NOT NULL DEFAULT 0,
  ok_count        INTEGER     NOT NULL DEFAULT 0,
  duplicate_count INTEGER     NOT NULL DEFAULT 0,
  not_found_count INTEGER     NOT NULL DEFAULT 0,
  scans           JSONB       NOT NULL DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scan_sessions_truck_id    ON scan_sessions(truck_id);
CREATE INDEX IF NOT EXISTS idx_scan_sessions_finished_at ON scan_sessions(finished_at DESC);
