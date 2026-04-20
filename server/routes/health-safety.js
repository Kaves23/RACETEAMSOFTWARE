'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, record_type } = req.query;
    const c=[], p=[];
    if (status)     { p.push(status);      c.push(`status=$${p.length}`); }
    if (record_type){ p.push(record_type); c.push(`record_type=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM health_safety ${where} ORDER BY created_at DESC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { record_type,title,description,hazard_level,affected_persons,controls,residual_risk,review_date,status,owner } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    const r = await pool.query(
      `INSERT INTO health_safety (record_type,title,description,hazard_level,affected_persons,controls,residual_risk,review_date,status,owner)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [record_type||'risk_assessment',title,description,hazard_level||'medium',affected_persons,controls,residual_risk||'low',review_date||null,status||'active',owner]
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { record_type,title,description,hazard_level,affected_persons,controls,residual_risk,review_date,status,owner } = req.body;
    const r = await pool.query(
      `UPDATE health_safety SET record_type=$1,title=$2,description=$3,hazard_level=$4,affected_persons=$5,controls=$6,residual_risk=$7,review_date=$8,status=$9,owner=$10,updated_at=NOW() WHERE id=$11 RETURNING *`,
      [record_type,title,description,hazard_level,affected_persons,controls,residual_risk,review_date||null,status,owner,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM health_safety WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
