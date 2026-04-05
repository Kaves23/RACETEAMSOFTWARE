-- Migration 018: Allow NULL event_id for general packing lists
-- This enables creating a "GENERAL LIST" that appears on all events

-- Remove NOT NULL constraint from event_id in event_packing_lists
ALTER TABLE event_packing_lists 
  ALTER COLUMN event_id DROP NOT NULL;

-- Note: We keep the foreign key constraint, which will work fine with NULL values
-- NULL event_id means it's a GENERAL list visible on all events
