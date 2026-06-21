'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');
const crypto = require('crypto');

function normalizeEmail(value) {
  const v = String(value || '').trim().toLowerCase();
  return v || null;
}

/* GET all prospects */
router.get('/', async (req, res, next) => {
  try {
    const { status, search } = req.query;
    const c = [], p = [];
    if (status) { p.push(status); c.push(`status=$${p.length}`); }
    if (search) { p.push(`%${search}%`); c.push(`(driver_name ILIKE $${p.length} OR parent_name ILIKE $${p.length})`); }
    const where = c.length ? 'WHERE ' + c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM academy_prospects ${where} ORDER BY created_at DESC`, p);
    res.json(r.rows);
  } catch (e) { next(e); }
});

/* POST create prospect */
router.post('/', async (req, res, next) => {
  try {
    const {
      driver_name, driver_dob, category, test_venue, nationality,
      parent_name, parent_phone, parent_email,
      source, assigned_to, status, notes,
      sessions, attachments, activities, tasks, booked_dates,
      test_fee, fee_currency, payment_status
    } = req.body;
    if (!driver_name) return res.status(400).json({ error: 'driver_name required' });
    const r = await pool.query(
      `INSERT INTO academy_prospects
         (driver_name, driver_dob, category, test_venue, nationality,
          parent_name, parent_phone, parent_email,
          source, assigned_to, status, notes,
          sessions, attachments, activities, tasks, booked_dates,
          test_fee, fee_currency, payment_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING *`,
      [
        driver_name, driver_dob || null, category || null, test_venue || null, nationality || null,
        parent_name || null, parent_phone || null, normalizeEmail(parent_email),
        source || null, assigned_to || null, status || 'lead', notes || null,
        JSON.stringify(sessions || []), JSON.stringify(attachments || []),
        JSON.stringify(activities || []), JSON.stringify(tasks || []), JSON.stringify(booked_dates || []),
        (test_fee === '' || test_fee == null) ? null : parseFloat(test_fee), fee_currency || 'ZAR', payment_status || 'unpaid'
      ]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

/* PUT update prospect */
router.put('/:id', async (req, res, next) => {
  try {
    const {
      driver_name, driver_dob, category, test_venue, nationality,
      parent_name, parent_phone, parent_email,
      source, assigned_to, status, notes,
      sessions, attachments, activities, tasks, booked_dates,
      test_fee, fee_currency, payment_status
    } = req.body;
    const r = await pool.query(
      `UPDATE academy_prospects SET
         driver_name=$1, driver_dob=$2, category=$3, test_venue=$4, nationality=$5,
         parent_name=$6, parent_phone=$7, parent_email=$8,
         source=$9, assigned_to=$10, status=$11, notes=$12,
         sessions=$13, attachments=$14, activities=$15, tasks=$16, booked_dates=$17,
         test_fee=$18, fee_currency=$19, payment_status=COALESCE($20, payment_status), updated_at=NOW()
       WHERE id=$21 RETURNING *`,
      [
        driver_name, driver_dob || null, category || null, test_venue || null, nationality || null,
        parent_name || null, parent_phone || null, normalizeEmail(parent_email),
        source || null, assigned_to || null, status || 'lead', notes || null,
        JSON.stringify(sessions || []), JSON.stringify(attachments || []), JSON.stringify(activities || []), JSON.stringify(tasks || []), JSON.stringify(booked_dates || []),
        (test_fee === '' || test_fee == null) ? null : parseFloat(test_fee), fee_currency || 'ZAR', payment_status || null,
        req.params.id
      ]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

/* PATCH update a single session inside a prospect (e.g. attach lap data) */
router.patch('/:id/sessions/:sesId', async (req, res, next) => {
  try {
    const row = await pool.query('SELECT sessions FROM academy_prospects WHERE id=$1', [req.params.id]);
    if (!row.rows.length) return res.status(404).json({ error: 'Prospect not found' });
    let sessions = row.rows[0].sessions;
    if (!Array.isArray(sessions)) sessions = [];
    const idx = sessions.findIndex(s => String(s.id) === String(req.params.sesId));
    if (idx === -1) return res.status(404).json({ error: 'Session not found' });
    sessions[idx] = { ...sessions[idx], ...req.body };
    await pool.query(
      'UPDATE academy_prospects SET sessions=$1, updated_at=NOW() WHERE id=$2',
      [JSON.stringify(sessions), req.params.id]
    );
    res.json(sessions[idx]);
  } catch (e) { next(e); }
});

/* DELETE prospect */
router.delete('/:id', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM academy_prospects WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (e) { next(e); }
});

/* POST generate a test-drive invoice for a prospect */
router.post('/:id/invoice', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const pr = await client.query('SELECT * FROM academy_prospects WHERE id=$1', [req.params.id]);
    if (!pr.rows.length) return res.status(404).json({ error: 'Prospect not found' });
    const prospect = pr.rows[0];

    if (prospect.invoice_id) {
      return res.status(409).json({ error: 'Invoice already generated', invoice_id: prospect.invoice_id });
    }

    const fee = (req.body && req.body.test_fee != null && req.body.test_fee !== '')
      ? parseFloat(req.body.test_fee)
      : (prospect.test_fee != null ? parseFloat(prospect.test_fee) : 0);
    if (!(fee > 0)) return res.status(400).json({ error: 'A positive test fee is required to invoice' });

    const currency = (req.body && req.body.fee_currency) || prospect.fee_currency || 'ZAR';
    const createdBy = req.user?.name || req.user?.email || null;
    const invId  = 'inv-' + crypto.randomUUID();
    const today  = new Date();
    const due    = new Date(today.getTime() + 14 * 86400000);
    const number = 'ACAD-' + today.toISOString().slice(0, 10).replace(/-/g, '') + '-' + invId.slice(-4).toUpperCase();
    const line   = { description: 'Academy test drive — ' + (prospect.driver_name || 'Driver'), quantity: 1, unit_price: fee, amount: fee, total: fee };

    await client.query('BEGIN');
    const inv = await client.query(
      `INSERT INTO fin_invoices
        (id,number,status,inv_type,invoice_date,due_date,customer_details,vat_rate,currency,lines,notes,department,created_by)
       VALUES ($1,$2,'Draft','academy_test',$3,$4,$5,0,$6,$7,$8,'Academy',$9) RETURNING *`,
      [invId, number, today.toISOString().slice(0, 10), due.toISOString().slice(0, 10),
       JSON.stringify({ name: prospect.parent_name || prospect.driver_name, email: prospect.parent_email || null, phone: prospect.parent_phone || null }),
       currency, JSON.stringify([line]), 'Auto-generated from Academy pipeline', createdBy]
    );
    await client.query(
      `UPDATE academy_prospects SET invoice_id=$1, test_fee=$2, fee_currency=$3,
         payment_status='invoiced', updated_at=NOW() WHERE id=$4`,
      [invId, fee, currency, prospect.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ success: true, invoice: inv.rows[0] });
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_e) {}
    next(e);
  } finally {
    client.release();
  }
});

module.exports = router;
