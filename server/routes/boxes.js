const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { logActivity } = require('../lib/activityLog');

// GET /api/boxes - Get all boxes
router.get('/', async (req, res, next) => {
  try {
    const { status, location_id, search, fields } = req.query;

    // Fix 10: Support ?fields=id,name,barcode,status for lightweight list loads
    // Always include item_count (denormalised by trigger – no subquery needed)
    const SAFE_FIELDS = new Set([
      'id','barcode','name','box_type','status','item_count',
      'current_weight_kg','max_weight_kg','current_location_id','current_truck_id',
      'current_zone','rfid_tag','assigned_driver_id','assigned_staff_id','dimensions_length_cm',
      'dimensions_width_cm','dimensions_height_cm','created_at','updated_at'
    ]);
    let selectedFields;
    if (fields) {
      selectedFields = fields.split(',')
        .map(f => f.trim())
        .filter(f => SAFE_FIELDS.has(f))
        .map(f => `b.${f}`);
      if (selectedFields.length === 0) selectedFields = null;
    }
    const selectClause = selectedFields
      ? `${selectedFields.join(', ')}, d.name as assigned_driver_name, st.name as assigned_staff_name`
      : 'b.*, d.name as assigned_driver_name, st.name as assigned_staff_name';

    // Use LATERAL JOIN instead of a correlated subquery — executes once per query,
    // not once per row, and uses idx_lpb_box_added (box_id, added_at DESC).
    let query = `
      SELECT ${selectClause}, latest_lp.truck_id AS load_plan_truck_id, latest_lp.scanned_at AS load_plan_scanned_at
      FROM boxes b
      LEFT JOIN drivers d ON b.assigned_driver_id = d.id
      LEFT JOIN staff st ON b.assigned_staff_id = st.id
      LEFT JOIN LATERAL (
        SELECT lp.truck_id, lpb.scanned_at
        FROM load_plan_boxes lpb
        JOIN load_plans lp ON lp.id = lpb.load_plan_id
        WHERE lpb.box_id = b.id
        ORDER BY lpb.added_at DESC
        LIMIT 1
      ) latest_lp ON true
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;
    
    if (status) {
      query += ` AND b.status = $${paramCount++}`;
      params.push(status);
    }
    
    if (location_id) {
      query += ` AND b.current_location_id = $${paramCount++}`;
      params.push(location_id);
    }
    
    if (search) {
      query += ` AND (b.name ILIKE $${paramCount} OR b.barcode ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }
    
    query += ' ORDER BY b.name ASC';
    
    const result = await pool.query(query, params);
    res.set('Cache-Control', 'private, max-age=15');
    res.json({ success: true, count: result.rows.length, boxes: result.rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/boxes/:id - Get single box
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM boxes WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Box not found' });
    }
    
    // Get contents — LEFT JOINs handle item_type = NULL (physical items),
    // 'item', 'inventory', and any other values gracefully.
    const contents = await pool.query(`
      SELECT bc.box_id, bc.item_id,
             COALESCE(bc.item_type, 'item') AS item_type,
             bc.quantity_packed, bc.position_in_box, bc.packed_at,
             COALESCE(i.name, inv.name)       AS name,
             COALESCE(i.barcode, inv.sku)     AS item_barcode,
             COALESCE(i.category, inv.category) AS category,
             inv.sku
      FROM box_contents bc
      LEFT JOIN items i
        ON bc.item_id = i.id AND (bc.item_type IS NULL OR bc.item_type != 'inventory')
      LEFT JOIN inventory inv
        ON bc.item_id = inv.id AND bc.item_type = 'inventory'
      WHERE bc.box_id = $1
      ORDER BY bc.packed_at DESC
    `, [id]);
    
    res.json({ 
      success: true, 
      box: result.rows[0],
      contents: contents.rows 
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/boxes - Create new box
router.post('/', async (req, res, next) => {
  try {
    const {
      barcode,
      name,
      length,
      width,
      height,
      max_weight,
      current_weight,
      location_id,
      current_truck_id,
      current_zone,
      rfid_tag,
      status,
      box_type,
      assigned_driver_id
    } = req.body;
    
    // Validate required fields
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ 
        success: false, 
        error: 'Box name is required' 
      });
    }
    
    if (length === undefined || length === null || isNaN(length) || length <= 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Valid length is required (must be > 0)' 
      });
    }
    
    if (width === undefined || width === null || isNaN(width) || width <= 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Valid width is required (must be > 0)' 
      });
    }
    
    if (height === undefined || height === null || isNaN(height) || height <= 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Valid height is required (must be > 0)' 
      });
    }
    
    // Generate ID and barcode if not provided
    const id = barcode || `BOX-${Date.now().toString(36).toUpperCase()}`;
    const finalBarcode = barcode || id;
    
    const query = `
      INSERT INTO boxes (
        id, barcode, name, dimensions_length_cm, dimensions_width_cm, dimensions_height_cm, 
        max_weight_kg, current_weight_kg, current_location_id, 
        current_truck_id, current_zone, rfid_tag, status, box_type, assigned_driver_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (barcode) DO UPDATE SET
        name = EXCLUDED.name,
        dimensions_length_cm = EXCLUDED.dimensions_length_cm,
        dimensions_width_cm = EXCLUDED.dimensions_width_cm,
        dimensions_height_cm = EXCLUDED.dimensions_height_cm,
        max_weight_kg = EXCLUDED.max_weight_kg,
        box_type = EXCLUDED.box_type,
        updated_at = NOW()
      RETURNING *
    `;
    
    const values = [
      id,
      finalBarcode,
      name,
      length,
      width,
      height,
      max_weight || null,
      current_weight || 0,
      location_id || null,
      current_truck_id || null,
      current_zone || null,
      rfid_tag || null,
      status || 'warehouse',
      box_type || 'regular',
      assigned_driver_id || null
    ];
    
    const result = await pool.query(query, values);
    logActivity(pool, {
      entityType: 'box', entityId: result.rows[0].id, entityName: result.rows[0].name,
      action: 'created',
      userId: req.user?.userId || null, userName: req.user?.username || null,
      details: { box_type: result.rows[0].box_type, status: result.rows[0].status },
    }).catch(() => {});
    res.status(201).json({ success: true, box: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({ success: false, error: 'Box with this barcode already exists' });
    }
    next(error);
  }
});

