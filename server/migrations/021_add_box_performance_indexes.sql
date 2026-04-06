-- Migration 021: Add Performance Indexes for Box Loading
-- Adds missing indexes to improve query performance

-- Boxes table indexes
CREATE INDEX IF NOT EXISTS idx_boxes_status ON boxes(status);
CREATE INDEX IF NOT EXISTS idx_boxes_current_location ON boxes(current_location_id);
CREATE INDEX IF NOT EXISTS idx_boxes_created_desc ON boxes(created_at DESC);

-- Ensure driver index exists (should be from migration 013, but verify)
CREATE INDEX IF NOT EXISTS idx_boxes_assigned_driver ON boxes(assigned_driver_id);

-- Box contents indexes (should exist from migration 020, but verify)
CREATE INDEX IF NOT EXISTS idx_box_contents_box_id ON box_contents(box_id);
CREATE INDEX IF NOT EXISTS idx_box_contents_item_id ON box_contents(item_id);

-- Comment for documentation
COMMENT ON INDEX idx_boxes_status IS 'Improves filtering boxes by status (available, packed, loaded, etc.)';
COMMENT ON INDEX idx_boxes_current_location IS 'Improves filtering boxes by location';
COMMENT ON INDEX idx_boxes_created_desc IS 'Improves sorting boxes by creation date';
