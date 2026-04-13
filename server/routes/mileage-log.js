const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { logActivity } = require('../lib/activityLog');

function genId() {
  return `ml-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// GET /api/mileage-log
// Query params: entity_type, entity_id, event_id
router.get('/', async (req, res, next) => {
  try {
    const { entity_type, entity_id, event_id } = req.query;

    let q = `
      SELECT ml.*, u.username AS driver_username
      FROM mileage_log ml
      LEFT JOIN users u ON ml.driver_user_id = u.id
      WHERE 1=1`;
    const params = [];
    let p = 1;

    if (entity_type) { q += ` AND ml.entity_type = $${p++}`; params.push(entity_type); }
    if (entity_id)   { q += ` AND ml.entity_id = $${p++}`;   params.push(entity_id); }
    if (event_id)    { q += ` AND ml.event_id = $${p++}`;    params.push(event_id); }

    q += ' ORDER BY ml.logged_at DESC LIMIT 200';
    const result = await pool.query(q, params);
    res.json({ success: true, count: result.rows.length, logs: result.rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/mileage-log
router.post('/', async (req, res, next) => {
  try {
    const {
      entity_type      = 'truck',
      entity_id,
      entity_name,
      event_id,
      odometer_start_km,
      odometer_end_km,
      distance_km,
      fuel_litres,
      notes,
    } = req.body;

    if (!entity_id) {
      return res.status(400).json({ success: false, error: 'entity_id is required' });
    }

    // Calculate distance if not provided but odometer values are
    const computedDistance = distance_km != null
      ? parseFloat(distance_km)
      : (odometer_end_km != null && odometer_start_km != null)
        ? parseFloat(odometer_end_km) - parseFloat(odometer_start_km)
        : null;

    const id     = genId();
    const userId = req.user?.userId || null;

    const result = await pool.query(
      `INSERT INTO mileage_log
         (id, entity_type, entity_id, event_id,
          odometer_start_km, odometer_end_km, distance_km,
          driver_user_id, fuel_litres, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        id, entity_type, entity_id, event_id || null,
        odometer_start_km || null,
        odometer_end_km   || null,
        computedDistance  || null,
        userId,
        fuel_litres || null,
        notes       || null,
      ]
    );

    logActivity(pool, {
      entityType: entity_type,
      entityId:   entity_id,
      entityName: entity_name || null,
      action:     'mileage_added',
      eventId:    event_id || null,
      userId,
      userName:   req.user?.username || null,
      details:    { distance_km: computedDistance, fuel_litres: fuel_litres || null },
    }).catch(() => {});

    res.status(201).json({ success: true, log: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
