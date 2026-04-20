// routes/entries.js — Sporting entries CRUD
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, series } = req.query;
    const conds = [], params = [];
    if (status) { params.push(status); conds.push(`status=$${params.length}`); }
    if (series) { params.push(series); conds.push(`series=$${params.length}`); }
    const where = conds.length ? 'WHERE '+conds.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM sporting_entries ${where} ORDER BY created_at DESC`, params);
    res.json(r.rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { event_name, series, entry_number, car_number, driver_name, team_name, category, status, entry_date, notes } = req.body;
    if (!event_name) return res.status(400).json({ error: 'event_name required' });
    const r = await pool.query(
      `INSERT INTO sporting_entries (event_name,series,entry_number,car_number,driver_name,team_name,category,status,entry_date,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [event_name,series,entry_number,car_number,driver_name,team_name,category,status||'submitted',entry_date||null,notes]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { event_name, series, entry_number, car_number, driver_name, team_name, category, status, entry_date, notes } = req.body;
    const r = await pool.query(
      `UPDATE sporting_entries SET event_name=$1,series=$2,entry_number=$3,car_number=$4,driver_name=$5,
       team_name=$6,category=$7,status=$8,entry_date=$9,notes=$10,updated_at=NOW() WHERE id=$11 RETURNING *`,
      [event_name,series,entry_number,car_number,driver_name,team_name,category,status,entry_date||null,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM sporting_entries WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch (e) { next(e); }
});

module.exports = router;
