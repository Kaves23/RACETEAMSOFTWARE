// routes/training.js
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, staff_name } = req.query;
    const c=[], p=[];
    if (status)     { p.push(status);     c.push(`status=$${p.length}`); }
    if (staff_name) { p.push(`%${staff_name}%`); c.push(`staff_name ILIKE $${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM training_records ${where} ORDER BY training_date DESC NULLS LAST`, p);
    res.json(r.rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { staff_name, training_title, provider, status, training_date, expiry_date, certificate_ref, notes } = req.body;
    if (!staff_name || !training_title) return res.status(400).json({ error: 'staff_name and training_title required' });
    const r = await pool.query(
      `INSERT INTO training_records (staff_name,training_title,provider,status,training_date,expiry_date,certificate_ref,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [staff_name,training_title,provider,status||'scheduled',training_date||null,expiry_date||null,certificate_ref,notes]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { staff_name, training_title, provider, status, training_date, expiry_date, certificate_ref, notes } = req.body;
    const r = await pool.query(
      `UPDATE training_records SET staff_name=$1,training_title=$2,provider=$3,status=$4,training_date=$5,
       expiry_date=$6,certificate_ref=$7,notes=$8,updated_at=NOW() WHERE id=$9 RETURNING *`,
      [staff_name,training_title,provider,status,training_date||null,expiry_date||null,certificate_ref,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM training_records WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch (e) { next(e); }
});

module.exports = router;
