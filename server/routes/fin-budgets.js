// routes/fin-budgets.js
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

// GET /api/fin-budgets  — list all budgets with spent%
router.get('/', async (req, res, next) => {
  try {
    const { status, period, category } = req.query;
    const c=[], p=[];
    if (status)   { p.push(status);   c.push(`status=$${p.length}`); }
    if (period)   { p.push(period);   c.push(`period=$${p.length}`); }
    if (category) { p.push(category); c.push(`category=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(
      `SELECT b.*,
              ROUND(CASE WHEN b.total_amount > 0 THEN b.spent_amount / b.total_amount * 100 ELSE 0 END, 1) AS pct_spent
       FROM fin_budgets b ${where} ORDER BY b.created_at DESC`, p);
    res.json(r.rows);
  } catch (e) { next(e); }
});

// GET /api/fin-budgets/summary  — KPI totals
router.get('/summary', async (req, res, next) => {
  try {
    const r = await pool.query(`
      SELECT
        COUNT(*)                          AS total_budgets,
        SUM(total_amount)                 AS total_allocated,
        SUM(spent_amount)                 AS total_spent,
        SUM(total_amount - spent_amount)  AS total_remaining,
        COUNT(*) FILTER(WHERE status='active') AS active_budgets,
        COUNT(*) FILTER(WHERE spent_amount > total_amount) AS over_budget
      FROM fin_budgets WHERE status != 'closed'`);
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

// GET /api/fin-budgets/:id
router.get('/:id', async (req, res, next) => {
  try {
    const r = await pool.query('SELECT * FROM fin_budgets WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

// POST /api/fin-budgets
router.post('/', async (req, res, next) => {
  try {
    const { name, category, total_amount, period, event_id, status, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const createdBy = req.user?.name || req.user?.email || null;
    const r = await pool.query(
      `INSERT INTO fin_budgets (name,category,total_amount,period,event_id,status,notes,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [name, category||null, parseFloat(total_amount)||0, period||null, event_id||null, status||'active', notes||null, createdBy]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

// PUT /api/fin-budgets/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { name, category, total_amount, spent_amount, period, event_id, status, notes } = req.body;
    const r = await pool.query(
      `UPDATE fin_budgets SET name=$1,category=$2,total_amount=$3,spent_amount=$4,period=$5,
       event_id=$6,status=$7,notes=$8,updated_at=NOW() WHERE id=$9 RETURNING *`,
      [name, category||null, parseFloat(total_amount)||0, parseFloat(spent_amount)||0,
       period||null, event_id||null, status||'active', notes||null, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

// DELETE /api/fin-budgets/:id
router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM fin_budgets WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch (e) { next(e); }
});

module.exports = router;
