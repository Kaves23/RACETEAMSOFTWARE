const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { logActivity } = require('../lib/activityLog');

function genId() {
  return `pen-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// GET /api/post-event-notes
// Query params: entity_type, entity_id, event_id, action_required
router.get('/', async (req, res, next) => {
  try {
    const { entity_type, entity_id, event_id, action_required } = req.query;

    let q = 'SELECT * FROM post_event_notes WHERE 1=1';
    const params = [];
    let p = 1;

    if (entity_type)      { q += ` AND entity_type = $${p++}`;   params.push(entity_type); }
    if (entity_id)        { q += ` AND entity_id = $${p++}`;     params.push(entity_id); }
    if (event_id)         { q += ` AND event_id = $${p++}`;      params.push(event_id); }
    if (action_required !== undefined) {
      q += ` AND action_required = $${p++}`;
      params.push(action_required === 'true');
    }

    q += ' ORDER BY created_at DESC LIMIT 200';
    const result = await pool.query(q, params);
    res.json({ success: true, count: result.rows.length, notes: result.rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/post-event-notes
router.post('/', async (req, res, next) => {
  try {
    const {
      entity_type,
      entity_id,
      entity_name,
      event_id,
      condition          = 'good',
      note,
      action_required    = false,
      action_description,
      photos,
    } = req.body;

    if (!entity_type || !entity_id || !event_id) {
      return res.status(400).json({
        success: false,
        error: 'entity_type, entity_id and event_id are required',
      });
    }

    const id     = genId();
    const userId = req.user?.userId || null;

    const result = await pool.query(
      `INSERT INTO post_event_notes
         (id, entity_type, entity_id, event_id, condition, note,
          action_required, action_description, photos, created_by_user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        id, entity_type, entity_id, event_id,
        condition, note || null,
        action_required, action_description || null,
        photos ? JSON.stringify(photos) : null,
        userId,
      ]
    );

    logActivity(pool, {
      entityType: entity_type,
      entityId:   entity_id,
      entityName: entity_name || null,
      action:     'note_added',
      eventId:    event_id,
      userId,
      userName:   req.user?.username || null,
      details:    { condition, action_required },
    }).catch(() => {});

    res.status(201).json({ success: true, note: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
