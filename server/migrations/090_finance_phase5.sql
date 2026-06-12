-- 090_finance_phase5.sql — Finance Phase 5: requisitions, audit log, PO finance link, cost-cap settings.
-- Additive/nullable; safe on existing data.

-- ── Internal purchase requisitions ──────────────────────────────
CREATE TABLE IF NOT EXISTS fin_requisitions (
  id              VARCHAR(36) PRIMARY KEY,
  req_number      VARCHAR(50)  UNIQUE,
  status          VARCHAR(20)  NOT NULL DEFAULT 'draft',
  requester_name  VARCHAR(150),
  requester_email VARCHAR(200),
  department      VARCHAR(100),
  needed_by       DATE,
  event_id        VARCHAR(36),
  budget_id       UUID,
  category        VARCHAR(100),
  description     TEXT,
  items           JSONB DEFAULT '[]'::jsonb,
  total_amount    NUMERIC(14,2) DEFAULT 0,
  currency        VARCHAR(3)  DEFAULT 'ZAR',
  approver_name   VARCHAR(150),
  approved_at     TIMESTAMP,
  rejected_reason TEXT,
  po_id           VARCHAR(36),
  notes           TEXT,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fin_req_status     ON fin_requisitions(status);
CREATE INDEX IF NOT EXISTS idx_fin_req_event      ON fin_requisitions(event_id);
CREATE INDEX IF NOT EXISTS idx_fin_req_created    ON fin_requisitions(created_at DESC);

-- ── Finance audit log ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fin_audit_log (
  id           BIGSERIAL PRIMARY KEY,
  entity_type  VARCHAR(50) NOT NULL,
  entity_id    VARCHAR(64),
  action       VARCHAR(30) NOT NULL,
  user_name    VARCHAR(150),
  user_email   VARCHAR(200),
  changes      JSONB,
  amount       NUMERIC(14,2),
  currency     VARCHAR(3) DEFAULT 'ZAR',
  notes        TEXT,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fin_audit_entity   ON fin_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_fin_audit_created  ON fin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_audit_action   ON fin_audit_log(action);

-- ── Purchase order finance fields (link to requisition + extras) ──
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS requisition_id VARCHAR(36);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS event_id       VARCHAR(36);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS budget_id      UUID;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS received_at    TIMESTAMP;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS received_by    VARCHAR(150);

CREATE INDEX IF NOT EXISTS idx_po_requisition ON purchase_orders(requisition_id);
CREATE INDEX IF NOT EXISTS idx_po_event       ON purchase_orders(event_id);
