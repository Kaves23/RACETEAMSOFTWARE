const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// GET /api/boxes - Get all boxes
router.get('/', async (req, res, next) => {
  try {
    const { status, location_id, search } = req.query;
    
    let query = 'SELECT * FROM boxes WHERE 1=1';
    const params = [];
    let paramCount = 1;
    
    if (status) {
      query += ` AND status = $${paramCount++}`;
      params.push(status);
    }
    
    if (location_id) {
      query += ` AND location_id = $${paramCount++}`;
      params.push(location_id);
    }
    
    if (search) {
      query += ` AND (name ILIKE $${paramCount} OR barcode ILIKE $${paramCount})`;
      params.push(`%${search}%`);
      paramCount++;
    }
    
    query += ' ORDER BY created_at DESC';
    
    const result = await pool.query(query, params);
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
    
    // Also get contents
    const contents = await pool.query(`
      SELECT bc.*, i.name, i.barcode as item_barcode, i.category
      FROM box_contents bc
      JOIN items i ON bc.item_id = i.id
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
      status
    } = req.body;
    
    // Validate required fields
    if (!name || !length || !width || !height) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: name, length, width, height' 
      });
    }
    
    // Generate ID and barcode if not provided
    const id = barcode || `BOX-${Date.now().toString(36).toUpperCase()}`;
    const finalBarcode = barcode || id;
    
    const query = `
      INSERT INTO boxes (
        id, barcode, name, dimensions_length_cm, dimensions_width_cm, dimensions_height_cm, 
        max_weight_kg, current_weight_kg, current_location_id, 
        current_truck_id, current_zone, rfid_tag, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT (barcode) DO UPDATE SET
        name = EXCLUDED.name,
        dimensions_length_cm = EXCLUDED.dimensions_length_cm,
        dimensions_width_cm = EXCLUDED.dimensions_width_cm,
        dimensions_height_cm = EXCLUDED.dimensions_height_cm,
        max_weight_kg = EXCLUDED.max_weight_kg,
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
      status || 'warehouse'
    ];
    
    const result = await pool.query(query, values);
    res.status(201).json({ success: true, box: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({ success: false, error: 'Box with this barcode already exists' });
    }
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
      status
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
          updated_at = NOW()
      WHERE id = $12
      RETURNING *
    `;
    
    const values = [
      name, length, width, height, max_weight, current_weight,
      location_id, current_truck_id, current_zone, rfid_tag, status, id
    ];
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Box not found' });
    }
    
    res.json({ success: true, box: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/boxes/:id - Delete box
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Check if box has contents
    const contents = await pool.query('SELECT COUNT(*) FROM box_contents WHERE box_id = $1', [id]);
    
    if (parseInt(contents.rows[0].count) > 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Cannot delete box with contents. Unpack items first.' 
      });
    }
    
    const result = await pool.query('DELETE FROM boxes WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Box not found' });
    }
    
    res.json({ success: true, message: 'Box deleted', box: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
