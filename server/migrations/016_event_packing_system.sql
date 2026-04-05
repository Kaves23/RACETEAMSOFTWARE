-- Migration 016: Event Packing & Loading System
-- Real-world workflow: Track items from multiple locations being packed for events
-- Supports collaborative packing with WhatsApp-style checklists

-- ============================================
-- EVENT PACKING LISTS
-- Master checklist for an event - what needs to be packed
-- ============================================
CREATE TABLE IF NOT EXISTS event_packing_lists (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  event_id VARCHAR(36) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,  -- e.g., "Race Weekend - Silverstone", "Test Day Checklist"
  description TEXT,
  status VARCHAR(50) DEFAULT 'draft',  -- draft, in_progress, packed, loaded, complete
  packing_deadline TIMESTAMP,  -- When everything should be packed by
  loading_time TIMESTAMP,  -- When trucks need to be loaded
  departure_time TIMESTAMP,  -- When convoy leaves
  created_by VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_event_packing_lists_event ON event_packing_lists(event_id);
CREATE INDEX IF NOT EXISTS idx_event_packing_lists_status ON event_packing_lists(status);

-- ============================================
-- EVENT PACKING ITEMS
-- Individual items on the packing list with tick-off tracking
-- ============================================
CREATE TABLE IF NOT EXISTS event_packing_items (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  packing_list_id VARCHAR(36) NOT NULL REFERENCES event_packing_lists(id) ON DELETE CASCADE,
  
  -- What needs to be packed
  item_name VARCHAR(255) NOT NULL,  -- Name/description of item
  item_id VARCHAR(36) REFERENCES items(id) ON DELETE SET NULL,  -- Optional: link to items table
  inventory_id VARCHAR(36) REFERENCES inventory(id) ON DELETE SET NULL,  -- Optional: link to inventory
  quantity INTEGER DEFAULT 1,
  
  -- Category/purpose
  category VARCHAR(100),  -- 'pit_setup', 'team_equipment', 'driver_personal', 'spares', 'consumables', etc.
  priority VARCHAR(50) DEFAULT 'normal',  -- critical, high, normal, low
  required BOOLEAN DEFAULT true,
  
  -- Source location
  source_location VARCHAR(255),  -- 'Workshop', 'Storage Unit A', 'Driver Home', 'Supplier', etc.
  source_notes TEXT,  -- Additional location details
  
  -- Packing status
  status VARCHAR(50) DEFAULT 'pending',  -- pending, in_progress, packed, loaded, missing
  packed_quantity INTEGER DEFAULT 0,  -- How many actually packed
  
  -- Who packed it
  packed_by VARCHAR(36),  -- User ID who marked it packed
  packed_by_name VARCHAR(255),  -- Name (for WhatsApp users who aren't in system)
  packed_at TIMESTAMP,
  
  -- Where it was packed into
  box_id VARCHAR(36) REFERENCES boxes(id) ON DELETE SET NULL,
  truck_name VARCHAR(100),  -- 'Main Truck', 'Van 1', 'Driver Car', etc.
  truck_zone VARCHAR(50),  -- 'Front', 'Back', 'Middle', 'Roof', etc.
  
  -- Loading confirmation
  loaded_by VARCHAR(36),
  loaded_by_name VARCHAR(255),
  loaded_at TIMESTAMP,
  
  -- Notes and issues
  notes TEXT,
  issue_reported BOOLEAN DEFAULT false,
  issue_description TEXT,
  
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_packing_items_list ON event_packing_items(packing_list_id);
CREATE INDEX IF NOT EXISTS idx_packing_items_category ON event_packing_items(packing_list_id, category);
CREATE INDEX IF NOT EXISTS idx_packing_items_status ON event_packing_items(packing_list_id, status);
CREATE INDEX IF NOT EXISTS idx_packing_items_location ON event_packing_items(source_location);
CREATE INDEX IF NOT EXISTS idx_packing_items_priority ON event_packing_items(packing_list_id, priority);
CREATE INDEX IF NOT EXISTS idx_packing_items_box ON event_packing_items(box_id);
CREATE INDEX IF NOT EXISTS idx_packing_items_pending ON event_packing_items(packing_list_id) WHERE status = 'pending';

-- ============================================
-- PACKING ACTIVITY LOG
-- Audit trail of all packing actions (for WhatsApp-style feed)
-- ============================================
CREATE TABLE IF NOT EXISTS event_packing_activity (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  packing_list_id VARCHAR(36) NOT NULL REFERENCES event_packing_lists(id) ON DELETE CASCADE,
  packing_item_id VARCHAR(36) REFERENCES event_packing_items(id) ON DELETE CASCADE,
  
  action_type VARCHAR(50) NOT NULL,  -- 'item_added', 'item_packed', 'item_loaded', 'status_changed', 'comment_added', 'issue_reported'
  action_by VARCHAR(36),  -- User ID
  action_by_name VARCHAR(255),  -- Name (for external users)
  action_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  details JSONB,  -- Flexible field for action-specific data
  message TEXT,  -- Human-readable message for feed
  
  -- WhatsApp integration
  whatsapp_message_id VARCHAR(255),  -- If triggered from WhatsApp
  whatsapp_phone VARCHAR(50),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_packing_activity_list ON event_packing_activity(packing_list_id, action_at DESC);
CREATE INDEX IF NOT EXISTS idx_packing_activity_item ON event_packing_activity(packing_item_id);
CREATE INDEX IF NOT EXISTS idx_packing_activity_whatsapp ON event_packing_activity(whatsapp_message_id) WHERE whatsapp_message_id IS NOT NULL;

-- ============================================
-- TRUCKS / VEHICLES
-- Track what's being loaded into which vehicle
-- ============================================
CREATE TABLE IF NOT EXISTS event_vehicles (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  event_id VARCHAR(36) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  
  name VARCHAR(255) NOT NULL,  -- 'Main Transporter', 'Support Van', 'Driver Car #1'
  vehicle_type VARCHAR(50),  -- 'truck', 'van', 'car', 'trailer'
  registration VARCHAR(50),
  driver_name VARCHAR(255),
  driver_phone VARCHAR(50),
  
  capacity_weight_kg DECIMAL(10,2),
  capacity_volume_m3 DECIMAL(10,2),
  
  loading_status VARCHAR(50) DEFAULT 'pending',  -- pending, in_progress, loaded, departed, arrived
  departure_time TIMESTAMP,
  arrival_time TIMESTAMP,
  
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_event_vehicles_event ON event_vehicles(event_id);
CREATE INDEX IF NOT EXISTS idx_event_vehicles_status ON event_vehicles(event_id, loading_status);

-- ============================================
-- PACKING TEMPLATES
-- Save common packing lists for reuse
-- ============================================
CREATE TABLE IF NOT EXISTS packing_templates (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name VARCHAR(255) NOT NULL,  -- 'Standard Race Weekend', 'Test Day', 'Endurance Event'
  description TEXT,
  event_type VARCHAR(100),  -- Match to event types
  is_active BOOLEAN DEFAULT true,
  
  created_by VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_packing_templates_type ON packing_templates(event_type);
CREATE INDEX IF NOT EXISTS idx_packing_templates_active ON packing_templates(is_active) WHERE is_active = true;

-- ============================================
-- TEMPLATE ITEMS
-- Items in a packing template
-- ============================================
CREATE TABLE IF NOT EXISTS packing_template_items (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  template_id VARCHAR(36) NOT NULL REFERENCES packing_templates(id) ON DELETE CASCADE,
  
  item_name VARCHAR(255) NOT NULL,
  item_id VARCHAR(36) REFERENCES items(id) ON DELETE SET NULL,
  category VARCHAR(100),
  quantity INTEGER DEFAULT 1,
  priority VARCHAR(50) DEFAULT 'normal',
  required BOOLEAN DEFAULT true,
  typical_location VARCHAR(255),
  notes TEXT,
  
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_template_items_template ON packing_template_items(template_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_template_items_category ON packing_template_items(template_id, category);

-- ============================================
-- WHATSAPP INTEGRATION CONFIG
-- Store WhatsApp webhook configuration
-- ============================================
CREATE TABLE IF NOT EXISTS whatsapp_config (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  phone_number VARCHAR(50) NOT NULL,  -- WhatsApp Business number
  phone_number_id VARCHAR(255),  -- Meta/WhatsApp phone number ID
  whatsapp_business_account_id VARCHAR(255),
  access_token TEXT,  -- Encrypted access token
  webhook_verify_token VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- WHATSAPP SUBSCRIPTIONS
-- Link phone numbers to events for notifications
-- ============================================
CREATE TABLE IF NOT EXISTS event_whatsapp_subscribers (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  event_id VARCHAR(36) NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  phone_number VARCHAR(50) NOT NULL,
  contact_name VARCHAR(255),
  receive_updates BOOLEAN DEFAULT true,
  can_update_checklist BOOLEAN DEFAULT true,  -- Can mark items as packed
  
  subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_activity TIMESTAMP,
  
  UNIQUE(event_id, phone_number)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_subscribers_event ON event_whatsapp_subscribers(event_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_subscribers_phone ON event_whatsapp_subscribers(phone_number);

-- ============================================
-- Add comments for documentation
-- ============================================

COMMENT ON TABLE event_packing_lists IS 'Master packing checklist for events - what needs to be packed';
COMMENT ON TABLE event_packing_items IS 'Individual items to pack with tick-off tracking and location';
COMMENT ON TABLE event_packing_activity IS 'Audit log of all packing actions - powers activity feed';
COMMENT ON TABLE event_vehicles IS 'Trucks/vans/cars being loaded for event transport';
COMMENT ON TABLE packing_templates IS 'Reusable packing list templates by event type';
COMMENT ON TABLE packing_template_items IS 'Items in a packing template';
COMMENT ON TABLE whatsapp_config IS 'WhatsApp Business API configuration';
COMMENT ON TABLE event_whatsapp_subscribers IS 'Phone numbers subscribed to event updates via WhatsApp';

COMMENT ON COLUMN event_packing_items.category IS 'pit_setup, team_equipment, driver_personal, spares, consumables, tools, etc.';
COMMENT ON COLUMN event_packing_items.source_location IS 'Where item comes from: Workshop, Storage Unit A, Driver Home, Supplier, etc.';
COMMENT ON COLUMN event_packing_items.truck_zone IS 'Where in truck: Front, Back, Middle, Roof, Under floor, etc.';
COMMENT ON COLUMN event_packing_items.status IS 'pending → in_progress → packed → loaded (or missing if not found)';
COMMENT ON COLUMN event_packing_activity.action_type IS 'item_added, item_packed, item_loaded, status_changed, comment_added, issue_reported';
COMMENT ON COLUMN event_vehicles.vehicle_type IS 'truck, van, car, trailer';
