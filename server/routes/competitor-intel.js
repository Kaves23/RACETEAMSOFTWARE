// routes/competitor-intel.js
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { threat_level, series } = req.query;
    const c=[], p=[];
    if (threat_level) { p.push(threat_level); c.push(`threat_level=$${p.length}`); }
    if (series)       { p.push(series);       c.push(`series=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM competitor_intel ${where} ORDER BY created_at DESC`, p);
    res.json(r.rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { competitor_name, team, series, car_number, category, threat_level, strengths, weaknesses, recent_results, data_source, season, notes } = req.body;
    if (!competitor_name) return res.status(400).json({ error: 'competitor_name required' });
    const r = await pool.query(
      `INSERT INTO competitor_intel (competitor_name,team,series,car_number,category,threat_level,strengths,weaknesses,recent_results,data_source,season,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [competitor_name,team,series,car_number,category,threat_level||'medium',strengths,weaknesses,recent_results,data_source,season,notes]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { competitor_name, team, series, car_number, category, threat_level, strengths, weaknesses, recent_results, data_source, season, notes } = req.body;
    const r = await pool.query(
      `UPDATE competitor_intel SET competitor_name=$1,team=$2,series=$3,car_number=$4,category=$5,threat_level=$6,
       strengths=$7,weaknesses=$8,recent_results=$9,data_source=$10,season=$11,notes=$12,updated_at=NOW() WHERE id=$13 RETURNING *`,
      [competitor_name,team,series,car_number,category,threat_level,strengths,weaknesses,recent_results,data_source,season,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM competitor_intel WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch (e) { next(e); }
});

module.exports = router;
