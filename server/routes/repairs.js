// routes/repairs.js (build repairs)
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, component_type } = req.query;
    const c=[], p=[];
    if (status)         { p.push(status);         c.push(`status=$${p.length}`); }
    if (component_type) { p.push(component_type); c.push(`component_type=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM repairs ${where} ORDER BY date_logged DESC NULLS LAST`, p);
    res.json(r.rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { component, component_type, car, event_name, mechanic, damage_description, repair_method, status, est_cost, date_logged, date_completed, notes } = req.body;
    if (!component) return res.status(400).json({ error: 'component required' });
    const r = await pool.query(
      `INSERT INTO repairs (component,component_type,car,event_name,mechanic,damage_description,repair_method,status,est_cost,date_logged,date_completed,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [component,component_type,car,event_name,mechanic,damage_description,repair_method,status||'logged',est_cost||null,date_logged||null,date_completed||null,notes]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { component, component_type, car, event_name, mechanic, damage_description, repair_method, status, est_cost, date_logged, date_completed, notes } = req.body;
    const r = await pool.query(
      `UPDATE repairs SET component=$1,component_type=$2,car=$3,event_name=$4,mechanic=$5,damage_description=$6,
       repair_method=$7,status=$8,est_cost=$9,date_logged=$10,date_completed=$11,notes=$12,updated_at=NOW() WHERE id=$13 RETURNING *`,
      [component,component_type,car,event_name,mechanic,damage_description,repair_method,status,est_cost||null,date_logged||null,date_completed||null,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM repairs WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch (e) { next(e); }
});

module.exports = router;
