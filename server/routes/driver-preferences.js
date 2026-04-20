'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { driver_name } = req.query;
    const c=[], p=[];
    if (driver_name){ p.push(`%${driver_name}%`); c.push(`driver_name ILIKE $${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM driver_preferences ${where} ORDER BY driver_name ASC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { driver_name,driver_id,seat_position,steering_position,mirror_settings,pedal_spacing,brake_bias_preference,diff_preference,balance_preference,communication_style,debriefs_preference,notes } = req.body;
    if (!driver_name) return res.status(400).json({ error: 'driver_name required' });
    const r = await pool.query(
      `INSERT INTO driver_preferences (driver_name,driver_id,seat_position,steering_position,mirror_settings,pedal_spacing,brake_bias_preference,diff_preference,balance_preference,communication_style,debriefs_preference,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [driver_name,driver_id||null,seat_position,steering_position,mirror_settings,pedal_spacing,brake_bias_preference,diff_preference,balance_preference,communication_style,debriefs_preference,notes]
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { driver_name,seat_position,steering_position,mirror_settings,pedal_spacing,brake_bias_preference,diff_preference,balance_preference,communication_style,debriefs_preference,notes } = req.body;
    const r = await pool.query(
      `UPDATE driver_preferences SET driver_name=$1,seat_position=$2,steering_position=$3,mirror_settings=$4,pedal_spacing=$5,brake_bias_preference=$6,diff_preference=$7,balance_preference=$8,communication_style=$9,debriefs_preference=$10,notes=$11,updated_at=NOW() WHERE id=$12 RETURNING *`,
      [driver_name,seat_position,steering_position,mirror_settings,pedal_spacing,brake_bias_preference,diff_preference,balance_preference,communication_style,debriefs_preference,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM driver_preferences WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
