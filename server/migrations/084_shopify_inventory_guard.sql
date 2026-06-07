-- Migration 084: Shopify inventory guardrails at DB level
-- Prevents accidental conversion/deletion of Shopify-linked inventory rows,
-- and records blocked attempts in an audit table.

CREATE TABLE IF NOT EXISTS policy_violation_log (
  id VARCHAR(36) PRIMARY KEY,
  rule_name VARCHAR(80) NOT NULL,
  entity_type VARCHAR(40) NOT NULL,
  entity_id VARCHAR(64) NOT NULL,
  operation VARCHAR(20) NOT NULL,
  reason TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_policy_violation_rule_time
  ON policy_violation_log (rule_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_policy_violation_entity
  ON policy_violation_log (entity_type, entity_id, created_at DESC);

CREATE OR REPLACE FUNCTION guard_inventory_shopify_linked()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  is_linked BOOLEAN;
BEGIN
  is_linked := (OLD.shopify_variant_id IS NOT NULL OR OLD.shopify_product_id IS NOT NULL);

  IF NOT is_linked THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    INSERT INTO policy_violation_log (id, rule_name, entity_type, entity_id, operation, reason, details)
    VALUES (
      concat('pv-', to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS'), '-', substr(md5(random()::text), 1, 8)),
      'shopify_inventory_guard',
      'inventory',
      OLD.id::text,
      'DELETE',
      'Deletion of Shopify-linked inventory row is blocked.',
      jsonb_build_object('old_row', to_jsonb(OLD), 'txid', txid_current())
    );

    RAISE EXCEPTION 'Shopify-linked inventory rows cannot be deleted';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF (OLD.shopify_variant_id IS NOT NULL AND NEW.shopify_variant_id IS NULL)
       OR (OLD.shopify_product_id IS NOT NULL AND NEW.shopify_product_id IS NULL) THEN
      INSERT INTO policy_violation_log (id, rule_name, entity_type, entity_id, operation, reason, details)
      VALUES (
        concat('pv-', to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS'), '-', substr(md5(random()::text), 1, 8)),
        'shopify_inventory_guard',
        'inventory',
        OLD.id::text,
        'UPDATE',
        'Removing Shopify link fields from a linked inventory row is blocked.',
        jsonb_build_object(
          'old_variant', OLD.shopify_variant_id,
          'new_variant', NEW.shopify_variant_id,
          'old_product', OLD.shopify_product_id,
          'new_product', NEW.shopify_product_id,
          'txid', txid_current()
        )
      );

      RAISE EXCEPTION 'Shopify-linked inventory rows cannot be de-linked from Shopify';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventory_shopify_guard ON inventory;

CREATE TRIGGER trg_inventory_shopify_guard
BEFORE UPDATE OR DELETE ON inventory
FOR EACH ROW
EXECUTE FUNCTION guard_inventory_shopify_linked();
