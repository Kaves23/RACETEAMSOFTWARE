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
      `SELECT b.id, b.name, b.barcode, b.current_truck_id,
              lpb.truck_zone, lpb.load_order
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
      loaded: r.current_truck_id === truck_id
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
        if (box.current_truck_id === truck_id) {
          return res.json({
            success: true, type: 'box', status: 'already_loaded',
            name: box.name, barcode: box.barcode,
            message: `Already on truck: ${box.name}`
          });
        }

        await pool.query(
          `UPDATE boxes SET current_truck_id = $1, updated_at = NOW() WHERE id = $2`,
          [truck_id, box.id]
        );

        // Look up zone from current draft plan
        const zoneResult = await pool.query(
          `SELECT lpb.truck_zone FROM load_plan_boxes lpb
           JOIN load_plans lp ON lp.id = lpb.load_plan_id
           WHERE lpb.box_id = $1 AND lp.truck_id = $2 AND lp.status = 'Draft'
           ORDER BY lp.updated_at DESC LIMIT 1`,
          [box.id, truck_id]
        );
        const zone = zoneResult.rows.length > 0 ? zoneResult.rows[0].truck_zone : null;

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

module.exports = router;
