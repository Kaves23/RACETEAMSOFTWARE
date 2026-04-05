-- Migration 015: Add Many-to-Many Relationships for Assets, Boxes, Items, and Events
-- This migration creates relationship tables for tracking assignments to events

-- ============================================
-- BOXES <-> EVENTS (many-to-many)
-- Track which boxes are assigned to which events
-- ============================================
CREATE TABLE IF NOT EXISTS box_events (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  box_id VARCHAR(36) NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  event_id VARCHAR(36) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  packed_status VARCHAR(50) DEFAULT 'pending',  -- pending, in_progress, packed, loaded
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(box_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_box_events_box ON box_events(box_id);
CREATE INDEX IF NOT EXISTS idx_box_events_event ON box_events(event_id);
CREATE INDEX IF NOT EXISTS idx_box_events_status ON box_events(packed_status);

-- ============================================
-- ITEMS <-> EVENTS (many-to-many)
-- Track which items (equipment/assets) are assigned to events
-- (independent of which box they're packed in)
-- ============================================
CREATE TABLE IF NOT EXISTS item_events (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  item_id VARCHAR(36) NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  event_id VARCHAR(36) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  quantity INTEGER DEFAULT 1,  -- How many of this item for this event
  required BOOLEAN DEFAULT true,  -- Is this item required vs optional?
  assigned_by VARCHAR(36),  -- User who assigned it
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  checked_out_at TIMESTAMP,  -- When it was packed/loaded
  returned_at TIMESTAMP,  -- When it was returned after event
  condition_notes TEXT,  -- Post-event condition notes
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(item_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_item_events_item ON item_events(item_id);
CREATE INDEX IF NOT EXISTS idx_item_events_event ON item_events(event_id);
CREATE INDEX IF NOT EXISTS idx_item_events_required ON item_events(event_id, required);
CREATE INDEX IF NOT EXISTS idx_item_events_checked_out ON item_events(event_id) WHERE checked_out_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_item_events_pending_return ON item_events(event_id) WHERE checked_out_at IS NOT NULL AND returned_at IS NULL;

-- ============================================
-- INVENTORY <-> EVENTS (many-to-many)
-- Track which inventory items (consumables) are assigned to events
-- ============================================
CREATE TABLE IF NOT EXISTS inventory_events (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  inventory_id VARCHAR(36) NOT NULL REFERENCES inventory(id) ON DELETE CASCADE,
  event_id VARCHAR(36) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  quantity_allocated INTEGER NOT NULL,  -- How many units allocated
  quantity_used INTEGER DEFAULT 0,  -- How many actually used
  assigned_by VARCHAR(36),
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  returned_at TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(inventory_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_events_inventory ON inventory_events(inventory_id);
CREATE INDEX IF NOT EXISTS idx_inventory_events_event ON inventory_events(event_id);
CREATE INDEX IF NOT EXISTS idx_inventory_events_pending ON inventory_events(event_id) WHERE returned_at IS NULL;

-- ============================================
-- BOXES <-> DRIVERS (many-to-many)
-- Track which boxes are assigned to which drivers over time
-- (complement to boxes.assigned_driver_id which is current assignment)
-- ============================================
CREATE TABLE IF NOT EXISTS box_assignments (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  box_id VARCHAR(36) NOT NULL REFERENCES boxes(id) ON DELETE CASCADE,
  driver_id VARCHAR(36) NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  event_id VARCHAR(36) REFERENCES events(id) ON DELETE SET NULL,  -- Optional: for which event
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  unassigned_at TIMESTAMP,  -- When assignment ended
  assigned_by VARCHAR(36),  -- User who made the assignment
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_box_assignments_box ON box_assignments(box_id);
CREATE INDEX IF NOT EXISTS idx_box_assignments_driver ON box_assignments(driver_id);
CREATE INDEX IF NOT EXISTS idx_box_assignments_event ON box_assignments(event_id);
CREATE INDEX IF NOT EXISTS idx_box_assignments_active ON box_assignments(box_id, driver_id) WHERE unassigned_at IS NULL;

-- ============================================
-- ITEMS <-> DRIVERS (already exists from migration 014)
-- driver_items table handles this
-- ============================================

-- ============================================
-- ASSET TYPES <-> EVENTS (many-to-many)
-- Track which asset types are typically needed for event types
-- (for template/planning purposes)
-- ============================================
CREATE TABLE IF NOT EXISTS asset_type_event_templates (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  asset_type_id VARCHAR(36) NOT NULL REFERENCES asset_types(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,  -- e.g., "Race Weekend", "Test Day", "Practice"
  typical_quantity INTEGER DEFAULT 1,
  required BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(asset_type_id, event_type)
);

CREATE INDEX IF NOT EXISTS idx_asset_type_templates_type ON asset_type_event_templates(asset_type_id);
CREATE INDEX IF NOT EXISTS idx_asset_type_templates_event ON asset_type_event_templates(event_type);

-- ============================================
-- SUPPLIERS <-> ITEMS (many-to-many)
-- Track which suppliers provide which items
-- ============================================
CREATE TABLE IF NOT EXISTS supplier_items (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  supplier_id VARCHAR(36) NOT NULL,  -- References suppliers (not created yet, using VARCHAR for now)
  item_id VARCHAR(36) NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  supplier_sku VARCHAR(100),  -- Supplier's product code
  unit_cost DECIMAL(10,2),
  lead_time_days INTEGER,
  minimum_order_quantity INTEGER DEFAULT 1,
  preferred BOOLEAN DEFAULT false,  -- Is this the preferred supplier for this item?
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(supplier_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_supplier_items_supplier ON supplier_items(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_items_item ON supplier_items(item_id);
CREATE INDEX IF NOT EXISTS idx_supplier_items_preferred ON supplier_items(item_id, preferred) WHERE preferred = true;

-- ============================================
-- Add helpful comments
-- ============================================

COMMENT ON TABLE box_events IS 'Many-to-many: Boxes assigned to events with packing status';
COMMENT ON TABLE item_events IS 'Many-to-many: Items (equipment/assets) assigned to events';
COMMENT ON TABLE inventory_events IS 'Many-to-many: Inventory (consumables) allocated to events';
COMMENT ON TABLE box_assignments IS 'Many-to-many: Box assignment history to drivers (complements boxes.assigned_driver_id)';
COMMENT ON TABLE asset_type_event_templates IS 'Templates: Which asset types are needed for event types';
COMMENT ON TABLE supplier_items IS 'Many-to-many: Suppliers that provide items with pricing';

COMMENT ON COLUMN box_events.packed_status IS 'Packing workflow: pending → in_progress → packed → loaded';
COMMENT ON COLUMN item_events.checked_out_at IS 'When item was packed/loaded for event';
COMMENT ON COLUMN item_events.returned_at IS 'When item was returned after event';
COMMENT ON COLUMN box_assignments.unassigned_at IS 'NULL = currently assigned, timestamp = historical assignment';
COMMENT ON COLUMN supplier_items.preferred IS 'Mark the preferred supplier for an item';
