-- Migration 039: Performance indexes & query optimisation
-- Audit date: 9 April 2026
-- Issues addressed:
--   1. load_plan_boxes has no index on box_id → correlated subquery in GET /api/boxes does a seqscan per box
--   2. load_plan_boxes has no index on (load_plan_id, load_order) → draft fetch scans all placements
--   3. load_plans has no index on (status, updated_at) → draft lookup does a full table scan
--   4. load_plans has no index on (status, truck_id) → truck-specific draft lookup does a full table scan
--   5. items has no index on created_at → items list (ORDER BY created_at DESC) does a seqscan
--   6. items has no partial index on next_maintenance_date → dashboard alert query scans entire items table
--   7. boxes has no index on assigned_driver_id → LEFT JOIN drivers in GET /api/boxes does a nested loop seqscan
--   8. box_contents has no index on (item_id, item_type) → inventory pack quantity check scans box_contents
--   9. inventory has no index on category → inventory filter queries scan entire table
--  10. No pg_trgm GIN indexes → every ILIKE search on name/barcode columns does a full table seqscan

-- ===================================================================
-- 1. Enable pg_trgm for fast ILIKE / trigram searches
-- ===================================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ===================================================================
-- 2. load_plan_boxes indexes (most critical — fixes the per-box subquery)
-- ===================================================================

-- Covers: WHERE lpb.box_id = b.id ORDER BY lpb.added_at DESC LIMIT 1
CREATE INDEX IF NOT EXISTS idx_lpb_box_added
  ON load_plan_boxes(box_id, added_at DESC);

-- Covers: WHERE load_plan_id = $1 ORDER BY load_order
CREATE INDEX IF NOT EXISTS idx_lpb_plan_order
  ON load_plan_boxes(load_plan_id, load_order);

-- ===================================================================
-- 3. load_plans indexes (fixes draft lookup seqscans)
-- ===================================================================

-- Covers: WHERE status = 'Draft' ORDER BY updated_at DESC LIMIT 1
CREATE INDEX IF NOT EXISTS idx_load_plans_status_updated
  ON load_plans(status, updated_at DESC);

-- Covers: WHERE status = 'Draft' AND truck_id = $1 ORDER BY updated_at DESC LIMIT 1
CREATE INDEX IF NOT EXISTS idx_load_plans_status_truck
  ON load_plans(status, truck_id)
  WHERE status = 'Draft';

-- ===================================================================
-- 4. items indexes
-- ===================================================================

-- Covers: ORDER BY created_at DESC (items list API)
CREATE INDEX IF NOT EXISTS idx_items_created_at
  ON items(created_at DESC);

-- Covers: WHERE next_maintenance_date <= CURRENT_DATE + INTERVAL '30 days' (dashboard alerts)
CREATE INDEX IF NOT EXISTS idx_items_maintenance_date
  ON items(next_maintenance_date ASC)
  WHERE next_maintenance_date IS NOT NULL;

-- GIN trigram index for fast name/barcode ILIKE searches
CREATE INDEX IF NOT EXISTS idx_items_name_trgm
  ON items USING gin(name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_items_barcode_trgm
  ON items USING gin(barcode gin_trgm_ops);

-- ===================================================================
-- 5. boxes indexes
-- ===================================================================

-- Covers: LEFT JOIN drivers d ON b.assigned_driver_id = d.id
CREATE INDEX IF NOT EXISTS idx_boxes_assigned_driver
  ON boxes(assigned_driver_id)
  WHERE assigned_driver_id IS NOT NULL;

-- GIN trigram index for fast name/barcode ILIKE searches
CREATE INDEX IF NOT EXISTS idx_boxes_name_trgm
  ON boxes USING gin(name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_boxes_barcode_trgm
  ON boxes USING gin(barcode gin_trgm_ops);

-- ===================================================================
-- 6. box_contents indexes
-- ===================================================================

-- Covers: WHERE item_id = $1 AND item_type = 'inventory' (inventory pack quantity check)
CREATE INDEX IF NOT EXISTS idx_box_contents_item_type
  ON box_contents(item_id, item_type);

-- ===================================================================
-- 7. inventory indexes
-- ===================================================================

-- Covers: WHERE category = $1 (inventory filter)
CREATE INDEX IF NOT EXISTS idx_inventory_category
  ON inventory(category);

-- Covers: WHERE min_quantity > 0 AND quantity <= min_quantity (low stock alert)
-- Partial index only on rows that can trigger alerts
CREATE INDEX IF NOT EXISTS idx_inventory_low_stock
  ON inventory(quantity, min_quantity)
  WHERE min_quantity > 0;

-- GIN trigram index for fast name/sku ILIKE searches
CREATE INDEX IF NOT EXISTS idx_inventory_name_trgm
  ON inventory USING gin(name gin_trgm_ops);

-- ===================================================================
-- 8. sessions - partial index on expires_at for cleanup queries
-- ===================================================================
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
  ON sessions(expires_at)
  WHERE expires_at IS NOT NULL;
