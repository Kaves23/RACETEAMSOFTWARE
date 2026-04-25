// routes/race-sessions.js
// CRUD for race_sessions — used by both strategy.html and performance.html
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');
const crypto  = require('crypto');

function newId() { return crypto.randomUUID(); }

// Helper — format ms as m:ss.xxx
function msToLap(ms) {
  if (!ms) return null;
  const min  = Math.floor(ms / 60000);
  const rem  = ms % 60000;
  const sec  = (rem / 1000).toFixed(3).padStart(6, '0');
  return `${min}:${sec}`;
}

// ── GET /api/race-sessions ─────────────────────────────────
// Query params: event_id, driver_id, session_type, status, flagged, limit
router.get('/', async (req, res, next) => {
  try {
    const { event_id, driver_id, session_type, status, flagged, limit = 500 } = req.query;
    const conditions = [];
    const params     = [];

    if (event_id)      { params.push(event_id);      conditions.push(`rs.event_id = $${params.length}`); }
    if (driver_id)     { params.push(driver_id);     conditions.push(`rs.driver_id = $${params.length}`); }
    if (session_type)  { params.push(session_type);  conditions.push(`rs.session_type = $${params.length}`); }
    if (status)        { params.push(status);        conditions.push(`rs.status = $${params.length}`); }
    if (flagged === 'true') conditions.push('rs.flagged = TRUE');

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    params.push(parseInt(limit, 10) || 500);

    const result = await pool.query(`
      SELECT
        rs.*,
        rs.session_name                                 AS name,
        d.name                                          AS driver_name,
        d.color                                         AS driver_color,
        e.name                                          AS event_name,
        e.start_date                                    AS event_date,
        e.circuit                                       AS event_circuit,
        i.name                                          AS kart_name,
        i.barcode                                       AS kart_number
      FROM race_sessions rs
      LEFT JOIN drivers d  ON rs.driver_id = d.id
      LEFT JOIN events  e  ON rs.event_id  = e.id
      LEFT JOIN items   i  ON rs.kart_id   = i.id
      ${where}
      ORDER BY rs.created_at DESC
      LIMIT $${params.length}
    `, params);

    // Add formatted best_lap for display convenience
    const rows = result.rows.map(r => ({
      ...r,
      best_lap_formatted: msToLap(r.best_lap_ms)
    }));

    res.json({ success: true, sessions: rows, count: rows.length });
  } catch (err) { next(err); }
});

