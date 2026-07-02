'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

const VALID_STATUS = ['planned', 'attended', 'cancelled', 'no_show'];
const VALID_TYRE_BRAND = ['Levanto', 'Mojo'];
const VALID_TYRE_SIZE = ['Mini', 'Senior'];

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
async function loadSessions(where, params) {
  const sessions = (await pool.query(
    `SELECT * FROM practice_sessions ${where} ORDER BY session_date DESC, created_at DESC`,
    params
  )).rows;
  if (!sessions.length) return [];

  const ids = sessions.map(s => s.id);
  const att = (await pool.query(
    `SELECT * FROM practice_attendance WHERE session_id = ANY($1) ORDER BY driver_name ASC`,
    [ids]
  )).rows;
  const staff = (await pool.query(
    `SELECT * FROM practice_session_staff WHERE session_id = ANY($1) ORDER BY staff_name ASC`,
    [ids]
  )).rows;

  const bySession = {};
  sessions.forEach(s => { s.attendance = []; s.staff = []; bySession[s.id] = s; });
  att.forEach(a => { if (bySession[a.session_id]) bySession[a.session_id].attendance.push(a); });
  staff.forEach(st => { if (bySession[st.session_id]) bySession[st.session_id].staff.push(st); });
  return sessions;
}

async function upsertAttendance(client, sessionId, row, editor) {
  const status = VALID_STATUS.includes(row.status) ? row.status : 'attended';
  const tyreBrand = VALID_TYRE_BRAND.includes(row.tyre_brand) ? row.tyre_brand : null;
  const tyreSize = VALID_TYRE_SIZE.includes(row.tyre_size) ? row.tyre_size : null;
  const vals = [
    sessionId,
    row.driver_id || null,
    (row.driver_name || '').trim(),
    status,
    row.kart || null,
    row.engine || null,
    row.coach_staff_id || null,
    row.coach_name || null,
    row.notes || null,
    tyreBrand,
    tyreSize,
    editor || null
  ];
  // Linked driver → upsert on (session_id, driver_id); override row → match on name.
  if (row.driver_id) {
    const r = await client.query(
      `INSERT INTO practice_attendance
         (session_id, driver_id, driver_name, status, kart, engine, coach_staff_id, coach_name, notes, tyre_brand, tyre_size, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)
       ON CONFLICT (session_id, driver_id) WHERE driver_id IS NOT NULL
       DO UPDATE SET driver_name=EXCLUDED.driver_name, status=EXCLUDED.status, kart=EXCLUDED.kart,
                     engine=EXCLUDED.engine, coach_staff_id=EXCLUDED.coach_staff_id,
                     coach_name=EXCLUDED.coach_name, notes=EXCLUDED.notes,
                     tyre_brand=EXCLUDED.tyre_brand, tyre_size=EXCLUDED.tyre_size,
                     updated_by=EXCLUDED.updated_by, updated_at=NOW()
       RETURNING *`, vals);
    return r.rows[0];
  }
  const existing = await client.query(
    `SELECT id FROM practice_attendance WHERE session_id=$1 AND driver_id IS NULL AND LOWER(driver_name)=LOWER($2) LIMIT 1`,
    [sessionId, vals[2]]
  );
  if (existing.rows.length) {
    const r = await client.query(
      `UPDATE practice_attendance SET status=$2, kart=$3, engine=$4, coach_staff_id=$5,
              coach_name=$6, notes=$7, tyre_brand=$8, tyre_size=$9,
              updated_by=$10, updated_at=NOW() WHERE id=$1 RETURNING *`,
      [existing.rows[0].id, status, vals[4], vals[5], vals[6], vals[7], vals[8], vals[9], vals[10], editor || null]);
    return r.rows[0];
  }
  const r = await client.query(
    `INSERT INTO practice_attendance
       (session_id, driver_id, driver_name, status, kart, engine, coach_staff_id, coach_name, notes, tyre_brand, tyre_size, created_by, updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12) RETURNING *`, vals);
  return r.rows[0];
}

