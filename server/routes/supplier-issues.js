'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, severity, supplier_id } = req.query;
    const c=[], p=[];
    if (status)     { p.push(status);      c.push(`status=$${p.length}`); }
    if (severity)   { p.push(severity);    c.push(`severity=$${p.length}`); }
    if (supplier_id){ p.push(supplier_id); c.push(`supplier_id=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM supplier_issues ${where} ORDER BY created_at DESC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { supplier_id,issue_type,title,description,severity,resolution,status,reported_by } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    const r = await pool.query(
      `INSERT INTO supplier_issues (supplier_id,issue_type,title,description,severity,resolution,status,reported_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [supplier_id||null,issue_type||'quality',title,description,severity||'medium',resolution,status||'open',reported_by||req.user?.name]
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { supplier_id,issue_type,title,description,severity,resolution,status } = req.body;
    const r = await pool.query(
      `UPDATE supplier_issues SET supplier_id=$1,issue_type=$2,title=$3,description=$4,severity=$5,resolution=$6,status=$7,updated_at=NOW() WHERE id=$8 RETURNING *`,
      [supplier_id||null,issue_type,title,description,severity,resolution,status,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM supplier_issues WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
