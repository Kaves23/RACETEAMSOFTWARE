// routes/sporting-calendar.js
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, series } = req.query;
    const conds = [], params = [];
    if (status) { params.push(status); conds.push(`status = $${params.length}`); }
    if (series) { params.push(series); conds.push(`series = $${params.length}`); }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    const result = await pool.query(`SELECT * FROM sporting_calendar ${where} ORDER BY start_date ASC NULLS LAST`, params);
    res.json(result.rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { event_name, series, round_number, circuit, country, city, start_date, end_date, status, notes } = req.body;
    if (!event_name) return res.status(400).json({ error: 'event_name required' });
    const r = await pool.query(
      `INSERT INTO sporting_calendar (event_name,series,round_number,circuit,country,city,start_date,end_date,status,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [event_name,series,round_number||null,circuit,country,city,start_date||null,end_date||null,status||'scheduled',notes]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { event_name, series, round_number, circuit, country, city, start_date, end_date, status, notes } = req.body;
    const r = await pool.query(
      `UPDATE sporting_calendar SET event_name=$1,series=$2,round_number=$3,circuit=$4,country=$5,city=$6,
       start_date=$7,end_date=$8,status=$9,notes=$10,updated_at=NOW() WHERE id=$11 RETURNING *`,
      [event_name,series,round_number||null,circuit,country,city,start_date||null,end_date||null,status,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM sporting_calendar WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (e) { next(e); }
});

module.exports = router;
