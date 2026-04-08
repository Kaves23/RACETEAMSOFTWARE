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
      `SELECT box_id, truck_zone, position_x, position_y, position_z, load_order, added_at
       FROM load_plan_boxes WHERE load_plan_id = $1 ORDER BY load_order`,
      [plan.id]
    );

    const placements = boxesResult.rows.map(r => ({
      boxId: r.box_id,
      zone: r.truck_zone,
      position: { x: r.position_x || 0, y: r.position_y || 0, z: r.position_z || 0 },
      timestamp: r.added_at
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

    // Find existing draft or create a new one
    let planId;
    const existing = await client.query(
      `SELECT id FROM load_plans WHERE status = 'Draft' ORDER BY updated_at DESC LIMIT 1`
    );

    if (existing.rows.length > 0) {
      planId = existing.rows[0].id;
      await client.query(
        `UPDATE load_plans SET truck_id = $1, event_id = $2, updated_at = NOW() WHERE id = $3`,
        [truck_id || null, event_id || null, planId]
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

    for (let i = 0; i < placements.length; i++) {
      const p = placements[i];
      await client.query(
        `INSERT INTO load_plan_boxes (load_plan_id, box_id, truck_zone, position_x, position_y, position_z, load_order, added_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          planId,
          p.boxId,
          p.zone || null,
          p.position?.x || 0,
          p.position?.y || 0,
          p.position?.z || 0,
          i + 1,
          p.timestamp || new Date().toISOString()
        ]
      );
    }

    await client.query('COMMIT');

    res.json({ success: true, planId, placementCount: placements.length });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

module.exports = router;
