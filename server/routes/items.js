const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// GET /api/items - Get all items
router.get('/', async (req, res, next) => {
  try {
    const { item_type, category, status, current_box_id, search } = req.query;
    
    // Only select columns needed by frontend for better performance
    let query = `SELECT 
      id, barcode, name, serial_number, category, item_type, 
      status, current_box_id, current_location_id, weight_kg, 
      value_usd, description, created_at, updated_at
    FROM items WHERE 1=1`;
    const params = [];
    let paramCount = 1;
    
    if (item_type) {
      query += ` AND item_type = $${paramCount++}`;
      params.push(item_type);
    }
    
    if (category) {
      query += ` AND category = $${paramCount++}`;
      params.push(category);
    }
    
    if (status) {
      query += ` AND status = $${paramCount++}`;
      params.push(status);
    }
    
    if (current_box_id) {
      query += ` AND current_box_id = $${paramCount++}`;
      params.push(current_box_id);
    }
    
    if (search) {
      query += ` AND (name ILIKE $${paramCount} OR barcode ILIKE $${paramCount} OR description ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }
    
    query += ' ORDER BY created_at DESC';
    
    const result = await pool.query(query, params);
    res.json({ success: true, count: result.rows.length, items: result.rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/items/:id - Get single item
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM items WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }
    
    res.json({ success: true, item: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// GET /api/items/:id/history - Get item history
router.get('/:id/history', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Fetch history from item_history table
    const query = `
      SELECT 
        id,
        item_id,
        action,
        details,
        from_box_id,
        to_box_id,
        from_location_id,
        to_location_id,
        previous_status,
        new_status,
        performed_by_user_id,
        timestamp,
        ip_address
      FROM item_history
      WHERE item_id = $1
      ORDER BY timestamp DESC
      LIMIT 100
    `;
    
    const result = await pool.query(query, [id]);
    
    res.json({ 
      success: true, 
      count: result.rows.length,
      history: result.rows 
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/items - Create new item
router.post('/', async (req, res, next) => {
  try {
    const {
      barcode,
      name,
      item_type,
      category,
      description,
      current_box_id,
      current_location_id,
      last_maintenance_date,
      next_maintenance_date,
      weight,
      value,
      serial_number,
      status
    } = req.body;
    
    // Validate required fields
    if (!name || !item_type) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: name, item_type' 
      });
    }
    
    // Generate ID and barcode if not provided
    const id = barcode || `ITEM-${Date.now().toString(36).toUpperCase()}`;
    const finalBarcode = barcode || id;
    
    const query = `
      INSERT INTO items (
        id, barcode, name, item_type, category, description,
        current_box_id, current_location_id, last_maintenance_date,
        next_maintenance_date, weight_kg, value_usd, serial_number, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (barcode) DO UPDATE SET
        name = EXCLUDED.name,
        item_type = EXCLUDED.item_type,
        category = EXCLUDED.category,
        description = EXCLUDED.description,
        updated_at = NOW()
      RETURNING *
    `;
    
    const values = [
      id,
      finalBarcode,
      name,
      item_type,
      category || null,
      description || null,
      current_box_id || null,
      current_location_id || null,
      last_maintenance_date || null,
      next_maintenance_date || null,
      weight || null,
      value || null,
      serial_number || null,
      status || 'warehouse'
    ];
    
    const result = await pool.query(query, values);
    res.status(201).json({ success: true, item: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      const detail = (error.detail || '').toLowerCase();
      const constraint = (error.constraint || '').toLowerCase();
      console.error('409 unique violation — constraint:', error.constraint, 'detail:', error.detail);
      if (detail.includes('serial_number') || constraint.includes('serial')) {
        return res.status(409).json({ success: false, error: 'An item with this serial number already exists. Use a different serial number.' });
      }
      if (detail.includes('(id)') && !detail.includes('barcode')) {
        return res.status(409).json({ success: false, error: 'ID conflict — please leave the barcode field blank to auto-generate a unique ID.' });
      }
      return res.status(409).json({ success: false, error: 'An item with this barcode already exists. Use a different barcode.' });
    }
    next(error);
  }
});

// PUT /api/items/:id - Update item
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      name,
      item_type,
      category,
      description,
      current_box_id,
      current_location_id,
      last_maintenance_date,
      next_maintenance_date,
      weight,
      value,
      serial_number,
      status
    } = req.body;
    
    const query = `
      UPDATE items
      SET name = COALESCE($1, name),
          item_type = COALESCE($2, item_type),
          category = COALESCE($3, category),
          description = COALESCE($4, description),
          current_box_id = COALESCE($5, current_box_id),
          current_location_id = COALESCE($6, current_location_id),
          last_maintenance_date = COALESCE($7, last_maintenance_date),
          next_maintenance_date = COALESCE($8, next_maintenance_date),
          weight_kg = COALESCE($9, weight_kg),
          value_usd = COALESCE($10, value_usd),
          serial_number = COALESCE($11, serial_number),
          status = COALESCE($12, status),
          updated_at = NOW()
      WHERE id = $13
      RETURNING *
    `;
    
    const values = [
      name, item_type, category, description, current_box_id,
      current_location_id, last_maintenance_date, next_maintenance_date,
      weight, value, serial_number, status, id
    ];
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }
    
    res.json({ success: true, item: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/items/:id - Delete item
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Remove from any boxes first
    await pool.query('DELETE FROM box_contents WHERE item_id = $1', [id]);
    
    const result = await pool.query('DELETE FROM items WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }
    
    res.json({ success: true, message: 'Item deleted', item: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// POST /api/items/pack - Pack item into box
router.post('/pack', async (req, res, next) => {
  try {
    const { boxId, itemId } = req.body;
    
    if (!boxId || !itemId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: boxId, itemId' 
      });
    }
    
    const userId = req.user?.userId || null;

    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Fetch box to check weight limit
      const boxRow = await client.query('SELECT id, max_weight_kg, current_weight_kg FROM boxes WHERE id = $1', [boxId]);
      if (boxRow.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Box not found' });
      }

      // Fix 8: Atomic conditional claim — prevents TOCTOU race condition.
      // UPDATE succeeds only if the item is unpacked OR already in this same box.
      const result = await client.query(
        'UPDATE items SET current_box_id = $1, updated_at = NOW() WHERE id = $2 AND (current_box_id IS NULL OR current_box_id = $1) RETURNING *',
        [boxId, itemId]
      );
      
      if (result.rows.length === 0) {
        const exists = await client.query('SELECT id, current_box_id FROM items WHERE id = $1', [itemId]);
        await client.query('ROLLBACK');
        if (exists.rows.length === 0) {
          return res.status(404).json({ success: false, error: 'Item not found' });
        }
        return res.status(409).json({
          success: false,
          error: `Item is already packed in another box (${exists.rows[0].current_box_id})`
        });
      }

      // Fix 17: Weight limit check (inside transaction so rollback undoes the claim)
      const box = boxRow.rows[0];
      const item = result.rows[0];
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
      
      // Remove any stale box_contents entries for this item in OTHER boxes (data reconciliation)
      await client.query(
        "DELETE FROM box_contents WHERE item_id = $1 AND box_id != $2 AND item_type IN ('equipment', 'asset')",
        [itemId, boxId]
      );

      // Check if box_contents entry already exists for THIS box
      const existingContent = await client.query(
        "SELECT * FROM box_contents WHERE box_id = $1 AND item_id = $2 AND item_type IN ('equipment', 'asset')",
        [boxId, itemId]
      );
      
      if (existingContent.rows.length === 0) {
        // Auto-assign position
        const maxPosResult = await client.query(
          'SELECT COALESCE(MAX(position_in_box), 0) + 1 AS next_pos FROM box_contents WHERE box_id = $1',
          [boxId]
        );
        const position = maxPosResult.rows[0].next_pos;
        await client.query(
          `INSERT INTO box_contents (box_id, item_id, item_type, packed_by_user_id, position_in_box, packed_at)
           VALUES ($1, $2, 'equipment', $3, $4, NOW())`,
          [boxId, itemId, userId, position]
        );
      } else {
        await client.query(
          "UPDATE box_contents SET packed_at = NOW(), packed_by_user_id = $3 WHERE box_id = $1 AND item_id = $2 AND item_type IN ('equipment', 'asset')",
          [boxId, itemId, userId]
        );
      }
      
      // Fix 9: Recalculate box weight and item count
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
      `, [boxId]);

      // Fix 3: Write to item_history
      await client.query(
        "INSERT INTO item_history (id, item_id, action, to_box_id, performed_by_user_id, timestamp) VALUES ($1, $2, 'packed', $3, $4, NOW())",
        [`hist-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`, itemId, boxId, userId]
      );
      
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

// POST /api/items/unpack - Unpack item from box
router.post('/unpack', async (req, res, next) => {
  try {
    const { boxId, itemId } = req.body;
    
    if (!itemId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required field: itemId' 
      });
    }
    
    const userId = req.user?.userId || null;
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get the box ID before clearing it
      const itemBefore = await client.query('SELECT current_box_id FROM items WHERE id = $1', [itemId]);
      const fromBoxId = boxId || (itemBefore.rows[0]?.current_box_id) || null;

      // Clear item's current_box_id
      const result = await client.query(
        'UPDATE items SET current_box_id = NULL, updated_at = NOW() WHERE id = $1 RETURNING *',
        [itemId]
      );
      
      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Item not found' });
      }
      
      // Remove from box_contents table
      await client.query(
        "DELETE FROM box_contents WHERE item_id = $1 AND item_type IN ('equipment', 'asset')",
        [itemId]
      );

      // Fix 9: Recalculate box weight and item count if we know which box it came from
      if (fromBoxId) {
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
        `, [fromBoxId]);
      }

      // Fix 3: Write to item_history
      await client.query(
        "INSERT INTO item_history (id, item_id, action, from_box_id, performed_by_user_id, timestamp) VALUES ($1, $2, 'unpacked', $3, $4, NOW())",
        [`hist-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`, itemId, fromBoxId, userId]
      );
      
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

module.exports = router;
