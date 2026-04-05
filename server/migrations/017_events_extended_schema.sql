-- Migration 017: Extend events table with all needed fields
-- Convert localStorage events structure to database-first approach

-- Add missing columns to events table
ALTER TABLE events 
  ADD COLUMN IF NOT EXISTS brief TEXT,
  ADD COLUMN IF NOT EXISTS drivers JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS crew JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS documents JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS runbook JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS setups JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS run_plan JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS checklists JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS session_logs JSONB DEFAULT '{}'::jsonb;

-- Update table comment
COMMENT ON TABLE events IS 'Race events with full runbook, setup, and planning data';
COMMENT ON COLUMN events.brief IS 'Event summary and key information';
COMMENT ON COLUMN events.drivers IS 'Array of driver objects: [{staffId, class, number}]';
COMMENT ON COLUMN events.crew IS 'Array of crew objects: [{staffId, role}]';
COMMENT ON COLUMN events.documents IS 'Array of documents: [{provider, name, url, id}]';
COMMENT ON COLUMN events.runbook IS 'Runbook object: {version, notes, gates: [], schedule: []}';
COMMENT ON COLUMN events.setups IS 'Array of vehicle setups for drivers';
COMMENT ON COLUMN events.run_plan IS 'Array of session schedule: [{start, name, driver, status, durationMin}]';
COMMENT ON COLUMN events.checklists IS 'Array of event checklists';
COMMENT ON COLUMN events.session_logs IS 'Object mapping session IDs to log data: {sessionId: {weather, tags, feedback, ...}}';
