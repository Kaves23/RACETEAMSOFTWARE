const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { logActivity } = require('../lib/activityLog');

function genId()   { return `rf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
function mlId()    { return `ml-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }

// GET /api/race-fleet
router.get('/', async (req, res, next) => {
  try {
    const { vehicle_type, status, search } = req.query;

    let q = `
      SELECT rf.*, d.name AS driver_name
      FROM race_fleet rf
      LEFT JOIN drivers d ON rf.assigned_driver_id = d.id
      WHERE 1=1`;
    const params = [];
    let p = 1;

    if (vehicle_type) { q += ` AND rf.vehicle_type = $${p++}`; params.push(vehicle_type); }
    if (status)       { q += ` AND rf.status = $${p++}`;       params.push(status); }
    if (search)       { q += ` AND rf.name ILIKE $${p++}`;     params.push(`%${search}%`); }

    q += ' ORDER BY rf.created_at DESC';
    const result = await pool.query(q, params);
    res.json({ success: true, count: result.rows.length, vehicles: result.rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/race-fleet/:id
router.get('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT rf.*, d.name AS driver_name
       FROM race_fleet rf
       LEFT JOIN drivers d ON rf.assigned_driver_id = d.id
       WHERE rf.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Vehicle not found' });
    }
    res.json({ success: true, vehicle: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// GET /api/race-fleet/:id/history
router.get('/:id/history', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT * FROM activity_log
       WHERE entity_type = 'race_fleet' AND entity_id = $1
       ORDER BY created_at DESC LIMIT 100`,
      [req.params.id]
    );
    res.json({ success: true, count: result.rows.length, history: result.rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/race-fleet
router.post('/', async (req, res, next) => {
  try {
    const {
      name, vehicle_type = 'kart',
      class: vehicleClass,
      make, model, year,
      chassis_number, engine_serial,
      assigned_driver_id, current_location_id,
      status = 'available',
      next_service_due_hours, notes,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }

    const id = genId();
    const result = await pool.query(
      `INSERT INTO race_fleet
         (id, name, vehicle_type, class, make, model, year,
          chassis_number, engine_serial,
          assigned_driver_id, current_location_id,
          status, next_service_due_hours, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        id, name.trim(), vehicle_type,
        vehicleClass        || null,
        make                || null,
        model               || null,
        year                || null,
        chassis_number      || null,
        engine_serial       || null,
        assigned_driver_id  || null,
        current_location_id || null,
        status,
        next_service_due_hours || null,
        notes               || null,
      ]
    );

    logActivity(pool, {
      entityType: 'race_fleet',
      entityId:   id,
      entityName: name.trim(),
      action:     'created',
      userId:     req.user?.userId   || null,
      userName:   req.user?.username || null,
      details:    { vehicle_type, class: vehicleClass },
    }).catch(() => {});

    res.status(201).json({ success: true, vehicle: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// PUT /api/race-fleet/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const FIELDS = [
      'name','vehicle_type','class','make','model','year',
      'chassis_number','engine_serial',
      'assigned_driver_id','current_location_id','current_event_id',
      'status','total_race_hours','total_mileage_km',
      'last_service_date','next_service_due_hours','notes',
    ];

    const setClauses = [];
    const values    = [];
    let p = 1;

    for (const f of FIELDS) {
      if (req.body[f] !== undefined) {
        setClauses.push(`${f} = $${p++}`);
        values.push(req.body[f]);
      }
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid fields to update' });
    }

    setClauses.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query(
      `UPDATE race_fleet SET ${setClauses.join(', ')} WHERE id = $${p} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Vehicle not found' });
    }

    logActivity(pool, {
      entityType: 'race_fleet',
      entityId:   id,
      entityName: result.rows[0].name,
      action:     'updated',
      userId:     req.user?.userId   || null,
      userName:   req.user?.username || null,
    }).catch(() => {});

    res.json({ success: true, vehicle: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// POST /api/race-fleet/:id/usage  — log a race session
router.post('/:id/usage', async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      event_id    = null,
      session_type,
      race_hours  = 0,
      distance_km = 0,
      driver_name,
      notes,
    } = req.body;

    const rfRow = await pool.query('SELECT * FROM race_fleet WHERE id = $1', [id]);
    if (rfRow.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Vehicle not found' });
    }
    const v = rfRow.rows[0];

    const hrs = parseFloat(race_hours)  || 0;
    const km  = parseFloat(distance_km) || 0;

    // Accumulate totals on the vehicle
    await pool.query(
      `UPDATE race_fleet
       SET total_race_hours = total_race_hours + $1,
           total_mileage_km = total_mileage_km + $2,
           updated_at = NOW()
       WHERE id = $3`,
      [hrs, km, id]
    );

    // Write mileage_log entry
    if (km > 0) {
      await pool.query(
        `INSERT INTO mileage_log
           (id, entity_type, entity_id, event_id, distance_km, driver_user_id, notes, logged_at)
         VALUES ($1,'race_fleet',$2,$3,$4,$5,$6,NOW())`,
        [mlId(), id, event_id, km, req.user?.userId || null, notes || null]
      );
    }

    await logActivity(pool, {
      entityType: 'race_fleet',
      entityId:   id,
      entityName: v.name,
      action:     'used',
      eventId:    event_id,
      userId:     req.user?.userId   || null,
      userName:   req.user?.username || null,
      details:    { session_type, race_hours: hrs, distance_km: km, driver_name, notes },
    });

    res.json({
      success: true,
      message: 'Usage logged',
      total_race_hours: v.total_race_hours + hrs,
      total_mileage_km: v.total_mileage_km + km,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/race-fleet/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      'DELETE FROM race_fleet WHERE id = $1 RETURNING *',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Vehicle not found' });
    }
    res.json({ success: true, vehicle: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
