-- Migration 024: Add task styling and event linking
-- Created: 2026-04-06
-- Adds custom styling fields and event relationship

-- Add styling columns
ALTER TABLE event_packing_items 
ADD COLUMN IF NOT EXISTS font_family VARCHAR(100),
ADD COLUMN IF NOT EXISTS font_size VARCHAR(20),
ADD COLUMN IF NOT EXISTS is_expanded BOOLEAN DEFAULT true;

-- Add event relationship column (for general tasks that link to events)
-- Note: packing_list_id already links to packing_lists which has event_id
-- But for flexibility, we add direct event linking
ALTER TABLE event_packing_items 
ADD COLUMN IF NOT EXISTS linked_event_id VARCHAR(36);

-- Add foreign key for linked events
ALTER TABLE event_packing_items 
ADD CONSTRAINT fk_linked_event 
FOREIGN KEY (linked_event_id) REFERENCES events(id) ON DELETE SET NULL;

-- Add index for event queries
CREATE INDEX IF NOT EXISTS idx_packing_items_linked_event ON event_packing_items(linked_event_id);

-- Migration complete