// ─────────────────────────────────────────────────────────────
// Sessions
// ─────────────────────────────────────────────────────────────
router.get('/sessions', async (req, res, next) => {
  try {
    const { from, to, track, event_id, class_name, driver_id } = req.query;
    const c = [], p = [];
    if (from)       { p.push(from);       c.push(`session_date >= $${p.length}`); }
    if (to)         { p.push(to);         c.push(`session_date <= $${p.length}`); }
    if (track)      { p.push(track);      c.push(`track = $${p.length}`); }
    if (event_id)   { p.push(event_id);   c.push(`event_id = $${p.length}`); }
    if (class_name) { p.push(class_name); c.push(`class_name = $${p.length}`); }
    if (driver_id)  {
      p.push(driver_id);
      c.push(`id IN (SELECT session_id FROM practice_attendance WHERE driver_id = $${p.length})`);
    }
    const where = c.length ? 'WHERE ' + c.join(' AND ') : '';
    res.json(await loadSessions(where, p));
  } catch (e) { next(e); }
});

router.get('/sessions/:id', async (req, res, next) => {
  try {
    const rows = await loadSessions('WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

router.post('/sessions', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const b = req.body || {};
    if (!b.session_date) return res.status(400).json({ error: 'session_date required' });
    await client.query('BEGIN');
    const sessionType = b.session_type === 'race' ? 'race' : 'practice';
    const s = (await client.query(
      `INSERT INTO practice_sessions (session_date, track, venue, event_id, class_name, title, notes, session_type, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [b.session_date, b.track || null, b.venue || null, b.event_id || null,
       b.class_name || null, b.title || null, b.notes || null, sessionType,
       b.created_by || req.user?.username || null]
    )).rows[0];

    const editor = req.user?.username || null;
    if (Array.isArray(b.attendance)) {
      for (const row of b.attendance) {
        if (!(row.driver_name || '').trim() && !row.driver_id) continue;
        await upsertAttendance(client, s.id, row, editor);
      }
    }
    if (Array.isArray(b.staff)) {
      for (const st of b.staff) {
        if (!(st.staff_name || '').trim()) continue;
        await client.query(
          `INSERT INTO practice_session_staff (session_id, staff_id, staff_name, role) VALUES ($1,$2,$3,$4)`,
          [s.id, st.staff_id || null, st.staff_name.trim(), st.role || null]);
      }
    }
    await client.query('COMMIT');
    const full = await loadSessions('WHERE id = $1', [s.id]);
    res.status(201).json(full[0]);
  } catch (e) { await client.query('ROLLBACK'); next(e); }
  finally { client.release(); }
});

router.put('/sessions/:id', async (req, res, next) => {
  try {
    const b = req.body || {};
    const sessionType = b.session_type === 'race' ? 'race' : (b.session_type === 'practice' ? 'practice' : null);
    const r = await pool.query(
      `UPDATE practice_sessions SET session_date=COALESCE($1,session_date), track=$2, venue=$3,
              event_id=$4, class_name=$5, title=$6, notes=$7,
              session_type=COALESCE($8,session_type), updated_at=NOW()
       WHERE id=$9 RETURNING *`,
      [b.session_date || null, b.track || null, b.venue || null, b.event_id || null,
       b.class_name || null, b.title || null, b.notes || null, sessionType, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    const full = await loadSessions('WHERE id = $1', [req.params.id]);
    res.json(full[0]);
  } catch (e) { next(e); }
});

router.delete('/sessions/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM practice_sessions WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch (e) { next(e); }
});

// ─────────────────────────────────────────────────────────────
// Matrix cell upsert / clear (primary path for the grid)
// ─────────────────────────────────────────────────────────────
router.put('/sessions/:id/cell', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const b = req.body || {};
    if (!(b.driver_name || '').trim() && !b.driver_id)
      return res.status(400).json({ error: 'driver_id or driver_name required' });

    // Empty/blank status clears the cell.
    if (!b.status) {
      if (b.driver_id) {
        await client.query('DELETE FROM practice_attendance WHERE session_id=$1 AND driver_id=$2',
          [req.params.id, b.driver_id]);
      } else {
        await client.query(
          'DELETE FROM practice_attendance WHERE session_id=$1 AND driver_id IS NULL AND LOWER(driver_name)=LOWER($2)',
          [req.params.id, (b.driver_name || '').trim()]);
      }
      return res.json({ cleared: true });
    }
    const row = await upsertAttendance(client, req.params.id, b, req.user?.username || null);
    res.json(row);
  } catch (e) { next(e); }
  finally { client.release(); }
});

// Bulk replace/upsert attendance for a session
router.put('/sessions/:id/attendance', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const rows = Array.isArray(req.body?.attendance) ? req.body.attendance : [];
    await client.query('BEGIN');
    const editor = req.user?.username || null;
    await client.query('DELETE FROM practice_attendance WHERE session_id=$1', [req.params.id]);
    for (const row of rows) {
      if (!(row.driver_name || '').trim() && !row.driver_id) continue;
      await upsertAttendance(client, req.params.id, row, editor);
    }
    await client.query('COMMIT');
    const full = await loadSessions('WHERE id = $1', [req.params.id]);
    res.json(full[0]);
  } catch (e) { await client.query('ROLLBACK'); next(e); }
  finally { client.release(); }
});

router.put('/attendance/:id', async (req, res, next) => {
  try {
    const b = req.body || {};
    const status = VALID_STATUS.includes(b.status) ? b.status : 'attended';
    const r = await pool.query(
      `UPDATE practice_attendance SET status=$1, kart=$2, engine=$3, coach_staff_id=$4,
              coach_name=$5, notes=$6, tyre_brand=$7, tyre_size=$8,
              updated_by=$9, updated_at=NOW() WHERE id=$10 RETURNING *`,
      [status, b.kart || null, b.engine || null, b.coach_staff_id || null,
       b.coach_name || null, b.notes || null,
       VALID_TYRE_BRAND.includes(b.tyre_brand) ? b.tyre_brand : null,
       VALID_TYRE_SIZE.includes(b.tyre_size) ? b.tyre_size : null,
       req.user?.username || null, req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/attendance/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM practice_attendance WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch (e) { next(e); }
});

// ─────────────────────────────────────────────────────────────
// Session staff (replace whole list)
// ─────────────────────────────────────────────────────────────
router.put('/sessions/:id/staff', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const rows = Array.isArray(req.body?.staff) ? req.body.staff : [];
    await client.query('BEGIN');
    await client.query('DELETE FROM practice_session_staff WHERE session_id=$1', [req.params.id]);
    for (const st of rows) {
      if (!(st.staff_name || '').trim()) continue;
      await client.query(
        `INSERT INTO practice_session_staff (session_id, staff_id, staff_name, role) VALUES ($1,$2,$3,$4)`,
        [req.params.id, st.staff_id || null, st.staff_name.trim(), st.role || null]);
    }
    await client.query('COMMIT');
    const full = await loadSessions('WHERE id = $1', [req.params.id]);
    res.json(full[0]);
  } catch (e) { await client.query('ROLLBACK'); next(e); }
  finally { client.release(); }
});

// ─────────────────────────────────────────────────────────────
// Analytics
// ─────────────────────────────────────────────────────────────
router.get('/analytics', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const c = [], p = [];
    if (from) { p.push(from); c.push(`s.session_date >= $${p.length}`); }
    if (to)   { p.push(to);   c.push(`s.session_date <= $${p.length}`); }
    const where = c.length ? 'WHERE ' + c.join(' AND ') : '';

    const perDriver = (await pool.query(`
      SELECT a.driver_id,
             MAX(a.driver_name) AS driver_name,
             COUNT(*) FILTER (WHERE a.status='attended')  AS attended,
             COUNT(*) FILTER (WHERE a.status='planned')   AS planned,
             COUNT(*) FILTER (WHERE a.status='cancelled') AS cancelled,
             COUNT(*) FILTER (WHERE a.status='no_show')   AS no_show,
             COUNT(DISTINCT s.track) FILTER (WHERE a.status='attended') AS tracks_run,
             MAX(s.session_date) FILTER (WHERE a.status='attended') AS last_attended
      FROM practice_attendance a
      JOIN practice_sessions s ON s.id = a.session_id
      ${where}
      GROUP BY a.driver_id, LOWER(a.driver_name)
      ORDER BY attended DESC, driver_name ASC`, p)).rows;

    const perTrack = (await pool.query(`
      SELECT COALESCE(s.track,'—') AS track,
             COUNT(DISTINCT s.id) AS sessions,
             COUNT(*) FILTER (WHERE a.status='attended') AS attendances,
             COUNT(DISTINCT a.driver_id) FILTER (WHERE a.status='attended') AS drivers
      FROM practice_sessions s
      LEFT JOIN practice_attendance a ON a.session_id = s.id
      ${where}
      GROUP BY s.track
      ORDER BY sessions DESC`, p)).rows;

    const familiarity = (await pool.query(`
      SELECT a.driver_id, MAX(a.driver_name) AS driver_name, COALESCE(s.track,'—') AS track,
             COUNT(*) FILTER (WHERE a.status='attended') AS attended,
             MAX(s.session_date) FILTER (WHERE a.status='attended') AS last_date
      FROM practice_attendance a
      JOIN practice_sessions s ON s.id = a.session_id
      ${where}
      GROUP BY a.driver_id, LOWER(a.driver_name), s.track
      HAVING COUNT(*) FILTER (WHERE a.status='attended') > 0
      ORDER BY driver_name ASC, attended DESC`, p)).rows;

    const totals = (await pool.query(`
      SELECT COUNT(DISTINCT s.id) AS sessions,
             COUNT(*) FILTER (WHERE a.status='attended') AS attendances,
             COUNT(DISTINCT s.track) AS tracks
      FROM practice_sessions s
      LEFT JOIN practice_attendance a ON a.session_id = s.id
      ${where}`, p)).rows[0];

    const tyreUsage = (await pool.query(`
      SELECT COALESCE(a.tyre_brand,'Unspecified') AS tyre_brand,
             COALESCE(a.tyre_size,'Unspecified') AS tyre_size,
             COUNT(*) FILTER (WHERE a.status='attended') AS attended,
             COUNT(DISTINCT a.driver_id) FILTER (WHERE a.status='attended' AND a.driver_id IS NOT NULL) AS linked_drivers,
             COUNT(DISTINCT s.id) FILTER (WHERE a.status='attended') AS sessions
      FROM practice_attendance a
      JOIN practice_sessions s ON s.id = a.session_id
      ${where}
      GROUP BY a.tyre_brand, a.tyre_size
      ORDER BY attended DESC, tyre_brand ASC, tyre_size ASC`, p)).rows;

    res.json({ perDriver, perTrack, familiarity, totals, tyreUsage });
  } catch (e) { next(e); }
});

// ─────────────────────────────────────────────────────────────
// Bulk import (from the existing Google Sheet)
// body: { sessions: [{ session_date, track, venue, class_name, event_id,
//                      attendance: [{ driver_id, driver_name, status }] }] }
// ─────────────────────────────────────────────────────────────
router.post('/import', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const sessions = Array.isArray(req.body?.sessions) ? req.body.sessions : [];
    await client.query('BEGIN');
    const editor = req.user?.username || 'import';
    let createdSessions = 0, createdAttendance = 0;
    for (const b of sessions) {
      if (!b.session_date) continue;
      const s = (await client.query(
        `INSERT INTO practice_sessions (session_date, track, venue, event_id, class_name, title, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [b.session_date, b.track || null, b.venue || null, b.event_id || null,
         b.class_name || null, b.title || null, b.notes || null, b.created_by || editor]
      )).rows[0];
      createdSessions++;
      const att = Array.isArray(b.attendance) ? b.attendance : [];
      for (const row of att) {
        if (!(row.driver_name || '').trim() && !row.driver_id) continue;
        await upsertAttendance(client, s.id, row, editor);
        createdAttendance++;
      }
    }
    await client.query('COMMIT');
    res.status(201).json({ createdSessions, createdAttendance });
  } catch (e) { await client.query('ROLLBACK'); next(e); }
  finally { client.release(); }
});

module.exports = router;
