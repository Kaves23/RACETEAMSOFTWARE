'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, car_number, category } = req.query;
    const c=[], p=[];
    if (status)    { p.push(status);    c.push(`status=$${p.length}`); }
    if (car_number){ p.push(car_number);c.push(`car_number=$${p.length}`); }
    if (category)  { p.push(category);  c.push(`category=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM preventive_maintenance ${where} ORDER BY next_due ASC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { car_number,component,category,description,frequency_km,frequency_events,last_done_km,last_done_date,next_due,next_due_km,assigned_to,status,notes } = req.body;
    if (!component) return res.status(400).json({ error: 'component required' });
    const r = await pool.query(
      `INSERT INTO preventive_maintenance (car_number,component,category,description,frequency_km,frequency_events,last_done_km,last_done_date,next_due,next_due_km,assigned_to,status,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [car_number,component,category||'mechanical',description,frequency_km||null,frequency_events||null,last_done_km||null,last_done_date||null,next_due||null,next_due_km||null,assigned_to,status||'scheduled',notes]
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { car_number,component,category,description,frequency_km,frequency_events,last_done_km,last_done_date,next_due,next_due_km,assigned_to,status,notes } = req.body;
    const r = await pool.query(
      `UPDATE preventive_maintenance SET car_number=$1,component=$2,category=$3,description=$4,frequency_km=$5,frequency_events=$6,last_done_km=$7,last_done_date=$8,next_due=$9,next_due_km=$10,assigned_to=$11,status=$12,notes=$13,updated_at=NOW() WHERE id=$14 RETURNING *`,
      [car_number,component,category,description,frequency_km||null,frequency_events||null,last_done_km||null,last_done_date||null,next_due||null,next_due_km||null,assigned_to,status,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM preventive_maintenance WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
