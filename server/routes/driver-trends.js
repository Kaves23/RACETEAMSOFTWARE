'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { driver_name, trend_direction } = req.query;
    const c=[], p=[];
    if (driver_name)    { p.push(`%${driver_name}%`);    c.push(`driver_name ILIKE $${p.length}`); }
    if (trend_direction){ p.push(trend_direction); c.push(`trend_direction=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM driver_trends ${where} ORDER BY recorded_at DESC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { driver_name,driver_id,event_id,session_name,metric_name,metric_value,target_value,trend_direction,notes } = req.body;
    if (!driver_name||!metric_name) return res.status(400).json({ error: 'driver_name and metric_name required' });
    const r = await pool.query(
      `INSERT INTO driver_trends (driver_name,driver_id,event_id,session_name,metric_name,metric_value,target_value,trend_direction,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [driver_name,driver_id||null,event_id||null,session_name,metric_name,metric_value||null,target_value||null,trend_direction||'stable',notes]
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { driver_name,session_name,metric_name,metric_value,target_value,trend_direction,notes } = req.body;
    const r = await pool.query(
      `UPDATE driver_trends SET driver_name=$1,session_name=$2,metric_name=$3,metric_value=$4,target_value=$5,trend_direction=$6,notes=$7,updated_at=NOW() WHERE id=$8 RETURNING *`,
      [driver_name,session_name,metric_name,metric_value||null,target_value||null,trend_direction,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM driver_trends WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
