'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { condition, compound, car_number } = req.query;
    const c=[], p=[];
    if (condition)  { p.push(condition);  c.push(`condition=$${p.length}`); }
    if (compound)   { p.push(compound);   c.push(`compound=$${p.length}`); }
    if (car_number) { p.push(car_number); c.push(`car_number=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM tyre_register ${where} ORDER BY created_at DESC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { set_number,compound,specification,car_number,driver_name,event_id,session_fitted,laps_used,condition,temperature_inner,temperature_middle,temperature_outer,pressure_hot,pressure_cold,notes } = req.body;
    if (!set_number||!compound) return res.status(400).json({ error: 'set_number and compound required' });
    const r = await pool.query(
      `INSERT INTO tyre_register (set_number,compound,specification,car_number,driver_name,event_id,session_fitted,laps_used,condition,temperature_inner,temperature_middle,temperature_outer,pressure_hot,pressure_cold,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [set_number,compound,specification,car_number,driver_name,event_id||null,session_fitted,laps_used||0,condition||'new',temperature_inner||null,temperature_middle||null,temperature_outer||null,pressure_hot||null,pressure_cold||null,notes]
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { set_number,compound,specification,car_number,driver_name,event_id,session_fitted,laps_used,condition,temperature_inner,temperature_middle,temperature_outer,pressure_hot,pressure_cold,notes } = req.body;
    const r = await pool.query(
      `UPDATE tyre_register SET set_number=$1,compound=$2,specification=$3,car_number=$4,driver_name=$5,event_id=$6,session_fitted=$7,laps_used=$8,condition=$9,temperature_inner=$10,temperature_middle=$11,temperature_outer=$12,pressure_hot=$13,pressure_cold=$14,notes=$15,updated_at=NOW() WHERE id=$16 RETURNING *`,
      [set_number,compound,specification,car_number,driver_name,event_id||null,session_fitted,laps_used||0,condition,temperature_inner||null,temperature_middle||null,temperature_outer||null,pressure_hot||null,pressure_cold||null,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM tyre_register WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
