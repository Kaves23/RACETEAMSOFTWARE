-- Migration 065: Executive Module
CREATE TABLE IF NOT EXISTS approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  approval_type TEXT NOT NULL DEFAULT 'spend' CHECK (approval_type IN ('spend','hire','contract','strategy','policy','other')),
  description TEXT,
  requested_by TEXT NOT NULL,
  requested_for TEXT,
  value NUMERIC(14,2),
  currency TEXT NOT NULL DEFAULT 'GBP',
  submitted_date DATE NOT NULL DEFAULT CURRENT_DATE,
  required_by DATE,
  approved_by TEXT,
  approved_date DATE,
  rejection_reason TEXT,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','deferred','cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exec_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  action_type TEXT NOT NULL DEFAULT 'task' CHECK (action_type IN ('task','decision','follow_up','escalation')),
  owner TEXT NOT NULL,
  raised_by TEXT,
  due_date DATE,
  completed_date DATE,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','completed','deferred','cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  decision_type TEXT NOT NULL DEFAULT 'strategic' CHECK (decision_type IN ('strategic','operational','sporting','financial','hr','technical','other')),
  description TEXT,
  options_considered TEXT,
  rationale TEXT,
  decided_by TEXT NOT NULL,
  decision_date DATE NOT NULL DEFAULT CURRENT_DATE,
  impact TEXT,
  review_date DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending','active','under_review','superseded','archived')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  announcement_type TEXT NOT NULL DEFAULT 'general' CHECK (announcement_type IN ('general','urgent','sporting','hr','technical','commercial')),
  audience TEXT NOT NULL DEFAULT 'all_staff',
  published_by TEXT,
  publish_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expiry_date DATE,
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS strategic_objectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  pillar TEXT NOT NULL DEFAULT 'performance' CHECK (pillar IN ('performance','commercial','people','operations','technical','other')),
  season TEXT,
  target_metric TEXT,
  target_value TEXT,
  current_value TEXT,
  progress_pct INT NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
  owner TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('not_started','active','at_risk','completed','cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS board_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  report_type TEXT NOT NULL DEFAULT 'monthly' CHECK (report_type IN ('monthly','quarterly','annual','ad_hoc','event')),
  period TEXT NOT NULL,
  prepared_by TEXT,
  reviewed_by TEXT,
  approval_status TEXT NOT NULL DEFAULT 'draft' CHECK (approval_status IN ('draft','under_review','approved','published')),
  document_url TEXT,
  presentation_date DATE,
  distribution_list TEXT,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS doc_control (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_number TEXT NOT NULL,
  title TEXT NOT NULL,
  doc_type TEXT NOT NULL DEFAULT 'procedure' CHECK (doc_type IN ('procedure','policy','specification','form','drawing','report','manual','other')),
  department TEXT,
  version TEXT NOT NULL DEFAULT '1.0',
  revision_reason TEXT,
  author TEXT,
  approved_by TEXT,
  issue_date DATE,
  review_date DATE,
  document_url TEXT,
  status TEXT NOT NULL DEFAULT 'current' CHECK (status IN ('draft','current','under_review','superseded','obsolete')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kpi_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_name TEXT NOT NULL,
  department TEXT NOT NULL,
  metric_type TEXT NOT NULL DEFAULT 'percentage' CHECK (metric_type IN ('percentage','count','currency','time','ratio','score')),
  period TEXT NOT NULL,
  target_value NUMERIC(12,4),
  actual_value NUMERIC(12,4),
  unit TEXT,
  trend TEXT CHECK (trend IN ('up','down','stable')),
  status TEXT NOT NULL DEFAULT 'on_track' CHECK (status IN ('on_track','at_risk','off_track','not_reported')),
  notes TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);
CREATE INDEX IF NOT EXISTS idx_exec_actions_status ON exec_actions(status);
CREATE INDEX IF NOT EXISTS idx_exec_actions_due ON exec_actions(due_date);
CREATE INDEX IF NOT EXISTS idx_decisions_date ON decisions(decision_date);
CREATE INDEX IF NOT EXISTS idx_strat_objectives_status ON strategic_objectives(status);
CREATE INDEX IF NOT EXISTS idx_kpi_metrics_dept ON kpi_metrics(department);
CREATE INDEX IF NOT EXISTS idx_kpi_metrics_period ON kpi_metrics(period);
