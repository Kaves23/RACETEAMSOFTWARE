const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// GET /api/activity-log
// Query params: entity_type, entity_id, event_id, user_id, action, from, to, limit, offset
router.get('/', async (req, res, next) => {
  try {
    const {
      entity_type,
      entity_id,
      event_id,
      user_id,
      action,
      from,
      to,
      limit  = 100,
      offset = 0,
    } = req.query;

    let q = 'SELECT * FROM activity_log WHERE 1=1';
    const params = [];
    let p = 1;

    if (entity_type) { q += ` AND entity_type = $${p++}`;             params.push(entity_type); }
    if (entity_id)   { q += ` AND entity_id = $${p++}`;               params.push(entity_id); }
    if (event_id)    { q += ` AND event_id = $${p++}`;                params.push(event_id); }
    if (user_id)     { q += ` AND performed_by_user_id = $${p++}`;    params.push(user_id); }
    if (action)      { q += ` AND action = $${p++}`;                  params.push(action); }
    if (from)        { q += ` AND created_at >= $${p++}`;             params.push(from); }
    if (to)          { q += ` AND created_at <= $${p++}`;             params.push(to); }

    q += ` ORDER BY created_at DESC LIMIT $${p++} OFFSET $${p++}`;
    params.push(Math.min(parseInt(limit)  || 100, 500));
    params.push(Math.max(parseInt(offset) || 0,   0));

    const result = await pool.query(q, params);
    res.json({ success: true, count: result.rows.length, logs: result.rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
