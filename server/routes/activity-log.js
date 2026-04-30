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

// GET /api/activity-log/boxes/:id
// Aggregated box history timeline:
//   - All activity_log rows for entity_type='box' AND entity_id=:id
//   - Plus all item pack/unpack events referencing this box (details->>'to_box_id' or from_box_id)
//   Returns { ok: true, history: [...] } in the shape expected by box-packing-engine renderHistoryHtml
router.get('/boxes/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const [boxRows, itemRows] = await Promise.all([
      // Direct box-level events (created, updated, unloaded, loaded_to_truck, etc.)
      pool.query(
        `SELECT id, entity_type, entity_name, action, performed_by_name, details, created_at
         FROM activity_log
         WHERE entity_type = 'box' AND entity_id = $1
         ORDER BY created_at DESC LIMIT 200`,
        [id]
      ),
      // Item pack/unpack events that reference this box
      pool.query(
        `SELECT id, entity_type, entity_name, action, performed_by_name, details, created_at
         FROM activity_log
         WHERE entity_type = 'item'
           AND action IN ('packed', 'unpacked')
           AND (details->>'to_box_id' = $1 OR details->>'from_box_id' = $1)
         ORDER BY created_at DESC LIMIT 200`,
        [id]
      ),
    ]);

    // Merge and sort by date descending
    const all = [...boxRows.rows, ...itemRows.rows].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );

    // Map to the shape renderHistoryHtml expects
    const history = all.map(row => {
      const det = row.details || {};
      // Map activity_log action names to renderHistoryHtml ACTION_META keys
      const actionMap = {
        packed:              'item_added',
        unpacked:            'item_removed',
        item_added:          'item_added',
        item_removed:        'item_removed',
        box_emptied:         'box_emptied',
        created:             'created',
        deleted:             'status_changed',
        loaded_to_truck:     'loaded_to_truck',
        removed_from_truck:  'removed_from_truck',
        unloaded:            'unloaded',
        location_changed:    'location_changed',
        status_changed:      'status_changed',
        updated:             'status_changed',
      };
      const mappedAction = actionMap[row.action] || row.action;

      // Build human-readable detail string
      let detailStr = '';
      if (row.entity_type === 'item') {
        const boxName = det.to_box_name || det.from_box_name || '';
        detailStr = `${row.entity_name || det.item_name || ''}${boxName ? ' \u2192 ' + boxName : ''}`;
      } else {
        if (det.item_name)     detailStr = det.item_name;
        else if (det.name)     detailStr = `Name: ${det.name}`;
        else if (det.status)   detailStr = `Status: ${det.status}`;
        else if (det.items_removed !== undefined) detailStr = `${det.items_removed} item(s) removed`;
      }

      return {
        action:          mappedAction,
        details:         detailStr || null,
        user_name:       row.performed_by_name || null,
        timestamp:       row.created_at,
        to_truck_name:   det.truck_name || null,
        from_truck_name: null,
      };
    });

    res.json({ ok: true, history });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
