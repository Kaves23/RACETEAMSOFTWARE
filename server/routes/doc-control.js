'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, doc_type, department } = req.query;
    const c=[], p=[];
    if (status)    { p.push(status);     c.push(`status=$${p.length}`); }
    if (doc_type)  { p.push(doc_type);   c.push(`doc_type=$${p.length}`); }
    if (department){ p.push(department); c.push(`department=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM doc_control ${where} ORDER BY title ASC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { doc_number,title,doc_type,department,version,author,approver,effective_date,review_date,url,status,notes } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    const r = await pool.query(
      `INSERT INTO doc_control (doc_number,title,doc_type,department,version,author,approver,effective_date,review_date,url,status,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [doc_number,title,doc_type||'procedure',department,version||'1.0',author||req.user?.name,approver,effective_date||null,review_date||null,url,status||'draft',notes]
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { doc_number,title,doc_type,department,version,author,approver,effective_date,review_date,url,status,notes } = req.body;
    const r = await pool.query(
      `UPDATE doc_control SET doc_number=$1,title=$2,doc_type=$3,department=$4,version=$5,author=$6,approver=$7,effective_date=$8,review_date=$9,url=$10,status=$11,notes=$12,updated_at=NOW() WHERE id=$13 RETURNING *`,
      [doc_number,title,doc_type,department,version,author,approver,effective_date||null,review_date||null,url,status,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM doc_control WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
