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

    let where = 'WHERE 1=1';
    const whereParams = [];
    let p = 1;

    if (entity_type) { where += ` AND entity_type = $${p++}`;             whereParams.push(entity_type); }
    if (entity_id)   { where += ` AND entity_id = $${p++}`;               whereParams.push(entity_id); }
    if (event_id)    { where += ` AND event_id = $${p++}`;                whereParams.push(event_id); }
    if (user_id)     { where += ` AND performed_by_user_id = $${p++}`;    whereParams.push(user_id); }
    if (action)      { where += ` AND action = $${p++}`;                  whereParams.push(action); }
    if (from)        { where += ` AND created_at >= $${p++}`;             whereParams.push(from); }
    if (to)          { where += ` AND created_at <= $${p++}`;             whereParams.push(to); }

    const dataParams = [...whereParams, Math.min(parseInt(limit) || 100, 500), Math.max(parseInt(offset) || 0, 0)];

    const [countResult, dataResult] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM activity_log ${where}`, whereParams),
      pool.query(`SELECT * FROM activity_log ${where} ORDER BY created_at DESC LIMIT $${p} OFFSET $${p + 1}`, dataParams),
    ]);

    const total = parseInt(countResult.rows[0].count, 10);
    res.json({ success: true, total, count: total, logs: dataResult.rows });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
