// routes/fin-budget-lines.js
// Detailed budget lines (track hire, medical hire, officials hire, advertising,
// freight, etc.) scoped to an event, a project, or standalone. Tracks budgeted
// vs committed vs actual spend, with auto-derived actuals from linked payments
// and expenses (bills).
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');
const crypto = require('crypto');

const num = v => Number(v) || 0;

// Recompute committed + actual for a budget line from linked payments/expenses.
async function recompute(lineId, client = pool) {
  const r = await client.query(`
    SELECT
      COALESCE((SELECT SUM(amount) FROM fin_payments WHERE budget_line_id = $1 AND status = 'paid'), 0)
        + COALESCE((SELECT SUM(amount) FROM expenses WHERE budget_line_id = $1 AND (status = 'paid' OR status = 'Paid')), 0) AS actual,
      COALESCE((SELECT SUM(amount) FROM fin_payments WHERE budget_line_id = $1 AND status <> 'paid'), 0)
        + COALESCE((SELECT SUM(amount) FROM expenses WHERE budget_line_id = $1 AND (status IS NULL OR status NOT IN ('paid','Paid'))), 0) AS committed
  `, [lineId]);
  const actual = num(r.rows[0].actual);
  const committed = num(r.rows[0].committed);
  await client.query(
    `UPDATE fin_budget_lines SET actual_amount = $2, committed_amount = $3, updated_at = NOW() WHERE id = $1`,
    [lineId, actual, committed]
  );
  return { actual, committed };
}

// GET /api/fin-budget-lines  — list, filterable by scope/event/project/category/status
router.get('/', async (req, res, next) => {
  try {
    const { scope_type, event_id, project_id, category, status } = req.query;
    const c = [], p = [];
    if (scope_type) { p.push(scope_type); c.push(`scope_type=$${p.length}`); }
    if (event_id)   { p.push(event_id);   c.push(`event_id=$${p.length}`); }
    if (project_id) { p.push(project_id); c.push(`project_id=$${p.length}`); }
    if (category)   { p.push(category);   c.push(`category=$${p.length}`); }
    if (status)     { p.push(status);     c.push(`status=$${p.length}`); }
    const where = c.length ? 'WHERE ' + c.join(' AND ') : '';
    const r = await pool.query(`
      SELECT l.*,
             ROUND(CASE WHEN l.budgeted_amount > 0 THEN l.actual_amount / l.budgeted_amount * 100 ELSE 0 END, 1) AS pct_actual,
             (l.budgeted_amount - l.actual_amount - l.committed_amount) AS remaining
      FROM fin_budget_lines l ${where}
      ORDER BY l.due_date ASC NULLS LAST, l.created_at DESC`, p);
    res.json({ success: true, data: r.rows });
  } catch (e) { next(e); }
});

// GET /api/fin-budget-lines/summary?scope_type=&event_id=&project_id=  — totals
router.get('/summary', async (req, res, next) => {
  try {
    const { event_id, project_id } = req.query;
    const c = [], p = [];
    if (event_id)   { p.push(event_id);   c.push(`event_id=$${p.length}`); }
    if (project_id) { p.push(project_id); c.push(`project_id=$${p.length}`); }
    const where = c.length ? 'WHERE ' + c.join(' AND ') : '';
    const r = await pool.query(`
      SELECT
        COUNT(*)                       AS line_count,
        COALESCE(SUM(budgeted_amount),0)  AS budgeted,
        COALESCE(SUM(committed_amount),0) AS committed,
        COALESCE(SUM(actual_amount),0)    AS actual,
        COALESCE(SUM(budgeted_amount - actual_amount - committed_amount),0) AS remaining
      FROM fin_budget_lines ${where}`, p);
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { next(e); }
});

// GET /api/fin-budget-lines/:id
router.get('/:id', async (req, res, next) => {
  try {
    const r = await pool.query('SELECT * FROM fin_budget_lines WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { next(e); }
});

// POST /api/fin-budget-lines
router.post('/', async (req, res, next) => {
  try {
    const {
      name, category, description, scope_type, event_id, project_id,
      budgeted_amount, currency, due_date, status, vendor, notes
    } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ success: false, error: 'name required' });
    const createdBy = req.user?.name || req.user?.email || null;
    const id = crypto.randomUUID();
    const r = await pool.query(`
      INSERT INTO fin_budget_lines
        (id, name, category, description, scope_type, event_id, project_id,
         budgeted_amount, currency, due_date, status, vendor, notes, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *`,
      [id, name.trim(), category||null, description||null,
       scope_type || (event_id ? 'event' : project_id ? 'project' : 'standalone'),
       event_id||null, project_id||null,
       num(budgeted_amount), currency||'ZAR', due_date||null,
       status||'open', vendor||null, notes||null, createdBy]
    );
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e) { next(e); }
});

// PUT /api/fin-budget-lines/:id
router.put('/:id', async (req, res, next) => {
  try {
    const {
      name, category, description, scope_type, event_id, project_id,
      budgeted_amount, currency, due_date, status, vendor, notes
    } = req.body;
    const r = await pool.query(`
      UPDATE fin_budget_lines SET
        name            = COALESCE($2, name),
        category        = $3,
        description     = $4,
        scope_type      = COALESCE($5, scope_type),
        event_id        = $6,
        project_id      = $7,
        budgeted_amount = COALESCE($8, budgeted_amount),
        currency        = COALESCE($9, currency),
        due_date        = $10,
        status          = COALESCE($11, status),
        vendor          = $12,
        notes           = $13,
        updated_at      = NOW()
      WHERE id = $1
      RETURNING *`,
      [req.params.id,
       name?.trim() || null, category||null, description||null,
       scope_type||null, event_id||null, project_id||null,
       budgeted_amount != null ? num(budgeted_amount) : null,
       currency||null, due_date||null, status||null, vendor||null, notes||null]
    );
    if (!r.rows.length) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { next(e); }
});

// POST /api/fin-budget-lines/:id/recompute — refresh actual/committed from links
router.post('/:id/recompute', async (req, res, next) => {
  try {
    const totals = await recompute(req.params.id);
    const r = await pool.query('SELECT * FROM fin_budget_lines WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: r.rows[0], totals });
  } catch (e) { next(e); }
});

// DELETE /api/fin-budget-lines/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const r = await pool.query('DELETE FROM fin_budget_lines WHERE id=$1 RETURNING id', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;
module.exports.recompute = recompute;
