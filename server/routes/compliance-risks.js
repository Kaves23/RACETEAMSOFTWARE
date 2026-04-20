'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, risk_level, category } = req.query;
    const c=[], p=[];
    if (status)    { p.push(status);    c.push(`status=$${p.length}`); }
    if (risk_level){ p.push(risk_level);c.push(`risk_level=$${p.length}`); }
    if (category)  { p.push(category);  c.push(`category=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM compliance_risks ${where} ORDER BY risk_score DESC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { title,description,category,risk_level,likelihood,impact,risk_score,mitigation,owner,review_date,status } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    const r = await pool.query(
      `INSERT INTO compliance_risks (title,description,category,risk_level,likelihood,impact,risk_score,mitigation,owner,review_date,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [title,description,category||'regulatory',risk_level||'medium',likelihood||3,impact||3,(likelihood||3)*(impact||3),mitigation,owner,review_date||null,status||'open']
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { title,description,category,risk_level,likelihood,impact,risk_score,mitigation,owner,review_date,status } = req.body;
    const r = await pool.query(
      `UPDATE compliance_risks SET title=$1,description=$2,category=$3,risk_level=$4,likelihood=$5,impact=$6,risk_score=$7,mitigation=$8,owner=$9,review_date=$10,status=$11,updated_at=NOW() WHERE id=$12 RETURNING *`,
      [title,description,category,risk_level,likelihood,impact,risk_score,mitigation,owner,review_date||null,status,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM compliance_risks WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
