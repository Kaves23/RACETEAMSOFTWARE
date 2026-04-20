-- Migration 062: Procurement Module
CREATE TABLE IF NOT EXISTS proc_suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  website TEXT,
  account_number TEXT,
  payment_terms TEXT,
  lead_time_days INT DEFAULT 0,
  rating INT CHECK (rating BETWEEN 1 AND 5),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','blacklisted')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rfqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_number TEXT NOT NULL,
  title TEXT NOT NULL,
  supplier_id UUID REFERENCES proc_suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT,
  items_description TEXT,
  quantity INT DEFAULT 1,
  required_by DATE,
  issued_date DATE,
  response_due DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','received','awarded','cancelled')),
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rfq_id UUID REFERENCES rfqs(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES proc_suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT NOT NULL,
  quote_number TEXT,
  description TEXT,
  unit_price NUMERIC(14,2),
  quantity INT DEFAULT 1,
  total_price NUMERIC(14,2),
  currency TEXT NOT NULL DEFAULT 'GBP',
  valid_until DATE,
  lead_time_days INT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','under_review','accepted','rejected','expired')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS proc_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID REFERENCES proc_suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT NOT NULL,
  contract_title TEXT NOT NULL,
  contract_type TEXT NOT NULL DEFAULT 'supply' CHECK (contract_type IN ('supply','service','nda','framework','sponsorship','other')),
  value NUMERIC(14,2),
  currency TEXT NOT NULL DEFAULT 'GBP',
  start_date DATE,
  end_date DATE,
  auto_renew BOOLEAN NOT NULL DEFAULT FALSE,
  notice_period_days INT DEFAULT 30,
  document_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','expired','terminated','under_review')),
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS slas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID REFERENCES proc_suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  target_value TEXT NOT NULL,
  measurement_period TEXT,
  actual_value TEXT,
  status TEXT NOT NULL DEFAULT 'met' CHECK (status IN ('met','at_risk','breached','not_measured')),
  review_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lead_times (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID REFERENCES proc_suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT NOT NULL,
  item_category TEXT NOT NULL,
  item_description TEXT,
  standard_lead_days INT NOT NULL DEFAULT 0,
  expedited_lead_days INT,
  last_actual_days INT,
  reliability_pct INT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS emergency_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID REFERENCES proc_suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT NOT NULL,
  description TEXT NOT NULL,
  reason TEXT NOT NULL,
  quantity INT DEFAULT 1,
  unit_cost NUMERIC(14,2),
  total_cost NUMERIC(14,2),
  ordered_date DATE NOT NULL DEFAULT CURRENT_DATE,
  required_by DATE,
  status TEXT NOT NULL DEFAULT 'placed' CHECK (status IN ('placed','confirmed','in_transit','received','cancelled')),
  approved_by TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS supplier_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID REFERENCES proc_suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT NOT NULL,
  issue_title TEXT NOT NULL,
  issue_type TEXT NOT NULL DEFAULT 'quality' CHECK (issue_type IN ('quality','delivery','pricing','communication','other')),
  description TEXT,
  impact TEXT,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  resolution TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','escalated')),
  raised_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proc_suppliers_status ON proc_suppliers(status);
CREATE INDEX IF NOT EXISTS idx_proc_contracts_status ON proc_contracts(contract_title);
CREATE INDEX IF NOT EXISTS idx_rfqs_status ON rfqs(status);
CREATE INDEX IF NOT EXISTS idx_supplier_issues_status ON supplier_issues(status);
CREATE INDEX IF NOT EXISTS idx_emergency_orders_status ON emergency_orders(status);
