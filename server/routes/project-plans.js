const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const crypto = require('crypto');

// ──────────────────────────────────────────────────────────────────
// PLANS
// ──────────────────────────────────────────────────────────────────

// GET /api/project-plans — all plans, with optional event name
router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT p.*,
             e.name AS event_name,
             e.start_date AS event_start_date,
             COUNT(t.id) AS task_count
      FROM project_plans p
      LEFT JOIN events e ON e.id = p.event_id
      LEFT JOIN project_tasks t ON t.plan_id = p.id
      GROUP BY p.id, e.name, e.start_date
      ORDER BY e.start_date ASC NULLS LAST, p.created_at DESC
    `);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/project-plans/milestones — all milestones across all plans
router.get('/milestones', async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT
        t.id,
        t.title,
        t.start_date,
        t.end_date,
        t.status,
        t.progress,
        t.priority,
        t.color,
        t.is_milestone,
        t.plan_id,
        t.assignee_user_id,
        t.description,
        p.name       AS plan_name,
        p.status     AS plan_status,
        u.full_name  AS assignee_name
      FROM project_tasks t
      JOIN project_plans p ON p.id = t.plan_id
      LEFT JOIN users u ON u.id = t.assignee_user_id
      WHERE t.is_milestone = true
      ORDER BY t.start_date ASC NULLS LAST, t.created_at ASC
    `);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/project-plans/workload?weeks=8 — per-user task load by ISO week
router.get('/workload', async (req, res, next) => {
  const weeks = Math.min(parseInt(req.query.weeks, 10) || 8, 26);
  try {
    const result = await pool.query(`
      SELECT
        t.id,
        t.title,
        t.start_date,
        t.end_date,
        t.status,
        t.priority,
        t.assignee_user_id,
        u.full_name  AS assignee_name,
        p.id         AS plan_id,
        p.name       AS plan_name
      FROM project_tasks t
      JOIN project_plans p ON p.id = t.plan_id
      LEFT JOIN users u ON u.id = t.assignee_user_id
      WHERE t.assignee_user_id IS NOT NULL
        AND t.status NOT IN ('completed','cancelled')
        AND t.end_date IS NOT NULL
      ORDER BY t.end_date ASC
    `);
    res.json({ success: true, data: result.rows, weeks });
  } catch (error) {
    next(error);
  }
});

