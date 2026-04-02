-- Migration 002: History and Audit Tables (PostgreSQL)
-- Created: 1 April 2026
-- PostgreSQL compatible version

-- ============================================
-- AUDIT TRAIL TABLES
-- ============================================

-- Item history (complete audit trail for items)
CREATE TABLE IF NOT EXISTS item_history (
  id VARCHAR(36) PRIMARY KEY,
  item_id VARCHAR(36) NOT NULL,
  action VARCHAR(50) NOT NULL,
  details TEXT,
  from_box_id VARCHAR(36),
  to_box_id VARCHAR(36),
  from_location_id VARCHAR(36),
  to_location_id VARCHAR(36),
  previous_status VARCHAR(50),
  new_status VARCHAR(50),
  performed_by_user_id VARCHAR(36),
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(45),
  user_agent TEXT
);

-- Create indexes for item_history
CREATE INDEX IF NOT EXISTS idx_item_history_item ON item_history(item_id);
CREATE INDEX IF NOT EXISTS idx_item_history_action ON item_history(action);
CREATE INDEX IF NOT EXISTS idx_item_history_timestamp ON item_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_item_history_user ON item_history(performed_by_user_id);
CREATE INDEX IF NOT EXISTS idx_item_history_boxes ON item_history(from_box_id, to_box_id);

-- Box history (complete audit trail for boxes)
CREATE TABLE IF NOT EXISTS box_history (
  id VARCHAR(36) PRIMARY KEY,
  box_id VARCHAR(36) NOT NULL,
  action VARCHAR(50) NOT NULL,
  details TEXT,
  from_location_id VARCHAR(36),
  to_location_id VARCHAR(36),
  from_truck_id VARCHAR(36),
  to_truck_id VARCHAR(36),
  previous_status VARCHAR(50),
  new_status VARCHAR(50),
  performed_by_user_id VARCHAR(36),
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(45),
  user_agent TEXT
);

-- Create indexes for box_history
CREATE INDEX IF NOT EXISTS idx_box_history_box ON box_history(box_id);
CREATE INDEX IF NOT EXISTS idx_box_history_action ON box_history(action);
CREATE INDEX IF NOT EXISTS idx_box_history_timestamp ON box_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_box_history_user ON box_history(performed_by_user_id);
CREATE INDEX IF NOT EXISTS idx_box_history_locations ON box_history(from_location_id, to_location_id);

-- Truck history (complete audit trail for trucks)
CREATE TABLE IF NOT EXISTS truck_history (
  id VARCHAR(36) PRIMARY KEY,
  truck_id VARCHAR(36) NOT NULL,
  action VARCHAR(50) NOT NULL,
  details TEXT,
  from_location_id VARCHAR(36),
  to_location_id VARCHAR(36),
  previous_status VARCHAR(50),
  new_status VARCHAR(50),
  performed_by_user_id VARCHAR(36),
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(45),
  user_agent TEXT
);

-- Create indexes for truck_history
CREATE INDEX IF NOT EXISTS idx_truck_history_truck ON truck_history(truck_id);
CREATE INDEX IF NOT EXISTS idx_truck_history_action ON truck_history(action);
CREATE INDEX IF NOT EXISTS idx_truck_history_timestamp ON truck_history(timestamp);
CREATE INDEX IF NOT EXISTS idx_truck_history_user ON truck_history(performed_by_user_id);
