'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { driver_name, event_id } = req.query;
    const c=[], p=[];
    if (driver_name){ p.push(`%${driver_name}%`); c.push(`driver_name ILIKE $${p.length}`); }
    if (event_id)   { p.push(event_id);            c.push(`event_id=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM driver_debriefs ${where} ORDER BY created_at DESC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { driver_name,driver_id,event_id,session_type,tyre_feeling,balance_feeling,confidence_level,pace_rating,key_moments,improvements,coach_notes,created_by } = req.body;
    if (!driver_name) return res.status(400).json({ error: 'driver_name required' });
    const r = await pool.query(
      `INSERT INTO driver_debriefs (driver_name,driver_id,event_id,session_type,tyre_feeling,balance_feeling,confidence_level,pace_rating,key_moments,improvements,coach_notes,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [driver_name,driver_id||null,event_id||null,session_type||'race',tyre_feeling,balance_feeling,confidence_level||null,pace_rating||null,key_moments,improvements,coach_notes,created_by||req.user?.name]
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { driver_name,event_id,session_type,tyre_feeling,balance_feeling,confidence_level,pace_rating,key_moments,improvements,coach_notes } = req.body;
    const r = await pool.query(
      `UPDATE driver_debriefs SET driver_name=$1,event_id=$2,session_type=$3,tyre_feeling=$4,balance_feeling=$5,confidence_level=$6,pace_rating=$7,key_moments=$8,improvements=$9,coach_notes=$10,updated_at=NOW() WHERE id=$11 RETURNING *`,
      [driver_name,event_id||null,session_type,tyre_feeling,balance_feeling,confidence_level||null,pace_rating||null,key_moments,improvements,coach_notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM driver_debriefs WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
