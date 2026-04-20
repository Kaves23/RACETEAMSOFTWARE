'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, event_id, debrief_type } = req.query;
    const c=[], p=[];
    if (status)      { p.push(status);      c.push(`status=$${p.length}`); }
    if (event_id)    { p.push(event_id);    c.push(`event_id=$${p.length}`); }
    if (debrief_type){ p.push(debrief_type);c.push(`debrief_type=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM debriefs ${where} ORDER BY created_at DESC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { event_id,session_name,debrief_type,driver_name,car_number,attendees,key_findings,action_items,balance_feedback,tyre_feedback,setup_direction,status,created_by } = req.body;
    if (!session_name) return res.status(400).json({ error: 'session_name required' });
    const r = await pool.query(
      `INSERT INTO debriefs (event_id,session_name,debrief_type,driver_name,car_number,attendees,key_findings,action_items,balance_feedback,tyre_feedback,setup_direction,status,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [event_id||null,session_name,debrief_type||'post_session',driver_name,car_number,attendees,key_findings,action_items,balance_feedback,tyre_feedback,setup_direction,status||'open',created_by||req.user?.name]
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { event_id,session_name,debrief_type,driver_name,car_number,attendees,key_findings,action_items,balance_feedback,tyre_feedback,setup_direction,status } = req.body;
    const r = await pool.query(
      `UPDATE debriefs SET event_id=$1,session_name=$2,debrief_type=$3,driver_name=$4,car_number=$5,attendees=$6,key_findings=$7,action_items=$8,balance_feedback=$9,tyre_feedback=$10,setup_direction=$11,status=$12,updated_at=NOW() WHERE id=$13 RETURNING *`,
      [event_id||null,session_name,debrief_type,driver_name,car_number,attendees,key_findings,action_items,balance_feedback,tyre_feedback,setup_direction,status,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM debriefs WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
