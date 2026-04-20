-- Migration 058: Event Notes extras
-- Adds: recurring task support, multi-assignee JSON, comments thread, task links/attachments

-- Extend event_packing_items with new columns
ALTER TABLE event_packing_items
  ADD COLUMN IF NOT EXISTS recurrence       TEXT    DEFAULT NULL,   -- 'daily','weekly','per_event' or NULL
  ADD COLUMN IF NOT EXISTS recurrence_end   DATE    DEFAULT NULL,   -- stop recurring after this date
  ADD COLUMN IF NOT EXISTS assignees_json   TEXT    DEFAULT NULL;   -- JSON array of assignee name strings

-- Comments thread per task
CREATE TABLE IF NOT EXISTS task_comments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     UUID        NOT NULL,
  list_id     UUID        NOT NULL,
  author      TEXT,
  content     TEXT        NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_comments_item ON task_comments (item_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_list ON task_comments (list_id);

-- Links / attachments per task (URL-based)
CREATE TABLE IF NOT EXISTS task_links (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     UUID        NOT NULL,
  list_id     UUID        NOT NULL,
  label       TEXT,
  url         TEXT        NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_links_item ON task_links (item_id);
CREATE INDEX IF NOT EXISTS idx_task_links_list ON task_links (list_id);
