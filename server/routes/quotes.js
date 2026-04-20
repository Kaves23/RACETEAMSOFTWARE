'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, supplier_id, rfq_id } = req.query;
    const c=[], p=[];
    if (status)     { p.push(status);      c.push(`status=$${p.length}`); }
    if (supplier_id){ p.push(supplier_id); c.push(`supplier_id=$${p.length}`); }
    if (rfq_id)     { p.push(rfq_id);      c.push(`rfq_id=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM quotes ${where} ORDER BY created_at DESC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { rfq_id,supplier_id,quote_number,total_value,currency,valid_until,lead_time_days,items,terms,status,notes } = req.body;
    if (!supplier_id||!total_value) return res.status(400).json({ error: 'supplier_id and total_value required' });
    const r = await pool.query(
      `INSERT INTO quotes (rfq_id,supplier_id,quote_number,total_value,currency,valid_until,lead_time_days,items,terms,status,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [rfq_id||null,supplier_id,quote_number,total_value,currency||'GBP',valid_until||null,lead_time_days||null,items,terms,status||'received',notes]
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { rfq_id,supplier_id,quote_number,total_value,currency,valid_until,lead_time_days,items,terms,status,notes } = req.body;
    const r = await pool.query(
      `UPDATE quotes SET rfq_id=$1,supplier_id=$2,quote_number=$3,total_value=$4,currency=$5,valid_until=$6,lead_time_days=$7,items=$8,terms=$9,status=$10,notes=$11,updated_at=NOW() WHERE id=$12 RETURNING *`,
      [rfq_id||null,supplier_id,quote_number,total_value,currency,valid_until||null,lead_time_days||null,items,terms,status,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM quotes WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
