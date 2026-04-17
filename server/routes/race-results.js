// routes/race-results.js
// CRUD for race_results table — used by results.html
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');
const crypto  = require('crypto');

function newId() { return crypto.randomUUID(); }

// Format ms as m:ss.xxx for display
function msToLap(ms) {
  if (!ms) return null;
  const min = Math.floor(ms / 60000);
  const rem = ms % 60000;
  const sec = (rem / 1000).toFixed(3).padStart(6, '0');
  return `${min}:${sec}`;
}

// ── GET /api/race-results ──────────────────────────────────
// Query params: event_id, driver_id, series, class, season (YYYY)
router.get('/', async (req, res, next) => {
  try {
    const { event_id, driver_id, series, class: cls, season, limit = 500 } = req.query;
    const conditions = [];
    const params     = [];

    if (event_id)  { params.push(event_id);  conditions.push(`rr.event_id  = $${params.length}`); }
    if (driver_id) { params.push(driver_id); conditions.push(`rr.driver_id = $${params.length}`); }
    if (series)    { params.push(series);    conditions.push(`rr.series    = $${params.length}`); }
    if (cls)       { params.push(cls);       conditions.push(`rr.class     = $${params.length}`); }
    if (season)    {
      // Filter by event start_date year
      params.push(season);
      conditions.push(`EXTRACT(YEAR FROM e.start_date) = $${params.length}`);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    params.push(parseInt(limit, 10) || 500);

    const result = await pool.query(`
      SELECT
        rr.*,
        d.name       AS driver_name,
        d.color      AS driver_color,
        e.name       AS event_name,
        e.start_date AS event_date,
        e.circuit    AS event_circuit,
        e.country    AS event_country
      FROM race_results rr
      LEFT JOIN drivers d ON rr.driver_id = d.id
      LEFT JOIN events  e ON rr.event_id  = e.id
      ${where}
      ORDER BY e.start_date DESC, rr.finish_position ASC NULLS LAST
      LIMIT $${params.length}
    `, params);

    const rows = result.rows.map(r => ({
      ...r,
      fastest_lap_formatted: msToLap(r.fastest_lap_ms)
    }));

    res.json({ success: true, results: rows, count: rows.length });
  } catch (err) { next(err); }
});

// ── GET /api/race-results/:id ──────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT
        rr.*,
        d.name       AS driver_name,
        d.color      AS driver_color,
        e.name       AS event_name,
        e.start_date AS event_date,
        e.circuit    AS event_circuit,
        e.country    AS event_country
      FROM race_results rr
      LEFT JOIN drivers d ON rr.driver_id = d.id
      LEFT JOIN events  e ON rr.event_id  = e.id
      WHERE rr.id = $1
    `, [req.params.id]);

    if (!result.rows.length)
      return res.status(404).json({ success: false, error: 'Result not found' });

    const row = { ...result.rows[0], fastest_lap_formatted: msToLap(result.rows[0].fastest_lap_ms) };
    res.json({ success: true, result: row });
  } catch (err) { next(err); }
});

// ── GET /api/race-results/standings — championship running totals
// Query params: driver_id, series, season — returns [{event_name, event_date, points, cumulative_points}]
router.get('/standings', async (req, res, next) => {
  try {
    const { driver_id, series, season } = req.query;
    if (!driver_id) return res.status(400).json({ success: false, error: 'driver_id required' });

    const conditions = ['rr.driver_id = $1'];
    const params     = [driver_id];

    if (series) { params.push(series); conditions.push(`rr.series = $${params.length}`); }
    if (season) { params.push(season); conditions.push(`EXTRACT(YEAR FROM e.start_date) = $${params.length}`); }

    const result = await pool.query(`
      SELECT
        rr.id, rr.points, rr.finish_position, rr.dnf,
        e.name       AS event_name,
        e.start_date AS event_date,
        e.circuit    AS event_circuit
      FROM race_results rr
      LEFT JOIN events e ON rr.event_id = e.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY e.start_date ASC
    `, params);

    let cumulative = 0;
    const standings = result.rows.map(r => {
      cumulative += parseFloat(r.points) || 0;
      return { ...r, cumulative_points: cumulative };
    });

    res.json({ success: true, standings, total_points: cumulative });
  } catch (err) { next(err); }
});

// ── POST /api/race-results ─────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const {
      event_id, driver_id, session_id,
      series, class: cls,
      grid_position, finish_position,
      fastest_lap_ms, laps_completed,
      dnf = false, dnf_reason,
      points = 0, notes
    } = req.body;

    if (!event_id) return res.status(400).json({ success: false, error: 'event_id is required' });

    const id = newId();
    await pool.query(`
      INSERT INTO race_results
        (id, event_id, driver_id, session_id,
         series, class, grid_position, finish_position,
         fastest_lap_ms, laps_completed,
         dnf, dnf_reason, points, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    `, [
      id, event_id, driver_id || null, session_id || null,
      series || null, cls || null,
      grid_position || null, finish_position || null,
      fastest_lap_ms || null, laps_completed || null,
      dnf, dnf_reason || null, points, notes || null
    ]);

    const row = (await pool.query('SELECT * FROM race_results WHERE id=$1', [id])).rows[0];
    res.status(201).json({ success: true, result: row });
  } catch (err) { next(err); }
});

// ── PUT /api/race-results/:id ──────────────────────────────
router.put('/:id', async (req, res, next) => {
  try {
    const {
      event_id, driver_id, session_id,
      series, class: cls,
      grid_position, finish_position,
      fastest_lap_ms, laps_completed,
      dnf, dnf_reason, points, notes
    } = req.body;

    const result = await pool.query(`
      UPDATE race_results SET
        event_id        = COALESCE($1,  event_id),
        driver_id       = COALESCE($2,  driver_id),
        session_id      = COALESCE($3,  session_id),
        series          = COALESCE($4,  series),
        class           = COALESCE($5,  class),
        grid_position   = COALESCE($6,  grid_position),
        finish_position = COALESCE($7,  finish_position),
        fastest_lap_ms  = COALESCE($8,  fastest_lap_ms),
        laps_completed  = COALESCE($9,  laps_completed),
        dnf             = COALESCE($10, dnf),
        dnf_reason      = COALESCE($11, dnf_reason),
        points          = COALESCE($12, points),
        notes           = COALESCE($13, notes)
      WHERE id = $14
      RETURNING *
    `, [
      event_id ?? null, driver_id ?? null, session_id ?? null,
      series ?? null, cls ?? null,
      grid_position ?? null, finish_position ?? null,
      fastest_lap_ms ?? null, laps_completed ?? null,
      dnf ?? null, dnf_reason ?? null,
      points ?? null, notes ?? null,
      req.params.id
    ]);

    if (!result.rows.length)
      return res.status(404).json({ success: false, error: 'Result not found' });

    res.json({ success: true, result: result.rows[0] });
  } catch (err) { next(err); }
});

// ── DELETE /api/race-results/:id ───────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      'DELETE FROM race_results WHERE id=$1 RETURNING id', [req.params.id]
    );
    if (!result.rows.length)
      return res.status(404).json({ success: false, error: 'Result not found' });
    res.json({ success: true, deleted: req.params.id });
  } catch (err) { next(err); }
});

module.exports = router;
