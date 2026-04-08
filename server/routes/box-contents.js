const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// GET /api/box-contents - Get all box contents (items + inventory)
router.get('/', async (req, res, next) => {
  try {
    const query = `
      SELECT 
        bc.*,
        COALESCE(i.name, inv.name) as item_name,
        COALESCE(i.barcode, inv.sku) as item_barcode,
        COALESCE(bc.item_type, i.item_type, 'inventory') as item_type,
        COALESCE(i.category, inv.category) as category,
        i.serial_number as serial_number,
        b.name as box_name,
        b.barcode as box_barcode
      FROM box_contents bc
      LEFT JOIN items i ON bc.item_id = i.id AND (bc.item_type IS NULL OR bc.item_type != 'inventory')
      LEFT JOIN inventory inv ON bc.item_id = inv.id AND bc.item_type = 'inventory'
      JOIN boxes b ON bc.box_id = b.id
      WHERE COALESCE(i.id, inv.id) IS NOT NULL
      ORDER BY bc.packed_at DESC
    `;
    
    const result = await pool.query(query);
    
    res.json({
      success: true,
      count: result.rows.length,
      boxContents: result.rows
    });
  } catch (error) {
    console.error('Error fetching box contents:', error);
    next(error);
  }
});

// POST /api/box-contents/pack - Pack item into box
router.post('/pack', async (req, res, next) => {
  try {
    const { box_id, item_id, packed_by_user_id, position_in_box } = req.body;
    
    // Validate required fields
    if (!box_id || !item_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: box_id, item_id' 
      });
    }
    
    // Check if box exists
    const boxCheck = await pool.query('SELECT id, status, max_weight_kg, current_weight_kg FROM boxes WHERE id = $1', [box_id]);
    if (boxCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Box not found' });
    }
    
    // Fix 11: Use authenticated user ID from requireAuth middleware
    const userId = req.user?.userId || packed_by_user_id || null;
    const box = boxCheck.rows[0];

    // Start transaction
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Fix 8: Atomic conditional claim — prevents TOCTOU race condition.
      // UPDATE succeeds only if the item is unpacked OR already in this same box.
      const itemClaim = await client.query(
        `UPDATE items SET current_box_id = $1, updated_at = NOW()
         WHERE id = $2 AND (current_box_id IS NULL OR current_box_id = $1)
         RETURNING id, name, barcode, weight_kg`,
        [box_id, item_id]
      );
      if (itemClaim.rows.length === 0) {
        const exists = await client.query('SELECT id, current_box_id FROM items WHERE id = $1', [item_id]);
        await client.query('ROLLBACK');
        if (exists.rows.length === 0) {
          return res.status(404).json({ success: false, error: 'Item not found' });
        }
        return res.status(409).json({
          success: false,
          error: `Item is already packed in another box (${exists.rows[0].current_box_id})`
        });
      }
      const item = itemClaim.rows[0];

      // Fix 17: Weight limit check (inside transaction so rollback undoes the claim)
      if (box.max_weight_kg && item.weight_kg) {
        const currentWeight = parseFloat(box.current_weight_kg) || 0;
        const itemWeight = parseFloat(item.weight_kg);
        if (currentWeight + itemWeight > parseFloat(box.max_weight_kg)) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            error: `Weight limit exceeded: box capacity is ${box.max_weight_kg}kg, currently ${currentWeight}kg, item weighs ${itemWeight}kg`
          });
        }
      }

      // Auto-assign position if not provided (Fix 12: track position_in_box)
      let resolvedPosition = position_in_box;
      if (resolvedPosition === undefined || resolvedPosition === null) {
        const maxPosResult = await client.query(
          'SELECT COALESCE(MAX(position_in_box), 0) + 1 AS next_pos FROM box_contents WHERE box_id = $1',
          [box_id]
        );
        resolvedPosition = maxPosResult.rows[0].next_pos;
      }

      // Add to box_contents
      const insertQuery = `
        INSERT INTO box_contents (box_id, item_id, packed_by_user_id, position_in_box)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (box_id, item_id) DO UPDATE SET
          packed_at = NOW(),
          packed_by_user_id = EXCLUDED.packed_by_user_id,
          position_in_box = EXCLUDED.position_in_box
        RETURNING *
      `;
      
      const result = await client.query(insertQuery, [box_id, item_id, userId, resolvedPosition]);
      
      // Fix 9: Recalculate and update box current_weight_kg and item_count from all packed items
      await client.query(`
        UPDATE boxes
        SET current_weight_kg = (
          SELECT COALESCE(SUM(i.weight_kg), 0)
          FROM box_contents bc
          JOIN items i ON i.id = bc.item_id
          WHERE bc.box_id = $1 AND i.weight_kg IS NOT NULL AND bc.item_type != 'inventory'
        ),
        item_count = (
          SELECT COUNT(*) FROM box_contents bc WHERE bc.box_id = $1
        ),
        updated_at = NOW()
        WHERE id = $1
      `, [box_id]);

      // Fix 3: Write to item_history audit log
      await client.query(`
        INSERT INTO item_history (id, item_id, action, to_box_id, performed_by_user_id, timestamp)
        VALUES ($1, $2, 'packed', $3, $4, NOW())
      `, [`hist-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`, item_id, box_id, userId]);
      
      await client.query('COMMIT');
      
      res.status(201).json({ 
        success: true, 
        message: 'Item packed successfully',
        record: result.rows[0] 
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

// POST /api/box-contents/unpack - Unpack item from box
router.post('/unpack', async (req, res, next) => {
  try {
    const { box_id, item_id } = req.body;
    
    // Validate required fields
    if (!box_id || !item_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: box_id, item_id' 
      });
    }
    
    const userId = req.user?.userId || null;

    // Start transaction
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Remove from box_contents
      const deleteQuery = 'DELETE FROM box_contents WHERE box_id = $1 AND item_id = $2 RETURNING *';
      const result = await client.query(deleteQuery, [box_id, item_id]);
      
      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ 
          success: false, 
          error: 'Item not found in this box' 
        });
      }
      
      // Clear item's current_box_id
      await client.query(
        'UPDATE items SET current_box_id = NULL, updated_at = NOW() WHERE id = $1',
        [item_id]
      );
      
      // Fix 9: Recalculate box weight and item_count after unpacking
      await client.query(`
        UPDATE boxes
        SET current_weight_kg = (
          SELECT COALESCE(SUM(i.weight_kg), 0)
          FROM box_contents bc
          JOIN items i ON i.id = bc.item_id
          WHERE bc.box_id = $1 AND i.weight_kg IS NOT NULL AND bc.item_type != 'inventory'
        ),
        item_count = (
          SELECT COUNT(*) FROM box_contents bc WHERE bc.box_id = $1
        ),
        updated_at = NOW()
        WHERE id = $1
      `, [box_id]);

      // Fix 3: Write to item_history audit log
      await client.query(`
        INSERT INTO item_history (id, item_id, action, from_box_id, performed_by_user_id, timestamp)
        VALUES ($1, $2, 'unpacked', $3, $4, NOW())
      `, [`hist-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`, item_id, box_id, userId]);
      
      await client.query('COMMIT');
      
      res.json({ 
        success: true, 
        message: 'Item unpacked successfully',
        record: result.rows[0] 
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

// GET /api/box-contents/:box_id - Get all items in a box (items + inventory)
router.get('/:box_id', async (req, res, next) => {
  try {
    const { box_id } = req.params;
    
    const query = `
      SELECT 
        bc.*,
        COALESCE(i.name, inv.name) as name,
        COALESCE(i.barcode, inv.sku) as item_barcode,
        COALESCE(bc.item_type, i.item_type, 'inventory') as item_type,
        COALESCE(i.category, inv.category) as category,
        COALESCE(i.description, inv.description) as description,
        COALESCE(i.weight_kg, 0) as weight_kg,
        COALESCE(i.status, 'available') as item_status,
        i.serial_number as serial_number,
        u.username as packed_by_username
      FROM box_contents bc
      LEFT JOIN items i ON bc.item_id = i.id AND (bc.item_type IS NULL OR bc.item_type != 'inventory')
      LEFT JOIN inventory inv ON bc.item_id = inv.id AND bc.item_type = 'inventory'
      LEFT JOIN users u ON bc.packed_by_user_id = u.id
      WHERE bc.box_id = $1
        AND COALESCE(i.id, inv.id) IS NOT NULL
      ORDER BY bc.packed_at DESC
    `;
    
    const result = await pool.query(query, [box_id]);
    
    res.json({ 
      success: true, 
      box_id,
      count: result.rows.length,
      contents: result.rows 
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/box-contents/:box_id/clear - Unpack all items from a box
router.delete('/:box_id/clear', async (req, res, next) => {
  try {
    const { box_id } = req.params;
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get all items in the box
      const items = await client.query('SELECT item_id FROM box_contents WHERE box_id = $1', [box_id]);
      
      // Clear all items' current_box_id
      if (items.rows.length > 0) {
        const itemIds = items.rows.map(r => r.item_id);
        await client.query(
          'UPDATE items SET current_box_id = NULL, updated_at = NOW() WHERE id = ANY($1::text[])',
          [itemIds]
        );
      }
      
      // Remove all from box_contents
      const result = await client.query('DELETE FROM box_contents WHERE box_id = $1 RETURNING *', [box_id]);
      
      await client.query('COMMIT');
      
      res.json({ 
        success: true, 
        message: `Unpacked ${result.rows.length} items from box`,
        count: result.rows.length
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

module.exports = router;
