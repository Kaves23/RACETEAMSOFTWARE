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
    const b = req.body || {};
    const title           = b.title;
    const governing_body  = b.governing_body  ?? b.series ?? null;
    const doc_type        = b.doc_type        ?? b.regulation_type ?? null;
    const version         = b.version         ?? null;
    const effective_date  = b.effective_date  || null;
    const document_url    = b.document_url    ?? null;
    const status          = b.status          || 'active';
    const summary         = b.summary         ?? b.notes ?? null;
    const linked_event    = b.linked_event    ?? null;
    if (!title) return res.status(400).json({ error: 'title required' });
    const r = await pool.query(
      `INSERT INTO regulations (title,series,regulation_type,governing_body,doc_type,version,effective_date,document_url,status,notes,summary,linked_event)
       VALUES ($1,$2,$3,$2,$3,$4,$5,$6,$7,$8,$8,$9) RETURNING *`,
      [title,governing_body,doc_type,version,effective_date,document_url,status,summary,linked_event]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const b = req.body || {};
    const title           = b.title;
    const governing_body  = b.governing_body  ?? b.series ?? null;
    const doc_type        = b.doc_type        ?? b.regulation_type ?? null;
    const version         = b.version         ?? null;
    const effective_date  = b.effective_date  || null;
    const document_url    = b.document_url    ?? null;
    const status          = b.status          || 'active';
    const summary         = b.summary         ?? b.notes ?? null;
    const linked_event    = b.linked_event    ?? null;
    const r = await pool.query(
      `UPDATE regulations SET title=$1,series=$2,regulation_type=$3,governing_body=$2,doc_type=$3,
       version=$4,effective_date=$5,document_url=$6,status=$7,notes=$8,summary=$8,linked_event=$9,updated_at=NOW()
       WHERE id=$10 RETURNING *`,
      [title,governing_body,doc_type,version,effective_date,document_url,status,summary,linked_event,req.params.id]
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
