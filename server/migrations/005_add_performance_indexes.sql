-- Migration 005: Performance Indexes
-- Created: 31 March 2026
-- Purpose: Add missing indexes for frequently queried/sorted columns

-- Add index on items.created_at for ORDER BY queries
CREATE INDEX IF NOT EXISTS idx_items_created_at ON items(created_at DESC);

-- Add index on boxes.created_at for ORDER BY queries  
CREATE INDEX IF NOT EXISTS idx_boxes_created_at ON boxes(created_at DESC);

-- Composite index for common item queries (type + status + created_at)
CREATE INDEX IF NOT EXISTS idx_items_type_status_created ON items(item_type, status, created_at DESC);

-- Composite index for common box queries (status + location + created_at)
CREATE INDEX IF NOT EXISTS idx_boxes_status_location_created ON boxes(status, current_location_id, created_at DESC);