// GET /api/project-plans/:id — single plan
router.get('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT p.*,
             e.name AS event_name,
             e.start_date AS event_start_date
      FROM project_plans p
      LEFT JOIN events e ON e.id = p.event_id
      WHERE p.id = $1
    `, [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Plan not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// POST /api/project-plans — create plan
router.post('/', async (req, res, next) => {
  const {
    name, event_id, start_date, end_date, color, description,
    project_type, owner_staff_id, risk_level, priority,
    budget, currency
  } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, error: 'name is required' });
  }
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const id = crypto.randomUUID();
    const result = await client.query(`
      INSERT INTO project_plans
        (id, name, event_id, start_date, end_date, color, description,
         project_type, owner_staff_id, risk_level, priority, budget, currency, created_by_user_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
    `, [
      id,
      name.trim(),
      event_id || null,
      start_date || null,
      end_date || null,
      color || '#a64dff',
      description || null,
      project_type || null,
      owner_staff_id || null,
      risk_level || null,
      priority || 'medium',
      budget || null,
      currency || 'ZAR',
      req.user?.id || null
    ]);
    await client.query('COMMIT');
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    if (client) { try { await client.query('ROLLBACK'); } catch (_) {} }
    next(error);
  } finally {
    if (client) client.release();
  }
});

// POST /api/project-plans/:id/duplicate — clone a plan with all tasks + links in one transaction
router.post('/:id/duplicate', async (req, res, next) => {
  const { name, as_template } = req.body || {};
  const asTemplate = as_template === true || as_template === 'true';
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');

    // 1. Load source plan
    const srcPlanRes = await client.query('SELECT * FROM project_plans WHERE id = $1', [req.params.id]);
    if (srcPlanRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Source plan not found' });
    }
    const src = srcPlanRes.rows[0];
    const newName = (name && name.trim()) ? name.trim() : `${src.name} (Copy)`;

    // 2. Create the new plan
    const newPlanId = crypto.randomUUID();
    const newPlanRes = await client.query(`
      INSERT INTO project_plans
        (id, name, event_id, start_date, end_date, color, status, description,
         project_type, owner_staff_id, risk_level, priority, created_by_user_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *
    `, [
      newPlanId,
      newName,
      src.event_id || null,
      src.start_date || null,
      src.end_date || null,
      src.color || '#a64dff',
      asTemplate ? 'planned' : (src.status || 'active'),
      src.description || null,
      src.project_type || null,
      src.owner_staff_id || null,
      asTemplate ? null : (src.risk_level || null),
      src.priority || 'medium',
      req.user?.id || null
    ]);

    // 3. Load all source tasks
    const tasksRes = await client.query(
      'SELECT * FROM project_tasks WHERE plan_id = $1 ORDER BY sort_order ASC, created_at ASC',
      [req.params.id]
    );
    const srcTasks = tasksRes.rows;

    // Pre-generate new IDs for every task so parent remapping works regardless of order
    const idMap = {};
    for (const t of srcTasks) idMap[t.id] = crypto.randomUUID();

    // Determine insertable columns dynamically (handles schema drift), excluding generated ones
    const skipCols = new Set(['created_at', 'updated_at']);
    const overrideCols = new Set(['id', 'plan_id', 'parent_task_id']);

    let copiedTasks = 0;
    for (const t of srcTasks) {
      const cols = [];
      const vals = [];
      for (const col of Object.keys(t)) {
        if (skipCols.has(col) || overrideCols.has(col)) continue;
        cols.push(col);
        if (asTemplate && col === 'progress') vals.push(0);
        else if (asTemplate && col === 'status') vals.push('not_started');
        else if (asTemplate && (col === 'actual_start_date' || col === 'actual_end_date' || col === 'blocker_reason')) vals.push(null);
        else vals.push(t[col]);
      }
      // Prepend overridden columns
      cols.unshift('id', 'plan_id', 'parent_task_id');
      vals.unshift(idMap[t.id], newPlanId, t.parent_task_id ? (idMap[t.parent_task_id] || null) : null);

      const placeholders = cols.map((_, i) => `$${i + 1}`).join(',');
      await client.query(
        `INSERT INTO project_tasks (${cols.join(',')}) VALUES (${placeholders})`,
        vals
      );
      copiedTasks++;
    }

    // 4. Copy dependency links (only those whose endpoints were copied)
    const linksRes = await client.query(`
      SELECT l.* FROM project_task_links l
      JOIN project_tasks ft ON ft.id = l.from_task_id
      WHERE ft.plan_id = $1
    `, [req.params.id]);

    let copiedLinks = 0;
    for (const link of linksRes.rows) {
      const fromNew = idMap[link.from_task_id];
      const toNew = idMap[link.to_task_id];
      if (!fromNew || !toNew) continue;
      await client.query(`
        INSERT INTO project_task_links (id, from_task_id, to_task_id, link_type, lag_days)
        VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT (from_task_id, to_task_id) DO NOTHING
      `, [
        crypto.randomUUID(),
        fromNew,
        toNew,
        link.link_type || 'finish_to_start',
        link.lag_days || 0
      ]);
      copiedLinks++;
    }

    await client.query('COMMIT');
    res.status(201).json({
      success: true,
      data: newPlanRes.rows[0],
      copied: { tasks: copiedTasks, links: copiedLinks }
    });
  } catch (error) {
    if (client) { try { await client.query('ROLLBACK'); } catch (_) {} }
    next(error);
  } finally {
    if (client) client.release();
  }
});

// PUT /api/project-plans/:id — update plan
router.put('/:id', async (req, res, next) => {
  const {
    name, event_id, start_date, end_date, color, status, description,
    project_type, owner_staff_id, risk_level, priority, actual_end_date,
    budget, spent, currency
  } = req.body;
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const existing = await client.query('SELECT id FROM project_plans WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Plan not found' });
    }
    const result = await client.query(`
      UPDATE project_plans SET
        name            = COALESCE($1, name),
        event_id        = $2,
        start_date      = $3,
        end_date        = $4,
        color           = COALESCE($5, color),
        status          = COALESCE($6, status),
        description     = $7,
        project_type    = COALESCE($8, project_type),
        owner_staff_id  = COALESCE($9, owner_staff_id),
        risk_level      = COALESCE($10, risk_level),
        priority        = COALESCE($11, priority),
        actual_end_date = $12,
        budget          = COALESCE($14, budget),
        spent           = COALESCE($15, spent),
        currency        = COALESCE($16, currency),
        updated_at      = NOW()
      WHERE id = $13
      RETURNING *
    `, [
      name?.trim() || null,
      event_id !== undefined ? (event_id || null) : undefined,
      start_date || null,
      end_date || null,
      color || null,
      status || null,
      description !== undefined ? (description || null) : undefined,
      project_type || null,
      owner_staff_id || null,
      risk_level || null,
      priority || null,
      actual_end_date !== undefined ? (actual_end_date || null) : undefined,
      req.params.id,
      budget !== undefined ? (budget || null) : undefined,
      spent !== undefined ? (spent || null) : undefined,
      currency || null
    ]);
    await client.query('COMMIT');
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    if (client) { try { await client.query('ROLLBACK'); } catch (_) {} }
    next(error);
  } finally {
    if (client) client.release();
  }
});

// DELETE /api/project-plans/:id — delete plan (cascades to tasks + links)
router.delete('/:id', async (req, res, next) => {
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const result = await client.query('DELETE FROM project_plans WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Plan not found' });
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (error) {
    if (client) { try { await client.query('ROLLBACK'); } catch (_) {} }
    next(error);
  } finally {
    if (client) client.release();
  }
});

// ──────────────────────────────────────────────────────────────────
// TASKS
// ──────────────────────────────────────────────────────────────────

// GET /api/project-plans/:id/tasks — all tasks for a plan (flat; client builds tree)
router.get('/:id/tasks', async (req, res, next) => {
  try {
    const planCheck = await pool.query('SELECT id FROM project_plans WHERE id = $1', [req.params.id]);
    if (planCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Plan not found' });
    }
    const result = await pool.query(`
      SELECT t.*,
             u.full_name AS assignee_name,
             u.username  AS assignee_username
      FROM project_tasks t
      LEFT JOIN users u ON u.id = t.assignee_user_id
      WHERE t.plan_id = $1
      ORDER BY t.sort_order ASC, t.created_at ASC
    `, [req.params.id]);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

// POST /api/project-tasks — create task
router.post('/tasks', async (req, res, next) => {
  const {
    plan_id, parent_task_id, title, description,
    start_date, end_date, progress, color,
    assignee_user_id, priority, status, is_milestone,
    linked_entity_type, linked_entity_id, sort_order,
    estimated_cost, actual_cost
  } = req.body;
  if (!plan_id) return res.status(400).json({ success: false, error: 'plan_id is required' });
  if (!title || !title.trim()) return res.status(400).json({ success: false, error: 'title is required' });
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const planCheck = await client.query('SELECT id FROM project_plans WHERE id = $1', [plan_id]);
    if (planCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Plan not found' });
    }
    const id = crypto.randomUUID();
    const result = await client.query(`
      INSERT INTO project_tasks (
        id, plan_id, parent_task_id, title, description,
        start_date, end_date, progress, color,
        assignee_user_id, priority, status, is_milestone,
        linked_entity_type, linked_entity_id, sort_order,
        estimated_cost, actual_cost
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      RETURNING *
    `, [
      id, plan_id, parent_task_id || null, title.trim(), description || null,
      start_date || null, end_date || null, progress || 0, color || null,
      assignee_user_id || null, priority || 'medium', status || 'not_started',
      is_milestone || false,
      linked_entity_type || null, linked_entity_id || null,
      sort_order ?? 0,
      estimated_cost || null, actual_cost || null
    ]);
    await client.query('COMMIT');
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    if (client) { try { await client.query('ROLLBACK'); } catch (_) {} }
    next(error);
  } finally {
    if (client) client.release();
  }
});

// PUT /api/project-tasks/:taskId — update task
router.put('/tasks/:taskId', async (req, res, next) => {
  const {
    parent_task_id, title, description,
    start_date, end_date, progress, color,
    assignee_user_id, priority, status, is_milestone,
    linked_entity_type, linked_entity_id, sort_order,
    department, task_type, actual_start_date, actual_end_date, blocker_reason,
    estimated_cost, actual_cost
  } = req.body;
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const existing = await client.query('SELECT id FROM project_tasks WHERE id = $1', [req.params.taskId]);
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Task not found' });
    }
    const result = await client.query(`
      UPDATE project_tasks SET
        parent_task_id      = $1,
        title               = COALESCE($2, title),
        description         = $3,
        start_date          = $4,
        end_date            = $5,
        progress            = COALESCE($6, progress),
        color               = $7,
        assignee_user_id    = $8,
        priority            = COALESCE($9, priority),
        status              = COALESCE($10, status),
        is_milestone        = COALESCE($11, is_milestone),
        linked_entity_type  = $12,
        linked_entity_id    = $13,
        sort_order          = COALESCE($14, sort_order),
        department          = COALESCE($15, department),
        task_type           = COALESCE($16, task_type),
        actual_start_date   = $17,
        actual_end_date     = $18,
        blocker_reason      = $19,
        estimated_cost      = COALESCE($21, estimated_cost),
        actual_cost         = COALESCE($22, actual_cost),
        updated_at          = NOW()
      WHERE id = $20
      RETURNING *
    `, [
      parent_task_id !== undefined ? (parent_task_id || null) : undefined,
      title?.trim() || null,
      description !== undefined ? (description || null) : undefined,
      start_date !== undefined ? (start_date || null) : undefined,
      end_date !== undefined ? (end_date || null) : undefined,
      progress ?? null,
      color !== undefined ? (color || null) : undefined,
      assignee_user_id !== undefined ? (assignee_user_id || null) : undefined,
      priority || null,
      status || null,
      is_milestone ?? null,
      linked_entity_type !== undefined ? (linked_entity_type || null) : undefined,
      linked_entity_id !== undefined ? (linked_entity_id || null) : undefined,
      sort_order ?? null,
      department !== undefined ? (department || null) : undefined,
      task_type !== undefined ? (task_type || null) : undefined,
      actual_start_date !== undefined ? (actual_start_date || null) : undefined,
      actual_end_date !== undefined ? (actual_end_date || null) : undefined,
      blocker_reason !== undefined ? (blocker_reason || null) : undefined,
      req.params.taskId,
      estimated_cost !== undefined ? (estimated_cost || null) : undefined,
      actual_cost !== undefined ? (actual_cost || null) : undefined
    ]);
    await client.query('COMMIT');
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    if (client) { try { await client.query('ROLLBACK'); } catch (_) {} }
    next(error);
  } finally {
    if (client) client.release();
  }
});

// DELETE /api/project-tasks/:taskId — delete task (cascades subtasks + links)
router.delete('/tasks/:taskId', async (req, res, next) => {
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const result = await client.query('DELETE FROM project_tasks WHERE id = $1 RETURNING id', [req.params.taskId]);
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Task not found' });
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (error) {
    if (client) { try { await client.query('ROLLBACK'); } catch (_) {} }
    next(error);
  } finally {
    if (client) client.release();
  }
});

// ──────────────────────────────────────────────────────────────────
// DEPENDENCY LINKS
// ──────────────────────────────────────────────────────────────────

// GET /api/project-plans/tasks/:taskId/links — all links for a task (both directions)
router.get('/tasks/:taskId/links', async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT l.*,
             ft.title AS from_task_title,
             tt.title AS to_task_title
      FROM project_task_links l
      JOIN project_tasks ft ON ft.id = l.from_task_id
      JOIN project_tasks tt ON tt.id = l.to_task_id
      WHERE l.from_task_id = $1 OR l.to_task_id = $1
      ORDER BY l.created_at ASC
    `, [req.params.taskId]);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/project-plans/:id/links — all links for a whole plan (for rendering SVG overlay)
router.get('/:id/links', async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT l.*
      FROM project_task_links l
      JOIN project_tasks ft ON ft.id = l.from_task_id
      WHERE ft.plan_id = $1
      ORDER BY l.created_at ASC
    `, [req.params.id]);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

// POST /api/project-tasks/links — create dependency link
router.post('/task-links', async (req, res, next) => {
  const { from_task_id, to_task_id, link_type, lag_days } = req.body;
  if (!from_task_id || !to_task_id) {
    return res.status(400).json({ success: false, error: 'from_task_id and to_task_id are required' });
  }
  if (from_task_id === to_task_id) {
    return res.status(400).json({ success: false, error: 'A task cannot link to itself' });
  }
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const id = crypto.randomUUID();
    const result = await client.query(`
      INSERT INTO project_task_links (id, from_task_id, to_task_id, link_type, lag_days)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (from_task_id, to_task_id) DO UPDATE SET
        link_type = EXCLUDED.link_type,
        lag_days  = EXCLUDED.lag_days
      RETURNING *
    `, [
      id,
      from_task_id,
      to_task_id,
      link_type || 'finish_to_start',
      lag_days || 0
    ]);
    await client.query('COMMIT');
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    if (client) { try { await client.query('ROLLBACK'); } catch (_) {} }
    next(error);
  } finally {
    if (client) client.release();
  }
});

// DELETE /api/project-plans/task-links/:linkId — remove dependency link
router.delete('/task-links/:linkId', async (req, res, next) => {
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const result = await client.query('DELETE FROM project_task_links WHERE id = $1 RETURNING id', [req.params.linkId]);
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Link not found' });
    }
    await client.query('COMMIT');
    res.json({ success: true });
  } catch (error) {
    if (client) { try { await client.query('ROLLBACK'); } catch (_) {} }
    next(error);
  } finally {
    if (client) client.release();
  }
});

// ──────────────────────────────────────────────────────────────────
// TASK ASSIGNMENTS (secondary / additional assignees)
// ──────────────────────────────────────────────────────────────────

// GET /api/project-plans/tasks/:taskId/assignments
router.get('/tasks/:taskId/assignments', async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT a.*, u.name AS user_name, u.email AS user_email
      FROM project_task_assignments a
      LEFT JOIN users u ON u.id = a.user_id
      WHERE a.task_id = $1
      ORDER BY a.is_primary DESC, a.created_at ASC
    `, [req.params.taskId]);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

// POST /api/project-plans/task-assignments
router.post('/task-assignments', async (req, res, next) => {
  const { task_id, user_id, role_on_task, is_primary } = req.body;
  if (!task_id || !user_id) {
    return res.status(400).json({ success: false, error: 'task_id and user_id are required' });
  }
  try {
    const id = crypto.randomUUID();
    const result = await pool.query(`
      INSERT INTO project_task_assignments (id, task_id, user_id, role_on_task, is_primary)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT DO NOTHING
      RETURNING *
    `, [id, task_id, user_id, role_on_task || null, is_primary || false]);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/project-plans/task-assignments/:id
router.delete('/task-assignments/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      'DELETE FROM project_task_assignments WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Assignment not found' });
    }
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// ──────────────────────────────────────────────────────────────────
// TASK LABOUR (hours × cost rate and × bill rate)
// ──────────────────────────────────────────────────────────────────

// GET /api/project-plans/tasks/:taskId/labour — labour entries for a task
router.get('/tasks/:taskId/labour', async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT l.*, s.name AS staff_full_name, s.role AS staff_role
      FROM project_task_labour l
      LEFT JOIN staff s ON s.id = l.staff_id
      WHERE l.task_id = $1
      ORDER BY l.work_date ASC NULLS LAST, l.created_at ASC
    `, [req.params.taskId]);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/project-plans/:id/labour-summary — labour totals per task for a plan
router.get('/:id/labour-summary', async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT l.task_id,
             SUM(l.hours)        AS total_hours,
             SUM(l.cost_amount)  AS total_cost,
             SUM(l.bill_amount)  AS total_bill
      FROM project_task_labour l
      JOIN project_tasks t ON t.id = l.task_id
      WHERE t.plan_id = $1
      GROUP BY l.task_id
    `, [req.params.id]);
    const totals = await pool.query(`
      SELECT COALESCE(SUM(l.hours),0)       AS hours,
             COALESCE(SUM(l.cost_amount),0) AS cost,
             COALESCE(SUM(l.bill_amount),0) AS bill
      FROM project_task_labour l
      JOIN project_tasks t ON t.id = l.task_id
      WHERE t.plan_id = $1
    `, [req.params.id]);
    res.json({ success: true, data: result.rows, totals: totals.rows[0] });
  } catch (error) {
    next(error);
  }
});

// POST /api/project-plans/task-labour — add a labour entry
router.post('/task-labour', async (req, res, next) => {
  const {
    task_id, staff_id, staff_name, work_date,
    hours, cost_rate, bill_rate, billable, currency, notes, created_by
  } = req.body;
  if (!task_id) return res.status(400).json({ success: false, error: 'task_id is required' });
  try {
    const taskCheck = await pool.query('SELECT id FROM project_tasks WHERE id = $1', [task_id]);
    if (taskCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }
    const id = crypto.randomUUID();
    const result = await pool.query(`
      INSERT INTO project_task_labour (
        id, task_id, staff_id, staff_name, work_date,
        hours, cost_rate, bill_rate, billable, currency, notes, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *
    `, [
      id, task_id, staff_id || null, staff_name || null, work_date || null,
      hours || 0, cost_rate || 0, bill_rate || 0,
      billable !== undefined ? billable : true,
      currency || 'ZAR', notes || null, created_by || null
    ]);
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// PUT /api/project-plans/task-labour/:id — update a labour entry
router.put('/task-labour/:id', async (req, res, next) => {
  const {
    staff_id, staff_name, work_date,
    hours, cost_rate, bill_rate, billable, currency, notes
  } = req.body;
  try {
    const result = await pool.query(`
      UPDATE project_task_labour SET
        staff_id   = COALESCE($1, staff_id),
        staff_name = COALESCE($2, staff_name),
        work_date  = $3,
        hours      = COALESCE($4, hours),
        cost_rate  = COALESCE($5, cost_rate),
        bill_rate  = COALESCE($6, bill_rate),
        billable   = COALESCE($7, billable),
        currency   = COALESCE($8, currency),
        notes      = $9,
        updated_at = NOW()
      WHERE id = $10
      RETURNING *
    `, [
      staff_id !== undefined ? (staff_id || null) : undefined,
      staff_name !== undefined ? (staff_name || null) : undefined,
      work_date !== undefined ? (work_date || null) : undefined,
      hours ?? null,
      cost_rate ?? null,
      bill_rate ?? null,
      billable ?? null,
      currency || null,
      notes !== undefined ? (notes || null) : undefined,
      req.params.id
    ]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Labour entry not found' });
    }
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/project-plans/task-labour/:id — remove a labour entry
router.delete('/task-labour/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      'DELETE FROM project_task_labour WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Labour entry not found' });
    }
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// ──────────────────────────────────────────────────────────────────
// PROJECT DETAIL (for project-detail.html)
// GET /api/project-plans/:id/detail — plan + task stats + linked event
// ──────────────────────────────────────────────────────────────────
router.get('/:id/detail', async (req, res, next) => {
  try {
    const planRes = await pool.query(`
      SELECT p.*,
             e.name      AS event_name,
             e.start_date AS event_start_date,
             e.end_date   AS event_end_date,
             COALESCE(u.full_name, u.username) AS owner_name
      FROM project_plans p
      LEFT JOIN events e ON e.id = p.event_id
      LEFT JOIN users  u ON u.id = p.owner_staff_id
      WHERE p.id = $1
    `, [req.params.id]);

    if (planRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Plan not found' });
    }

    const statsRes = await pool.query(`
      SELECT
        COUNT(*)                                                          AS total_tasks,
        COUNT(*) FILTER (WHERE parent_task_id IS NULL)                    AS top_level_tasks,
        COUNT(*) FILTER (WHERE status = 'completed')                     AS completed_tasks,
        COUNT(*) FILTER (WHERE status IN ('blocked','waiting_on'))       AS blocked_tasks,
        COUNT(*) FILTER (WHERE status NOT IN ('completed','cancelled')
                          AND end_date < CURRENT_DATE)                   AS overdue_tasks,
        COUNT(*) FILTER (WHERE status NOT IN ('completed','cancelled')
                          AND priority = 'critical')                     AS critical_tasks,
        ROUND(AVG(progress))                                             AS avg_progress
      FROM project_tasks
      WHERE plan_id = $1
    `, [req.params.id]);

    res.json({
      success: true,
      data: {
        plan: planRes.rows[0],
        stats: statsRes.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
});

// ──────────────────────────────────────────────────────────────────
// BASELINES
// ──────────────────────────────────────────────────────────────────

// POST /api/project-plans/:id/baselines — snapshot current tasks into a new baseline
router.post('/:id/baselines', async (req, res, next) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ success: false, error: 'name is required' });
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const planCheck = await client.query('SELECT id FROM project_plans WHERE id = $1', [req.params.id]);
    if (planCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Plan not found' });
    }
    const bl = await client.query(
      `INSERT INTO project_baselines (plan_id, name, created_by) VALUES ($1,$2,$3) RETURNING *`,
      [req.params.id, name.trim(), req.user?.id || null]
    );
    const baseline = bl.rows[0];
    // Snapshot all tasks
    const tasks = await client.query(
      `SELECT id, start_date, end_date, progress, is_milestone FROM project_tasks WHERE plan_id = $1`,
      [req.params.id]
    );
    if (tasks.rows.length > 0) {
      const vals = tasks.rows.map((_, i) => `($1,$${i*4+2},$${i*4+3},$${i*4+4},$${i*4+5})`).join(',');
      const params = [baseline.id];
      tasks.rows.forEach(t => params.push(t.id, t.start_date || null, t.end_date || null, t.progress || 0, !!t.is_milestone));
      await client.query(
        `INSERT INTO project_baseline_tasks (baseline_id,task_id,planned_start,planned_end,planned_progress,is_milestone) VALUES ${vals}`,
        params
      );
    }
    await client.query('COMMIT');
    res.json({ success: true, data: baseline });
  } catch (error) {
    if (client) { try { await client.query('ROLLBACK'); } catch (_) {} }
    next(error);
  } finally {
    if (client) client.release();
  }
});

// GET /api/project-plans/:id/baselines — list baselines for a plan
router.get('/:id/baselines', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT b.*, u.full_name AS created_by_name
       FROM project_baselines b
       LEFT JOIN users u ON u.id = b.created_by
       WHERE b.plan_id = $1
       ORDER BY b.created_at DESC`,
      [req.params.id]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) { next(error); }
});

// GET /api/project-plans/:id/baselines/latest — most recent baseline with task snapshots
router.get('/:id/baselines/latest', async (req, res, next) => {
  try {
    const blRes = await pool.query(
      `SELECT id FROM project_baselines WHERE plan_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [req.params.id]
    );
    if (blRes.rows.length === 0) return res.json({ success: true, data: null, tasks: [] });
    const baselineId = blRes.rows[0].id;
    const tasksRes = await pool.query(
      `SELECT task_id, planned_start, planned_end, planned_progress, is_milestone
       FROM project_baseline_tasks WHERE baseline_id = $1`,
      [baselineId]
    );
    res.json({ success: true, data: { id: baselineId }, tasks: tasksRes.rows });
  } catch (error) { next(error); }
});

module.exports = router;
