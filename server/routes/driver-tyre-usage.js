'use strict';
const express = require('express');
const router = express.Router();
const { pool } = require('../db');

const VALID_TYRE_BRAND = ['Levanto', 'Mojo'];
const VALID_TYRE_SIZE = ['Mini', 'Senior'];
const VALID_TYRE_TYPE = ['Slick', 'Wet'];
const VALID_SOURCE = ['manual', 'backlog'];

function tyreVal(value, allowed) {
  return allowed.includes(value) ? value : null;
}

function setsVal(value) {
  return Math.max(1, Math.min(99, parseInt(value, 10) || 1));
}

function addFilters(req, params, clauses, alias) {
  const prefix = alias ? alias + '.' : '';
  if (req.query.driver_id) {
    params.push(req.query.driver_id);
    clauses.push(`${prefix}driver_id = $${params.length}`);
  }
  if (req.query.driver_name) {
    params.push(`%${req.query.driver_name}%`);
    clauses.push(`${prefix}driver_name ILIKE $${params.length}`);
  }
  if (req.query.from) {
    params.push(req.query.from);
    clauses.push(`${prefix}usage_date >= $${params.length}`);
  }
  if (req.query.to) {
    params.push(req.query.to);
    clauses.push(`${prefix}usage_date <= $${params.length}`);
  }
}

async function manualRows(req) {
  const params = [];
  const clauses = [];
  addFilters(req, params, clauses, 'u');
  if (req.query.source && req.query.source !== 'practice') {
    params.push(req.query.source);
    clauses.push(`u.source = $${params.length}`);
  }
  const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
  const r = await pool.query(`
    SELECT u.id, u.driver_id, u.driver_name, u.usage_date, u.tyre_brand, u.tyre_size,
           COALESCE(u.tyre_type, 'Slick') AS tyre_type, u.sets_used,
           u.practice_session_id, u.event_id, u.source, u.notes, u.created_at, u.updated_at,
           e.name AS event_name, e.title AS event_title,
           ps.track AS practice_track, ps.venue AS practice_venue, ps.session_type AS practice_type
    FROM driver_tyre_usage u
    LEFT JOIN events e ON e.id = u.event_id
    LEFT JOIN practice_sessions ps ON ps.id = u.practice_session_id
    ${where}
    ORDER BY u.usage_date DESC NULLS LAST, u.created_at DESC`, params);
  return r.rows;
}

async function practiceRows(req) {
  const params = [];
  const clauses = [`(a.tyre_sets IS NOT NULL OR a.tyre_brand IS NOT NULL OR a.tyre_size IS NOT NULL OR a.tyre_type IS NOT NULL)`];
  if (req.query.driver_id) {
    params.push(req.query.driver_id);
    clauses.push(`a.driver_id = $${params.length}`);
  }
  if (req.query.driver_name) {
    params.push(`%${req.query.driver_name}%`);
    clauses.push(`a.driver_name ILIKE $${params.length}`);
  }
  if (req.query.from) {
    params.push(req.query.from);
    clauses.push(`s.session_date >= $${params.length}`);
  }
  if (req.query.to) {
    params.push(req.query.to);
    clauses.push(`s.session_date <= $${params.length}`);
  }
  const where = 'WHERE ' + clauses.join(' AND ');
  const r = await pool.query(`
    SELECT ('practice:' || a.id || ':' || ordinality)::text AS id,
           a.driver_id, a.driver_name, s.session_date AS usage_date,
           COALESCE(t.set->>'brand', a.tyre_brand) AS tyre_brand,
           COALESCE(t.set->>'size', a.tyre_size) AS tyre_size,
           COALESCE(t.set->>'type', a.tyre_type, 'Slick') AS tyre_type,
           COALESCE(NULLIF(t.set->>'sets','')::int, 1) AS sets_used,
           s.id AS practice_session_id, s.event_id, 'practice'::text AS source,
           a.notes,
           a.created_at, a.updated_at, e.name AS event_name, e.title AS event_title,
           s.track AS practice_track, s.venue AS practice_venue, s.session_type AS practice_type
    FROM practice_attendance a
    JOIN practice_sessions s ON s.id = a.session_id
    LEFT JOIN events e ON e.id = s.event_id
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(a.tyre_sets) = 'array' AND jsonb_array_length(a.tyre_sets) > 0 THEN a.tyre_sets
        ELSE jsonb_build_array(jsonb_build_object(
          'brand', a.tyre_brand,
          'size', a.tyre_size,
          'type', COALESCE(a.tyre_type, 'Slick'),
          'sets', 1
        ))
      END
    ) WITH ORDINALITY AS t(set, ordinality)
    ${where}
    ORDER BY s.session_date DESC NULLS LAST, a.driver_name ASC`, params);
  return r.rows;
}

router.get('/', async (req, res, next) => {
  try {
    const include = req.query.include || 'all';
    const rows = [];
    if (include !== 'practice') rows.push(...await manualRows(req));
    if (include !== 'manual') rows.push(...await practiceRows(req));
    rows.sort((a, b) =>
      String(b.usage_date || '').localeCompare(String(a.usage_date || '')) ||
      String(a.driver_name || '').localeCompare(String(b.driver_name || ''))
    );
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const b = req.body || {};
    if (!(b.driver_name || '').trim() && !b.driver_id) return res.status(400).json({ error: 'driver required' });
    const r = await pool.query(
      `INSERT INTO driver_tyre_usage
         (driver_id, driver_name, usage_date, tyre_brand, tyre_size, tyre_type, sets_used,
          practice_session_id, event_id, source, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        b.driver_id || null,
        (b.driver_name || '').trim(),
        b.usage_date || null,
        tyreVal(b.tyre_brand, VALID_TYRE_BRAND),
        tyreVal(b.tyre_size, VALID_TYRE_SIZE),
        tyreVal(b.tyre_type, VALID_TYRE_TYPE) || 'Slick',
        setsVal(b.sets_used),
        b.practice_session_id || null,
        b.event_id || null,
        VALID_SOURCE.includes(b.source) ? b.source : 'manual',
        b.notes || null,
        req.user?.username || null
      ]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    if (String(req.params.id).startsWith('practice:')) {
      return res.status(400).json({ error: 'Practice-derived rows are edited in Practice Tracking' });
    }
    const b = req.body || {};
    if (!(b.driver_name || '').trim() && !b.driver_id) return res.status(400).json({ error: 'driver required' });
    const r = await pool.query(
      `UPDATE driver_tyre_usage SET
         driver_id=$1, driver_name=$2, usage_date=$3, tyre_brand=$4, tyre_size=$5, tyre_type=$6,
         sets_used=$7, practice_session_id=$8, event_id=$9, source=$10, notes=$11, updated_at=NOW()
       WHERE id=$12 RETURNING *`,
      [
        b.driver_id || null,
        (b.driver_name || '').trim(),
        b.usage_date || null,
        tyreVal(b.tyre_brand, VALID_TYRE_BRAND),
        tyreVal(b.tyre_size, VALID_TYRE_SIZE),
        tyreVal(b.tyre_type, VALID_TYRE_TYPE) || 'Slick',
        setsVal(b.sets_used),
        b.practice_session_id || null,
        b.event_id || null,
        VALID_SOURCE.includes(b.source) ? b.source : 'manual',
        b.notes || null,
        req.params.id
      ]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    if (String(req.params.id).startsWith('practice:')) {
      return res.status(400).json({ error: 'Practice-derived rows are removed in Practice Tracking' });
    }
    await pool.query('DELETE FROM driver_tyre_usage WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (e) { next(e); }
});

module.exports = router;
