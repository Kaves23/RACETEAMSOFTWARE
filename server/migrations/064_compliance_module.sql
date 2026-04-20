-- Migration 064: Compliance Module
CREATE TABLE IF NOT EXISTS policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  policy_type TEXT NOT NULL DEFAULT 'operational' CHECK (policy_type IN ('operational','hr','financial','technical','safety','data','other')),
  version TEXT NOT NULL DEFAULT '1.0',
  effective_date DATE,
  review_date DATE,
  owner TEXT,
  approved_by TEXT,
  document_url TEXT,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','under_review','superseded','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS legal_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  contract_type TEXT NOT NULL DEFAULT 'commercial' CHECK (contract_type IN ('commercial','employment','sponsorship','supplier','nda','ip','other')),
  counterparty TEXT NOT NULL,
  value NUMERIC(14,2),
  currency TEXT NOT NULL DEFAULT 'GBP',
  start_date DATE,
  end_date DATE,
  auto_renew BOOLEAN NOT NULL DEFAULT FALSE,
  notice_period_days INT DEFAULT 30,
  legal_owner TEXT,
  document_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','under_review','signed','active','expired','terminated')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS insurance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_name TEXT NOT NULL,
  insurance_type TEXT NOT NULL DEFAULT 'public_liability' CHECK (insurance_type IN ('public_liability','product_liability','employer','event','vehicle','travel','equipment','other')),
  insurer TEXT NOT NULL,
  policy_number TEXT,
  broker TEXT,
  coverage_amount NUMERIC(14,2),
  currency TEXT NOT NULL DEFAULT 'GBP',
  premium_annual NUMERIC(10,2),
  start_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  excess NUMERIC(10,2),
  document_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expiring_soon','expired','claim_open','cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS legal_matters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  matter_type TEXT NOT NULL DEFAULT 'dispute' CHECK (matter_type IN ('dispute','claim','regulatory','ip','employment','contractual','other')),
  description TEXT,
  counterparty TEXT,
  legal_counsel TEXT,
  estimated_value NUMERIC(14,2),
  currency TEXT NOT NULL DEFAULT 'GBP',
  opened_date DATE,
  target_resolution DATE,
  outcome TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed','escalated')),
  confidential BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS data_protection (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  record_type TEXT NOT NULL DEFAULT 'dpa' CHECK (record_type IN ('dpa','subject_access','breach','consent','retention','audit','other')),
  data_subjects TEXT,
  data_categories TEXT,
  processing_purpose TEXT,
  legal_basis TEXT,
  third_parties TEXT,
  retention_period TEXT,
  review_date DATE,
  dpo_review BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','under_review','archived')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS health_safety (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  record_type TEXT NOT NULL DEFAULT 'risk_assessment' CHECK (record_type IN ('risk_assessment','incident','near_miss','inspection','training','audit','method_statement','other')),
  location TEXT,
  date_of_event DATE,
  description TEXT,
  severity TEXT CHECK (severity IN ('low','medium','high','critical')),
  likelihood TEXT CHECK (likelihood IN ('unlikely','possible','likely','almost_certain')),
  control_measures TEXT,
  action_required TEXT,
  assigned_to TEXT,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','closed','review_required')),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS compliance_risks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_title TEXT NOT NULL,
  risk_category TEXT NOT NULL DEFAULT 'regulatory' CHECK (risk_category IN ('regulatory','legal','financial','reputational','operational','data','other')),
  regulation_reference TEXT,
  description TEXT,
  likelihood INT NOT NULL DEFAULT 3 CHECK (likelihood BETWEEN 1 AND 5),
  impact INT NOT NULL DEFAULT 3 CHECK (impact BETWEEN 1 AND 5),
  risk_score INT GENERATED ALWAYS AS (likelihood * impact) STORED,
  mitigation TEXT,
  owner TEXT,
  review_date DATE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','mitigated','accepted','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crisis_management (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  crisis_type TEXT NOT NULL DEFAULT 'operational' CHECK (crisis_type IN ('operational','media','safety','financial','legal','sporting','natural','other')),
  description TEXT,
  trigger TEXT,
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  response_lead TEXT,
  response_team TEXT,
  communications_lead TEXT,
  timeline TEXT,
  resolution TEXT,
  lessons_learned TEXT,
  status TEXT NOT NULL DEFAULT 'monitoring' CHECK (status IN ('monitoring','active','resolved','post_review')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_policies_status ON policies(status);
CREATE INDEX IF NOT EXISTS idx_policies_review_date ON policies(review_date);
CREATE INDEX IF NOT EXISTS idx_insurance_expiry ON insurance(expiry_date);
CREATE INDEX IF NOT EXISTS idx_legal_contracts_status ON legal_contracts(status);
CREATE INDEX IF NOT EXISTS idx_hs_status ON health_safety(status);
CREATE INDEX IF NOT EXISTS idx_compliance_risks_score ON compliance_risks(likelihood, impact);
