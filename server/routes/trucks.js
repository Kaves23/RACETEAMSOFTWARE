const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const crypto = require('crypto');

// GET /api/trucks - list all vehicles
router.get('/', async (req, res, next) => {
  try {
    const { status, search } = req.query;
    let query = `
      SELECT id, registration, name, truck_type, notes,
             dimensions_length_m, dimensions_width_m, dimensions_height_m,
             max_weight_kg, status,
             make, model, year, colour, fuel_type, current_odometer_km,
             service_interval_km, service_interval_months,
             last_service_date, last_service_km, next_service_date, next_service_km,
             insurance_expiry, insurance_notes,
             roadworthy_expiry, roadworthy_notes, licence_disc_expiry,
             created_at, updated_at
      FROM trucks
      WHERE 1=1
    `;
    const params = [];
    let p = 1;

    if (status) {
      query += ` AND status = $${p++}`;
      params.push(status);
    }
    if (search) {
      query += ` AND (name ILIKE $${p} OR registration ILIKE $${p})`;
      params.push(`%${search}%`);
      p++;
    }

    query += ' ORDER BY name ASC';
    const result = await pool.query(query, params);
    res.json({ success: true, count: result.rows.length, trucks: result.rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/trucks/alerts/summary - fleet-wide compliance + service alerts (must be before /:id)
router.get('/alerts/summary', async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT id, name, registration, status,
             insurance_expiry, roadworthy_expiry, licence_disc_expiry,
             next_service_date, next_service_km, current_odometer_km,
             service_interval_km
      FROM trucks
      WHERE status != 'retired'
      ORDER BY name ASC
    `);
    const today = new Date();
    const soon = new Date(today); soon.setDate(soon.getDate() + 30);

    const alerts = [];
    for (const t of result.rows) {
      const check = (label, expiry) => {
        if (!expiry) return;
        const d = new Date(expiry);
        if (d < today) alerts.push({ truck_id: t.id, truck_name: t.name, registration: t.registration, type: label, severity: 'expired', expiry });
        else if (d <= soon) alerts.push({ truck_id: t.id, truck_name: t.name, registration: t.registration, type: label, severity: 'due_soon', expiry });
      };
      check('Insurance', t.insurance_expiry);
      check('Roadworthy', t.roadworthy_expiry);
      check('Licence Disc', t.licence_disc_expiry);
      check('Service Due', t.next_service_date);

      if (t.next_service_km && t.current_odometer_km) {
        const remaining = parseFloat(t.next_service_km) - parseFloat(t.current_odometer_km);
        if (remaining <= 0) alerts.push({ truck_id: t.id, truck_name: t.name, registration: t.registration, type: 'Service (km)', severity: 'expired', detail: `${Math.abs(remaining).toFixed(0)} km overdue` });
        else if (remaining <= 1000) alerts.push({ truck_id: t.id, truck_name: t.name, registration: t.registration, type: 'Service (km)', severity: 'due_soon', detail: `${remaining.toFixed(0)} km remaining` });
      }
    }
    res.json({ success: true, alerts });
  } catch (err) { next(err); }
});

// GET /api/trucks/:id
router.get('/:id', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM trucks WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Vehicle not found' });
    res.json({ success: true, truck: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// POST /api/trucks - create vehicle
router.post('/', async (req, res, next) => {
  try {
    const {
      registration, name, truck_type,
      dimensions_length_m, dimensions_width_m, dimensions_height_m,
      max_weight_kg, status = 'available', notes = ''
    } = req.body;

    if (!registration) return res.status(400).json({ success: false, error: 'Registration is required' });

    const id = crypto.randomUUID();
    const result = await pool.query(
      `INSERT INTO trucks
         (id, registration, name, truck_type, dimensions_length_m, dimensions_width_m,
          dimensions_height_m, max_weight_kg, status, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
       RETURNING *`,
      [id, registration, name || registration, truck_type || 'Trailer',
       dimensions_length_m || null, dimensions_width_m || null, dimensions_height_m || null,
       max_weight_kg || null, status]
    );
    res.status(201).json({ success: true, truck: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') { // unique violation on registration
      return res.status(409).json({ success: false, error: 'A vehicle with that registration already exists' });
    }
    next(err);
  }
});

// PUT /api/trucks/:id - update vehicle
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      registration, name, truck_type,
      dimensions_length_m, dimensions_width_m, dimensions_height_m,
      max_weight_kg, status, notes,
      // fleet fields
      make, model, year, colour, fuel_type, current_odometer_km,
      service_interval_km, service_interval_months,
      last_service_date, last_service_km, next_service_date, next_service_km,
      insurance_expiry, insurance_notes,
      roadworthy_expiry, roadworthy_notes,
      licence_disc_expiry,
      // NATIS / licence disc document fields
      vin, engine_number, licence_number, series, vehicle_description,
      vehicle_category, registered_owner, drive_type,
      tare_weight_kg, gvm_kg,
      licence_disc_paid_date, licence_disc_amount_paid,
      control_number, registering_authority, nvc
    } = req.body;

    const result = await pool.query(
      `UPDATE trucks SET
         registration          = COALESCE($2,  registration),
         name                  = COALESCE($3,  name),
         truck_type            = COALESCE($4,  truck_type),
         dimensions_length_m   = $5,
         dimensions_width_m    = $6,
         dimensions_height_m   = $7,
         max_weight_kg         = $8,
         status                = COALESCE($9,  status),
         notes                 = COALESCE($10, notes),
         make                  = $11,
         model                 = $12,
         year                  = $13,
         colour                = $14,
         fuel_type             = $15,
         current_odometer_km   = COALESCE($16, current_odometer_km),
         service_interval_km   = $17,
         service_interval_months = $18,
         last_service_date     = $19,
         last_service_km       = $20,
         next_service_date     = $21,
         next_service_km       = $22,
         insurance_expiry      = $23,
         insurance_notes       = $24,
         roadworthy_expiry     = $25,
         roadworthy_notes      = $26,
         licence_disc_expiry   = $27,
         vin                        = $28,
         engine_number              = $29,
         licence_number             = $30,
         series                     = $31,
         vehicle_description        = $32,
         vehicle_category           = $33,
         registered_owner           = $34,
         drive_type                 = $35,
         tare_weight_kg             = $36,
         gvm_kg                     = $37,
         licence_disc_paid_date     = $38,
         licence_disc_amount_paid   = $39,
         control_number             = $40,
         registering_authority      = $41,
         nvc                        = $42,
         updated_at            = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, registration, name, truck_type,
       dimensions_length_m ?? null, dimensions_width_m ?? null, dimensions_height_m ?? null,
       max_weight_kg ?? null, status, notes ?? null,
       make ?? null, model ?? null, year ?? null, colour ?? null, fuel_type ?? null,
       current_odometer_km ?? null,
       service_interval_km ?? null, service_interval_months ?? null,
       last_service_date ?? null, last_service_km ?? null,
       next_service_date ?? null, next_service_km ?? null,
       insurance_expiry ?? null, insurance_notes ?? null,
       roadworthy_expiry ?? null, roadworthy_notes ?? null,
       licence_disc_expiry ?? null,
       vin ?? null, engine_number ?? null, licence_number ?? null,
       series ?? null, vehicle_description ?? null, vehicle_category ?? null,
       registered_owner ?? null, drive_type ?? null,
       tare_weight_kg ?? null, gvm_kg ?? null,
       licence_disc_paid_date ?? null, licence_disc_amount_paid ?? null,
       control_number ?? null, registering_authority ?? null, nvc ?? null]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Vehicle not found' });
    res.json({ success: true, truck: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: 'A vehicle with that registration already exists' });
    }
    next(err);
  }
});

// DELETE /api/trucks/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM trucks WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Vehicle not found' });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ─── SERVICE LOGS ──────────────────────────────────────────────────────────────

// GET /api/trucks/:id/service
router.get('/:id/service', async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT * FROM vehicle_service_logs WHERE truck_id = $1 ORDER BY service_date DESC',
      [req.params.id]
    );
    res.json({ success: true, logs: result.rows });
  } catch (err) { next(err); }
});