// POST /api/boxes/:id/unload - Clear truck assignment and move box to a location
router.post('/:id/unload', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { location_id } = req.body;

    const result = await pool.query(
      `UPDATE boxes
         SET status = 'warehouse',
             current_truck_id = NULL,
             current_zone = NULL,
             current_location_id = $1,
             updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [location_id || null, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Box not found' });
    }

    logActivity(pool, {
      entityType: 'box', entityId: id, entityName: result.rows[0].name,
      action: 'unloaded',
      userId: req.user?.userId || null, userName: req.user?.username || null,
      details: { location_id: location_id || null },
    }).catch(() => {});
    res.json({ success: true, box: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// PUT /api/boxes/:id - Update box
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      name,
      length,
      width,
      height,
      max_weight,
      current_weight,
      location_id,
      current_truck_id,
      current_zone,
      rfid_tag,
      status,
      assigned_driver_id,
      assigned_staff_id,
      notes
    } = req.body;
    
    const query = `
      UPDATE boxes
      SET name = COALESCE($1, name),
          dimensions_length_cm = COALESCE($2, dimensions_length_cm),
          dimensions_width_cm = COALESCE($3, dimensions_width_cm),
          dimensions_height_cm = COALESCE($4, dimensions_height_cm),
          max_weight_kg = COALESCE($5, max_weight_kg),
          current_weight_kg = COALESCE($6, current_weight_kg),
          current_location_id = COALESCE($7, current_location_id),
          current_truck_id = COALESCE($8, current_truck_id),
          current_zone = COALESCE($9, current_zone),
          rfid_tag = COALESCE($10, rfid_tag),
          status = COALESCE($11, status),
          assigned_driver_id = $12,
          assigned_staff_id = $13,
          notes = COALESCE($14, notes),
          updated_at = NOW()
      WHERE id = $15
      RETURNING *
    `;
    
    const values = [
      name, length, width, height, max_weight, current_weight,
      location_id, current_truck_id, current_zone, rfid_tag, status,
      assigned_driver_id !== undefined ? assigned_driver_id : null,
      assigned_staff_id !== undefined ? assigned_staff_id : null,
      notes !== undefined ? notes : null,
      id
    ];
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Box not found' });
    }

    const updated = result.rows[0];
    // Determine what changed for detailed logging
    const changes = {};
    if (name)               changes.name = name;
    if (status)             changes.status = status;
    if (current_truck_id !== undefined) changes.truck_id = current_truck_id;
    if (current_location_id !== undefined) changes.location_id = current_location_id;
    // Pick most specific action label
    let action = 'updated';
    if (current_truck_id && current_truck_id !== 'null') action = 'loaded_to_truck';
    else if (current_truck_id === null || current_truck_id === 'null') action = 'removed_from_truck';
    else if (current_location_id) action = 'location_changed';
    else if (status) action = 'status_changed';

    logActivity(pool, {
      entityType: 'box', entityId: id, entityName: updated.name,
      action,
      userId: req.user?.userId || null, userName: req.user?.username || null,
      details: changes,
    }).catch(() => {});
    res.json({ success: true, box: updated });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/boxes/:id - Delete box
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Cascade delete box_contents first (FK CASCADE also handles this, defence-in-depth)
    await pool.query('DELETE FROM box_contents WHERE box_id = $1', [id]);
    // Remove orphaned entity_tags (DB trigger in migration 041 also handles this)
    await pool.query("DELETE FROM entity_tags WHERE entity_type = 'box' AND entity_id = $1", [id]);
    
    const result = await pool.query('DELETE FROM boxes WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Box not found' });
    }

    logActivity(pool, {
      entityType: 'box', entityId: id, entityName: result.rows[0].name,
      action: 'deleted',
      userId: req.user?.userId || null, userName: req.user?.username || null,
    }).catch(() => {});
    res.json({ success: true, message: 'Box deleted', box: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
