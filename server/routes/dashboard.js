const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// GET /api/dashboard/alerts
// Returns low-stock inventory items and maintenance-due assets in one query
router.get('/alerts', async (req, res, next) => {
  try {
    const [lowStock, maintenance] = await Promise.all([
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
      `)
    ]);

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
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
