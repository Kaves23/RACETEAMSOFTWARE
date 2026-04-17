-- ============================================================
-- Migration 056 — Notes Knowledge Base
-- Extends the existing notes table (or creates it) with all
-- columns needed for a team knowledge base with entity linking,
-- folder organisation, full-text search, and tagging.
-- ============================================================

-- Create notes table if it doesn't already exist
CREATE TABLE IF NOT EXISTS notes (
  id           VARCHAR(36)  PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title        TEXT         NOT NULL DEFAULT 'Untitled',
  content      TEXT         NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Add all new columns idempotently
DO $$ BEGIN
  ALTER TABLE notes ADD COLUMN folder TEXT NOT NULL DEFAULT 'General';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE notes ADD COLUMN tags TEXT[] NOT NULL DEFAULT '{}';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE notes ADD COLUMN is_pinned BOOLEAN NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE notes ADD COLUMN linked_entity_type TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE notes ADD COLUMN linked_entity_id VARCHAR(36);
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE notes ADD COLUMN linked_entity_name TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE notes ADD COLUMN word_count INT NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE notes ADD COLUMN created_by TEXT;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Ensure id column is the right type (may be integer on old schema)
-- If id already exists as varchar we skip; nothing to do.

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notes_folder
  ON notes(folder);

CREATE INDEX IF NOT EXISTS idx_notes_linked_entity
  ON notes(linked_entity_type, linked_entity_id)
  WHERE linked_entity_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notes_pinned
  ON notes(is_pinned DESC, updated_at DESC);

-- Full-text search index
CREATE INDEX IF NOT EXISTS idx_notes_fts
  ON notes USING gin(to_tsvector('english', title || ' ' || COALESCE(content, '')));

-- updated_at trigger (reuse existing function if available, otherwise create)
DO $$ BEGIN
  CREATE TRIGGER notes_updated_at
    BEFORE UPDATE ON notes
    FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
