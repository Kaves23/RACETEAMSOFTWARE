-- Migration 053: Race sessions + Incidents tables
-- Added: 17 April 2026
-- race_sessions: covers both Strategy (setup/tyre notes) and Performance (telemetry/laps)
--   — same table, strategy.html and performance.html present different inspector views.
-- incidents: replaces localStorage-only incidents.html data.

-- ═══════════════════════════════════════════════════════════
-- 1.  RACE SESSIONS
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS race_sessions (
  id                VARCHAR(36)   PRIMARY KEY,
  event_id          VARCHAR(36)   REFERENCES events(id)   ON DELETE SET NULL,
  driver_id         VARCHAR(36)   REFERENCES drivers(id)  ON DELETE SET NULL,
  kart_id           VARCHAR(36)   REFERENCES items(id)    ON DELETE SET NULL,  -- items WHERE is_race_fleet = true
  session_type      VARCHAR(50)   NOT NULL DEFAULT 'Practice',  -- Practice / Qualifying / Race / Test Day
  session_name      VARCHAR(255),
  status            VARCHAR(50)   NOT NULL DEFAULT 'Planned',   -- Planned / In Progress / Complete
  start_time        TIMESTAMPTZ,
  end_time          TIMESTAMPTZ,
  tyre_set          VARCHAR(100),
  compound          VARCHAR(50),   -- Soft / Medium / Hard / Wet / Intermediate
  tyre_laps         INTEGER       DEFAULT 0,
  best_lap_ms       INTEGER,       -- best lap time in milliseconds (null = no data)
  lap_count         INTEGER       DEFAULT 0,
  consistency_ms    INTEGER,       -- σ of lap times in ms (null = no data)
  setup_changes     JSONB         NOT NULL DEFAULT '[]',   -- [{change, by}]
  lap_times         JSONB         NOT NULL DEFAULT '[]',   -- [{lap, time_ms, s1_ms, s2_ms, s3_ms}]
  driver_feedback   TEXT,
  engineer_notes    TEXT,
  aims_upload_id    VARCHAR(36),   -- FK-like link to telemetry uploads (not strict FK — telemetry is separate)
  flagged           BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rs_event    ON race_sessions(event_id)  WHERE event_id  IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rs_driver   ON race_sessions(driver_id) WHERE driver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rs_kart     ON race_sessions(kart_id)   WHERE kart_id   IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rs_type     ON race_sessions(session_type);
CREATE INDEX IF NOT EXISTS idx_rs_status   ON race_sessions(status);
CREATE INDEX IF NOT EXISTS idx_rs_flagged  ON race_sessions(flagged)   WHERE flagged = TRUE;
CREATE INDEX IF NOT EXISTS idx_rs_created  ON race_sessions(created_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER race_sessions_updated_at
    BEFORE UPDATE ON race_sessions
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ═══════════════════════════════════════════════════════════
-- 2.  INCIDENTS
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS incidents (
  id                VARCHAR(36)   PRIMARY KEY,
  event_id          VARCHAR(36)   REFERENCES events(id)   ON DELETE SET NULL,
  driver_id         VARCHAR(36)   REFERENCES drivers(id)  ON DELETE SET NULL,
  kart_id           VARCHAR(36)   REFERENCES items(id)    ON DELETE SET NULL,
  session_id        VARCHAR(36)   REFERENCES race_sessions(id) ON DELETE SET NULL,
  title             VARCHAR(255)  NOT NULL,
  severity          VARCHAR(50)   NOT NULL DEFAULT 'Medium',  -- Low / Medium / High / Critical
  status            VARCHAR(50)   NOT NULL DEFAULT 'Open',    -- Open / Monitoring / Resolved
  owner_staff_id    VARCHAR(36)   REFERENCES staff(id)    ON DELETE SET NULL,
  owner_text        VARCHAR(255),  -- free-text fallback if no staff record
  telemetry_snapshot TEXT,
  timecode          VARCHAR(50),
  narrative         TEXT,
  corrective_actions TEXT,
  damage            JSONB         NOT NULL DEFAULT '{}',   -- {part: 'green'|'amber'|'red'}
  attachments       JSONB         NOT NULL DEFAULT '[]',   -- [{provider, name, url, addedAt}]
  created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inc_event    ON incidents(event_id)    WHERE event_id    IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inc_driver   ON incidents(driver_id)   WHERE driver_id   IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inc_kart     ON incidents(kart_id)     WHERE kart_id     IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inc_session  ON incidents(session_id)  WHERE session_id  IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inc_severity ON incidents(severity);
CREATE INDEX IF NOT EXISTS idx_inc_status   ON incidents(status);
CREATE INDEX IF NOT EXISTS idx_inc_created  ON incidents(created_at DESC);

DO $$ BEGIN
  CREATE TRIGGER incidents_updated_at
    BEFORE UPDATE ON incidents
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
