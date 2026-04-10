-- Migration: Add text_color column to event_packing_items
-- Allows per-row text colour customisation in the Checklists view

ALTER TABLE event_packing_items
  ADD COLUMN IF NOT EXISTS text_color VARCHAR(20);
