'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, severity, car_number } = req.query;
    const c=[], p=[];
    if (status)    { p.push(status);    c.push(`status=$${p.length}`); }
    if (severity)  { p.push(severity);  c.push(`severity=$${p.length}`); }
    if (car_number){ p.push(car_number);c.push(`car_number=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM reliability_incidents ${where} ORDER BY occurred_at DESC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { title,description,car_number,event_id,component,subsystem,severity,root_cause,immediate_action,status,occurred_at,reported_by } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    const r = await pool.query(
      `INSERT INTO reliability_incidents (title,description,car_number,event_id,component,subsystem,severity,root_cause,immediate_action,status,occurred_at,reported_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [title,description,car_number,event_id||null,component,subsystem,severity||'medium',root_cause,immediate_action,status||'open',occurred_at||new Date(),reported_by||req.user?.name]
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { title,description,car_number,event_id,component,subsystem,severity,root_cause,immediate_action,status } = req.body;
    const r = await pool.query(
      `UPDATE reliability_incidents SET title=$1,description=$2,car_number=$3,event_id=$4,component=$5,subsystem=$6,severity=$7,root_cause=$8,immediate_action=$9,status=$10,updated_at=NOW() WHERE id=$11 RETURNING *`,
      [title,description,car_number,event_id||null,component,subsystem,severity,root_cause,immediate_action,status,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM reliability_incidents WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
