-- Migration 045: Add scanned_at to load_plan_boxes
-- Separates "planned to go on truck" (box in load plan) from
-- "physically scanned onto truck" (box confirmed via barcode scan).
-- The scan-to-load page now ticks boxes as scanned_at IS NOT NULL,
-- so boxes dragged into a draft plan start with all checkboxes empty (⬜)
-- and only become ✅ when physically scanned at the truck.

ALTER TABLE load_plan_boxes ADD COLUMN IF NOT EXISTS scanned_at TIMESTAMPTZ;
