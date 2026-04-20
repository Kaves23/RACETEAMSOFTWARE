// routes/fin-payments.js
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

// GET /api/fin-payments
router.get('/', async (req, res, next) => {
  try {
    const { status, budget_id, category } = req.query;
    const c=[], p=[];
    if (status)    { p.push(status);    c.push(`status=$${p.length}`); }
    if (budget_id) { p.push(budget_id); c.push(`budget_id=$${p.length}`); }
    if (category)  { p.push(category);  c.push(`category=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(
      `SELECT p.*, b.name AS budget_name
       FROM fin_payments p
       LEFT JOIN fin_budgets b ON p.budget_id = b.id
       ${where} ORDER BY p.payment_date DESC NULLS LAST, p.created_at DESC`, p);
    res.json(r.rows);
  } catch (e) { next(e); }
});

// GET /api/fin-payments/summary
router.get('/summary', async (req, res, next) => {
  try {
    const r = await pool.query(`
      SELECT
        COUNT(*)                          AS total_payments,
        SUM(CASE WHEN currency='GBP' THEN amount ELSE 0 END) AS total_gbp,
        COUNT(*) FILTER(WHERE status='pending')   AS pending_count,
        COUNT(*) FILTER(WHERE status='approved')  AS approved_count,
        COUNT(*) FILTER(WHERE status='paid')       AS paid_count,
        SUM(CASE WHEN status='pending' AND currency='GBP' THEN amount ELSE 0 END) AS pending_gbp
      FROM fin_payments`);
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

// GET /api/fin-payments/:id
router.get('/:id', async (req, res, next) => {
  try {
    const r = await pool.query('SELECT * FROM fin_payments WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

// POST /api/fin-payments
router.post('/', async (req, res, next) => {
  try {
    const { payee, description, amount, currency, payment_date, reference, method,
            status, budget_id, category, event_id, notes } = req.body;
    if (!payee) return res.status(400).json({ error: 'payee required' });
    const createdBy = req.user?.name || req.user?.email || null;
    const r = await pool.query(
      `INSERT INTO fin_payments (payee,description,amount,currency,payment_date,reference,method,
       status,budget_id,category,event_id,notes,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [payee, description||null, parseFloat(amount)||0, currency||'GBP', payment_date||null,
       reference||null, method||'bank_transfer', status||'pending',
       budget_id||null, category||null, event_id||null, notes||null, createdBy]
    );
    // Update budget spent_amount if budget_id provided and status=paid
    if (budget_id && (status === 'paid')) {
      await pool.query(
        `UPDATE fin_budgets SET spent_amount = spent_amount + $1, updated_at=NOW() WHERE id=$2`,
        [parseFloat(amount)||0, budget_id]
      );
    }
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

// PUT /api/fin-payments/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { payee, description, amount, currency, payment_date, reference, method,
            status, budget_id, category, event_id, notes, approved_by } = req.body;
    const r = await pool.query(
      `UPDATE fin_payments SET payee=$1,description=$2,amount=$3,currency=$4,payment_date=$5,
       reference=$6,method=$7,status=$8,budget_id=$9,category=$10,event_id=$11,notes=$12,
       approved_by=$13,updated_at=NOW() WHERE id=$14 RETURNING *`,
      [payee, description||null, parseFloat(amount)||0, currency||'GBP', payment_date||null,
       reference||null, method||'bank_transfer', status||'pending',
       budget_id||null, category||null, event_id||null, notes||null,
       approved_by||null, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

// DELETE /api/fin-payments/:id
router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM fin_payments WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch (e) { next(e); }
});

module.exports = router;
