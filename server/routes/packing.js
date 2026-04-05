// Packing Lists & Event Loading API Routes
const express = require('express');
const router = express.Router();
const db = require('../db');

// ============================================
// PACKING LISTS
// ============================================

// GET /api/packing-lists - Get all packing lists
router.get('/', async (req, res) => {
  try {
    const { event_id, status } = req.query;
    
    let sql = `
      SELECT pl.*,
             e.name as event_name,
             e.start_date as event_start,
             COUNT(pi.id) as total_items,
             COUNT(CASE WHEN pi.status = 'packed' THEN 1 END) as packed_items,
             COUNT(CASE WHEN pi.status = 'loaded' THEN 1 END) as loaded_items,
             COUNT(CASE WHEN pi.issue_reported = true THEN 1 END) as issue_items
      FROM event_packing_lists pl
      LEFT JOIN events e ON pl.event_id = e.id
      LEFT JOIN event_packing_items pi ON pl.id = pi.packing_list_id
    `;
    
    const conditions = [];
    const params = [];
    
    if (event_id) {
      conditions.push(`pl.event_id = $${params.length + 1}`);
      params.push(event_id);
    }
    
    if (status) {
      conditions.push(`pl.status = $${params.length + 1}`);
      params.push(status);
    }
    
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    
    sql += ' GROUP BY pl.id, e.name, e.start_date ORDER BY pl.created_at DESC';
    
    const result = await db.query(sql, params);
    res.json({ success: true, lists: result.rows });
  } catch (error) {
    console.error('Error getting packing lists:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/packing-lists/:id - Get single packing list with full details
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const listResult = await db.query(`
      SELECT pl.*,
             e.name as event_name,
             e.start_date as event_start,
             e.circuit as event_location
      FROM event_packing_lists pl
      LEFT JOIN events e ON pl.event_id = e.id
      WHERE pl.id = $1
    `, [id]);
    
    if (listResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Packing list not found' });
    }
    
    const list = listResult.rows[0];
    
    // Get items
    const itemsResult = await db.query(`
      SELECT pi.*,
             i.name as item_system_name,
             b.name as box_name
      FROM event_packing_items pi
      LEFT JOIN items i ON pi.item_id = i.id
      LEFT JOIN boxes b ON pi.box_id = b.id
      WHERE pi.packing_list_id = $1
      ORDER BY pi.category, pi.sort_order, pi.item_name
    `, [id]);
    
    list.items = itemsResult.rows;
    
    // Get stats
    const statsResult = await db.query(`
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'packed' THEN 1 END) as packed,
        COUNT(CASE WHEN status = 'loaded' THEN 1 END) as loaded,
        COUNT(CASE WHEN issue_reported = true THEN 1 END) as issues,
        COALESCE(SUM(quantity), 0) as total_quantity,
        COALESCE(SUM(packed_quantity), 0) as packed_quantity
      FROM event_packing_items
      WHERE packing_list_id = $1
    `, [id]);
    
    list.stats = statsResult.rows[0];
    
    res.json({ success: true, list });
  } catch (error) {
    console.error('Error getting packing list:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/packing-lists - Create new packing list
router.post('/', async (req, res) => {
  try {
    const {
      event_id,
      name,
      description,
      packing_deadline,
      loading_time,
      departure_time,
      created_by
    } = req.body;
    
    // Allow null event_id for GENERAL LIST
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'name is required'
      });
    }
    
    // event_id can be null for GENERAL LIST or custom lists
    // Only validation: name must be provided
    
    const id = require('crypto').randomUUID();
    
    const result = await db.query(`
      INSERT INTO event_packing_lists (
        id, event_id, name, description,
        packing_deadline, loading_time, departure_time,
        created_by, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft')
      RETURNING *
    `, [id, event_id || null, name, description, packing_deadline, loading_time, departure_time, created_by]);
    
    res.json({ success: true, list: result.rows[0] });
  } catch (error) {
    console.error('Error creating packing list:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/packing-lists/:id - Update packing list
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const allowedFields = [
      'name', 'description', 'status',
      'packing_deadline', 'loading_time', 'departure_time'
    ];
    
    const fields = [];
    const values = [];
    
    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = $${values.length + 1}`);
        values.push(updates[key]);
      }
    });
    
    if (fields.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid fields to update' });
    }
    
    fields.push(`updated_at = NOW()`);
    values.push(id);
    
    const sql = `
      UPDATE event_packing_lists
      SET ${fields.join(', ')}
      WHERE id = $${values.length}
      RETURNING *
    `;
    
    const result = await db.query(sql, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Packing list not found' });
    }
    
    res.json({ success: true, list: result.rows[0] });
  } catch (error) {
    console.error('Error updating packing list:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/packing-lists/:id - Delete packing list
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if list exists and get its name
    const checkResult = await db.query(
      'SELECT name FROM event_packing_lists WHERE id = $1',
      [id]
    );
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Packing list not found' });
    }
    
    // Prevent deleting GENERAL LIST
    if (checkResult.rows[0].name === 'GENERAL LIST') {
      return res.status(400).json({ success: false, error: 'Cannot delete GENERAL LIST' });
    }
    
    // Delete all items in the list first
    await db.query('DELETE FROM event_packing_items WHERE list_id = $1', [id]);
    
    // Delete all activity for the list
    await db.query('DELETE FROM event_packing_activity WHERE list_id = $1', [id]);
    
    // Delete the list
    await db.query('DELETE FROM event_packing_lists WHERE id = $1', [id]);
    
    res.json({ success: true, message: 'Packing list deleted' });
  } catch (error) {
    console.error('Error deleting packing list:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// PACKING ITEMS
// ============================================

// GET /api/packing-lists/:listId/items - Get items for a packing list
router.get('/:listId/items', async (req, res) => {
  try {
    const { listId } = req.params;
    const { category, status, source_location } = req.query;
    
    let sql = `
      SELECT pi.*,
             i.name as item_system_name,
             b.name as box_name
      FROM event_packing_items pi
      LEFT JOIN items i ON pi.item_id = i.id
      LEFT JOIN boxes b ON pi.box_id = b.id
      WHERE pi.packing_list_id = $1
    `;
    
    const params = [listId];
    
    if (category) {
      params.push(category);
      sql += ` AND pi.category = $${params.length}`;
    }
    
    if (status) {
      params.push(status);
      sql += ` AND pi.status = $${params.length}`;
    }
    
    if (source_location) {
      params.push(source_location);
      sql += ` AND pi.source_location = $${params.length}`;
    }
    
    sql += ' ORDER BY pi.category, pi.priority DESC, pi.sort_order, pi.item_name';
    
    const result = await db.query(sql, params);
    res.json({ success: true, items: result.rows });
  } catch (error) {
    console.error('Error getting packing items:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/packing-lists/:listId/items - Add item to packing list
router.post('/:listId/items', async (req, res) => {
  try {
    const { listId } = req.params;
    const {
      item_name,
      item_id,
      inventory_id,
      quantity,
      category,
      priority,
      required,
      source_location,
      source_notes
    } = req.body;
    
    if (!item_name) {
      return res.status(400).json({ success: false, error: 'item_name is required' });
    }
    
    const id = require('crypto').randomUUID();
    
    const result = await db.query(`
      INSERT INTO event_packing_items (
        id, packing_list_id, item_name, item_id, inventory_id,
        quantity, category, priority, required,
        source_location, source_notes, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending')
      RETURNING *
    `, [
      id, listId, item_name, item_id || null, inventory_id || null,
      quantity || 1, category || 'general', priority || 'normal',
      required !== false, source_location || null, source_notes || null
    ]);
    
    // Log activity
    await logActivity(listId, id, 'item_added', null, null, `Added: ${item_name}`);
    
    res.json({ success: true, item: result.rows[0] });
  } catch (error) {
    console.error('Error adding packing item:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/packing-lists/:listId/items/:itemId/mark-packed
router.post('/:listId/items/:itemId/mark-packed', async (req, res) => {
  try {
    const { listId, itemId } = req.params;
    const {
      packed_by,
      packed_by_name,
      packed_quantity,
      box_id,
      truck_name,
      truck_zone,
      notes
    } = req.body;
    
    const result = await db.query(`
      UPDATE event_packing_items
      SET status = 'packed',
          packed_by = $1,
          packed_by_name = $2,
          packed_at = NOW(),
          packed_quantity = COALESCE($3, quantity),
          box_id = $4,
          truck_name = $5,
          truck_zone = $6,
          notes = COALESCE($7, notes),
          updated_at = NOW()
      WHERE id = $8 AND packing_list_id = $9
      RETURNING *
    `, [
      packed_by || null,
      packed_by_name || 'Unknown',
      packed_quantity || null,
      box_id || null,
      truck_name || null,
      truck_zone || null,
      notes || null,
      itemId,
      listId
    ]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }
    
    const item = result.rows[0];
    
    // Log activity
    const message = `${packed_by_name} packed ${item.item_name}${truck_name ? ` → ${truck_name}` : ''}`;
    await logActivity(listId, itemId, 'item_packed', packed_by, packed_by_name, message);
    
    res.json({ success: true, item });
  } catch (error) {
    console.error('Error marking item packed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/packing-lists/:listId/items/:itemId/mark-loaded
router.post('/:listId/items/:itemId/mark-loaded', async (req, res) => {
  try {
    const { listId, itemId } = req.params;
    const { loaded_by, loaded_by_name } = req.body;
    
    const result = await db.query(`
      UPDATE event_packing_items
      SET status = 'loaded',
          loaded_by = $1,
          loaded_by_name = $2,
          loaded_at = NOW(),
          updated_at = NOW()
      WHERE id = $3 AND packing_list_id = $4
      RETURNING *
    `, [loaded_by || null, loaded_by_name || 'Unknown', itemId, listId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }
    
    const item = result.rows[0];
    
    // Log activity
    const message = `${loaded_by_name} loaded ${item.item_name} onto truck`;
    await logActivity(listId, itemId, 'item_loaded', loaded_by, loaded_by_name, message);
    
    res.json({ success: true, item });
  } catch (error) {
    console.error('Error marking item loaded:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/packing-lists/:listId/items/:itemId/mark-pending
router.post('/:listId/items/:itemId/mark-pending', async (req, res) => {
  try {
    const { listId, itemId } = req.params;
    const { unmarked_by_name } = req.body;
    
    const result = await db.query(`
      UPDATE event_packing_items
      SET status = 'pending',
          packed_by = NULL,
          packed_by_name = NULL,
          packed_at = NULL,
          loaded_by = NULL,
          loaded_by_name = NULL,
          loaded_at = NULL,
          updated_at = NOW()
      WHERE id = $1 AND packing_list_id = $2
      RETURNING *
    `, [itemId, listId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }
    
    const item = result.rows[0];
    
    // Log activity
    const message = `${unmarked_by_name || 'Someone'} marked ${item.item_name} as pending`;
    await logActivity(listId, itemId, 'item_pending', null, unmarked_by_name, message);
    
    res.json({ success: true, item });
  } catch (error) {
    console.error('Error marking item pending:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/packing-lists/:listId/items/:itemId/report-issue
router.post('/:listId/items/:itemId/report-issue', async (req, res) => {
  try {
    const { listId, itemId } = req.params;
    const { issue_description, reported_by_name } = req.body;
    
    if (!issue_description) {
      return res.status(400).json({ success: false, error: 'issue_description is required' });
    }
    
    const result = await db.query(`
      UPDATE event_packing_items
      SET issue_reported = true,
          issue_description = $1,
          updated_at = NOW()
      WHERE id = $2 AND packing_list_id = $3
      RETURNING *
    `, [issue_description, itemId, listId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }
    
    const item = result.rows[0];
    
    // Log activity
    const message = `⚠️ ${reported_by_name || 'Someone'} reported issue: ${item.item_name} - ${issue_description}`;
    await logActivity(listId, itemId, 'issue_reported', null, reported_by_name, message);
    
    res.json({ success: true, item });
  } catch (error) {
    console.error('Error reporting issue:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/packing-lists/:listId/items/:itemId
router.delete('/:listId/items/:itemId', async (req, res) => {
  try {
    const { listId, itemId } = req.params;
    
    const result = await db.query(`
      DELETE FROM event_packing_items
      WHERE id = $1 AND packing_list_id = $2
      RETURNING item_name
    `, [itemId, listId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Item not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// ACTIVITY FEED
// ============================================

// GET /api/packing-lists/:listId/activity
router.get('/:listId/activity', async (req, res) => {
  try {
    const { listId } = req.params;
    const { since, limit } = req.query;
    
    let sql = `
      SELECT * FROM event_packing_activity
      WHERE packing_list_id = $1
    `;
    
    const params = [listId];
    
    if (since) {
      params.push(since);
      sql += ` AND action_at > $${params.length}`;
    }
    
    sql += ` ORDER BY action_at DESC`;
    
    if (limit) {
      params.push(parseInt(limit));
      sql += ` LIMIT $${params.length}`;
    } else {
      sql += ` LIMIT 50`;
    }
    
    const result = await db.query(sql, params);
    res.json({ success: true, activity: result.rows });
  } catch (error) {
    console.error('Error getting activity:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// TEMPLATES
// ============================================

// POST /api/packing-lists/:listId/create-from-template
router.post('/:listId/create-from-template', async (req, res) => {
  try {
    const { listId } = req.params;
    const { template_id } = req.body;
    
    if (!template_id) {
      return res.status(400).json({ success: false, error: 'template_id is required' });
    }
    
    // Copy template items to packing list
    const result = await db.query(`
      INSERT INTO event_packing_items (
        id, packing_list_id, item_name, item_id, category,
        quantity, priority, required, source_location, notes, status
      )
      SELECT 
        gen_random_uuid()::text,
        $1,
        item_name,
        item_id,
        category,
        quantity,
        priority,
        required,
        typical_location,
        notes,
        'pending'
      FROM packing_template_items
      WHERE template_id = $2
      RETURNING *
    `, [listId, template_id]);
    
    res.json({ success: true, items: result.rows, count: result.rows.length });
  } catch (error) {
    console.error('Error creating from template:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// HELPER FUNCTIONS
// ============================================

async function logActivity(packingListId, itemId, actionType, actionBy, actionByName, message) {
  try {
    const id = require('crypto').randomUUID();
    await db.query(`
      INSERT INTO event_packing_activity (
        id, packing_list_id, packing_item_id, action_type,
        action_by, action_by_name, message
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [id, packingListId, itemId || null, actionType, actionBy || null, actionByName || null, message]);
  } catch (error) {
    console.error('Error logging activity:', error);
    // Don't throw - activity logging shouldn't break the main operation
  }
}

module.exports = router;
