// routes/fin-purchase-orders.js — Finance-flavoured PO management.
// Uses existing purchase_orders table (Phase 5 added: requisition_id, event_id, budget_id, received_at, received_by).
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');
const crypto  = require('crypto');
const { writeAudit } = require('./_fin-audit-helper');

const newId = () => `po-${crypto.randomUUID()}`;
const num = (v) => (v == null || v === '') ? 0 : (Number(v) || 0);

function nextNumber() {
  const d = new Date();
  const y = String(d.getFullYear()).slice(2);
  const m = String(d.getMonth()+1).padStart(2,'0');
  const r = Math.floor(Math.random()*9000+1000);
  return `PO-${y}${m}-${r}`;
}

// GET /api/fin-purchase-orders
router.get('/', async (req, res, next) => {
  try {
    const { status, event_id, supplier } = req.query;
    const c = [], p = [];
    if (status)   { p.push(status);   c.push(`status=$${p.length}`); }
    if (event_id) { p.push(event_id); c.push(`event_id=$${p.length}`); }
    if (supplier) { p.push(supplier); c.push(`supplier=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(
      `SELECT po.*, e.name AS event_name
       FROM purchase_orders po
       LEFT JOIN events e ON e.id = po.event_id
       ${where}
       ORDER BY po.order_date DESC NULLS LAST, po.created_at DESC`, p);
    res.json({ success: true, data: r.rows });
  } catch (e) { next(e); }
});

// GET /api/fin-purchase-orders/:id
router.get('/:id', async (req, res, next) => {
  try {
    const r = await pool.query('SELECT * FROM purchase_orders WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { next(e); }
});

// POST /api/fin-purchase-orders
router.post('/', async (req, res, next) => {
  try {
    const b = req.body || {};
    const id = b.id || newId();
    const poNumber = b.po_number || nextNumber();
    const total = num(b.total_amount);
    const r = await pool.query(
      `INSERT INTO purchase_orders
         (id, po_number, supplier, status, total_amount, currency, order_date, expected_delivery_date,
          items, notes, requisition_id, event_id, budget_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [id, poNumber, b.supplier || null, b.status || 'draft',
       total, b.currency || 'ZAR',
       b.order_date || null, b.expected_delivery_date || null,
       typeof b.items === 'string' ? b.items : (b.items ? JSON.stringify(b.items) : null),
       b.notes || null,
       b.requisition_id || null, b.event_id || null, b.budget_id || null]);

    // If this PO came from a requisition, link back and mark it ordered.
    if (b.requisition_id) {
      await pool.query(
        `UPDATE fin_requisitions SET po_id=$1, status='ordered', updated_at=NOW() WHERE id=$2`,
        [id, b.requisition_id]);
    }
    await writeAudit(pool, req, 'purchase_order', id, 'create', { po_number: poNumber, total }, total);
    res.status(201).json({ success: true, data: r.rows[0] });
  } catch (e) { next(e); }
});

// PUT /api/fin-purchase-orders/:id
router.put('/:id', async (req, res, next) => {
  try {
    const b = req.body || {};
    const r = await pool.query(
      `UPDATE purchase_orders SET
         supplier               = COALESCE($2, supplier),
         status                 = COALESCE($3, status),
         total_amount           = COALESCE($4, total_amount),
         currency               = COALESCE($5, currency),
         order_date             = COALESCE($6, order_date),
         expected_delivery_date = COALESCE($7, expected_delivery_date),
         items                  = COALESCE($8, items),
         notes                  = COALESCE($9, notes),
         event_id               = COALESCE($10, event_id),
         budget_id              = COALESCE($11, budget_id),
         updated_at             = NOW()
       WHERE id=$1 RETURNING *`,
      [req.params.id,
       b.supplier || null, b.status || null,
       b.total_amount != null ? num(b.total_amount) : null,
       b.currency || null,
       b.order_date || null, b.expected_delivery_date || null,
       (b.items != null) ? (typeof b.items === 'string' ? b.items : JSON.stringify(b.items)) : null,
       b.notes || null, b.event_id || null, b.budget_id || null]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    await writeAudit(pool, req, 'purchase_order', req.params.id, 'update', b);
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { next(e); }
});

// POST /api/fin-purchase-orders/:id/receive
router.post('/:id/receive', async (req, res, next) => {
  try {
    const receiver = req.body?.received_by || req.user?.name || req.user?.email || null;
    const r = await pool.query(
      `UPDATE purchase_orders
       SET status='received', received_at=NOW(), received_by=$2,
           actual_delivery_date=COALESCE(actual_delivery_date, CURRENT_DATE),
           updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [req.params.id, receiver]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    await writeAudit(pool, req, 'purchase_order', req.params.id, 'receive',
      { received_by: receiver }, num(r.rows[0].total_amount));
    res.json({ success: true, data: r.rows[0] });
  } catch (e) { next(e); }
});

// DELETE /api/fin-purchase-orders/:id
router.delete('/:id', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM purchase_orders WHERE id=$1', [req.params.id]);
    await writeAudit(pool, req, 'purchase_order', req.params.id, 'delete');
    res.status(204).end();
  } catch (e) { next(e); }
});

module.exports = router;
