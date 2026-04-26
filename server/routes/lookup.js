const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// GET /api/lookup?q=BARCODE
// Unified barcode/name search across boxes, items, and inventory.
// Returns { results: [ { type, record } ] } sorted: exact barcode matches first.
router.get('/', async (req, res, next) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ success: true, results: [] });

    // Parameterised ILIKE pattern — safe, no injection risk
    const like = `%${q}%`;

    const [boxRows, itemRows, invRows] = await Promise.all([
      // Boxes: include location name + truck info
      pool.query(`
        SELECT
          b.id, b.barcode, b.name, b.status, b.box_type,
          b.current_location_id, l.name AS location_name,
          b.current_truck_id, t.name AS truck_name,
          b.item_count, b.current_weight_kg, b.max_weight_kg,
          b.assigned_driver_id, d.name AS driver_name
        FROM boxes b
        LEFT JOIN locations l ON l.id = b.current_location_id
        LEFT JOIN trucks t ON t.id = b.current_truck_id
        LEFT JOIN drivers d ON d.id = b.assigned_driver_id
        WHERE b.barcode ILIKE $1 OR b.name ILIKE $1
        ORDER BY
          CASE WHEN b.barcode = $2 THEN 0 ELSE 1 END,
          b.name
        LIMIT 10
      `, [like, q]),

      // Items / equipment / assets
      pool.query(`
        SELECT
          i.id, i.barcode, i.name, i.item_type, i.category, i.status,
          i.current_box_id, b.name AS box_name,
          i.current_location_id, l.name AS location_name,
          i.serial_number, i.weight_kg, i.value_usd, i.description,
          i.assigned_staff_id, s.name AS assigned_staff_name
        FROM items i
        LEFT JOIN boxes b ON b.id = i.current_box_id
        LEFT JOIN locations l ON l.id = i.current_location_id
        LEFT JOIN staff s ON s.id = i.assigned_staff_id
        WHERE i.barcode ILIKE $1 OR i.name ILIKE $1
        ORDER BY
          CASE WHEN i.barcode = $2 THEN 0 ELSE 1 END,
          i.name
        LIMIT 10
      `, [like, q]),

      // Inventory (consumables/parts)
      pool.query(`
        SELECT
          inv.id, inv.sku, inv.name, inv.category, inv.quantity,
          inv.unit, inv.min_quantity,
          inv.shopify_variant_id, inv.shopify_product_id,
          inv.location_id, l.name AS location_name
        FROM inventory inv
        LEFT JOIN locations l ON l.id = inv.location_id
        WHERE inv.sku ILIKE $1 OR inv.name ILIKE $1
        ORDER BY
          CASE WHEN inv.sku = $2 THEN 0 ELSE 1 END,
          inv.name
        LIMIT 10
      `, [like, q])
    ]);

    const results = [
      ...boxRows.rows.map(r => ({ type: 'box', record: r })),
      ...itemRows.rows.map(r => ({ type: 'item', record: r })),
      ...invRows.rows.map(r => ({ type: 'inventory', record: r }))
    ];

    res.json({ success: true, count: results.length, results });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
