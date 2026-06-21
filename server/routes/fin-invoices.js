// routes/fin-invoices.js
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

const crypto = require('crypto');
const newId = (p) => `${p}-${crypto.randomUUID()}`;

// ── Customers ───────────────────────────────────────────────────────────────
// GET /api/fin-invoices/customers
router.get('/customers', async (req, res, next) => {
  try {
    const r = await pool.query('SELECT * FROM fin_invoice_customers ORDER BY name');
    res.json(r.rows);
  } catch (e) { next(e); }
});

// POST /api/fin-invoices/customers
router.post('/customers', async (req, res, next) => {
  try {
    const { id, name, email, phone, address, sage_ref } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const cid = id || newId('cust');
    const createdBy = req.user?.name || req.user?.email || null;
    const r = await pool.query(
      `INSERT INTO fin_invoice_customers (id,name,email,phone,address,sage_ref,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET
         name=EXCLUDED.name, email=EXCLUDED.email, phone=EXCLUDED.phone,
         address=EXCLUDED.address, sage_ref=EXCLUDED.sage_ref, updated_at=NOW()
       RETURNING *`,
      [cid, name, email||null, phone||null, address||null, sage_ref||null, createdBy]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

// PUT /api/fin-invoices/customers/:id
router.put('/customers/:id', async (req, res, next) => {
  try {
    const { name, email, phone, address, sage_ref } = req.body;
    const r = await pool.query(
      `UPDATE fin_invoice_customers SET name=$1,email=$2,phone=$3,address=$4,sage_ref=$5,updated_at=NOW()
       WHERE id=$6 RETURNING *`,
      [name, email||null, phone||null, address||null, sage_ref||null, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

// DELETE /api/fin-invoices/customers/:id
router.delete('/customers/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM fin_invoice_customers WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch (e) { next(e); }
});

// ── Invoices ──────────────────────────────────────────────────────────────
// GET /api/fin-invoices
router.get('/', async (req, res, next) => {
  try {
    // Auto-transition sent invoices whose due date has passed to Overdue.
    await pool.query(
      `UPDATE fin_invoices SET status='Overdue', updated_at=NOW()
       WHERE status='Sent' AND due_date IS NOT NULL AND due_date < CURRENT_DATE`);
    const { status, customer_id, event_id } = req.query;
    const c=[], p=[];
    if (status)      { p.push(status);      c.push(`status=$${p.length}`); }
    if (customer_id) { p.push(customer_id); c.push(`customer_id=$${p.length}`); }
    if (event_id)    { p.push(event_id);    c.push(`event_id=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(
      `SELECT * FROM fin_invoices ${where} ORDER BY invoice_date DESC NULLS LAST, created_at DESC`, p);
    res.json(r.rows);
  } catch (e) { next(e); }
});

// GET /api/fin-invoices/:id
router.get('/:id', async (req, res, next) => {
  try {
    const r = await pool.query('SELECT * FROM fin_invoices WHERE id=$1', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

function invoiceParams(b) {
  return [
    b.number||null, b.status||'Draft', b.inv_type||null,
    b.invoice_date||null, b.due_date||null, b.customer_id||null,
    b.customer_details||null, b.event_id||null, b.driver_id||null,
    parseFloat(b.vat_rate)||0, b.currency||'ZAR',
    JSON.stringify(Array.isArray(b.lines) ? b.lines : []),
    b.notes||null, b.sage_nominal||null, b.tax_code||null, b.department||null
  ];
}

// POST /api/fin-invoices
router.post('/', async (req, res, next) => {
  try {
    const b = req.body || {};
    const id = b.id || newId('inv');
    const createdBy = req.user?.name || req.user?.email || null;
    const r = await pool.query(
      `INSERT INTO fin_invoices
        (id,number,status,inv_type,invoice_date,due_date,customer_id,customer_details,
         event_id,driver_id,vat_rate,currency,lines,notes,sage_nominal,tax_code,department,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [id, ...invoiceParams(b), createdBy]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

// PUT /api/fin-invoices/:id
router.put('/:id', async (req, res, next) => {
  try {
    const b = req.body || {};
    const r = await pool.query(
      `UPDATE fin_invoices SET
        number=$1,status=$2,inv_type=$3,invoice_date=$4,due_date=$5,customer_id=$6,
        customer_details=$7,event_id=$8,driver_id=$9,vat_rate=$10,currency=$11,lines=$12,
        notes=$13,sage_nominal=$14,tax_code=$15,department=$16,updated_at=NOW()
       WHERE id=$17 RETURNING *`,
      [...invoiceParams(b), req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

// DELETE /api/fin-invoices/:id
router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM fin_invoices WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch (e) { next(e); }
});

module.exports = router;
