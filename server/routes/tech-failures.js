// routes/tech-failures.js
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, severity, component_type } = req.query;
    const c=[], p=[];
    if (status)         { p.push(status);         c.push(`status=$${p.length}`); }
    if (severity)       { p.push(severity);       c.push(`severity=$${p.length}`); }
    if (component_type) { p.push(component_type); c.push(`component_type=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM tech_failures ${where} ORDER BY date_logged DESC NULLS LAST`, p);
    res.json(r.rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { failure_ref, car_number, component_type, component_ref, event_name, session, severity, status, symptoms, root_cause, resolution, date_logged, logged_by, notes } = req.body;
    if (!component_type) return res.status(400).json({ error: 'component_type required' });
    const r = await pool.query(
      `INSERT INTO tech_failures (failure_ref,car_number,component_type,component_ref,event_name,session,severity,status,symptoms,root_cause,resolution,date_logged,logged_by,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [failure_ref,car_number,component_type,component_ref,event_name,session,severity||'medium',status||'open',symptoms,root_cause,resolution,date_logged||null,logged_by,notes]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { failure_ref, car_number, component_type, component_ref, event_name, session, severity, status, symptoms, root_cause, resolution, date_logged, logged_by, notes } = req.body;
    const r = await pool.query(
      `UPDATE tech_failures SET failure_ref=$1,car_number=$2,component_type=$3,component_ref=$4,event_name=$5,
       session=$6,severity=$7,status=$8,symptoms=$9,root_cause=$10,resolution=$11,date_logged=$12,logged_by=$13,
       notes=$14,updated_at=NOW() WHERE id=$15 RETURNING *`,
      [failure_ref,car_number,component_type,component_ref,event_name,session,severity,status,symptoms,root_cause,resolution,date_logged||null,logged_by,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM tech_failures WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch (e) { next(e); }
});

module.exports = router;
