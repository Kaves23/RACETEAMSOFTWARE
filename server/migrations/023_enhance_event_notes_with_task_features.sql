-- Migration 023: Enhance Event Notes with full task management features
-- Created: 2026-04-06
-- Adds all task functionality to event_packing_items to make it a complete task system

-- Add task management columns to event_packing_items
ALTER TABLE event_packing_items 
ADD COLUMN IF NOT EXISTS assigned_to_user_id VARCHAR(36),
ADD COLUMN IF NOT EXISTS assigned_to_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS start_date DATE,
ADD COLUMN IF NOT EXISTS due_date DATE,
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS estimated_hours DECIMAL(6,2),
ADD COLUMN IF NOT EXISTS actual_hours DECIMAL(6,2),
ADD COLUMN IF NOT EXISTS progress_percent INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS tags TEXT,
ADD COLUMN IF NOT EXISTS created_by_user_id VARCHAR(36),
ADD COLUMN IF NOT EXISTS created_by_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS parent_item_id VARCHAR(36),
ADD COLUMN IF NOT EXISTS dependencies TEXT,
ADD COLUMN IF NOT EXISTS color VARCHAR(20),
ADD COLUMN IF NOT EXISTS is_milestone BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS blocked_reason TEXT;

-- Add foreign key for parent items (subtasks)
DO $$ BEGIN
  ALTER TABLE event_packing_items
    ADD CONSTRAINT fk_parent_item
    FOREIGN KEY (parent_item_id) REFERENCES event_packing_items(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Add indexes for new task-related queries
CREATE INDEX IF NOT EXISTS idx_packing_items_assigned_to ON event_packing_items(assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_packing_items_due_date ON event_packing_items(due_date);
CREATE INDEX IF NOT EXISTS idx_packing_items_start_date ON event_packing_items(start_date);
CREATE INDEX IF NOT EXISTS idx_packing_items_parent ON event_packing_items(parent_item_id);
CREATE INDEX IF NOT EXISTS idx_packing_items_created_by ON event_packing_items(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_packing_items_milestone ON event_packing_items(is_milestone) WHERE is_milestone = true;
CREATE INDEX IF NOT EXISTS idx_packing_items_progress ON event_packing_items(packing_list_id, progress_percent);

-- Update status values to be more task-like (but keep backward compatibility)
-- pending, in_progress, completed, blocked, cancelled, packed, loaded, missing
-- The system will support both task statuses and packing statuses

-- Migration complete
