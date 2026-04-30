const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { logActivity } = require('../lib/activityLog');

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

    const boxPlacements = boxesResult.rows.map(r => ({
      type: 'box',
      boxId: r.box_id,
      zone: r.truck_zone,
      position: { x: r.position_x || 0, y: r.position_y || 0, z: r.position_z || 0 },
      timestamp: r.added_at,
      scannedAt: r.scanned_at || null
    }));

    // Also load standalone asset / inventory placements
    const assetsResult = await pool.query(
      `SELECT item_type, item_id, truck_zone, added_at
       FROM load_plan_assets WHERE load_plan_id = $1 ORDER BY added_at`,
      [plan.id]
    );

    const assetPlacements = assetsResult.rows.map(r => ({
      type: r.item_type,
      ...(r.item_type === 'asset' ? { assetId: r.item_id } : { inventoryId: r.item_id }),
      zone: r.truck_zone,
      timestamp: r.added_at
    }));

    const placements = [...boxPlacements, ...assetPlacements];

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

    // Split placements by type
    const boxPlacements   = placements.filter(p => p.type === 'box' || p.boxId);
    const assetPlacements = placements.filter(p => p.type === 'asset' || (p.assetId && !p.boxId));
    const invPlacements   = placements.filter(p => p.type === 'inventory' || (p.inventoryId && !p.boxId));

    // Bulk INSERT box placements — filter to only box IDs that exist in the boxes table
    if (boxPlacements.length > 0) {
      const candidateIds = boxPlacements.map(p => p.boxId).filter(Boolean);
      const existsResult = await client.query(
        `SELECT id FROM boxes WHERE id = ANY($1::text[])`,
        [candidateIds]
      );
      const validIds = new Set(existsResult.rows.map(r => r.id));
      const validPlacements = boxPlacements.filter(p => validIds.has(p.boxId));

      if (validPlacements.length > 0) {
        const planIds   = validPlacements.map(() => planId);
        const boxIds    = validPlacements.map(p => p.boxId);
        const zones     = validPlacements.map(p => p.zone || null);
        const xs        = validPlacements.map(p => p.position?.x || 0);
        const ys        = validPlacements.map(p => p.position?.y || 0);
        const zs        = validPlacements.map(p => p.position?.z || 0);
        const orders    = validPlacements.map((_, i) => i + 1);
        const addedAts  = validPlacements.map(p => p.timestamp || new Date().toISOString());

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
    }

    // Replace asset / inventory placements
    await client.query('DELETE FROM load_plan_assets WHERE load_plan_id = $1', [planId]);

    const allItemPlacements = [
      ...assetPlacements.map(p => ({ itemType: 'asset',     itemId: p.assetId,     zone: p.zone, ts: p.timestamp })),
      ...invPlacements.map(p   => ({ itemType: 'inventory', itemId: p.inventoryId, zone: p.zone, ts: p.timestamp }))
    ].filter(p => p.itemId);

    if (allItemPlacements.length > 0) {
      const iplanIds  = allItemPlacements.map(() => planId);
      const iTypes    = allItemPlacements.map(p => p.itemType);
      const iIds      = allItemPlacements.map(p => p.itemId);
      const iZones    = allItemPlacements.map(p => p.zone || null);
      const iAddedAts = allItemPlacements.map(p => p.ts || new Date().toISOString());

      await client.query(
        `INSERT INTO load_plan_assets (load_plan_id, item_type, item_id, truck_zone, added_at)
         SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::timestamptz[])`,
        [iplanIds, iTypes, iIds, iZones, iAddedAts]
      );
    }

    // Sync boxes.current_truck_id — set for placed boxes, clear for removed ones
    const placedBoxIds = boxPlacements.map(p => p.boxId).filter(Boolean);
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

    // Audit log
    logActivity(pool, {
      entityType: 'load_plan',
      entityId:   planId,
      entityName: truck_id ? `Load Plan (truck ${truck_id})` : 'Load Plan',
      action:     'draft_saved',
      userId:   req.user?.userId   || null,
      userName: req.user?.username || null,
      details:  { truck_id: truck_id || null, event_id: event_id || null, placementCount: placements.length },
    }).catch(() => {});

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

    // Audit log
    logActivity(pool, {
      entityType: 'load_plan',
      entityId:   planId,
      entityName: truck_id ? `Load Plan (truck ${truck_id})` : 'Load Plan',
      action:     'finalised',
      userId:   req.user?.userId   || null,
      userName: req.user?.username || null,
      details:  { truck_id: truck_id || null },
    }).catch(() => {});

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
