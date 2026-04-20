// routes/regulations.js
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, series, regulation_type } = req.query;
    const c=[], p=[];
    if (status)          { p.push(status);          c.push(`status=$${p.length}`); }
    if (series)          { p.push(series);          c.push(`series=$${p.length}`); }
    if (regulation_type) { p.push(regulation_type); c.push(`regulation_type=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM regulations ${where} ORDER BY created_at DESC`, p);
    res.json(r.rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { title, series, regulation_type, version, effective_date, document_url, status, notes } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    const r = await pool.query(
      `INSERT INTO regulations (title,series,regulation_type,version,effective_date,document_url,status,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [title,series,regulation_type,version,effective_date||null,document_url,status||'active',notes]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { title, series, regulation_type, version, effective_date, document_url, status, notes } = req.body;
    const r = await pool.query(
      `UPDATE regulations SET title=$1,series=$2,regulation_type=$3,version=$4,effective_date=$5,
       document_url=$6,status=$7,notes=$8,updated_at=NOW() WHERE id=$9 RETURNING *`,
      [title,series,regulation_type,version,effective_date||null,document_url,status,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM regulations WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch (e) { next(e); }
});

module.exports = router;
