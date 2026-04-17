// routes/incidents.js
// CRUD for incidents table — replaces localStorage-only incidents.html
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');
const crypto  = require('crypto');

function newId() { return crypto.randomUUID(); }

// ── GET /api/incidents ─────────────────────────────────────
// Query params: event_id, driver_id, severity, status, limit
router.get('/', async (req, res, next) => {
  try {
    const { event_id, driver_id, severity, status, limit = 500 } = req.query;
    const conditions = [];
    const params     = [];

    if (event_id)  { params.push(event_id);  conditions.push(`inc.event_id  = $${params.length}`); }
    if (driver_id) { params.push(driver_id); conditions.push(`inc.driver_id = $${params.length}`); }
    if (severity)  { params.push(severity);  conditions.push(`inc.severity  = $${params.length}`); }
    if (status)    { params.push(status);    conditions.push(`inc.status    = $${params.length}`); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    params.push(parseInt(limit, 10) || 500);

    const result = await pool.query(`
      SELECT
        inc.*,
        e.name       AS event_name,
        e.start_date AS event_date,
        d.name       AS driver_name,
        d.color      AS driver_color,
        i.name       AS kart_name,
        i.barcode    AS kart_number,
        rs.session_name,
        COALESCE(s.name, inc.owner_text) AS owner_name
      FROM incidents inc
      LEFT JOIN events        e  ON inc.event_id   = e.id
      LEFT JOIN drivers       d  ON inc.driver_id  = d.id
      LEFT JOIN items         i  ON inc.kart_id    = i.id
      LEFT JOIN race_sessions rs ON inc.session_id = rs.id
      LEFT JOIN staff         s  ON inc.owner_staff_id = s.id
      ${where}
      ORDER BY inc.updated_at DESC
      LIMIT $${params.length}
    `, params);

    res.json({ success: true, incidents: result.rows, count: result.rows.length });
  } catch (err) { next(err); }
});

// ── GET /api/incidents/:id ─────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT
        inc.*,
        e.name       AS event_name,
        e.start_date AS event_date,
        d.name       AS driver_name,
        d.color      AS driver_color,
        i.name       AS kart_name,
        i.barcode    AS kart_number,
        rs.session_name,
        COALESCE(s.name, inc.owner_text) AS owner_name
      FROM incidents inc
      LEFT JOIN events        e  ON inc.event_id   = e.id
      LEFT JOIN drivers       d  ON inc.driver_id  = d.id
      LEFT JOIN items         i  ON inc.kart_id    = i.id
      LEFT JOIN race_sessions rs ON inc.session_id = rs.id
      LEFT JOIN staff         s  ON inc.owner_staff_id = s.id
      WHERE inc.id = $1
    `, [req.params.id]);

    if (!result.rows.length)
      return res.status(404).json({ success: false, error: 'Incident not found' });

    res.json({ success: true, incident: result.rows[0] });
  } catch (err) { next(err); }
});

// ── POST /api/incidents ────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const {
      event_id, driver_id, kart_id, session_id,
      title, severity = 'Medium', status = 'Open',
      owner_staff_id, owner_text,
      telemetry_snapshot, timecode,
      narrative, corrective_actions,
      damage = {}, attachments = []
    } = req.body;

    if (!title) return res.status(400).json({ success: false, error: 'title is required' });

    const id = newId();
    await pool.query(`
      INSERT INTO incidents
        (id, event_id, driver_id, kart_id, session_id,
         title, severity, status,
         owner_staff_id, owner_text,
         telemetry_snapshot, timecode,
         narrative, corrective_actions,
         damage, attachments)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
    `, [
      id,
      event_id  || null, driver_id || null,
      kart_id   || null, session_id || null,
      title, severity, status,
      owner_staff_id || null, owner_text || null,
      telemetry_snapshot || null, timecode || null,
      narrative || null, corrective_actions || null,
      JSON.stringify(damage), JSON.stringify(attachments)
    ]);

    const row = (await pool.query('SELECT * FROM incidents WHERE id=$1', [id])).rows[0];
    res.status(201).json({ success: true, incident: row });
  } catch (err) { next(err); }
});

// ── PUT /api/incidents/:id ─────────────────────────────────
router.put('/:id', async (req, res, next) => {
  try {
    const {
      event_id, driver_id, kart_id, session_id,
      title, severity, status,
      owner_staff_id, owner_text,
      telemetry_snapshot, timecode,
      narrative, corrective_actions,
      damage, attachments
    } = req.body;

    const result = await pool.query(`
      UPDATE incidents SET
        event_id            = COALESCE($1,  event_id),
        driver_id           = COALESCE($2,  driver_id),
        kart_id             = COALESCE($3,  kart_id),
        session_id          = COALESCE($4,  session_id),
        title               = COALESCE($5,  title),
        severity            = COALESCE($6,  severity),
        status              = COALESCE($7,  status),
        owner_staff_id      = COALESCE($8,  owner_staff_id),
        owner_text          = COALESCE($9,  owner_text),
        telemetry_snapshot  = COALESCE($10, telemetry_snapshot),
        timecode            = COALESCE($11, timecode),
        narrative           = COALESCE($12, narrative),
        corrective_actions  = COALESCE($13, corrective_actions),
        damage              = COALESCE($14::jsonb, damage),
        attachments         = COALESCE($15::jsonb, attachments)
      WHERE id = $16
      RETURNING *
    `, [
      event_id   ?? null, driver_id ?? null,
      kart_id    ?? null, session_id ?? null,
      title      ?? null, severity ?? null, status ?? null,
      owner_staff_id ?? null, owner_text ?? null,
      telemetry_snapshot ?? null, timecode ?? null,
      narrative ?? null, corrective_actions ?? null,
      damage      != null ? JSON.stringify(damage)      : null,
      attachments != null ? JSON.stringify(attachments) : null,
      req.params.id
    ]);

    if (!result.rows.length)
      return res.status(404).json({ success: false, error: 'Incident not found' });

    res.json({ success: true, incident: result.rows[0] });
  } catch (err) { next(err); }
});

// ── DELETE /api/incidents/:id ──────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      'DELETE FROM incidents WHERE id=$1 RETURNING id', [req.params.id]
    );
    if (!result.rows.length)
      return res.status(404).json({ success: false, error: 'Incident not found' });
    res.json({ success: true, deleted: req.params.id });
  } catch (err) { next(err); }
});

module.exports = router;
