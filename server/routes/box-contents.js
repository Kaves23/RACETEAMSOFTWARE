const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// GET /api/box-contents - Get all box contents
router.get('/', async (req, res, next) => {
  try {
    const query = `
      SELECT 
        bc.*,
        i.name as item_name, 
        i.barcode as item_barcode, 
        i.item_type, 
        i.category,
        b.name as box_name,
        b.barcode as box_barcode
      FROM box_contents bc
      JOIN items i ON bc.item_id = i.id
      JOIN boxes b ON bc.box_id = b.id
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
    const boxCheck = await pool.query('SELECT id, status FROM boxes WHERE id = $1', [box_id]);
    if (boxCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Box not found' });
    }
    
    // Check if item exists
    const itemCheck = await pool.query('SELECT id, current_box_id FROM items WHERE id = $1', [item_id]);
    if (itemCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }
    
    // Check if item is already in another box
    if (itemCheck.rows[0].current_box_id && itemCheck.rows[0].current_box_id !== box_id) {
      return res.status(400).json({ 
        success: false, 
        error: `Item is already packed in box ${itemCheck.rows[0].current_box_id}` 
      });
    }
    
    // Start transaction
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
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
      
      const result = await client.query(insertQuery, [
        box_id, 
        item_id, 
        packed_by_user_id || 'admin-001',
        position_in_box || null
      ]);
      
      // Update item's current_box_id
      await client.query(
        'UPDATE items SET current_box_id = $1, updated_at = NOW() WHERE id = $2',
        [box_id, item_id]
      );
      
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

// GET /api/box-contents/:box_id - Get all items in a box
router.get('/:box_id', async (req, res, next) => {
  try {
    const { box_id } = req.params;
    
    const query = `
      SELECT 
        bc.*,
        i.name, i.barcode as item_barcode, i.item_type, i.category, 
        i.description, i.weight_kg, i.status as item_status,
        u.username as packed_by_username
      FROM box_contents bc
      JOIN items i ON bc.item_id = i.id
      LEFT JOIN users u ON bc.packed_by_user_id = u.id
      WHERE bc.box_id = $1
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
