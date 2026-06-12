-- Migration 091 — Sporting Entries Phase 2
-- Adds: deadlines, payment tracking, doc-override block, championship link,
--       events deadlines, championships master table.
-- All additive / nullable so existing rows keep working.

-- ─── Fix driver_id / event_id types (075 made them INTEGER, but ids are UUID/TEXT)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name='sporting_entries' AND column_name='driver_id' AND data_type='integer'
  ) THEN
    ALTER TABLE sporting_entries ALTER COLUMN driver_id TYPE TEXT USING driver_id::TEXT;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name='sporting_entries' AND column_name='event_id' AND data_type='integer'
  ) THEN
    ALTER TABLE sporting_entries ALTER COLUMN event_id TYPE TEXT USING event_id::TEXT;
  END IF;
END $$;

-- ─── sporting_entries: deadlines, payments, championship link, doc overrides
ALTER TABLE sporting_entries
  ADD COLUMN IF NOT EXISTS entry_deadline    DATE,
  ADD COLUMN IF NOT EXISTS payment_deadline  DATE,
  ADD COLUMN IF NOT EXISTS entry_fee         NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS amount_paid       NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS paid_date         DATE,
  ADD COLUMN IF NOT EXISTS payment_ref       TEXT,
  ADD COLUMN IF NOT EXISTS championship_id   TEXT,
  ADD COLUMN IF NOT EXISTS doc_overrides     JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS override_reason   TEXT;

CREATE INDEX IF NOT EXISTS idx_sporting_entries_driver_id ON sporting_entries(driver_id) WHERE driver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sporting_entries_event_id  ON sporting_entries(event_id)  WHERE event_id  IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sporting_entries_status    ON sporting_entries(status);
CREATE INDEX IF NOT EXISTS idx_sporting_entries_champ     ON sporting_entries(championship_id) WHERE championship_id IS NOT NULL;

-- ─── events: deadline fields (entry & payment)
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS entry_deadline   DATE,
  ADD COLUMN IF NOT EXISTS payment_deadline DATE;

-- ─── championships master table
CREATE TABLE IF NOT EXISTS championships (
  id                 TEXT PRIMARY KEY,
  name               TEXT NOT NULL,
  sanctioning_body   TEXT,
  season             TEXT,
  default_fee        NUMERIC(14,2),
  currency           TEXT DEFAULT 'ZAR',
  doc_requirements   JSONB DEFAULT '{"licence":true,"medical":true,"helmet":true,"consent":false}'::jsonb,
  notes              TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_championships_name ON championships(name);
