// routes/penalties.js
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, penalty_type } = req.query;
    const c=[], p=[];
    if (status)       { p.push(status);       c.push(`status=$${p.length}`); }
    if (penalty_type) { p.push(penalty_type); c.push(`penalty_type=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM penalties ${where} ORDER BY penalty_date DESC NULLS LAST`, p);
    res.json(r.rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { event_name, driver_name, car_number, penalty_type, time_penalty, points_penalty, status, issued_by, reason, penalty_date, notes } = req.body;
    if (!driver_name) return res.status(400).json({ error: 'driver_name required' });
    const r = await pool.query(
      `INSERT INTO penalties (event_name,driver_name,car_number,penalty_type,time_penalty,points_penalty,status,issued_by,reason,penalty_date,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [event_name,driver_name,car_number,penalty_type,time_penalty||null,points_penalty||null,status||'issued',issued_by,reason,penalty_date||null,notes]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { event_name, driver_name, car_number, penalty_type, time_penalty, points_penalty, status, issued_by, reason, penalty_date, notes } = req.body;
    const r = await pool.query(
      `UPDATE penalties SET event_name=$1,driver_name=$2,car_number=$3,penalty_type=$4,time_penalty=$5,
       points_penalty=$6,status=$7,issued_by=$8,reason=$9,penalty_date=$10,notes=$11,updated_at=NOW() WHERE id=$12 RETURNING *`,
      [event_name,driver_name,car_number,penalty_type,time_penalty||null,points_penalty||null,status,issued_by,reason,penalty_date||null,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM penalties WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch (e) { next(e); }
});

module.exports = router;
