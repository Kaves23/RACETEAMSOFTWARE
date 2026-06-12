// routes/championships.js — Championship master list CRUD
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');
const crypto = require('crypto');

router.get('/', async (_req, res, next) => {
  try {
    const r = await pool.query('SELECT * FROM championships ORDER BY name');
    res.json(r.rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, sanctioning_body, season, default_fee, currency, doc_requirements, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const id = crypto.randomUUID();
    const r = await pool.query(
      `INSERT INTO championships (id, name, sanctioning_body, season, default_fee, currency, doc_requirements, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [id, name, sanctioning_body||null, season||null,
       default_fee===''||default_fee==null?null:default_fee,
       currency||'ZAR',
       doc_requirements ? JSON.stringify(doc_requirements) : null,
       notes||null]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { name, sanctioning_body, season, default_fee, currency, doc_requirements, notes } = req.body;
    const r = await pool.query(
      `UPDATE championships SET name=$1, sanctioning_body=$2, season=$3, default_fee=$4,
         currency=$5, doc_requirements=$6, notes=$7, updated_at=NOW()
       WHERE id=$8 RETURNING *`,
      [name, sanctioning_body||null, season||null,
       default_fee===''||default_fee==null?null:default_fee,
       currency||'ZAR',
       doc_requirements ? JSON.stringify(doc_requirements) : null,
       notes||null, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM championships WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch (e) { next(e); }
});

module.exports = router;
