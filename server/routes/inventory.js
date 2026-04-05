const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// POST /api/inventory/pack - Pack inventory item into box
router.post('/pack', async (req, res, next) => {
  try {
    const { boxId, itemId } = req.body;
    
    if (!boxId || !itemId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: boxId, itemId' 
      });
    }
    
    // Update inventory item's current_box_id
    const result = await pool.query(
      'UPDATE inventory SET current_box_id = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [boxId, itemId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Inventory item not found' });
    }
    
    // Also create box_contents entry
    await pool.query(
      `INSERT INTO box_contents (box_id, item_id, item_type, packed_at)
       VALUES ($1, $2, 'inventory', NOW())
       ON CONFLICT (box_id, item_id) DO UPDATE SET packed_at = NOW()`,
      [boxId, itemId]
    );
    
    res.json({ success: true, item: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// POST /api/inventory/unpack - Unpack inventory item from box
router.post('/unpack', async (req, res, next) => {
  try {
    const { itemId } = req.body;
    
    if (!itemId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required field: itemId' 
      });
    }
    
    // Clear inventory item's current_box_id
    const result = await pool.query(
      'UPDATE inventory SET current_box_id = NULL, updated_at = NOW() WHERE id = $1 RETURNING *',
      [itemId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Inventory item not found' });
    }
    
    // Remove from box_contents
    await pool.query(
      `DELETE FROM box_contents WHERE item_id = $1 AND item_type = 'inventory'`,
      [itemId]
    );
    
    res.json({ success: true, item: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// PUT /api/inventory/:id - Update inventory item
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Build dynamic UPDATE query
    const fields = [];
    const values = [];
    let paramCount = 1;
    
    const allowedFields = [
      'name', 'sku', 'category', 'description', 'quantity', 
      'min_quantity', 'unit', 'unit_cost', 'location_id', 
      'supplier', 'last_restocked_date', 'notes', 
      'current_box_id', 'location_distribution'
    ];
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }
    
    if (fields.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid fields to update' });
    }
    
    fields.push(`updated_at = NOW()`);
    values.push(id);
    
    const query = `UPDATE inventory SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Inventory item not found' });
    }
    
    res.json({ success: true, item: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/inventory/:id - Delete inventory item
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM inventory WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Inventory item not found' });
    }
    
    // Also remove from box_contents if packed
    await pool.query(
      `DELETE FROM box_contents WHERE item_id = $1 AND item_type = 'inventory'`,
      [id]
    );
    
    res.json({ success: true, item: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
