-- 074_telemetry_sessions.sql
-- AiM / Race Studio 3 telemetry analysis — core schema
-- Compatible with PostgreSQL 14+; all DDL is idempotent (IF NOT EXISTS / IF NOT EXISTS column)

-- ═══════════════════════════════════════════════════════════════════════
-- 1.  TELEMETRY SESSIONS
--     One row per uploaded .xrk / .xrz / .drk / .csv file
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS telemetry_sessions (
  id               SERIAL        PRIMARY KEY,

  -- Source file
  filename         TEXT          NOT NULL,
  file_format      TEXT          NOT NULL DEFAULT 'unknown',  -- xrk | xrz | drk | csv | txt
  file_size        BIGINT,
  file_path        TEXT,           -- absolute path on server (temp; may be NULL after cleanup)

  -- Parse lifecycle
  parse_status     TEXT          NOT NULL DEFAULT 'pending'
                   CHECK (parse_status IN ('pending','parsing','parsed','error','csv_only')),
  parse_error      TEXT,           -- last error message

  -- AiM session metadata (from DLL or CSV headers)
  racer_name       TEXT,
  vehicle_name     TEXT,
  track_name       TEXT,
  championship     TEXT,
  venue_type       TEXT,
  started_at       TIMESTAMPTZ,
  duration_s       NUMERIC(10,3),  -- total session length in seconds

  -- Best lap summary (computed post-parse)
  best_lap_index   INTEGER,
  best_lap_s       NUMERIC(10,3),
  lap_count        INTEGER        DEFAULT 0,

  -- Cross-system links
  event_id         TEXT          REFERENCES events(id)   ON DELETE SET NULL,
  driver_id        TEXT          REFERENCES drivers(id)  ON DELETE SET NULL,
  kart_item_id     TEXT          REFERENCES items(id)    ON DELETE SET NULL,
  drive_import_id  INTEGER       REFERENCES drive_imports(id) ON DELETE SET NULL,

  -- Free notes
  notes            TEXT,

  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ts_event       ON telemetry_sessions(event_id)        WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ts_driver      ON telemetry_sessions(driver_id)       WHERE driver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ts_status      ON telemetry_sessions(parse_status);
CREATE INDEX IF NOT EXISTS idx_ts_started     ON telemetry_sessions(started_at DESC) WHERE started_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ts_drive_imp   ON telemetry_sessions(drive_import_id) WHERE drive_import_id IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════════════
-- 2.  TELEMETRY LAPS
--     One row per lap per session; stats are pre-computed during parse
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS telemetry_laps (
  id             SERIAL       PRIMARY KEY,
  session_id     INTEGER      NOT NULL REFERENCES telemetry_sessions(id) ON DELETE CASCADE,
  lap_index      INTEGER      NOT NULL,   -- 0-based, matches DLL index
  start_s        NUMERIC(10,3),
  duration_s     NUMERIC(10,3),
  is_outlap      BOOLEAN      NOT NULL DEFAULT FALSE,
  is_inlap       BOOLEAN      NOT NULL DEFAULT FALSE,
  gap_to_best_s  NUMERIC(10,3),           -- duration_s - session best_lap_s (NULL for outlap/inlap)

  -- Per-lap channel peaks (populated when GPS/logged channels are parsed)
  max_speed_kph  NUMERIC(8,2),
  max_rpm        NUMERIC(8,1),
  max_lat_g      NUMERIC(6,3),
  max_lon_g      NUMERIC(6,3),

  -- GPS bounding box for track map rendering
  gps_lat_min    NUMERIC(11,8),
  gps_lat_max    NUMERIC(11,8),
  gps_lon_min    NUMERIC(11,8),
  gps_lon_max    NUMERIC(11,8),

  UNIQUE (session_id, lap_index)
);

CREATE INDEX IF NOT EXISTS idx_tl_session ON telemetry_laps(session_id);


-- ═══════════════════════════════════════════════════════════════════════
-- 3.  TELEMETRY CHANNELS
--     One row per channel per session; sample_data is stored separately
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS telemetry_channels (
  id              SERIAL       PRIMARY KEY,
  session_id      INTEGER      NOT NULL REFERENCES telemetry_sessions(id) ON DELETE CASCADE,

  -- Channel identity
  channel_group   TEXT         NOT NULL CHECK (channel_group IN ('logged','gps','gps_raw','csv')),
  channel_index   INTEGER      NOT NULL,   -- index within its group (0-based)
  name            TEXT         NOT NULL,
  units           TEXT         NOT NULL DEFAULT '',

  -- Stats (whole session)
  sample_count    INTEGER      NOT NULL DEFAULT 0,
  sample_rate_hz  NUMERIC(8,2),
  value_min       NUMERIC(16,6),
  value_max       NUMERIC(16,6),

  -- UI helpers
  category        TEXT         NOT NULL DEFAULT 'Misc'
                  CHECK (category IN ('Engine','GPS','Accelerometers','Brakes','Suspension','Temperature','Misc')),
  default_color   TEXT         NOT NULL DEFAULT '#3498db',

  UNIQUE (session_id, channel_group, channel_index)
);

CREATE INDEX IF NOT EXISTS idx_tc_session   ON telemetry_channels(session_id);
CREATE INDEX IF NOT EXISTS idx_tc_category  ON telemetry_channels(session_id, category);


-- ═══════════════════════════════════════════════════════════════════════
-- 4.  TELEMETRY SAMPLES
--     LTTB-downsampled time+value arrays per channel per lap.
--     lap_index NULL = whole-session data.
--     Max 500 points per row to keep JSONB size manageable (~4 KB each).
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS telemetry_samples (
  id            SERIAL     PRIMARY KEY,
  channel_id    INTEGER    NOT NULL REFERENCES telemetry_channels(id) ON DELETE CASCADE,
  lap_index     INTEGER,              -- NULL = whole session
  sample_count  INTEGER    NOT NULL DEFAULT 0,
  times         JSONB      NOT NULL DEFAULT '[]',   -- [float, ...]
  values        JSONB      NOT NULL DEFAULT '[]',   -- [float, ...]

  UNIQUE (channel_id, lap_index)
);

CREATE INDEX IF NOT EXISTS idx_tsa_channel ON telemetry_samples(channel_id);


-- ═══════════════════════════════════════════════════════════════════════
-- 5.  TELEMETRY INSIGHTS
--     Auto-generated observations per session; surfaced in the UI
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS telemetry_insights (
  id            SERIAL     PRIMARY KEY,
  session_id    INTEGER    NOT NULL REFERENCES telemetry_sessions(id) ON DELETE CASCADE,
  insight_type  TEXT       NOT NULL,  -- best_lap | consistency | anomaly | speed | gap | recommendation
  lap_index     INTEGER,              -- NULL = whole-session insight
  severity      TEXT       NOT NULL DEFAULT 'info'
                CHECK (severity IN ('info','good','warning','critical')),
  title         TEXT       NOT NULL,
  detail        TEXT,
  value_num     NUMERIC(16,6),
  unit          TEXT
);

CREATE INDEX IF NOT EXISTS idx_ti_session  ON telemetry_insights(session_id);
CREATE INDEX IF NOT EXISTS idx_ti_severity ON telemetry_insights(session_id, severity);


-- ═══════════════════════════════════════════════════════════════════════
-- 6.  BACKLINK: race_sessions ← telemetry_sessions
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE race_sessions
  ADD COLUMN IF NOT EXISTS telemetry_session_id INTEGER
    REFERENCES telemetry_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rs_tele ON race_sessions(telemetry_session_id)
  WHERE telemetry_session_id IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════════════
-- 7.  AUTO-UPDATE updated_at trigger
-- ═══════════════════════════════════════════════════════════════════════
-- trg_set_updated_at() was already created in migration 053 — reuse it.
DO $$ BEGIN
  CREATE TRIGGER telemetry_sessions_updated_at
    BEFORE UPDATE ON telemetry_sessions
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
