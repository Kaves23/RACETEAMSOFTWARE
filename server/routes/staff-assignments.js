const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const crypto = require('crypto');

// Asset type → table name mapping
const ASSET_TABLE = { item: 'items', box: 'boxes', inventory: 'inventory' };

// ──────────────────────────────────────────────────────────────────
// GET /api/staff-assignments  (no staffId) — list all staff with counts
// Defined FIRST so it is not shadowed by the /:staffId pattern.
// ──────────────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT s.id, s.name, s.role,
             COUNT(sia.id) FILTER (WHERE sia.returned_at IS NULL) AS active_count
      FROM staff s
      LEFT JOIN staff_item_assignments sia ON sia.staff_id = s.id
      GROUP BY s.id, s.name, s.role
      ORDER BY s.name ASC
    `);
    res.json({ success: true, staff: result.rows });
  } catch (error) {
    next(error);
  }
});

// ──────────────────────────────────────────────────────────────────
// GET /api/staff-assignments/:staffId
// Returns all ACTIVE checkouts + last 20 history rows.
// Single JOIN query replaces previous N+1 per-assignment lookups.
// ──────────────────────────────────────────────────────────────────
router.get('/:staffId', async (req, res, next) => {
  try {
    const { staffId } = req.params;
    if (!staffId) {
      return res.status(400).json({ success: false, error: 'staffId is required' });
    }

    const staffResult = await pool.query(
      'SELECT id, name, role FROM staff WHERE id = $1',
      [staffId]
    );
    if (staffResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Staff member not found' });
    }

    // Single query — LEFT JOINs to all three asset tables instead of N+1 lookups
    const activeResult = await pool.query(
      `SELECT
         sia.id, sia.asset_id, sia.asset_type, sia.assigned_at, sia.notes,
         COALESCE(i.name, b.name, inv.name)       AS asset_name,
         COALESCE(i.barcode, b.barcode, inv.sku)  AS asset_barcode
       FROM staff_item_assignments sia
       LEFT JOIN items     i   ON sia.asset_id = i.id   AND sia.asset_type = 'item'
       LEFT JOIN boxes     b   ON sia.asset_id = b.id   AND sia.asset_type = 'box'
       LEFT JOIN inventory inv ON sia.asset_id = inv.id AND sia.asset_type = 'inventory'
       WHERE sia.staff_id = $1 AND sia.returned_at IS NULL
       ORDER BY sia.assigned_at DESC`,
      [staffId]
    );

    const active = activeResult.rows.map(row => ({
      id: row.id,
      asset_id: row.asset_id,
      asset_type: row.asset_type,
      assigned_at: row.assigned_at,
      notes: row.notes,
      asset: { id: row.asset_id, name: row.asset_name, barcode: row.asset_barcode }
    }));

    const historyResult = await pool.query(
      `SELECT sia.id, sia.asset_id, sia.asset_type, sia.assigned_at, sia.returned_at, sia.notes
       FROM staff_item_assignments sia
       WHERE sia.staff_id = $1 AND sia.returned_at IS NOT NULL
       ORDER BY sia.returned_at DESC
       LIMIT 20`,
      [staffId]
    );

    res.json({
      success: true,
      staff: staffResult.rows[0],
      active,
      history: historyResult.rows
    });
  } catch (error) {
    next(error);
  }
});

// ──────────────────────────────────────────────────────────────────
// POST /api/staff-assignments
// Body: { staffId, assetId, assetType ('item'|'box'|'inventory'), notes }
// ──────────────────────────────────────────────────────────────────
router.post('/', async (req, res, next) => {
  let client;
  try {
    const { staffId, assetId, assetType, notes } = req.body;

    if (!staffId || !assetId || !assetType) {
      return res.status(400).json({ success: false, error: 'staffId, assetId, and assetType are required' });
    }
    const table = ASSET_TABLE[assetType];
    if (!table) {
      return res.status(400).json({ success: false, error: `Invalid assetType: ${assetType}` });
    }

    client = await pool.connect();
    await client.query('BEGIN');

    const staffCheck = await client.query('SELECT id FROM staff WHERE id = $1', [staffId]);
    if (staffCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Staff member not found' });
    }
    const assetCheck = await client.query(`SELECT id FROM ${table} WHERE id = $1`, [assetId]);
    if (assetCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Asset not found' });
    }

    // Close any open assignment for this asset
    await client.query(
      `UPDATE staff_item_assignments
       SET returned_at = NOW()
       WHERE asset_id = $1 AND asset_type = $2 AND returned_at IS NULL`,
      [assetId, assetType]
    );

    const assignmentId = crypto.randomUUID();
    await client.query(
      `INSERT INTO staff_item_assignments (id, staff_id, asset_id, asset_type, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [assignmentId, staffId, assetId, assetType, notes || null]
    );

    await client.query(
      `UPDATE ${table} SET assigned_staff_id = $1, updated_at = NOW() WHERE id = $2`,
      [staffId, assetId]
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
// DELETE /api/staff-assignments/:assetType/:assetId
// ──────────────────────────────────────────────────────────────────
router.delete('/:assetType/:assetId', async (req, res, next) => {
  let client;
  try {
    const { assetType, assetId } = req.params;
    const table = ASSET_TABLE[assetType];
    if (!table) {
      return res.status(400).json({ success: false, error: `Invalid assetType: ${assetType}` });
    }

    client = await pool.connect();
    await client.query('BEGIN');

    await client.query(
      `UPDATE staff_item_assignments
       SET returned_at = NOW()
       WHERE asset_id = $1 AND asset_type = $2 AND returned_at IS NULL`,
      [assetId, assetType]
    );

    await client.query(
      `UPDATE ${table} SET assigned_staff_id = NULL, updated_at = NOW() WHERE id = $1`,
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
  try {
    const { staffId } = req.params;

    // Verify staff member exists
    const staffResult = await pool.query('SELECT id, name, role FROM staff WHERE id = $1', [staffId]);
    if (staffResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Staff member not found' });
    }

    // Active assignments (returned_at IS NULL)
    const activeResult = await pool.query(
      `SELECT sia.id, sia.asset_id, sia.asset_type, sia.assigned_at, sia.notes
       FROM staff_item_assignments sia
       WHERE sia.staff_id = $1 AND sia.returned_at IS NULL
       ORDER BY sia.assigned_at DESC`,
      [staffId]
    );

    // Enrich active rows with asset name/barcode by type
    const active = await Promise.all(activeResult.rows.map(async row => {
      const table = ASSET_TABLE[row.asset_type];
      if (!table) return row;
      const nameCol = row.asset_type === 'inventory' ? 'sku' : 'barcode';
      const asset = await pool.query(
        `SELECT id, name, ${nameCol} AS barcode FROM ${table} WHERE id = $1`,
        [row.asset_id]
      );
      return { ...row, asset: asset.rows[0] || null };
    }));

    // Recent history (returned_at IS NOT NULL), last 20
    const historyResult = await pool.query(
      `SELECT sia.id, sia.asset_id, sia.asset_type, sia.assigned_at, sia.returned_at, sia.notes
       FROM staff_item_assignments sia
       WHERE sia.staff_id = $1 AND sia.returned_at IS NOT NULL
       ORDER BY sia.returned_at DESC
       LIMIT 20`,
      [staffId]
    );

    res.json({
      success: true,
      staff: staffResult.rows[0],
      active,
      history: historyResult.rows
    });
  } catch (error) {
    next(error);
  }
});

// ──────────────────────────────────────────────────────────────────
// POST /api/staff-assignments
// Assign an asset to a staff member.
// If the asset is already assigned to someone else, the old assignment
// is closed (returned_at = NOW()) before the new one is created.
// Body: { staffId, assetId, assetType ('item'|'box'|'inventory'), notes }
// ──────────────────────────────────────────────────────────────────
router.post('/', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { staffId, assetId, assetType, notes } = req.body;

    if (!staffId || !assetId || !assetType) {
      return res.status(400).json({ success: false, error: 'staffId, assetId, and assetType are required' });
    }
    const table = ASSET_TABLE[assetType];
    if (!table) {
      return res.status(400).json({ success: false, error: `Invalid assetType: ${assetType}` });
    }

    await client.query('BEGIN');

    // Verify staff + asset both exist
    const staffCheck = await client.query('SELECT id FROM staff WHERE id = $1', [staffId]);
    if (staffCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Staff member not found' });
    }
    const assetCheck = await client.query(`SELECT id, assigned_staff_id FROM ${table} WHERE id = $1`, [assetId]);
    if (assetCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Asset not found' });
    }

    // Close any open assignment for this asset (regardless of staff member)
    await client.query(
      `UPDATE staff_item_assignments
       SET returned_at = NOW()
       WHERE asset_id = $1 AND asset_type = $2 AND returned_at IS NULL`,
      [assetId, assetType]
    );

    // Create new assignment history row
    const assignmentId = crypto.randomUUID();
    await client.query(
      `INSERT INTO staff_item_assignments (id, staff_id, asset_id, asset_type, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [assignmentId, staffId, assetId, assetType, notes || null]
    );

    // Update denormalised column on the asset
    await client.query(
      `UPDATE ${table} SET assigned_staff_id = $1, updated_at = NOW() WHERE id = $2`,
      [staffId, assetId]
    );

    await client.query('COMMIT');

    res.json({ success: true, assignmentId });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// ──────────────────────────────────────────────────────────────────
// DELETE /api/staff-assignments/:assetType/:assetId
// Return / unassign an asset from whoever currently holds it.
// ──────────────────────────────────────────────────────────────────
router.delete('/:assetType/:assetId', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { assetType, assetId } = req.params;
    const table = ASSET_TABLE[assetType];
    if (!table) {
      return res.status(400).json({ success: false, error: `Invalid assetType: ${assetType}` });
    }

    await client.query('BEGIN');

    // Close open assignment row
    await client.query(
      `UPDATE staff_item_assignments
       SET returned_at = NOW()
       WHERE asset_id = $1 AND asset_type = $2 AND returned_at IS NULL`,
      [assetId, assetType]
    );

    // Clear denormalised column
    await client.query(
      `UPDATE ${table} SET assigned_staff_id = NULL, updated_at = NOW() WHERE id = $1`,
      [assetId]
    );

    await client.query('COMMIT');

    res.json({ success: true });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// ──────────────────────────────────────────────────────────────────
// GET /api/staff-assignments (no staffId) — list all staff with counts
// Used by settings page to show who has how many items
// ──────────────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT s.id, s.name, s.role,
             COUNT(sia.id) FILTER (WHERE sia.returned_at IS NULL) AS active_count
      FROM staff s
      LEFT JOIN staff_item_assignments sia ON sia.staff_id = s.id
      WHERE s.status = 'active' OR s.status IS NULL
      GROUP BY s.id, s.name, s.role
      ORDER BY s.name ASC
    `);
    res.json({ success: true, staff: result.rows });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
