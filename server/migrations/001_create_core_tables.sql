-- Migration 001: Core Tables for PostgreSQL
-- Created: 30 January 2026

-- ============================================
-- SHARED CORE TABLES
-- ============================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(36) PRIMARY KEY,
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(255),
  role VARCHAR(50) DEFAULT 'user',
  is_active BOOLEAN DEFAULT TRUE,
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Locations table
CREATE TABLE IF NOT EXISTS locations (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  location_type VARCHAR(50),
  address TEXT,
  city VARCHAR(100),
  country VARCHAR(100),
  postal_code VARCHAR(20),
  gps_latitude DECIMAL(10,8),
  gps_longitude DECIMAL(11,8),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_locations_type ON locations(location_type);
CREATE INDEX IF NOT EXISTS idx_locations_city ON locations(city);
CREATE INDEX IF NOT EXISTS idx_locations_country ON locations(country);

-- Events table
CREATE TABLE IF NOT EXISTS events (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  circuit VARCHAR(255),
  country VARCHAR(100),
  start_date DATE,
  end_date DATE,
  event_type VARCHAR(50),
  status VARCHAR(50) DEFAULT 'scheduled',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_events_dates ON events(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);

-- ============================================
-- LOGISTICS TABLES
-- ============================================

-- Items table (equipment and assets)
CREATE TABLE IF NOT EXISTS items (
  id VARCHAR(36) PRIMARY KEY,
  barcode VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  item_type VARCHAR(50),
  category VARCHAR(100),
  description TEXT,
  current_box_id VARCHAR(36),
  current_location_id VARCHAR(36),
  last_maintenance_date DATE,
  next_maintenance_date DATE,
  weight_kg DECIMAL(10,2),
  value_usd DECIMAL(10,2),
  serial_number VARCHAR(255),
  status VARCHAR(50) DEFAULT 'available',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_items_barcode ON items(barcode);
CREATE INDEX IF NOT EXISTS idx_items_type ON items(item_type);
CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
CREATE INDEX IF NOT EXISTS idx_items_box ON items(current_box_id);
CREATE INDEX IF NOT EXISTS idx_items_location ON items(current_location_id);
CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);

-- Boxes table
CREATE TABLE IF NOT EXISTS boxes (
  id VARCHAR(36) PRIMARY KEY,
  barcode VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  dimensions_length_cm DECIMAL(10,2),
  dimensions_width_cm DECIMAL(10,2),
  dimensions_height_cm DECIMAL(10,2),
  max_weight_kg DECIMAL(10,2),
  current_weight_kg DECIMAL(10,2) DEFAULT 0,
  current_location_id VARCHAR(36),
  current_truck_id VARCHAR(36),
  current_zone VARCHAR(100),
  rfid_tag VARCHAR(100),
  status VARCHAR(50) DEFAULT 'available',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_boxes_barcode ON boxes(barcode);
CREATE INDEX IF NOT EXISTS idx_boxes_location ON boxes(current_location_id);
CREATE INDEX IF NOT EXISTS idx_boxes_truck ON boxes(current_truck_id);
CREATE INDEX IF NOT EXISTS idx_boxes_status ON boxes(status);

-- Box contents (junction table)
CREATE TABLE IF NOT EXISTS box_contents (
  box_id VARCHAR(36) NOT NULL,
  item_id VARCHAR(36) NOT NULL,
  packed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  packed_by_user_id VARCHAR(36),
  position_in_box INTEGER,
  PRIMARY KEY (box_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_box_contents_box ON box_contents(box_id);
CREATE INDEX IF NOT EXISTS idx_box_contents_item ON box_contents(item_id);

-- Trucks table
CREATE TABLE IF NOT EXISTS trucks (
  id VARCHAR(36) PRIMARY KEY,
  registration VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255),
  truck_type VARCHAR(50),
  dimensions_length_m DECIMAL(10,2),
  dimensions_width_m DECIMAL(10,2),
  dimensions_height_m DECIMAL(10,2),
  max_weight_kg DECIMAL(10,2),
  current_location_id VARCHAR(36),
  current_event_id VARCHAR(36),
  gps_latitude DECIMAL(10,8),
  gps_longitude DECIMAL(11,8),
  status VARCHAR(50) DEFAULT 'available',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_trucks_registration ON trucks(registration);
CREATE INDEX IF NOT EXISTS idx_trucks_location ON trucks(current_location_id);
CREATE INDEX IF NOT EXISTS idx_trucks_event ON trucks(current_event_id);
CREATE INDEX IF NOT EXISTS idx_trucks_status ON trucks(status);

-- Truck zones
CREATE TABLE IF NOT EXISTS truck_zones (
  id SERIAL PRIMARY KEY,
  truck_id VARCHAR(36) NOT NULL,
  zone_name VARCHAR(100) NOT NULL,
  max_weight_kg DECIMAL(10,2),
  max_volume_m3 DECIMAL(10,3),
  position_x DECIMAL(10,2),
  position_y DECIMAL(10,2),
  position_z DECIMAL(10,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(truck_id, zone_name)
);

CREATE INDEX IF NOT EXISTS idx_truck_zones_truck ON truck_zones(truck_id);

-- Load plans
CREATE TABLE IF NOT EXISTS load_plans (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255),
  event_id VARCHAR(36),
  truck_id VARCHAR(36),
  status VARCHAR(50) DEFAULT 'draft',
  total_weight_kg DECIMAL(10,2) DEFAULT 0,
  total_volume_m3 DECIMAL(10,3) DEFAULT 0,
  departure_time TIMESTAMP,
  arrival_time TIMESTAMP,
  approved_by_user_id VARCHAR(36),
  approved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_load_plans_event ON load_plans(event_id);
CREATE INDEX IF NOT EXISTS idx_load_plans_truck ON load_plans(truck_id);
CREATE INDEX IF NOT EXISTS idx_load_plans_status ON load_plans(status);

-- Load plan boxes (junction table)
CREATE TABLE IF NOT EXISTS load_plan_boxes (
  load_plan_id VARCHAR(36) NOT NULL,
  box_id VARCHAR(36) NOT NULL,
  truck_zone VARCHAR(100),
  position_x DECIMAL(10,2),
  position_y DECIMAL(10,2),
  position_z DECIMAL(10,2),
  load_order INTEGER,
  unload_order INTEGER,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (load_plan_id, box_id)
);

CREATE INDEX IF NOT EXISTS idx_load_plan_boxes_plan ON load_plan_boxes(load_plan_id);
CREATE INDEX IF NOT EXISTS idx_load_plan_boxes_box ON load_plan_boxes(box_id);

-- Insert default admin user
INSERT INTO users (id, username, email, full_name, role, is_active)
VALUES ('admin-001', 'admin', 'admin@raceteam.com', 'System Administrator', 'admin', TRUE)
ON CONFLICT (username) DO NOTHING;

-- Migration complete
