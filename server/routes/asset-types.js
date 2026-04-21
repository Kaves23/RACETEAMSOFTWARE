const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// GET /api/asset-types - Get all asset types
router.get('/', async (req, res, next) => {
  try {
    const { is_active } = req.query;
    
    let query = `SELECT id, name, color, description, sort_order, is_active, created_at, updated_at
    FROM asset_types WHERE 1=1`;
    const params = [];
    let paramCount = 1;
    
    if (is_active !== undefined) {
      query += ` AND is_active = $${paramCount++}`;
      params.push(is_active === 'true');
    }
    
    query += ' ORDER BY sort_order ASC, name ASC';
    
    const result = await pool.query(query, params);
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, count: result.rows.length, assetTypes: result.rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/asset-types/:id - Get a specific asset type
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT id, name, color, description, sort_order, is_active, created_at, updated_at FROM asset_types WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Asset type not found' });
    }
    
    res.json({ success: true, assetType: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// POST /api/asset-types - Create a new asset type
router.post('/', async (req, res, next) => {
  try {
    const { id, name, color, description, sort_order, is_active } = req.body;
    
    if (!name || !color) {
      return res.status(400).json({ success: false, error: 'Name and color are required' });
    }
    
    // Validate color format (hex color)
    if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
      return res.status(400).json({ success: false, error: 'Color must be in hex format (#RRGGBB)' });
    }
    
    const assetTypeId = id || `at-${Date.now()}`;
    
    const result = await pool.query(
      `INSERT INTO asset_types (id, name, color, description, sort_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, color, description, sort_order, is_active, created_at, updated_at`,
      [assetTypeId, name, color, description || null, sort_order || 0, is_active !== false]
    );
    
    res.status(201).json({ success: true, assetType: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {  // Unique violation
      return res.status(409).json({ success: false, error: 'Asset type with this name already exists' });
    }
    next(error);
  }
});

// PUT /api/asset-types/:id - Update an asset type
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, color, description, sort_order, is_active } = req.body;
    
    // Validate color format if provided
    if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
      return res.status(400).json({ success: false, error: 'Color must be in hex format (#RRGGBB)' });
    }
    
    const updates = [];
    const params = [];
    let paramCount = 1;
    
    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      params.push(name);
    }
    
    if (color !== undefined) {
      updates.push(`color = $${paramCount++}`);
      params.push(color);
    }
    
    if (description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      params.push(description);
    }
    
    if (sort_order !== undefined) {
      updates.push(`sort_order = $${paramCount++}`);
      params.push(sort_order);
    }
    
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramCount++}`);
      params.push(is_active);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }
    
    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(id);
    
    const query = `UPDATE asset_types SET ${updates.join(', ')} WHERE id = $${paramCount} 
                   RETURNING id, name, color, description, sort_order, is_active, created_at, updated_at`;
    
    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Asset type not found' });
    }
    
    res.json({ success: true, assetType: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {  // Unique violation
      return res.status(409).json({ success: false, error: 'Asset type with this name already exists' });
    }
    next(error);
  }
});

// DELETE /api/asset-types/:id - Delete an asset type
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Check if any items are using this asset type
    const itemCheck = await pool.query(
      'SELECT COUNT(*) as count FROM items WHERE item_type = (SELECT name FROM asset_types WHERE id = $1)',
      [id]
    );
    
    if (parseInt(itemCheck.rows[0].count) > 0) {
      return res.status(409).json({ 
        success: false, 
        error: 'Cannot delete asset type while items are using it',
        itemCount: parseInt(itemCheck.rows[0].count)
      });
    }
    
    const result = await pool.query(
      'DELETE FROM asset_types WHERE id = $1 RETURNING id',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Asset type not found' });
    }
    
    res.json({ success: true, message: 'Asset type deleted successfully' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
