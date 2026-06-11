const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// GET /api/dashboard/alerts
// Returns low-stock inventory items, maintenance-due assets, and assets currently out.
// "Assets out" includes both active checkouts and item assets packed/loaded onto a truck.
router.get('/alerts', async (req, res, next) => {
  try {
    const [lowStock, maintenance, assetsOut] = await Promise.all([
      pool.query(`
        SELECT id, name, sku, quantity, min_quantity
        FROM inventory
        WHERE min_quantity > 0 AND quantity <= min_quantity
        ORDER BY (quantity::float / NULLIF(min_quantity,0)) ASC, name ASC
        LIMIT 50
      `),
      pool.query(`
        SELECT id, name, barcode, next_maintenance_date,
               (next_maintenance_date::date - CURRENT_DATE) AS days_until_due
        FROM items
        WHERE next_maintenance_date IS NOT NULL
          AND next_maintenance_date::date <= CURRENT_DATE + INTERVAL '30 days'
        ORDER BY next_maintenance_date ASC
        LIMIT 50
      `),
      pool.query(`
        WITH checked_out_items AS (
          SELECT DISTINCT ac.item_id
          FROM asset_checkouts ac
          WHERE ac.status IN ('active', 'overdue')
        ),
        packed_truck_items AS (
          SELECT DISTINCT epi.item_id
          FROM event_packing_items epi
          WHERE epi.item_id IS NOT NULL
            AND epi.status IN ('packed', 'loaded')
            AND (
              NULLIF(TRIM(COALESCE(epi.truck_name, '')), '') IS NOT NULL
              OR NULLIF(TRIM(COALESCE(epi.truck_zone, '')), '') IS NOT NULL
              OR epi.loaded_at IS NOT NULL
            )
        ),
        assets_out AS (
          SELECT item_id, 'checked_out' AS source FROM checked_out_items
          UNION
          SELECT item_id, 'truck_packed' AS source FROM packed_truck_items
        )
        SELECT
          COUNT(DISTINCT item_id) AS count,
          COUNT(DISTINCT CASE WHEN source = 'checked_out' THEN item_id END) AS checked_out_count,
          COUNT(DISTINCT CASE WHEN source = 'truck_packed' THEN item_id END) AS truck_packed_count
        FROM assets_out
      `)
    ]);

    const assetsOutRow = assetsOut.rows[0] || {};

    res.json({
      success: true,
      lowStock: {
        count: lowStock.rows.length,
        items: lowStock.rows
      },
      maintenanceDue: {
        count: maintenance.rows.length,
        overdueCount: maintenance.rows.filter(r => r.days_until_due < 0).length,
        items: maintenance.rows
      },
      assetsOut: {
        count: Number(assetsOutRow.count) || 0,
        checkedOutCount: Number(assetsOutRow.checked_out_count) || 0,
        truckPackedCount: Number(assetsOutRow.truck_packed_count) || 0
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
