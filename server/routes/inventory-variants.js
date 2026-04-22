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
// Body: { parentId, label, qty_a, qty_b, qty_c, notes, sort_order }
router.post('/', async (req, res, next) => {
  try {
    const { parentId, label, qty_a = 0, qty_b = 0, qty_c = 0, notes = '', sort_order = 0 } = req.body;

    if (!parentId || !label) {
      return res.status(400).json({ success: false, error: 'parentId and label are required' });
    }

    const id = genId();

    const result = await pool.query(
      `INSERT INTO inventory_variants (id, parent_id, label, qty_a, qty_b, qty_c, notes, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [id, parentId, label.trim(), Math.max(0, parseInt(qty_a) || 0),
       Math.max(0, parseInt(qty_b) || 0), Math.max(0, parseInt(qty_c) || 0),
       notes || '', parseInt(sort_order) || 0]
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
// Update a variant's quantities, label, or notes.
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { label, qty_a, qty_b, qty_c, notes, sort_order } = req.body;

    const fields  = [];
    const values  = [];
    let   pCount  = 1;

    if (label      !== undefined) { fields.push(`label = $${pCount++}`);      values.push(label.trim()); }
    if (qty_a      !== undefined) { fields.push(`qty_a = $${pCount++}`);      values.push(Math.max(0, parseInt(qty_a) || 0)); }
    if (qty_b      !== undefined) { fields.push(`qty_b = $${pCount++}`);      values.push(Math.max(0, parseInt(qty_b) || 0)); }
    if (qty_c      !== undefined) { fields.push(`qty_c = $${pCount++}`);      values.push(Math.max(0, parseInt(qty_c) || 0)); }
    if (notes      !== undefined) { fields.push(`notes = $${pCount++}`);      values.push(notes); }
    if (sort_order !== undefined) { fields.push(`sort_order = $${pCount++}`); values.push(parseInt(sort_order) || 0); }

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