// ── GET /api/race-sessions/:id ─────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT
        rs.*,
        rs.session_name AS name,
        d.name  AS driver_name,
        d.color AS driver_color,
        e.name  AS event_name,
        e.start_date AS event_date,
        e.circuit    AS event_circuit,
        i.name  AS kart_name,
        i.barcode AS kart_number
      FROM race_sessions rs
      LEFT JOIN drivers d ON rs.driver_id = d.id
      LEFT JOIN events  e ON rs.event_id  = e.id
      LEFT JOIN items   i ON rs.kart_id   = i.id
      WHERE rs.id = $1
    `, [req.params.id]);

    if (!result.rows.length)
      return res.status(404).json({ success: false, error: 'Session not found' });

    const row = { ...result.rows[0], best_lap_formatted: msToLap(result.rows[0].best_lap_ms) };
    res.json({ success: true, session: row });
  } catch (err) { next(err); }
});

// ── POST /api/race-sessions ────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const {
      event_id, driver_id, kart_id, session_type = 'Practice',
      session_name: _sn, name: _name, status = 'Planned',
      start_time, end_time,
      tyre_set, compound, tyre_laps = 0,
      best_lap_ms, lap_count = 0, consistency_ms,
      setup_changes = [], lap_times = [],
      driver_feedback, engineer_notes,
      aims_upload_id, flagged = false
    } = req.body;
    const session_name = _sn || _name || null;

    const id = newId();

    await pool.query(`
      INSERT INTO race_sessions
        (id, event_id, driver_id, kart_id, session_type, session_name, status,
         start_time, end_time, tyre_set, compound, tyre_laps,
         best_lap_ms, lap_count, consistency_ms,
         setup_changes, lap_times, driver_feedback, engineer_notes,
         aims_upload_id, flagged)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
    `, [
      id, event_id || null, driver_id || null, kart_id || null,
      session_type, session_name || null, status,
      start_time || null, end_time || null,
      tyre_set || null, compound || null, tyre_laps,
      best_lap_ms || null, lap_count, consistency_ms || null,
      JSON.stringify(setup_changes), JSON.stringify(lap_times),
      driver_feedback || null, engineer_notes || null,
      aims_upload_id || null, flagged
    ]);

    const row = (await pool.query('SELECT *, session_name AS name FROM race_sessions WHERE id=$1', [id])).rows[0];
    res.status(201).json({ success: true, session: row });
  } catch (err) { next(err); }
});

// ── PUT /api/race-sessions/:id ─────────────────────────────
router.put('/:id', async (req, res, next) => {
  try {
    const body = req.body;
    const session_name = body.session_name ?? body.name ?? null;
    const { event_id, driver_id, kart_id, session_type, status,
      start_time, end_time, tyre_set, compound, tyre_laps,
      best_lap_ms, lap_count, consistency_ms,
      setup_changes, lap_times,
      driver_feedback, engineer_notes,
      aims_upload_id, flagged
    } = body;

    const result = await pool.query(`
      UPDATE race_sessions SET
        event_id        = COALESCE($1,  event_id),
        driver_id       = COALESCE($2,  driver_id),
        kart_id         = COALESCE($3,  kart_id),
        session_type    = COALESCE($4,  session_type),
        session_name    = COALESCE($5,  session_name),
        status          = COALESCE($6,  status),
        start_time      = COALESCE($7,  start_time),
        end_time        = COALESCE($8,  end_time),
        tyre_set        = COALESCE($9,  tyre_set),
        compound        = COALESCE($10, compound),
        tyre_laps       = COALESCE($11, tyre_laps),
        best_lap_ms     = COALESCE($12, best_lap_ms),
        lap_count       = COALESCE($13, lap_count),
        consistency_ms  = COALESCE($14, consistency_ms),
        setup_changes   = COALESCE($15::jsonb, setup_changes),
        lap_times       = COALESCE($16::jsonb, lap_times),
        driver_feedback = COALESCE($17, driver_feedback),
        engineer_notes  = COALESCE($18, engineer_notes),
        aims_upload_id  = COALESCE($19, aims_upload_id),
        flagged         = COALESCE($20, flagged)
      WHERE id = $21
      RETURNING *
    `, [
      event_id  ?? null, driver_id ?? null, kart_id ?? null,
      session_type  ?? null, session_name  ?? null, status ?? null,
      start_time ?? null, end_time ?? null,
      tyre_set ?? null, compound ?? null, tyre_laps ?? null,
      best_lap_ms ?? null, lap_count ?? null, consistency_ms ?? null,
      setup_changes  != null ? JSON.stringify(setup_changes)  : null,
      lap_times      != null ? JSON.stringify(lap_times)      : null,
      driver_feedback ?? null, engineer_notes ?? null,
      aims_upload_id ?? null, flagged ?? null,
      req.params.id
    ]);

    if (!result.rows.length)
      return res.status(404).json({ success: false, error: 'Session not found' });

    res.json({ success: true, session: result.rows[0] });
  } catch (err) { next(err); }
});

// ── DELETE /api/race-sessions/:id ──────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      'DELETE FROM race_sessions WHERE id=$1 RETURNING id', [req.params.id]
    );
    if (!result.rows.length)
      return res.status(404).json({ success: false, error: 'Session not found' });
    res.json({ success: true, deleted: req.params.id });
  } catch (err) { next(err); }
});

module.exports = router;
