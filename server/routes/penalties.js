// routes/penalties.js
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, penalty_type, event_id, incident_id } = req.query;
    const c=[], p=[];
    if (status)       { p.push(status);       c.push(`status=$${p.length}`); }
    if (penalty_type) { p.push(penalty_type); c.push(`penalty_type=$${p.length}`); }
    if (event_id)     { p.push(event_id);     c.push(`event_id=$${p.length}`); }
    if (incident_id)  { p.push(incident_id);  c.push(`incident_id=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM penalties ${where} ORDER BY penalty_date DESC NULLS LAST, created_at DESC`, p);
    res.json(r.rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { event_name, event_id, driver_name, driver_id, car_number, penalty_type, time_penalty,
            points_penalty, status, issued_by, reason, penalty_date, notes, incident_id } = req.body;
    if (!driver_name) return res.status(400).json({ error: 'driver_name required' });
    const r = await pool.query(
      `INSERT INTO penalties (event_name,event_id,driver_name,driver_id,car_number,penalty_type,
                              time_penalty,points_penalty,status,issued_by,reason,penalty_date,notes,incident_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [event_name, event_id||null, driver_name, driver_id||null, car_number, penalty_type,
       time_penalty||null, points_penalty||null, status||'issued', issued_by, reason,
       penalty_date||null, notes, incident_id||null]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { event_name, event_id, driver_name, driver_id, car_number, penalty_type, time_penalty,
            points_penalty, status, issued_by, reason, penalty_date, notes, incident_id } = req.body;
    const r = await pool.query(
      `UPDATE penalties SET event_name=$1,event_id=$2,driver_name=$3,driver_id=$4,car_number=$5,
        penalty_type=$6,time_penalty=$7,points_penalty=$8,status=$9,issued_by=$10,reason=$11,
        penalty_date=$12,notes=$13,incident_id=$14,updated_at=NOW() WHERE id=$15 RETURNING *`,
      [event_name, event_id||null, driver_name, driver_id||null, car_number, penalty_type,
       time_penalty||null, points_penalty||null, status, issued_by, reason,
       penalty_date||null, notes, incident_id||null, req.params.id]
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
