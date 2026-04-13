-- Migration 050: Project Management — Gantt chart plans, tasks, and dependency links
-- Supports unlimited nesting, polymorphic entity linking, and manual dependency arrows.

-- ────────────────────────────────────────────────
-- 1. project_plans
--    Each plan maps to an optional event (or standalone).
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_plans (
  id                  TEXT        PRIMARY KEY,
  name                TEXT        NOT NULL,
  event_id            TEXT        REFERENCES events(id) ON DELETE SET NULL,
  start_date          DATE,
  end_date            DATE,
  color               TEXT        NOT NULL DEFAULT '#a64dff',
  status              TEXT        NOT NULL DEFAULT 'active'
                                  CHECK (status IN ('active','archived','completed')),
  description         TEXT,
  created_by_user_id  TEXT        REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_plans_event_id
  ON project_plans (event_id);

CREATE INDEX IF NOT EXISTS idx_project_plans_status
  ON project_plans (status);

-- ────────────────────────────────────────────────
-- 2. project_tasks
--    Self-referencing hierarchy via parent_task_id.
--    Polymorphic linked_entity_type / linked_entity_id
--    can reference any entity in the system.
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_tasks (
  id                  TEXT        PRIMARY KEY,
  plan_id             TEXT        NOT NULL REFERENCES project_plans(id) ON DELETE CASCADE,
  parent_task_id      TEXT        REFERENCES project_tasks(id) ON DELETE CASCADE,
  title               TEXT        NOT NULL,
  description         TEXT,
  start_date          DATE,
  end_date            DATE,
  progress            INT         NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  color               TEXT,
  assignee_user_id    TEXT        REFERENCES users(id) ON DELETE SET NULL,
  priority            TEXT        NOT NULL DEFAULT 'medium'
                                  CHECK (priority IN ('low','medium','high','critical')),
  status              TEXT        NOT NULL DEFAULT 'not_started'
                                  CHECK (status IN ('not_started','in_progress','blocked','completed','cancelled')),
  is_milestone        BOOLEAN     NOT NULL DEFAULT FALSE,
  linked_entity_type  TEXT        CHECK (linked_entity_type IN (
                                    'event','item','box','driver','truck',
                                    'load_plan','inventory','purchase_order','user'
                                  )),
  linked_entity_id    TEXT,
  sort_order          INT         NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_project_tasks_plan_id
  ON project_tasks (plan_id);

CREATE INDEX IF NOT EXISTS idx_project_tasks_parent_id
  ON project_tasks (parent_task_id);

CREATE INDEX IF NOT EXISTS idx_project_tasks_assignee
  ON project_tasks (assignee_user_id);

CREATE INDEX IF NOT EXISTS idx_project_tasks_linked_entity
  ON project_tasks (linked_entity_type, linked_entity_id);

-- ────────────────────────────────────────────────
-- 3. project_task_links
--    User-drawn dependency arrows. No scheduling
--    enforcement — purely visual in this version.
-- ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_task_links (
  id            TEXT        PRIMARY KEY,
  from_task_id  TEXT        NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  to_task_id    TEXT        NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  link_type     TEXT        NOT NULL DEFAULT 'finish_to_start'
                            CHECK (link_type IN (
                              'finish_to_start','start_to_start',
                              'finish_to_finish','start_to_finish'
                            )),
  lag_days      INT         NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (from_task_id, to_task_id)
);

CREATE INDEX IF NOT EXISTS idx_project_task_links_from
  ON project_task_links (from_task_id);

CREATE INDEX IF NOT EXISTS idx_project_task_links_to
  ON project_task_links (to_task_id);
