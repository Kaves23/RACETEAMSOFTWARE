'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, department, decision_maker } = req.query;
    const c=[], p=[];
    if (status)        { p.push(status);                  c.push(`status=$${p.length}`); }
    if (department)    { p.push(department);              c.push(`department=$${p.length}`); }
    if (decision_maker){ p.push(`%${decision_maker}%`);   c.push(`decision_maker ILIKE $${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM decisions ${where} ORDER BY decision_date DESC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { title,description,department,decision_maker,options_considered,rationale,outcome,decision_date,review_date,status } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    const r = await pool.query(
      `INSERT INTO decisions (title,description,department,decision_maker,options_considered,rationale,outcome,decision_date,review_date,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [title,description,department,decision_maker||req.user?.name,options_considered,rationale,outcome,decision_date||new Date(),review_date||null,status||'active']
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { title,description,department,decision_maker,options_considered,rationale,outcome,decision_date,review_date,status } = req.body;
    const r = await pool.query(
      `UPDATE decisions SET title=$1,description=$2,department=$3,decision_maker=$4,options_considered=$5,rationale=$6,outcome=$7,decision_date=$8,review_date=$9,status=$10,updated_at=NOW() WHERE id=$11 RETURNING *`,
      [title,description,department,decision_maker,options_considered,rationale,outcome,decision_date,review_date||null,status,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM decisions WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
