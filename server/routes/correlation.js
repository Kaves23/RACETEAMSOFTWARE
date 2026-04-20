'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { event_id, car_number } = req.query;
    const c=[], p=[];
    if (event_id)  { p.push(event_id);  c.push(`event_id=$${p.length}`); }
    if (car_number){ p.push(car_number);c.push(`car_number=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM correlation_data ${where} ORDER BY created_at DESC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { event_id,car_number,session_name,sim_lap_time,actual_lap_time,delta_seconds,correlation_pct,setup_changes,notes } = req.body;
    const r = await pool.query(
      `INSERT INTO correlation_data (event_id,car_number,session_name,sim_lap_time,actual_lap_time,delta_seconds,correlation_pct,setup_changes,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [event_id||null,car_number,session_name,sim_lap_time,actual_lap_time,delta_seconds||null,correlation_pct||null,setup_changes,notes]
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { event_id,car_number,session_name,sim_lap_time,actual_lap_time,delta_seconds,correlation_pct,setup_changes,notes } = req.body;
    const r = await pool.query(
      `UPDATE correlation_data SET event_id=$1,car_number=$2,session_name=$3,sim_lap_time=$4,actual_lap_time=$5,delta_seconds=$6,correlation_pct=$7,setup_changes=$8,notes=$9,updated_at=NOW() WHERE id=$10 RETURNING *`,
      [event_id||null,car_number,session_name,sim_lap_time,actual_lap_time,delta_seconds||null,correlation_pct||null,setup_changes,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM correlation_data WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
