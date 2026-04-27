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
    project_type, owner_staff_id, risk_level, priority
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
         project_type, owner_staff_id, risk_level, priority, created_by_user_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
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

// PUT /api/project-plans/:id — update plan
router.put('/:id', async (req, res, next) => {
  const {
    name, event_id, start_date, end_date, color, status, description,
    project_type, owner_staff_id, risk_level, priority, actual_end_date
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
      req.params.id
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
    linked_entity_type, linked_entity_id, sort_order
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
        linked_entity_type, linked_entity_id, sort_order
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING *
    `, [
      id, plan_id, parent_task_id || null, title.trim(), description || null,
      start_date || null, end_date || null, progress || 0, color || null,
      assignee_user_id || null, priority || 'medium', status || 'not_started',
      is_milestone || false,
      linked_entity_type || null, linked_entity_id || null,
      sort_order ?? 0
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
    linked_entity_type, linked_entity_id, sort_order
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
        updated_at          = NOW()
      WHERE id = $15
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
      req.params.taskId
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
             u.name       AS owner_name
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
        COUNT(*) FILTER (WHERE status = 'completed')                     AS completed_tasks,
        COUNT(*) FILTER (WHERE status = 'blocked')                       AS blocked_tasks,
        COUNT(*) FILTER (WHERE status NOT IN ('completed','cancelled')
                          AND end_date < CURRENT_DATE)                   AS overdue_tasks,
        COUNT(*) FILTER (WHERE status NOT IN ('completed','cancelled')
                          AND priority = 'critical')                     AS critical_tasks,
        ROUND(AVG(progress))                                             AS avg_progress
      FROM project_tasks
      WHERE plan_id = $1 AND parent_task_id IS NULL
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

module.exports = router;
