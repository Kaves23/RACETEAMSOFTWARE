-- Migration 044: Add notes column to boxes
-- Supports free-text notes on boxes, primarily for garage storage boxes
-- to list contents without formal inventory/asset tracking.

ALTER TABLE boxes ADD COLUMN IF NOT EXISTS notes TEXT;
