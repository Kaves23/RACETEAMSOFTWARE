// routes/components.js
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, component_type, car_number } = req.query;
    const c=[], p=[];
    if (status)         { p.push(status);         c.push(`status=$${p.length}`); }
    if (component_type) { p.push(component_type); c.push(`component_type=$${p.length}`); }
    if (car_number)     { p.push(car_number);     c.push(`car_number=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM components ${where} ORDER BY component_name ASC`, p);
    res.json(r.rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { component_name, component_type, serial_number, part_number, manufacturer, status, car_number, life_used, life_total, install_date, notes } = req.body;
    if (!component_name) return res.status(400).json({ error: 'component_name required' });
    const r = await pool.query(
      `INSERT INTO components (component_name,component_type,serial_number,part_number,manufacturer,status,car_number,life_used,life_total,install_date,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [component_name,component_type,serial_number,part_number,manufacturer,status||'active',car_number,life_used||0,life_total||null,install_date||null,notes]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { component_name, component_type, serial_number, part_number, manufacturer, status, car_number, life_used, life_total, install_date, notes } = req.body;
    const r = await pool.query(
      `UPDATE components SET component_name=$1,component_type=$2,serial_number=$3,part_number=$4,manufacturer=$5,
       status=$6,car_number=$7,life_used=$8,life_total=$9,install_date=$10,notes=$11,updated_at=NOW() WHERE id=$12 RETURNING *`,
      [component_name,component_type,serial_number,part_number,manufacturer,status,car_number,life_used||0,life_total||null,install_date||null,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM components WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch (e) { next(e); }
});

module.exports = router;
