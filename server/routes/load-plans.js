const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// GET /api/load-plans/draft?truck_id=X
// Returns the Draft plan for the given truck (or the most recent draft if no truck_id).
// If none exists, returns { plan: null, placements: [] }
router.get('/draft', async (req, res, next) => {
  try {
    const { truck_id } = req.query;
    const planResult = truck_id
      ? await pool.query(
          `SELECT * FROM load_plans WHERE status = 'Draft' AND truck_id = $1 ORDER BY updated_at DESC LIMIT 1`,
          [truck_id]
        )
      : await pool.query(
          `SELECT * FROM load_plans WHERE status = 'Draft' ORDER BY updated_at DESC LIMIT 1`
        );

    if (planResult.rows.length === 0) {
      return res.json({ success: true, plan: null, placements: [] });
    }

    const plan = planResult.rows[0];

    const boxesResult = await pool.query(
      `SELECT box_id, truck_zone, position_x, position_y, position_z, load_order, added_at, scanned_at
       FROM load_plan_boxes WHERE load_plan_id = $1 ORDER BY load_order`,
      [plan.id]
    );

    const placements = boxesResult.rows.map(r => ({
      boxId: r.box_id,
      zone: r.truck_zone,
      position: { x: r.position_x || 0, y: r.position_y || 0, z: r.position_z || 0 },
      timestamp: r.added_at,
      scannedAt: r.scanned_at || null
    }));

    res.json({ success: true, plan, placements });
  } catch (error) {
    next(error);
  }
});

// PUT /api/load-plans/draft
// Upserts the Draft plan and replaces all its box placements atomically.
// Body: { truck_id, event_id, placements: [{boxId, zone, position, timestamp}] }
router.put('/draft', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { truck_id, event_id, placements = [] } = req.body;

    await client.query('BEGIN');

    // Find existing draft for THIS specific truck (each truck has its own Draft plan)
    let planId;
    const existing = truck_id
      ? await client.query(
          `SELECT id FROM load_plans WHERE status = 'Draft' AND truck_id = $1 ORDER BY updated_at DESC LIMIT 1`,
          [truck_id]
        )
      : await client.query(
          `SELECT id FROM load_plans WHERE status = 'Draft' AND truck_id IS NULL ORDER BY updated_at DESC LIMIT 1`
        );

    if (existing.rows.length > 0) {
      planId = existing.rows[0].id;
      await client.query(
        `UPDATE load_plans SET event_id = $1, updated_at = NOW() WHERE id = $2`,
        [event_id || null, planId]
      );
    } else {
      planId = `lp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      await client.query(
        `INSERT INTO load_plans (id, truck_id, event_id, status, created_at, updated_at)
         VALUES ($1, $2, $3, 'Draft', NOW(), NOW())`,
        [planId, truck_id || null, event_id || null]
      );
    }

    // Replace all box placements
    await client.query('DELETE FROM load_plan_boxes WHERE load_plan_id = $1', [planId]);

    // Bulk INSERT using unnest — one round-trip regardless of placement count
    // (replaces N individual INSERTs which caused N network round-trips)
    if (placements.length > 0) {
      const planIds   = placements.map(() => planId);
      const boxIds    = placements.map(p => p.boxId);
      const zones     = placements.map(p => p.zone || null);
      const xs        = placements.map(p => p.position?.x || 0);
      const ys        = placements.map(p => p.position?.y || 0);
      const zs        = placements.map(p => p.position?.z || 0);
      const orders    = placements.map((_, i) => i + 1);
      const addedAts  = placements.map(p => p.timestamp || new Date().toISOString());

      await client.query(
        `INSERT INTO load_plan_boxes
           (load_plan_id, box_id, truck_zone, position_x, position_y, position_z, load_order, added_at)
         SELECT * FROM unnest(
           $1::text[], $2::text[], $3::text[],
           $4::float[], $5::float[], $6::float[],
           $7::int[], $8::timestamptz[]
         )`,
        [planIds, boxIds, zones, xs, ys, zs, orders, addedAts]
      );
    }

    // Sync boxes.current_truck_id — set for placed boxes, clear for removed ones
    const placedBoxIds = placements.map(p => p.boxId).filter(Boolean);
    if (placedBoxIds.length > 0) {
      await client.query(
        `UPDATE boxes SET current_truck_id = $1, updated_at = NOW() WHERE id = ANY($2::text[])`,
        [truck_id || null, placedBoxIds]
      );
    }
    // Clear truck assignment for any box that was in a previous draft for this truck but is no longer placed
    await client.query(
      `UPDATE boxes SET current_truck_id = NULL, updated_at = NOW()
       WHERE current_truck_id = $1
       AND ($2::text[] IS NULL OR id != ALL($2::text[]))`,
      [truck_id || null, placedBoxIds.length > 0 ? placedBoxIds : null]
    );

    await client.query('COMMIT');

    res.json({ success: true, planId, placementCount: placements.length });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// POST /api/load-plans/finalise
// Stamps the current draft as Completed (preserving it as history) then clears placements
// so a fresh draft can be started. Body: { truck_id } (used to find the right draft)
router.post('/finalise', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { truck_id } = req.body;
    await client.query('BEGIN');

    const draftQ = truck_id
      ? await client.query(`SELECT id FROM load_plans WHERE status = 'Draft' AND truck_id = $1 ORDER BY updated_at DESC LIMIT 1`, [truck_id])
      : await client.query(`SELECT id FROM load_plans WHERE status = 'Draft' ORDER BY updated_at DESC LIMIT 1`);

    if (draftQ.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'No draft plan found to finalise' });
    }

    const planId = draftQ.rows[0].id;

    // Mark as Completed
    await client.query(
      `UPDATE load_plans SET status = 'Completed', updated_at = NOW() WHERE id = $1`,
      [planId]
    );

    // Clear current_truck_id on all boxes that were in this plan
    await client.query(
      `UPDATE boxes SET current_truck_id = NULL, updated_at = NOW()
       WHERE id IN (SELECT box_id FROM load_plan_boxes WHERE load_plan_id = $1)`,
      [planId]
    );

    await client.query('COMMIT');
    res.json({ success: true, planId, message: 'Load plan finalised and saved to history' });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

// GET /api/load-plans/history
// Returns all Completed load plans with their box counts
router.get('/history', async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT lp.id, lp.name, lp.truck_id, lp.event_id, lp.status,
             lp.created_at, lp.updated_at,
             t.name AS truck_name,
             e.name AS event_name,
             COUNT(lpb.box_id) AS box_count
      FROM load_plans lp
      LEFT JOIN trucks t ON t.id = lp.truck_id
      LEFT JOIN events e ON e.id = lp.event_id
      LEFT JOIN load_plan_boxes lpb ON lpb.load_plan_id = lp.id
      WHERE lp.status = 'Completed'
      GROUP BY lp.id, t.name, e.name
      ORDER BY lp.updated_at DESC
    `);
    res.json({ success: true, plans: result.rows });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
