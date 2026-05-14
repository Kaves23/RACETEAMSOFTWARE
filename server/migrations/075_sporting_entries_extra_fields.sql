-- Add extra optional fields to sporting_entries used by entries.html UI
ALTER TABLE sporting_entries
  ADD COLUMN IF NOT EXISTS driver_id          INTEGER,
  ADD COLUMN IF NOT EXISTS event_id           INTEGER,
  ADD COLUMN IF NOT EXISTS licence_number     TEXT,
  ADD COLUMN IF NOT EXISTS championship       TEXT,
  ADD COLUMN IF NOT EXISTS required_documents TEXT,
  ADD COLUMN IF NOT EXISTS approval_status    TEXT;
