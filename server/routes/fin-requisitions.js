// routes/fin-requisitions.js — Internal purchase requisitions w/ approval flow
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');
const crypto  = require('crypto');
const { writeAudit } = require('./_fin-audit-helper');

const newId = () => `req-${crypto.randomUUID()}`;

function nextNumber() {
  const d = new Date();
  const y = String(d.getFullYear()).slice(2);
  const m = String(d.getMonth()+1).padStart(2,'0');
  const r = Math.floor(Math.random()*9000+1000);
  return `REQ-${y}${m}-${r}`;
}

const num = (v) => (v == null || v === '') ? 0 : (Number(v) || 0);

function totalFromItems(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((s, it) => s + (num(it.qty || 1) * num(it.unit_price || it.price || 0)), 0);
}

// GET /api/fin-requisitions
router.get('/', async (req, res, next) => {
  try {
    const { status, event_id } = req.query;
    const c = [], p = [];
    if (status)   { p.push(status);   c.push(`status=$${p.length}`); }
    if (event_id) { p.push(event_id); c.push(`event_id=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(
      `SELECT r.*, e.name AS event_name
       FROM fin_requisitions r
       LEFT JOIN events e ON e.id = r.event_id
       ${where}
       ORDER BY r.created_at DESC`, p);
    res.json({ success: true, data: r.rows });
  } catch (e) { next(e); }
});

// GET /api/fin-requisitions/:id
router.get('/:id', async (req, res, next) => {
  try {
    const r = await pool.query('SELECT * FROM fin_requisitions WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { next(e); }
});

// POST /api/fin-requisitions
router.post('/', async (req, res, next) => {
  try {
    const b = req.body || {};
    const id = b.id || newId();
    const reqNumber = b.req_number || nextNumber();
    const items = Array.isArray(b.items) ? b.items : [];
    const total = num(b.total_amount) || totalFromItems(items);
    const r = await pool.query(
      `INSERT INTO fin_requisitions
        (id, req_number, status, requester_name, requester_email, department, needed_by,
         event_id, budget_id, category, description, items, total_amount, currency, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15)
       RETURNING *`,
      [id, reqNumber, b.status || 'draft',
       b.requester_name || null, b.requester_email || null, b.department || null,
       b.needed_by || null, b.event_id || null, b.budget_id || null,
       b.category || null, b.description || null, JSON.stringify(items),
       total, b.currency || 'ZAR', b.notes || null]);
    await writeAudit(pool, req, 'requisition', id, 'create', { req_number: reqNumber, total }, total);
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e) { next(e); }
});

// PUT /api/fin-requisitions/:id
router.put('/:id', async (req, res, next) => {
  try {
    const b = req.body || {};
    const items = Array.isArray(b.items) ? b.items : null;
    const total = (b.total_amount != null) ? num(b.total_amount)
                : (items ? totalFromItems(items) : null);
    const r = await pool.query(
      `UPDATE fin_requisitions SET
        status          = COALESCE($2, status),
        requester_name  = COALESCE($3, requester_name),
        requester_email = COALESCE($4, requester_email),
        department      = COALESCE($5, department),
        needed_by       = COALESCE($6, needed_by),
        event_id        = COALESCE($7, event_id),
        budget_id       = COALESCE($8, budget_id),
        category        = COALESCE($9, category),
        description     = COALESCE($10, description),
        items           = COALESCE($11::jsonb, items),
        total_amount    = COALESCE($12, total_amount),
        currency        = COALESCE($13, currency),
        notes           = COALESCE($14, notes),
        updated_at      = NOW()
       WHERE id=$1 RETURNING *`,
      [req.params.id, b.status || null,
       b.requester_name || null, b.requester_email || null, b.department || null,
       b.needed_by || null, b.event_id || null, b.budget_id || null,
       b.category || null, b.description || null,
       items ? JSON.stringify(items) : null,
       total, b.currency || null, b.notes || null]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    await writeAudit(pool, req, 'requisition', req.params.id, 'update', b, total);
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { next(e); }
});

// POST /api/fin-requisitions/:id/approve
router.post('/:id/approve', async (req, res, next) => {
  try {
    const approver = req.body?.approver_name || req.user?.name || req.user?.email || null;
    const r = await pool.query(
      `UPDATE fin_requisitions
       SET status='approved', approver_name=$2, approved_at=NOW(), updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [req.params.id, approver]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    await writeAudit(pool, req, 'requisition', req.params.id, 'approve',
      { approver_name: approver }, num(r.rows[0].total_amount));
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { next(e); }
});

// POST /api/fin-requisitions/:id/reject
router.post('/:id/reject', async (req, res, next) => {
  try {
    const reason = req.body?.reason || null;
    const r = await pool.query(
      `UPDATE fin_requisitions
       SET status='rejected', rejected_reason=$2, updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [req.params.id, reason]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    await writeAudit(pool, req, 'requisition', req.params.id, 'reject', { reason });
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { next(e); }
});

// DELETE /api/fin-requisitions/:id
router.delete('/:id', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM fin_requisitions WHERE id=$1', [req.params.id]);
    await writeAudit(pool, req, 'requisition', req.params.id, 'delete');
    res.status(204).end();
  } catch (e) { next(e); }
});

module.exports = router;
