// routes/event-fastest-times.js
//
// Stores best-lap-per-(event,class,driver) captured by the Track Map page
// from the live timing feed. POSTs are upserts: an incoming row only
// replaces an existing one if its best_lap_ms is lower.
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

// GET /api/event-fastest-times?event_id=...&class_name=...
router.get('/', async (req, res, next) => {
  try {
    const { event_id, class_name } = req.query;
    const c = [], p = [];
    if (event_id)   { p.push(event_id);   c.push(`event_id = $${p.length}`); }
    if (class_name) { p.push(class_name); c.push(`class_name = $${p.length}`); }
    const where = c.length ? 'WHERE ' + c.join(' AND ') : '';
    const r = await pool.query(
      `SELECT * FROM event_fastest_times ${where}
       ORDER BY class_name ASC, best_lap_ms ASC`,
      p
    );
    res.json(r.rows);
  } catch (e) { next(e); }
});

// POST /api/event-fastest-times — single upsert
// Only updates when the incoming time is strictly faster than the stored one.
router.post('/', async (req, res, next) => {
  try {
    const {
      event_id, class_name, driver_name,
      our_driver_id, kart, best_lap, best_lap_ms,
      laps, session_name, source
    } = req.body || {};
    if (!event_id || !class_name || !driver_name || !best_lap_ms) {
      return res.status(400).json({ error: 'event_id, class_name, driver_name, best_lap_ms required' });
    }
    const r = await pool.query(
      `INSERT INTO event_fastest_times
         (event_id, class_name, driver_name, our_driver_id, kart,
          best_lap, best_lap_ms, laps, session_name, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (event_id, class_name, driver_name)
       DO UPDATE SET
         best_lap      = CASE WHEN EXCLUDED.best_lap_ms < event_fastest_times.best_lap_ms
                              THEN EXCLUDED.best_lap     ELSE event_fastest_times.best_lap END,
         best_lap_ms   = CASE WHEN EXCLUDED.best_lap_ms < event_fastest_times.best_lap_ms
                              THEN EXCLUDED.best_lap_ms  ELSE event_fastest_times.best_lap_ms END,
         our_driver_id = COALESCE(EXCLUDED.our_driver_id, event_fastest_times.our_driver_id),
         kart          = COALESCE(EXCLUDED.kart,          event_fastest_times.kart),
         laps          = GREATEST(COALESCE(EXCLUDED.laps,0), COALESCE(event_fastest_times.laps,0)),
         session_name  = COALESCE(EXCLUDED.session_name,  event_fastest_times.session_name),
         source        = COALESCE(EXCLUDED.source,        event_fastest_times.source),
         updated_at    = NOW()
       RETURNING *`,
      [event_id, class_name, driver_name,
       our_driver_id || null, kart || null,
       best_lap || null, parseInt(best_lap_ms, 10),
       laps || null, session_name || null, source || 'apex-live']
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

// POST /api/event-fastest-times/bulk — batch upsert
// Body: { rows: [ { event_id, class_name, driver_name, ... }, ... ] }
router.post('/bulk', async (req, res, next) => {
  const rows = Array.isArray(req.body && req.body.rows) ? req.body.rows : [];
  if (!rows.length) return res.json({ upserted: 0 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let count = 0;
    for (const row of rows) {
      if (!row || !row.event_id || !row.class_name || !row.driver_name || !row.best_lap_ms) continue;
      await client.query(
        `INSERT INTO event_fastest_times
           (event_id, class_name, driver_name, our_driver_id, kart,
            best_lap, best_lap_ms, laps, session_name, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (event_id, class_name, driver_name)
         DO UPDATE SET
           best_lap      = CASE WHEN EXCLUDED.best_lap_ms < event_fastest_times.best_lap_ms
                                THEN EXCLUDED.best_lap     ELSE event_fastest_times.best_lap END,
           best_lap_ms   = CASE WHEN EXCLUDED.best_lap_ms < event_fastest_times.best_lap_ms
                                THEN EXCLUDED.best_lap_ms  ELSE event_fastest_times.best_lap_ms END,
           our_driver_id = COALESCE(EXCLUDED.our_driver_id, event_fastest_times.our_driver_id),
           kart          = COALESCE(EXCLUDED.kart,          event_fastest_times.kart),
           laps          = GREATEST(COALESCE(EXCLUDED.laps,0), COALESCE(event_fastest_times.laps,0)),
           session_name  = COALESCE(EXCLUDED.session_name,  event_fastest_times.session_name),
           source        = COALESCE(EXCLUDED.source,        event_fastest_times.source),
           updated_at    = NOW()`,
        [row.event_id, row.class_name, row.driver_name,
         row.our_driver_id || null, row.kart || null,
         row.best_lap || null, parseInt(row.best_lap_ms, 10),
         row.laps || null, row.session_name || null, row.source || 'apex-live']
      );
      count++;
    }
    await client.query('COMMIT');
    res.json({ upserted: count });
  } catch (e) { await client.query('ROLLBACK'); next(e); }
  finally { client.release(); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM event_fastest_times WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch (e) { next(e); }
});

// DELETE /api/event-fastest-times?event_id=... — clear all for an event
router.delete('/', async (req, res, next) => {
  try {
    const { event_id } = req.query;
    if (!event_id) return res.status(400).json({ error: 'event_id required' });
    const r = await pool.query('DELETE FROM event_fastest_times WHERE event_id=$1', [event_id]);
    res.json({ deleted: r.rowCount });
  } catch (e) { next(e); }
});

module.exports = router;