// POST /api/trucks/:id/service
router.post('/:id/service', async (req, res, next) => {
  try {
    const { id: truck_id } = req.params;
    const { service_date, odometer_km, service_type = 'routine', description,
            cost_zar, performed_by, next_service_date, next_service_km, notes } = req.body;
    if (!service_date) return res.status(400).json({ success: false, error: 'service_date is required' });

    const id = crypto.randomUUID();
    const result = await pool.query(
      `INSERT INTO vehicle_service_logs
         (id, truck_id, service_date, odometer_km, service_type, description,
          cost_zar, performed_by, next_service_date, next_service_km, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [id, truck_id, service_date, odometer_km ?? null, service_type, description ?? null,
       cost_zar ?? null, performed_by ?? null, next_service_date ?? null, next_service_km ?? null, notes ?? null]
    );

    // Update parent truck's service fields & odometer
    await pool.query(
      `UPDATE trucks SET
         last_service_date   = $2,
         last_service_km     = COALESCE($3, last_service_km),
         next_service_date   = COALESCE($4, next_service_date),
         next_service_km     = COALESCE($5, next_service_km),
         current_odometer_km = GREATEST(COALESCE(current_odometer_km,0), COALESCE($3, COALESCE(current_odometer_km,0))),
         updated_at          = NOW()
       WHERE id = $1`,
      [truck_id, service_date, odometer_km ?? null, next_service_date ?? null, next_service_km ?? null]
    );

    res.status(201).json({ success: true, log: result.rows[0] });
  } catch (err) { next(err); }
});

// DELETE /api/trucks/:id/service/:logId
router.delete('/:id/service/:logId', async (req, res, next) => {
  try {
    const result = await pool.query(
      'DELETE FROM vehicle_service_logs WHERE id = $1 AND truck_id = $2 RETURNING id',
      [req.params.logId, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Log not found' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── FUEL LOGS ─────────────────────────────────────────────────────────────────

// GET /api/trucks/:id/fuel
router.get('/:id/fuel', async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT * FROM vehicle_fuel_logs WHERE truck_id = $1 ORDER BY filled_at DESC',
      [req.params.id]
    );
    res.json({ success: true, logs: result.rows });
  } catch (err) { next(err); }
});

// POST /api/trucks/:id/fuel
router.post('/:id/fuel', async (req, res, next) => {
  try {
    const { id: truck_id } = req.params;
    const { filled_at, odometer_km, litres, cost_per_litre, total_cost_zar, station_name, notes } = req.body;

    const id = crypto.randomUUID();
    // Auto-calculate cost if not given
    const total = total_cost_zar ?? (litres && cost_per_litre ? (parseFloat(litres) * parseFloat(cost_per_litre)).toFixed(2) : null);
    const result = await pool.query(
      `INSERT INTO vehicle_fuel_logs
         (id, truck_id, filled_at, odometer_km, litres, cost_per_litre, total_cost_zar, station_name, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [id, truck_id, filled_at ?? new Date(), odometer_km ?? null, litres ?? null,
       cost_per_litre ?? null, total, station_name ?? null, notes ?? null]
    );

    // Update odometer on truck if higher than current
    if (odometer_km) {
      await pool.query(
        `UPDATE trucks SET current_odometer_km = GREATEST(COALESCE(current_odometer_km,0), $2), updated_at = NOW() WHERE id = $1`,
        [truck_id, odometer_km]
      );
    }

    res.status(201).json({ success: true, log: result.rows[0] });
  } catch (err) { next(err); }
});

// DELETE /api/trucks/:id/fuel/:logId
router.delete('/:id/fuel/:logId', async (req, res, next) => {
  try {
    const result = await pool.query(
      'DELETE FROM vehicle_fuel_logs WHERE id = $1 AND truck_id = $2 RETURNING id',
      [req.params.logId, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Log not found' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── TRIP LOGS ─────────────────────────────────────────────────────────────────

// GET /api/trucks/:id/trips
router.get('/:id/trips', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT t.*, e.name AS event_name
       FROM vehicle_trips t
       LEFT JOIN events e ON e.id = t.event_id
       WHERE t.truck_id = $1
       ORDER BY t.departure_at DESC NULLS LAST`,
      [req.params.id]
    );
    res.json({ success: true, trips: result.rows });
  } catch (err) { next(err); }
});

// POST /api/trucks/:id/trips
router.post('/:id/trips', async (req, res, next) => {
  try {
    const { id: truck_id } = req.params;
    const { event_id, driver_name, departure_from, arrival_to,
            departure_at, arrival_at, start_odometer_km, end_odometer_km, notes } = req.body;

    const id = crypto.randomUUID();
    const result = await pool.query(
      `INSERT INTO vehicle_trips
         (id, truck_id, event_id, driver_name, departure_from, arrival_to,
          departure_at, arrival_at, start_odometer_km, end_odometer_km, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [id, truck_id, event_id ?? null, driver_name ?? null, departure_from ?? null, arrival_to ?? null,
       departure_at ?? null, arrival_at ?? null,
       start_odometer_km ?? null, end_odometer_km ?? null, notes ?? null]
    );

    // Update odometer on truck if end reading is higher
    if (end_odometer_km) {
      await pool.query(
        `UPDATE trucks SET current_odometer_km = GREATEST(COALESCE(current_odometer_km,0), $2), updated_at = NOW() WHERE id = $1`,
        [truck_id, end_odometer_km]
      );
    }

    res.status(201).json({ success: true, trip: result.rows[0] });
  } catch (err) { next(err); }
});

// DELETE /api/trucks/:id/trips/:tripId
router.delete('/:id/trips/:tripId', async (req, res, next) => {
  try {
    const result = await pool.query(
      'DELETE FROM vehicle_trips WHERE id = $1 AND truck_id = $2 RETURNING id',
      [req.params.tripId, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Trip not found' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
