// routes/fin-audit.js — Read-only audit log queries.
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

// GET /api/fin-audit?entity_type=&entity_id=&action=&from=&to=&limit=
router.get('/', async (req, res, next) => {
  try {
    const { entity_type, entity_id, action, from, to } = req.query;
    const limit = Math.max(1, Math.min(500, parseInt(req.query.limit, 10) || 200));
    const c = [], p = [];
    if (entity_type) { p.push(entity_type); c.push(`entity_type=$${p.length}`); }
    if (entity_id)   { p.push(entity_id);   c.push(`entity_id=$${p.length}`); }
    if (action)      { p.push(action);      c.push(`action=$${p.length}`); }
    if (from)        { p.push(from);        c.push(`created_at >= $${p.length}`); }
    if (to)          { p.push(to);          c.push(`created_at <= $${p.length}`); }
    p.push(limit);
    const where = c.length ? 'WHERE ' + c.join(' AND ') : '';
    const r = await pool.query(
      `SELECT * FROM fin_audit_log ${where} ORDER BY created_at DESC LIMIT $${p.length}`, p);
    res.json({ success: true, data: r.rows });
  } catch (e) { next(e); }
});

// GET /api/fin-audit/summary
router.get('/summary', async (req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT entity_type, action, COUNT(*)::int AS count
       FROM fin_audit_log
       WHERE created_at >= NOW() - INTERVAL '30 days'
       GROUP BY entity_type, action
       ORDER BY count DESC`);
    res.json({ success: true, data: r.rows });
  } catch (e) { next(e); }
});

module.exports = router;
