// routes/homologation.js
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { approval_status, part_family } = req.query;
    const c=[], p=[];
    if (approval_status) { p.push(approval_status); c.push(`approval_status=$${p.length}`); }
    if (part_family)     { p.push(part_family);     c.push(`part_family=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM homologation ${where} ORDER BY created_at DESC`, p);
    res.json(r.rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { doc_title, part_family, revision_number, approval_status, effective_date, expiry_date, governing_body, part_number, document_url, notes } = req.body;
    if (!doc_title) return res.status(400).json({ error: 'doc_title required' });
    const r = await pool.query(
      `INSERT INTO homologation (doc_title,part_family,revision_number,approval_status,effective_date,expiry_date,governing_body,part_number,document_url,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [doc_title,part_family,revision_number,approval_status||'pending',effective_date||null,expiry_date||null,governing_body,part_number,document_url,notes]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { doc_title, part_family, revision_number, approval_status, effective_date, expiry_date, governing_body, part_number, document_url, notes } = req.body;
    const r = await pool.query(
      `UPDATE homologation SET doc_title=$1,part_family=$2,revision_number=$3,approval_status=$4,effective_date=$5,
       expiry_date=$6,governing_body=$7,part_number=$8,document_url=$9,notes=$10,updated_at=NOW() WHERE id=$11 RETURNING *`,
      [doc_title,part_family,revision_number,approval_status,effective_date||null,expiry_date||null,governing_body,part_number,document_url,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM homologation WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch (e) { next(e); }
});

module.exports = router;
