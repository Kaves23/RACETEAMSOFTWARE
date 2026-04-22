const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

// ─── helpers ──────────────────────────────────────────────────────────────────
function genId() {
  return 'iv-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

// ─── GET /api/inventory-variants/:parentId  ───────────────────────────────────
// Return all variants for a given parent inventory item, ordered by sort_order then label.
router.get('/:parentId', async (req, res, next) => {
  try {
    const { parentId } = req.params;
    const result = await pool.query(
      `SELECT * FROM inventory_variants WHERE parent_id = $1 ORDER BY sort_order ASC, label ASC`,
      [parentId]
    );
    res.json({ success: true, variants: result.rows });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/inventory-variants  ───────────────────────────────────────────
// Create a new variant (and mark parent as has_variants=true).
// Body: { parentId, label, part_number, qty_a, qty_b, qty_c, notes, sort_order, location_stock }
// If location_stock is provided, qty_a/b/c are computed from it; explicit values used otherwise.
router.post('/', async (req, res, next) => {
  try {
    const { parentId, label, part_number = '', notes = '', sort_order = 0 } = req.body;
    let { qty_a = 0, qty_b = 0, qty_c = 0, location_stock } = req.body;

    if (!parentId || !label) {
      return res.status(400).json({ success: false, error: 'parentId and label are required' });
    }

    // If location_stock provided, derive aggregate totals from it
    if (location_stock && typeof location_stock === 'object') {
      qty_a = 0; qty_b = 0; qty_c = 0;
      for (const loc of Object.values(location_stock)) {
        qty_a += Math.max(0, parseInt(loc.a) || 0);
        qty_b += Math.max(0, parseInt(loc.b) || 0);
        qty_c += Math.max(0, parseInt(loc.c) || 0);
      }
    }

    const id = genId();
    const locStock = (location_stock && typeof location_stock === 'object') ? JSON.stringify(location_stock) : '{}';

    const result = await pool.query(
      `INSERT INTO inventory_variants (id, parent_id, label, part_number, qty_a, qty_b, qty_c, notes, sort_order, location_stock)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [id, parentId, label.trim(), (part_number || '').trim(),
       Math.max(0, parseInt(qty_a) || 0), Math.max(0, parseInt(qty_b) || 0),
       Math.max(0, parseInt(qty_c) || 0), notes || '',
       parseInt(sort_order) || 0, locStock]
    );

    // Ensure parent is flagged as having variants
    await pool.query(
      `UPDATE inventory SET has_variants = TRUE, updated_at = NOW() WHERE id = $1`,
      [parentId]
    );

    // Sync parent quantity to sum of all variants
    await syncParentQty(parentId);

    res.json({ success: true, variant: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: `Variant "${req.body.label}" already exists for this item` });
    }
    next(err);
  }
});

// ─── PUT /api/inventory-variants/:id  ────────────────────────────────────────
// Update a variant's quantities, label, notes, part_number, or location_stock.
// If location_stock is provided, qty_a/b/c are recomputed from it.
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { label, part_number, qty_a, qty_b, qty_c, notes, sort_order, location_stock } = req.body;

    const fields  = [];
    const values  = [];
    let   pCount  = 1;

    if (label        !== undefined) { fields.push(`label = $${pCount++}`);        values.push(label.trim()); }
    if (part_number  !== undefined) { fields.push(`part_number = $${pCount++}`);  values.push((part_number || '').trim()); }
    if (notes        !== undefined) { fields.push(`notes = $${pCount++}`);        values.push(notes); }
    if (sort_order   !== undefined) { fields.push(`sort_order = $${pCount++}`);   values.push(parseInt(sort_order) || 0); }

    if (location_stock !== undefined && location_stock !== null && typeof location_stock === 'object') {
      // Compute aggregate totals from location_stock
      let sumA = 0, sumB = 0, sumC = 0;
      for (const loc of Object.values(location_stock)) {
        sumA += Math.max(0, parseInt(loc.a) || 0);
        sumB += Math.max(0, parseInt(loc.b) || 0);
        sumC += Math.max(0, parseInt(loc.c) || 0);
      }
      fields.push(`location_stock = $${pCount++}`); values.push(JSON.stringify(location_stock));
      fields.push(`qty_a = $${pCount++}`);           values.push(sumA);
      fields.push(`qty_b = $${pCount++}`);           values.push(sumB);
      fields.push(`qty_c = $${pCount++}`);           values.push(sumC);
    } else {
      // Explicit qty values (legacy / no location_stock)
      if (qty_a !== undefined) { fields.push(`qty_a = $${pCount++}`); values.push(Math.max(0, parseInt(qty_a) || 0)); }
      if (qty_b !== undefined) { fields.push(`qty_b = $${pCount++}`); values.push(Math.max(0, parseInt(qty_b) || 0)); }
      if (qty_c !== undefined) { fields.push(`qty_c = $${pCount++}`); values.push(Math.max(0, parseInt(qty_c) || 0)); }
    }

    if (fields.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid fields to update' });
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const result = await pool.query(
      `UPDATE inventory_variants SET ${fields.join(', ')} WHERE id = $${pCount} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Variant not found' });
    }

    // Sync parent quantity
    await syncParentQty(result.rows[0].parent_id);

    res.json({ success: true, variant: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: `A variant with that label already exists` });
    }
    next(err);
  }
});

// ─── DELETE /api/inventory-variants/:id  ─────────────────────────────────────
// Delete a single variant. If parent has no variants left, clears has_variants flag.
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const del = await pool.query(
      `DELETE FROM inventory_variants WHERE id = $1 RETURNING *`,
      [id]
    );

    if (del.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Variant not found' });
    }

    const parentId = del.rows[0].parent_id;

    // Check if any variants remain; if not, unset has_variants on parent
    const remaining = await pool.query(
      `SELECT COUNT(*) AS cnt FROM inventory_variants WHERE parent_id = $1`,
      [parentId]
    );

    if (parseInt(remaining.rows[0].cnt) === 0) {
      await pool.query(
        `UPDATE inventory SET has_variants = FALSE, updated_at = NOW() WHERE id = $1`,
        [parentId]
      );
    } else {
      await syncParentQty(parentId);
    }

    res.json({ success: true, deleted: del.rows[0] });
  } catch (err) {
    next(err);
  }
});

// ─── internal: keep parent.quantity in sync ───────────────────────────────────
async function syncParentQty(parentId) {
  await pool.query(
    `UPDATE inventory
     SET quantity = (
       SELECT COALESCE(SUM(qty_a + qty_b + qty_c), 0)
       FROM inventory_variants
       WHERE parent_id = $1
     ),
     updated_at = NOW()
     WHERE id = $1`,
    [parentId]
  );
}

module.exports = router;
