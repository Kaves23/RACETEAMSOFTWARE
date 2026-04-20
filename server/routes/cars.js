// routes/cars.js
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status } = req.query;
    const c=[], p=[];
    if (status) { p.push(status); c.push(`status=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM cars ${where} ORDER BY car_number ASC`, p);
    res.json(r.rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { car_number, car_name, chassis_number, year, series, status, primary_driver, notes } = req.body;
    if (!car_number) return res.status(400).json({ error: 'car_number required' });
    const r = await pool.query(
      `INSERT INTO cars (car_number,car_name,chassis_number,year,series,status,primary_driver,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [car_number,car_name,chassis_number,year||null,series,status||'active',primary_driver,notes]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { car_number, car_name, chassis_number, year, series, status, primary_driver, notes } = req.body;
    const r = await pool.query(
      `UPDATE cars SET car_number=$1,car_name=$2,chassis_number=$3,year=$4,series=$5,status=$6,
       primary_driver=$7,notes=$8,updated_at=NOW() WHERE id=$9 RETURNING *`,
      [car_number,car_name,chassis_number,year||null,series,status,primary_driver,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM cars WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch (e) { next(e); }
});

module.exports = router;
