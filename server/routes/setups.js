// routes/setups.js
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { car_number, session } = req.query;
    const c=[], p=[];
    if (car_number) { p.push(car_number); c.push(`car_number=$${p.length}`); }
    if (session)    { p.push(session);    c.push(`session=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM setups ${where} ORDER BY setup_date DESC NULLS LAST`, p);
    res.json(r.rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { car_number, session, event_name, front_wing, rear_wing, ride_height_front, ride_height_rear, front_spring, rear_spring, front_arb, rear_arb, tyre_compound, tyre_pressure, fuel_load, setup_date, comments } = req.body;
    if (!car_number) return res.status(400).json({ error: 'car_number required' });
    const r = await pool.query(
      `INSERT INTO setups (car_number,session,event_name,front_wing,rear_wing,ride_height_front,ride_height_rear,front_spring,rear_spring,front_arb,rear_arb,tyre_compound,tyre_pressure,fuel_load,setup_date,comments)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [car_number,session,event_name,front_wing,rear_wing,ride_height_front||null,ride_height_rear||null,front_spring,rear_spring,front_arb,rear_arb,tyre_compound,tyre_pressure,fuel_load||null,setup_date||null,comments]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { car_number, session, event_name, front_wing, rear_wing, ride_height_front, ride_height_rear, front_spring, rear_spring, front_arb, rear_arb, tyre_compound, tyre_pressure, fuel_load, setup_date, comments } = req.body;
    const r = await pool.query(
      `UPDATE setups SET car_number=$1,session=$2,event_name=$3,front_wing=$4,rear_wing=$5,ride_height_front=$6,
       ride_height_rear=$7,front_spring=$8,rear_spring=$9,front_arb=$10,rear_arb=$11,tyre_compound=$12,
       tyre_pressure=$13,fuel_load=$14,setup_date=$15,comments=$16,updated_at=NOW() WHERE id=$17 RETURNING *`,
      [car_number,session,event_name,front_wing,rear_wing,ride_height_front||null,ride_height_rear||null,front_spring,rear_spring,front_arb,rear_arb,tyre_compound,tyre_pressure,fuel_load||null,setup_date||null,comments,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM setups WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch (e) { next(e); }
});

module.exports = router;
