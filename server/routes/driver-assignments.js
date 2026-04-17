const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const crypto = require('crypto');

// ──────────────────────────────────────────────────────────────────
// GET /api/driver-assignments  — list all drivers with assigned counts
// ──────────────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT d.id, d.name, d.number,
             COUNT(dia.id) FILTER (WHERE dia.returned_at IS NULL) AS active_count
      FROM drivers d
      LEFT JOIN driver_item_assignments dia ON dia.driver_id = d.id
      GROUP BY d.id, d.name, d.number
      ORDER BY d.name ASC
    `);
    res.json({ success: true, drivers: result.rows });
  } catch (error) {
    next(error);
  }
});

// ──────────────────────────────────────────────────────────────────
// GET /api/driver-assignments/:driverId — current assignments for one driver
// ──────────────────────────────────────────────────────────────────
router.get('/:driverId', async (req, res, next) => {
  try {
    const { driverId } = req.params;

    const driverResult = await pool.query(
      'SELECT id, name, number FROM drivers WHERE id = $1',
      [driverId]
    );
    if (driverResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Driver not found' });
    }

    const activeResult = await pool.query(
      `SELECT dia.id, dia.asset_id, dia.assigned_at, dia.notes,
              i.name AS asset_name, i.barcode AS asset_barcode
       FROM driver_item_assignments dia
       LEFT JOIN items i ON dia.asset_id = i.id
       WHERE dia.driver_id = $1 AND dia.returned_at IS NULL
       ORDER BY dia.assigned_at DESC`,
      [driverId]
    );

    const historyResult = await pool.query(
      `SELECT id, asset_id, assigned_at, returned_at, notes
       FROM driver_item_assignments
       WHERE driver_id = $1 AND returned_at IS NOT NULL
       ORDER BY returned_at DESC LIMIT 20`,
      [driverId]
    );

    res.json({
      success: true,
      driver: driverResult.rows[0],
      active: activeResult.rows,
      history: historyResult.rows
    });
  } catch (error) {
    next(error);
  }
});

// ──────────────────────────────────────────────────────────────────
// POST /api/driver-assignments
// Body: { driverId, assetId, notes }
// ──────────────────────────────────────────────────────────────────
router.post('/', async (req, res, next) => {
  let client;
  try {
    const { driverId, assetId, notes } = req.body;

    if (!driverId || !assetId) {
      return res.status(400).json({ success: false, error: 'driverId and assetId are required' });
    }

    client = await pool.connect();
    await client.query('BEGIN');

    const driverCheck = await client.query('SELECT id FROM drivers WHERE id = $1', [driverId]);
    if (driverCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Driver not found' });
    }
    const assetCheck = await client.query('SELECT id FROM items WHERE id = $1', [assetId]);
    if (assetCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Asset not found' });
    }

    // Close any open assignment for this asset
    await client.query(
      `UPDATE driver_item_assignments
       SET returned_at = NOW()
       WHERE asset_id = $1 AND returned_at IS NULL`,
      [assetId]
    );

    const assignmentId = crypto.randomUUID();
    await client.query(
      `INSERT INTO driver_item_assignments (id, driver_id, asset_id, notes)
       VALUES ($1, $2, $3, $4)`,
      [assignmentId, driverId, assetId, notes || null]
    );

    await client.query(
      `UPDATE items SET assigned_driver_id = $1, updated_at = NOW() WHERE id = $2`,
      [driverId, assetId]
    );

    await client.query('COMMIT');
    res.json({ success: true, assignmentId });
  } catch (error) {
    if (client) { try { await client.query('ROLLBACK'); } catch (_) {} }
    next(error);
  } finally {
    if (client) client.release();
  }
});

// ──────────────────────────────────────────────────────────────────
// DELETE /api/driver-assignments/item/:assetId — return asset from driver
// ──────────────────────────────────────────────────────────────────
router.delete('/item/:assetId', async (req, res, next) => {
  let client;
  try {
    const { assetId } = req.params;

    client = await pool.connect();
    await client.query('BEGIN');

    await client.query(
      `UPDATE driver_item_assignments
       SET returned_at = NOW()
       WHERE asset_id = $1 AND returned_at IS NULL`,
      [assetId]
    );

    await client.query(
      `UPDATE items SET assigned_driver_id = NULL, updated_at = NOW() WHERE id = $1`,
      [assetId]
    );

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (error) {
    if (client) { try { await client.query('ROLLBACK'); } catch (_) {} }
    next(error);
  } finally {
    if (client) client.release();
  }
});

module.exports = router;
