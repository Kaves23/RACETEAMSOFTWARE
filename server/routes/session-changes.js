// routes/session-changes.js
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, session } = req.query;
    const c=[], p=[];
    if (status)  { p.push(status );  c.push(`status=$${p.length}`); }
    if (session) { p.push(session);  c.push(`session=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM session_changes ${where} ORDER BY created_at DESC`, p);
    res.json(r.rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { car_number, session, event_name, change_description, requested_by, approved_by, reason, status, time_completed, notes } = req.body;
    if (!change_description) return res.status(400).json({ error: 'change_description required' });
    const r = await pool.query(
      `INSERT INTO session_changes (car_number,session,event_name,change_description,requested_by,approved_by,reason,status,time_completed,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [car_number,session,event_name,change_description,requested_by,approved_by,reason,status||'requested',time_completed,notes]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { car_number, session, event_name, change_description, requested_by, approved_by, reason, status, time_completed, notes } = req.body;
    const r = await pool.query(
      `UPDATE session_changes SET car_number=$1,session=$2,event_name=$3,change_description=$4,requested_by=$5,
       approved_by=$6,reason=$7,status=$8,time_completed=$9,notes=$10,updated_at=NOW() WHERE id=$11 RETURNING *`,
      [car_number,session,event_name,change_description,requested_by,approved_by,reason,status,time_completed,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM session_changes WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch (e) { next(e); }
});

module.exports = router;
