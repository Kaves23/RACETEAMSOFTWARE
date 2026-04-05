-- Migration 011: Add Shopify Integration Support
-- Adds fields to inventory table for Shopify sync and creates settings table

-- Add Shopify fields to inventory table
ALTER TABLE inventory 
ADD COLUMN IF NOT EXISTS shopify_product_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS shopify_variant_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS shopify_sync_at TIMESTAMPTZ;

-- Create index on Shopify product ID for faster lookups
CREATE INDEX IF NOT EXISTS idx_inventory_shopify_product ON inventory(shopify_product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_shopify_variant ON inventory(shopify_variant_id);

-- Create settings table for storing integration configs and other settings
CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(255) PRIMARY KEY,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on updated_at for settings
CREATE INDEX IF NOT EXISTS idx_settings_updated ON settings(updated_at DESC);

-- Add comment
COMMENT ON TABLE settings IS 'Key-value store for application settings and integration configs';
COMMENT ON COLUMN inventory.shopify_product_id IS 'Shopify product ID for sync tracking';
COMMENT ON COLUMN inventory.shopify_variant_id IS 'Shopify variant ID for sync tracking';
COMMENT ON COLUMN inventory.shopify_sync_at IS 'Last sync timestamp from Shopify';
