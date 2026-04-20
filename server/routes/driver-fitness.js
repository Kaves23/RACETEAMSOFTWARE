'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { driver_name, metric_type } = req.query;
    const c=[], p=[];
    if (driver_name){ p.push(`%${driver_name}%`); c.push(`driver_name ILIKE $${p.length}`); }
    if (metric_type){ p.push(metric_type);         c.push(`metric_type=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM driver_fitness ${where} ORDER BY recorded_at DESC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { driver_name,driver_id,metric_type,value,unit,target_value,recorded_at,notes } = req.body;
    if (!driver_name||!metric_type) return res.status(400).json({ error: 'driver_name and metric_type required' });
    const r = await pool.query(
      `INSERT INTO driver_fitness (driver_name,driver_id,metric_type,value,unit,target_value,recorded_at,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [driver_name,driver_id||null,metric_type,value||null,unit,target_value||null,recorded_at||new Date(),notes]
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { driver_name,metric_type,value,unit,target_value,recorded_at,notes } = req.body;
    const r = await pool.query(
      `UPDATE driver_fitness SET driver_name=$1,metric_type=$2,value=$3,unit=$4,target_value=$5,recorded_at=$6,notes=$7,updated_at=NOW() WHERE id=$8 RETURNING *`,
      [driver_name,metric_type,value||null,unit,target_value||null,recorded_at,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM driver_fitness WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
