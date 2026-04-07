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
             max_weight_kg, status, created_at, updated_at
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
      max_weight_kg, status, notes
    } = req.body;

    const result = await pool.query(
      `UPDATE trucks SET
         registration = COALESCE($2, registration),
         name = COALESCE($3, name),
         truck_type = COALESCE($4, truck_type),
         dimensions_length_m = $5,
         dimensions_width_m = $6,
         dimensions_height_m = $7,
         max_weight_kg = $8,
         status = COALESCE($9, status),
         updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, registration, name, truck_type,
       dimensions_length_m ?? null, dimensions_width_m ?? null, dimensions_height_m ?? null,
       max_weight_kg ?? null, status]
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

module.exports = router;
