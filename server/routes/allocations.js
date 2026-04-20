// routes/allocations.js
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, car_number } = req.query;
    const c=[], p=[];
    if (status)     { p.push(status);     c.push(`status=$${p.length}`); }
    if (car_number) { p.push(car_number); c.push(`car_number=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM allocations ${where} ORDER BY allocation_date DESC NULLS LAST`, p);
    res.json(r.rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { component_name, car_number, event_name, allocated_by, allocation_date, status, notes } = req.body;
    if (!component_name) return res.status(400).json({ error: 'component_name required' });
    const r = await pool.query(
      `INSERT INTO allocations (component_name,car_number,event_name,allocated_by,allocation_date,status,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [component_name,car_number,event_name,allocated_by,allocation_date||null,status||'allocated',notes]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { component_name, car_number, event_name, allocated_by, allocation_date, status, notes } = req.body;
    const r = await pool.query(
      `UPDATE allocations SET component_name=$1,car_number=$2,event_name=$3,allocated_by=$4,allocation_date=$5,
       status=$6,notes=$7,updated_at=NOW() WHERE id=$8 RETURNING *`,
      [component_name,car_number,event_name,allocated_by,allocation_date||null,status,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM allocations WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch (e) { next(e); }
});

module.exports = router;
