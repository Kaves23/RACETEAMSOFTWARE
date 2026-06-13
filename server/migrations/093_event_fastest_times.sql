-- 093_event_fastest_times.sql
-- Stores the fastest lap captured per (event, class, driver) by the live
-- timing feed when an operator has scoped Track Map to a specific event.
-- One row per (event, class, driver). Updates only ever lower the time.

CREATE TABLE IF NOT EXISTS event_fastest_times (
  id            SERIAL PRIMARY KEY,
  event_id      TEXT NOT NULL,
  class_name    TEXT NOT NULL,
  driver_name   TEXT NOT NULL,
  our_driver_id TEXT,
  kart          TEXT,
  best_lap      TEXT,            -- formatted display, e.g. "1:23.456"
  best_lap_ms   BIGINT NOT NULL, -- numeric for comparison/sorting
  laps          INTEGER,
  session_name  TEXT,            -- last live session this was captured during
  source        TEXT DEFAULT 'apex-live',
  captured_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT event_fastest_times_unique UNIQUE (event_id, class_name, driver_name)
);

CREATE INDEX IF NOT EXISTS idx_event_fastest_times_event
  ON event_fastest_times (event_id);
CREATE INDEX IF NOT EXISTS idx_event_fastest_times_event_class
  ON event_fastest_times (event_id, class_name, best_lap_ms);
