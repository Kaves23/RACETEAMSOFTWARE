const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// POST /api/inventory/pack - Pack inventory item into box (with quantity)
router.post('/pack', async (req, res, next) => {
  try {
    const { boxId, itemId, quantity } = req.body;
    
    console.log('📦 /api/inventory/pack called:', { boxId, itemId, quantity });
    
    if (!boxId || !itemId) {
      console.error('❌ Missing fields:', { boxId, itemId });
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: boxId, itemId',
        received: { boxId, itemId, quantity }
      });
    }
    
    const quantityToPack = parseInt(quantity) || 1;
    
    if (quantityToPack <= 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Quantity must be greater than 0' 
      });
    }
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get current inventory item
      const invResult = await client.query(
        'SELECT * FROM inventory WHERE id = $1',
        [itemId]
      );
      
      if (invResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Inventory item not found' });
      }
      
      const inventoryItem = invResult.rows[0];
      
      // Calculate already packed quantity across all boxes
      const packedResult = await client.query(
        `SELECT COALESCE(SUM(quantity_packed), 0) as total_packed 
         FROM box_contents 
         WHERE item_id = $1 AND item_type = 'inventory'`,
        [itemId]
      );
      
      const alreadyPacked = parseInt(packedResult.rows[0].total_packed) || 0;
      const availableQuantity = inventoryItem.quantity - alreadyPacked;
      
      if (quantityToPack > availableQuantity) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          success: false, 
          error: `Insufficient quantity. Available: ${availableQuantity}, Requested: ${quantityToPack}` 
        });
      }
      
      // Check if this item is already in this box
      const existingEntry = await client.query(
        'SELECT * FROM box_contents WHERE box_id = $1 AND item_id = $2 AND item_type = \'inventory\'',
        [boxId, itemId]
      );
      
      if (existingEntry.rows.length > 0) {
        // Update existing entry - add to quantity
        await client.query(
          `UPDATE box_contents 
           SET quantity_packed = quantity_packed + $1, packed_at = NOW() 
           WHERE box_id = $2 AND item_id = $3 AND item_type = 'inventory'`,
          [quantityToPack, boxId, itemId]
        );
      } else {
        // Create new box_contents entry
        await client.query(
          `INSERT INTO box_contents (box_id, item_id, item_type, quantity_packed, packed_at)
           VALUES ($1, $2, 'inventory', $3, NOW())`,
          [boxId, itemId, quantityToPack]
        );
      }
      
      // Don't update current_box_id for inventory - it can be in multiple boxes
      // Just update the timestamp
      await client.query(
        'UPDATE inventory SET updated_at = NOW() WHERE id = $1',
        [itemId]
      );
      
      await client.query('COMMIT');
      
      res.json({ 
        success: true, 
        message: `Packed ${quantityToPack} units into box`,
        item: inventoryItem,
        quantityPacked: quantityToPack,
        totalPacked: alreadyPacked + quantityToPack,
        availableQuantity: availableQuantity - quantityToPack
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
});

// POST /api/inventory/unpack - Unpack inventory item from box (specific box or all boxes)
router.post('/unpack', async (req, res, next) => {
  try {
    const { itemId, boxId, quantity } = req.body;
    
    if (!itemId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required field: itemId' 
      });
    }
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      if (boxId) {
        // Unpack from specific box
        const quantityToUnpack = parseInt(quantity) || null;
        
        if (quantityToUnpack && quantityToUnpack > 0) {
          // Unpack specific quantity
          const currentEntry = await client.query(
            'SELECT * FROM box_contents WHERE box_id = $1 AND item_id = $2 AND item_type = \'inventory\'',
            [boxId, itemId]
          );
          
          if (currentEntry.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Item not found in this box' });
          }
          
          const currentQty = currentEntry.rows[0].quantity_packed;
          
          if (quantityToUnpack >= currentQty) {
            // Remove entire entry
            await client.query(
              `DELETE FROM box_contents WHERE box_id = $1 AND item_id = $2 AND item_type = 'inventory'`,
              [boxId, itemId]
            );
          } else {
            // Reduce quantity
            await client.query(
              `UPDATE box_contents 
               SET quantity_packed = quantity_packed - $1 
               WHERE box_id = $2 AND item_id = $3 AND item_type = 'inventory'`,
              [quantityToUnpack, boxId, itemId]
            );
          }
        } else {
          // Remove all from this box
          await client.query(
            `DELETE FROM box_contents WHERE box_id = $1 AND item_id = $2 AND item_type = 'inventory'`,
            [boxId, itemId]
          );
        }
      } else {
        // Remove from ALL boxes
        await client.query(
          `DELETE FROM box_contents WHERE item_id = $1 AND item_type = 'inventory'`,
          [itemId]
        );
      }
      
      // Update inventory item timestamp
      const result = await client.query(
        'UPDATE inventory SET updated_at = NOW() WHERE id = $1 RETURNING *',
        [itemId]
      );
      
      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Inventory item not found' });
      }
      
      await client.query('COMMIT');
      
      res.json({ success: true, item: result.rows[0] });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
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
