-- Migration 003: Support and Tracking Tables
-- Created: 30 January 2026
-- PlanetScale MySQL 8.0

-- ============================================
-- BARCODE TRACKING
-- ============================================

-- Barcodes (master registry of all barcodes)
CREATE TABLE IF NOT EXISTS barcodes (
  id VARCHAR(36) PRIMARY KEY,
  barcode VARCHAR(100) NOT NULL UNIQUE,
  barcode_type ENUM('item', 'box', 'truck', 'asset', 'location', 'zone') NOT NULL,
  entity_id VARCHAR(36) NOT NULL,
  format VARCHAR(50) DEFAULT 'CODE128',
  print_count INT DEFAULT 0,
  last_printed_at TIMESTAMP NULL,
  last_scanned_at TIMESTAMP NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_barcode (barcode),
  INDEX idx_type (barcode_type),
  INDEX idx_entity (entity_id),
  INDEX idx_active (is_active)
);

-- Barcode scans (every scan logged)
CREATE TABLE IF NOT EXISTS barcode_scans (
  id VARCHAR(36) PRIMARY KEY,
  barcode_id VARCHAR(36) NOT NULL,
  barcode VARCHAR(100) NOT NULL,
  scan_type ENUM('pack', 'unpack', 'load', 'unload', 'verify', 'relocate', 'audit') NOT NULL,
  location_id VARCHAR(36) NULL,
  scanned_by_user_id VARCHAR(36) NULL,
  device_info TEXT,
  gps_latitude DECIMAL(10,8),
  gps_longitude DECIMAL(11,8),
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_barcode_id (barcode_id),
  INDEX idx_barcode (barcode),
  INDEX idx_scan_type (scan_type),
  INDEX idx_timestamp (timestamp),
  INDEX idx_user (scanned_by_user_id),
  INDEX idx_location (location_id)
);

-- ============================================
-- MAINTENANCE TRACKING
-- ============================================

-- Item maintenance schedule
CREATE TABLE IF NOT EXISTS item_maintenance_schedule (
  id VARCHAR(36) PRIMARY KEY,
  item_id VARCHAR(36) NOT NULL,
  maintenance_type ENUM('inspection', 'service', 'calibration', 'replacement', 'cleaning') NOT NULL,
  frequency_days INT NOT NULL,
  last_maintenance_date DATE NULL,
  next_maintenance_date DATE NULL,
  status ENUM('scheduled', 'overdue', 'completed', 'skipped', 'cancelled') DEFAULT 'scheduled',
  performed_by_user_id VARCHAR(36) NULL,
  notes TEXT,
  cost DECIMAL(10,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_item (item_id),
  INDEX idx_type (maintenance_type),
  INDEX idx_next_date (next_maintenance_date),
  INDEX idx_status (status)
);

-- Maintenance history (completed maintenance records)
CREATE TABLE IF NOT EXISTS maintenance_history (
  id VARCHAR(36) PRIMARY KEY,
  item_id VARCHAR(36) NOT NULL,
  maintenance_type ENUM('inspection', 'service', 'calibration', 'replacement', 'cleaning') NOT NULL,
  performed_date DATE NOT NULL,
  performed_by_user_id VARCHAR(36) NULL,
  description TEXT,
  cost DECIMAL(10,2),
  next_due_date DATE NULL,
  attachments TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_item (item_id),
  INDEX idx_date (performed_date),
  INDEX idx_type (maintenance_type),
  INDEX idx_user (performed_by_user_id)
);

-- ============================================
-- ALERTS AND NOTIFICATIONS
-- ============================================

-- System alerts (maintenance due, capacity warnings, etc)
CREATE TABLE IF NOT EXISTS alerts (
  id VARCHAR(36) PRIMARY KEY,
  alert_type ENUM('maintenance_due', 'capacity_warning', 'missing_item', 'expired_item', 'compliance', 'temperature', 'damage', 'other') NOT NULL,
  severity ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium',
  title VARCHAR(255) NOT NULL,
  message TEXT,
  entity_type VARCHAR(50),
  entity_id VARCHAR(36),
  is_read BOOLEAN DEFAULT FALSE,
  is_resolved BOOLEAN DEFAULT FALSE,
  resolved_by_user_id VARCHAR(36) NULL,
  resolved_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_type (alert_type),
  INDEX idx_severity (severity),
  INDEX idx_status (is_read, is_resolved),
  INDEX idx_entity (entity_type, entity_id),
  INDEX idx_created (created_at)
);

-- ============================================
-- COMPLIANCE AND DOCUMENTATION
-- ============================================

-- Documents (PDFs, images, manuals, compliance docs)
CREATE TABLE IF NOT EXISTS documents (
  id VARCHAR(36) PRIMARY KEY,
  document_type ENUM('manual', 'certificate', 'invoice', 'compliance', 'photo', 'inspection_report', 'other') NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  file_path VARCHAR(500),
  file_url TEXT,
  file_size_bytes BIGINT,
  mime_type VARCHAR(100),
  entity_type VARCHAR(50),
  entity_id VARCHAR(36),
  uploaded_by_user_id VARCHAR(36) NULL,
  tags TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_type (document_type),
  INDEX idx_entity (entity_type, entity_id),
  INDEX idx_uploaded_by (uploaded_by_user_id),
  INDEX idx_created (created_at)
);

-- ============================================
-- Migration complete
-- ============================================
