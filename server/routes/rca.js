'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, incident_id } = req.query;
    const c=[], p=[];
    if (status)     { p.push(status);     c.push(`status=$${p.length}`); }
    if (incident_id){ p.push(incident_id);c.push(`incident_id=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM rca ${where} ORDER BY created_at DESC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { incident_id,problem_statement,timeline,root_cause,contributing_factors,five_why_analysis,resolution,preventive_measures,owner,due_date,status } = req.body;
    if (!problem_statement) return res.status(400).json({ error: 'problem_statement required' });
    const r = await pool.query(
      `INSERT INTO rca (incident_id,problem_statement,timeline,root_cause,contributing_factors,five_why_analysis,resolution,preventive_measures,owner,due_date,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [incident_id||null,problem_statement,timeline,root_cause,contributing_factors,five_why_analysis,resolution,preventive_measures,owner,due_date||null,status||'in_progress']
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { incident_id,problem_statement,timeline,root_cause,contributing_factors,five_why_analysis,resolution,preventive_measures,owner,due_date,status } = req.body;
    const r = await pool.query(
      `UPDATE rca SET incident_id=$1,problem_statement=$2,timeline=$3,root_cause=$4,contributing_factors=$5,five_why_analysis=$6,resolution=$7,preventive_measures=$8,owner=$9,due_date=$10,status=$11,updated_at=NOW() WHERE id=$12 RETURNING *`,
      [incident_id||null,problem_statement,timeline,root_cause,contributing_factors,five_why_analysis,resolution,preventive_measures,owner,due_date||null,status,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM rca WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
