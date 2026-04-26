const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// GET /api/scan/manifest/:truck_id
// Returns all boxes in the draft load plan for this truck, with loaded status
router.get('/manifest/:truck_id', async (req, res, next) => {
  try {
    const { truck_id } = req.params;

    // Truck must exist
    const truckResult = await pool.query(
      `SELECT id, name, registration FROM trucks WHERE id = $1`,
      [truck_id]
    );
    if (truckResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Truck not found' });
    }

    const planResult = await pool.query(
      `SELECT id, name FROM load_plans WHERE status = 'Draft' AND truck_id = $1 ORDER BY updated_at DESC LIMIT 1`,
      [truck_id]
    );

    if (planResult.rows.length === 0) {
      return res.json({
        success: true,
        truck: truckResult.rows[0],
        planFound: false,
        boxes: [],
        totalCount: 0,
        loadedCount: 0
      });
    }

    const plan = planResult.rows[0];

    const result = await pool.query(
      `SELECT b.id, b.name, b.barcode,
              lpb.truck_zone, lpb.load_order, lpb.scanned_at
       FROM load_plan_boxes lpb
       JOIN boxes b ON b.id = lpb.box_id
       WHERE lpb.load_plan_id = $1
       ORDER BY lpb.load_order ASC NULLS LAST, b.name ASC`,
      [plan.id]
    );

    const boxes = result.rows.map(r => ({
      id: r.id,
      name: r.name,
      barcode: r.barcode || null,
      zone: r.truck_zone || null,
      loadOrder: r.load_order,
      loaded: r.scanned_at !== null
    }));

    res.json({
      success: true,
      truck: truckResult.rows[0],
      planFound: true,
      planId: plan.id,
      planName: plan.name,
      boxes,
      totalCount: boxes.length,
      loadedCount: boxes.filter(b => b.loaded).length
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/scan/confirm
// Body: { barcode, truck_id, mode: 'load'|'unload', return_location_id? }
router.post('/confirm', async (req, res, next) => {
  try {
    const { barcode, truck_id, mode, return_location_id } = req.body;

    if (!barcode || !truck_id || !mode) {
      return res.status(400).json({ success: false, error: 'barcode, truck_id and mode are required' });
    }
    if (!['load', 'unload'].includes(mode)) {
      return res.status(400).json({ success: false, error: 'mode must be "load" or "unload"' });
    }

    const barcodeClean = String(barcode).trim();

    // --- Try boxes first ---
    const boxResult = await pool.query(
      `SELECT id, name, barcode, current_truck_id, current_location_id FROM boxes WHERE UPPER(barcode) = UPPER($1) LIMIT 1`,
      [barcodeClean]
    );

    if (boxResult.rows.length > 0) {
      const box = boxResult.rows[0];

      if (mode === 'load') {
        // Check the load plan entry for this box+truck
        const planCheck = await pool.query(
          `SELECT lpb.load_plan_id, lpb.truck_zone, lpb.scanned_at
           FROM load_plan_boxes lpb
           JOIN load_plans lp ON lp.id = lpb.load_plan_id
           WHERE lpb.box_id = $1 AND lp.truck_id = $2 AND lp.status = 'Draft'
           ORDER BY lp.updated_at DESC LIMIT 1`,
          [box.id, truck_id]
        );

        if (planCheck.rows.length > 0) {
          // Box is in the load plan
          if (planCheck.rows[0].scanned_at) {
            // Already physically scanned onto this truck
            return res.json({
              success: true, type: 'box', status: 'already_loaded',
              name: box.name, barcode: box.barcode,
              message: `Already scanned: ${box.name}`
            });
          }
          // Mark as physically scanned
          await pool.query(
            `UPDATE load_plan_boxes SET scanned_at = NOW() WHERE load_plan_id = $1 AND box_id = $2`,
            [planCheck.rows[0].load_plan_id, box.id]
          );
        } else {
          // Box not in any load plan — fall back to current_truck_id check
          if (box.current_truck_id === truck_id) {
            return res.json({
              success: true, type: 'box', status: 'already_loaded',
              name: box.name, barcode: box.barcode,
              message: `Already on truck: ${box.name}`
            });
          }
        }

        await pool.query(
          `UPDATE boxes SET current_truck_id = $1, updated_at = NOW() WHERE id = $2`,
          [truck_id, box.id]
        );

        const zone = planCheck.rows.length > 0 ? planCheck.rows[0].truck_zone : null;

        // Record scan event in box_history (fire-and-forget)
        pool.query(
          `INSERT INTO box_history (id, box_id, action, details, to_truck_id, new_status, performed_by_user_id, timestamp)
           VALUES (gen_random_uuid(), $1, 'scanned', $2, $3, 'in_transit', $4, NOW())`,
          [box.id, `Scanned onto truck${zone ? ` — Zone ${zone}` : ''}`, truck_id, req.user?.userId || null]
        ).catch(() => {});

        return res.json({
          success: true, type: 'box', status: 'loaded',
          name: box.name, barcode: box.barcode, zone,
          message: `✓ ${box.name}${zone ? ` → ${zone}` : ''}`
        });

      } else {
        // Unload
        if (return_location_id) {
          await pool.query(
            `UPDATE boxes SET current_truck_id = NULL, current_location_id = $1, updated_at = NOW() WHERE id = $2`,
            [return_location_id, box.id]
          );
        } else {
          await pool.query(
            `UPDATE boxes SET current_truck_id = NULL, updated_at = NOW() WHERE id = $1`,
            [box.id]
          );
        }

        // Record unload event in box_history (fire-and-forget)
        pool.query(
          `INSERT INTO box_history (id, box_id, action, details, from_truck_id, new_status, performed_by_user_id, timestamp)
           VALUES (gen_random_uuid(), $1, 'unloaded', 'Scanned off truck', $2, 'available', $3, NOW())`,
          [box.id, box.current_truck_id || truck_id, req.user?.userId || null]
        ).catch(() => {});

        return res.json({
          success: true, type: 'box', status: 'unloaded',
          name: box.name, barcode: box.barcode,
          message: `✓ ${box.name} unloaded`
        });
      }
    }

    // --- Try items table ---
    const itemResult = await pool.query(
      `SELECT id, name, barcode, current_location_id FROM items WHERE UPPER(barcode) = UPPER($1) LIMIT 1`,
      [barcodeClean]
    );

    if (itemResult.rows.length > 0) {
      const item = itemResult.rows[0];

      if (mode === 'load') {
        await pool.query(
          `UPDATE items SET current_location_id = 'loc_truck', updated_at = NOW() WHERE id = $1`,
          [item.id]
        );
        return res.json({
          success: true, type: 'item', status: 'loaded',
          name: item.name, barcode: item.barcode,
          message: `✓ Asset: ${item.name}`
        });
      } else {
        const retLoc = return_location_id || item.current_location_id;
        await pool.query(
          `UPDATE items SET current_location_id = $1, updated_at = NOW() WHERE id = $2`,
          [retLoc, item.id]
        );
        return res.json({
          success: true, type: 'item', status: 'unloaded',
          name: item.name, barcode: item.barcode,
          message: `✓ Asset: ${item.name} returned`
        });
      }
    }

    // Nothing found
    return res.status(404).json({
      success: false,
      status: 'not_found',
      barcode: barcodeClean,
      error: `No box or asset with barcode "${barcodeClean}"`
    });

  } catch (err) {
    next(err);
  }
});

// POST /api/scan/sessions
// Body: { id, mode, truck_id, truck_name, started_at, finished_at, scans[] }
router.post('/sessions', async (req, res, next) => {
  try {
    const { id, mode, truck_id, truck_name, started_at, finished_at, scans } = req.body;

    if (!id || !mode || !finished_at || !Array.isArray(scans)) {
      return res.status(400).json({ success: false, error: 'id, mode, finished_at and scans are required' });
    }
    if (!['load', 'unload'].includes(mode)) {
      return res.status(400).json({ success: false, error: 'mode must be "load" or "unload"' });
    }

    const ok   = scans.filter(s => s.status === 'loaded' || s.status === 'unloaded').length;
    const dupe = scans.filter(s => s.status === 'already_loaded').length;
    const err  = scans.filter(s => s.status === 'not_found').length;

    await pool.query(
      `INSERT INTO scan_sessions
         (id, mode, truck_id, truck_name, started_at, finished_at,
          total_scanned, ok_count, duplicate_count, not_found_count, scans)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO NOTHING`,
      [
        id, mode,
        truck_id || null,
        truck_name || null,
        started_at || finished_at,
        finished_at,
        scans.length, ok, dupe, err,
        JSON.stringify(scans)
      ]
    );

    res.json({ success: true, id });
  } catch (err) {
    next(err);
  }
});

// GET /api/scan/sessions
// Query params: truck_id (optional), limit (default 50, max 200)
router.get('/sessions', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const params = [];
    let where = '';
    if (req.query.truck_id) {
      params.push(req.query.truck_id);
      where = ' WHERE truck_id = $1';
    }
    params.push(limit);
    const result = await pool.query(
      `SELECT id, mode, truck_id, truck_name, started_at, finished_at,
              total_scanned, ok_count, duplicate_count, not_found_count
       FROM scan_sessions${where}
       ORDER BY finished_at DESC
       LIMIT $${params.length}`,
      params
    );
    res.json({ success: true, sessions: result.rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/scan/sessions/:id
router.get('/sessions/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT * FROM scan_sessions WHERE id = $1`,
      [req.params.id]
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    res.json({ success: true, session: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
