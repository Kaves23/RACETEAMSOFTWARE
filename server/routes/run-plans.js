'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, event_id, car_number } = req.query;
    const c=[], p=[];
    if (status)    { p.push(status);    c.push(`status=$${p.length}`); }
    if (event_id)  { p.push(event_id);  c.push(`event_id=$${p.length}`); }
    if (car_number){ p.push(car_number);c.push(`car_number=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM run_plans ${where} ORDER BY created_at DESC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { event_id,session_name,car_number,driver_name,planned_laps,actual_laps,fuel_load,tyre_compound,objectives,notes,status,created_by } = req.body;
    if (!session_name) return res.status(400).json({ error: 'session_name required' });
    const r = await pool.query(
      `INSERT INTO run_plans (event_id,session_name,car_number,driver_name,planned_laps,actual_laps,fuel_load,tyre_compound,objectives,notes,status,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [event_id||null,session_name,car_number,driver_name,planned_laps||0,actual_laps||0,fuel_load||null,tyre_compound,objectives,notes,status||'planned',created_by||req.user?.name]
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { event_id,session_name,car_number,driver_name,planned_laps,actual_laps,fuel_load,tyre_compound,objectives,notes,status } = req.body;
    const r = await pool.query(
      `UPDATE run_plans SET event_id=$1,session_name=$2,car_number=$3,driver_name=$4,planned_laps=$5,actual_laps=$6,fuel_load=$7,tyre_compound=$8,objectives=$9,notes=$10,status=$11,updated_at=NOW() WHERE id=$12 RETURNING *`,
      [event_id||null,session_name,car_number,driver_name,planned_laps||0,actual_laps||0,fuel_load||null,tyre_compound,objectives,notes,status,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM run_plans WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
