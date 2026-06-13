-- 092 — Race Control: link penalties to incidents + add steward-friendly fields
ALTER TABLE penalties ADD COLUMN IF NOT EXISTS incident_id TEXT;
ALTER TABLE penalties ADD COLUMN IF NOT EXISTS driver_id   TEXT;
ALTER TABLE penalties ADD COLUMN IF NOT EXISTS event_id    TEXT;
CREATE INDEX IF NOT EXISTS idx_penalties_incident_id ON penalties(incident_id);
CREATE INDEX IF NOT EXISTS idx_penalties_event_id    ON penalties(event_id);
