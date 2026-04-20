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
    const r = await pool.query(`SELECT * FROM benchmarking ${where} ORDER BY created_at DESC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { event_id,session_name,car_number,driver_name,competitor_name,our_best_lap,competitor_best_lap,delta_seconds,sector_1_delta,sector_2_delta,sector_3_delta,notes } = req.body;
    const r = await pool.query(
      `INSERT INTO benchmarking (event_id,session_name,car_number,driver_name,competitor_name,our_best_lap,competitor_best_lap,delta_seconds,sector_1_delta,sector_2_delta,sector_3_delta,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [event_id||null,session_name,car_number,driver_name,competitor_name,our_best_lap,competitor_best_lap,delta_seconds||null,sector_1_delta||null,sector_2_delta||null,sector_3_delta||null,notes]
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { event_id,session_name,car_number,driver_name,competitor_name,our_best_lap,competitor_best_lap,delta_seconds,sector_1_delta,sector_2_delta,sector_3_delta,notes } = req.body;
    const r = await pool.query(
      `UPDATE benchmarking SET event_id=$1,session_name=$2,car_number=$3,driver_name=$4,competitor_name=$5,our_best_lap=$6,competitor_best_lap=$7,delta_seconds=$8,sector_1_delta=$9,sector_2_delta=$10,sector_3_delta=$11,notes=$12,updated_at=NOW() WHERE id=$13 RETURNING *`,
      [event_id||null,session_name,car_number,driver_name,competitor_name,our_best_lap,competitor_best_lap,delta_seconds||null,sector_1_delta||null,sector_2_delta||null,sector_3_delta||null,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM benchmarking WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
