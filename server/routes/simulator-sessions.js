'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { driver_name, sim_type } = req.query;
    const c=[], p=[];
    if (driver_name){ p.push(`%${driver_name}%`); c.push(`driver_name ILIKE $${p.length}`); }
    if (sim_type)   { p.push(sim_type);            c.push(`sim_type=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM simulator_sessions ${where} ORDER BY session_date DESC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { driver_name,driver_id,sim_type,session_date,duration_hours,track,setup_run,best_lap,objectives,outcomes,coach_name,notes } = req.body;
    if (!driver_name) return res.status(400).json({ error: 'driver_name required' });
    const r = await pool.query(
      `INSERT INTO simulator_sessions (driver_name,driver_id,sim_type,session_date,duration_hours,track,setup_run,best_lap,objectives,outcomes,coach_name,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [driver_name,driver_id||null,sim_type||'race_sim',session_date||new Date(),duration_hours||2,track,setup_run,best_lap||null,objectives,outcomes,coach_name,notes]
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { driver_name,sim_type,session_date,duration_hours,track,setup_run,best_lap,objectives,outcomes,coach_name,notes } = req.body;
    const r = await pool.query(
      `UPDATE simulator_sessions SET driver_name=$1,sim_type=$2,session_date=$3,duration_hours=$4,track=$5,setup_run=$6,best_lap=$7,objectives=$8,outcomes=$9,coach_name=$10,notes=$11,updated_at=NOW() WHERE id=$12 RETURNING *`,
      [driver_name,sim_type,session_date,duration_hours,track,setup_run,best_lap||null,objectives,outcomes,coach_name,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM simulator_sessions WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
