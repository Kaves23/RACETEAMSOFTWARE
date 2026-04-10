-- Migration: Add shopify_inventory_item_id to inventory table
-- Stores the Shopify inventory item legacy ID so we can return stock when unpacking

ALTER TABLE inventory
  ADD COLUMN IF NOT EXISTS shopify_inventory_item_id VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_inventory_shopify_inv_item
  ON inventory(shopify_inventory_item_id)
  WHERE shopify_inventory_item_id IS NOT NULL;
