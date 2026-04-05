-- Migration 010: Create remaining business tables
-- Created: 2026-04-04
-- Migrates all remaining localStorage data to PlanetScale

-- ============================================
-- TASKS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS tasks (
  id VARCHAR(36) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  priority VARCHAR(20) DEFAULT 'medium',
  assigned_to_user_id VARCHAR(36),
  event_id VARCHAR(36),
  category VARCHAR(100),
  due_date DATE,
  completed_at TIMESTAMP,
  tags TEXT,
  created_by_user_id VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to_user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_event ON tasks(event_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);

-- ============================================
-- NOTES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS notes (
  id VARCHAR(36) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  content TEXT,
  tags TEXT,
  is_pinned BOOLEAN DEFAULT FALSE,
  event_id VARCHAR(36),
  created_by_user_id VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notes_pinned ON notes(is_pinned);
CREATE INDEX IF NOT EXISTS idx_notes_event ON notes(event_id);
CREATE INDEX IF NOT EXISTS idx_notes_created_by ON notes(created_by_user_id);

-- ============================================
-- RUNBOOKS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS runbooks (
  id VARCHAR(36) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  description TEXT,
  content TEXT,
  steps TEXT,
  tags TEXT,
  version INT DEFAULT 1,
  is_active BOOLEAN DEFAULT TRUE,
  event_id VARCHAR(36),
  created_by_user_id VARCHAR(36),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_runbooks_category ON runbooks(category);
CREATE INDEX IF NOT EXISTS idx_runbooks_active ON runbooks(is_active);
CREATE INDEX IF NOT EXISTS idx_runbooks_event ON runbooks(event_id);

-- ============================================
-- DRIVERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS drivers (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  license_number VARCHAR(100),
  category VARCHAR(50),
  team VARCHAR(100),
  status VARCHAR(50) DEFAULT 'active',
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  emergency_contact TEXT,
  date_of_birth DATE,
  nationality VARCHAR(100),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers(status);
CREATE INDEX IF NOT EXISTS idx_drivers_category ON drivers(category);
CREATE INDEX IF NOT EXISTS idx_drivers_team ON drivers(team);

-- ============================================
-- EXPENSES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS expenses (
  id VARCHAR(36) PRIMARY KEY,
  description VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'USD',
  event_id VARCHAR(36),
  date DATE NOT NULL,
  paid_by_user_id VARCHAR(36),
  receipt_url TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  notes TEXT,
  created_by_user_id VARCHAR(36),
  approved_by_user_id VARCHAR(36),
  approved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_expenses_event ON expenses(event_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);

-- ============================================
-- PURCHASE ORDERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS purchase_orders (
  id VARCHAR(36) PRIMARY KEY,
  po_number VARCHAR(100) UNIQUE,
  supplier VARCHAR(255),
  status VARCHAR(50) DEFAULT 'draft',
  total_amount DECIMAL(10,2),
  currency VARCHAR(3) DEFAULT 'USD',
  order_date DATE,
  expected_delivery_date DATE,
  actual_delivery_date DATE,
  items TEXT,
  notes TEXT,
  created_by_user_id VARCHAR(36),
  approved_by_user_id VARCHAR(36),
  approved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_po_number ON purchase_orders(po_number);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_order_date ON purchase_orders(order_date);

-- ============================================
-- INVENTORY (PARTS/CONSUMABLES) TABLE
-- ============================================
-- Separate from items table - this is for consumable inventory, parts, etc.
CREATE TABLE IF NOT EXISTS inventory (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  sku VARCHAR(100) UNIQUE,
  category VARCHAR(100),
  description TEXT,
  quantity INT DEFAULT 0,
  min_quantity INT DEFAULT 0,
  unit VARCHAR(50),
  unit_cost DECIMAL(10,2),
  location_id VARCHAR(36),
  supplier VARCHAR(255),
  last_restocked_date DATE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_inventory_sku ON inventory(sku);
CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory(category);
CREATE INDEX IF NOT EXISTS idx_inventory_location ON inventory(location_id);
CREATE INDEX IF NOT EXISTS idx_inventory_quantity ON inventory(quantity);

-- Migration complete
