// routes/medical.js
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { result, record_type } = req.query;
    const c=[], p=[];
    if (result)      { p.push(result);      c.push(`result=$${p.length}`); }
    if (record_type) { p.push(record_type); c.push(`record_type=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM medical ${where} ORDER BY record_date DESC NULLS LAST`, p);
    res.json(r.rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { staff_name, record_type, result, record_date, expiry_date, practitioner, notes } = req.body;
    if (!staff_name) return res.status(400).json({ error: 'staff_name required' });
    const r = await pool.query(
      `INSERT INTO medical (staff_name,record_type,result,record_date,expiry_date,practitioner,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [staff_name,record_type||'medical_check',result||'pending',record_date||null,expiry_date||null,practitioner,notes]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { staff_name, record_type, result, record_date, expiry_date, practitioner, notes } = req.body;
    const r = await pool.query(
      `UPDATE medical SET staff_name=$1,record_type=$2,result=$3,record_date=$4,expiry_date=$5,
       practitioner=$6,notes=$7,updated_at=NOW() WHERE id=$8 RETURNING *`,
      [staff_name,record_type,result,record_date||null,expiry_date||null,practitioner,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM medical WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch (e) { next(e); }
});

module.exports = router;
