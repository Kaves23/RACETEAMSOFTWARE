-- Migration 002: History and Audit Tables
-- Created: 30 January 2026
-- PlanetScale MySQL 8.0

-- ============================================
-- AUDIT TRAIL TABLES
-- ============================================

-- Item history (complete audit trail for items)
CREATE TABLE IF NOT EXISTS item_history (
  id VARCHAR(36) PRIMARY KEY,
  item_id VARCHAR(36) NOT NULL,
  action VARCHAR(50) NOT NULL,
  details TEXT,
  from_box_id VARCHAR(36) NULL,
  to_box_id VARCHAR(36) NULL,
  from_location_id VARCHAR(36) NULL,
  to_location_id VARCHAR(36) NULL,
  previous_status VARCHAR(50),
  new_status VARCHAR(50),
  performed_by_user_id VARCHAR(36) NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(45),
  user_agent TEXT,
  
  INDEX idx_item (item_id),
  INDEX idx_action (action),
  INDEX idx_timestamp (timestamp),
  INDEX idx_user (performed_by_user_id),
  INDEX idx_boxes (from_box_id, to_box_id)
);

-- Box history (complete audit trail for boxes)
CREATE TABLE IF NOT EXISTS box_history (
  id VARCHAR(36) PRIMARY KEY,
  box_id VARCHAR(36) NOT NULL,
  action VARCHAR(50) NOT NULL,
  details TEXT,
  from_location_id VARCHAR(36) NULL,
  to_location_id VARCHAR(36) NULL,
  from_truck_id VARCHAR(36) NULL,
  to_truck_id VARCHAR(36) NULL,
  from_zone VARCHAR(50) NULL,
  to_zone VARCHAR(50) NULL,
  previous_status VARCHAR(50),
  new_status VARCHAR(50),
  load_plan_id VARCHAR(36) NULL,
  performed_by_user_id VARCHAR(36) NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(45),
  user_agent TEXT,
  
  INDEX idx_box (box_id),
  INDEX idx_action (action),
  INDEX idx_timestamp (timestamp),
  INDEX idx_user (performed_by_user_id),
  INDEX idx_trucks (from_truck_id, to_truck_id),
  INDEX idx_load_plan (load_plan_id)
);

-- Truck history (complete audit trail for trucks)
CREATE TABLE IF NOT EXISTS truck_history (
  id VARCHAR(36) PRIMARY KEY,
  truck_id VARCHAR(36) NOT NULL,
  action VARCHAR(50) NOT NULL,
  details TEXT,
  from_location_id VARCHAR(36) NULL,
  to_location_id VARCHAR(36) NULL,
  event_id VARCHAR(36) NULL,
  load_plan_id VARCHAR(36) NULL,
  previous_status VARCHAR(50),
  new_status VARCHAR(50),
  gps_latitude DECIMAL(10,8),
  gps_longitude DECIMAL(11,8),
  performed_by_user_id VARCHAR(36) NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_truck (truck_id),
  INDEX idx_action (action),
  INDEX idx_timestamp (timestamp),
  INDEX idx_event (event_id),
  INDEX idx_load_plan (load_plan_id)
);

-- ============================================
-- Migration complete
-- ============================================
