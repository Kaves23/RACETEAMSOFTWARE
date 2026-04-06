const express = require('express');
const router = express.Router();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: true
  }
});

// POST /api/box-assignments - Create new box-to-driver assignment (many-to-many)
router.post('/', async (req, res, next) => {
  try {
    const { box_id, driver_id, event_id, assigned_by, notes } = req.body;
    
    if (!box_id || !driver_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'box_id and driver_id are required' 
      });
    }
    
    // Check if active assignment already exists
    const existingCheck = await pool.query(
      'SELECT id FROM box_assignments WHERE box_id = $1 AND driver_id = $2 AND unassigned_at IS NULL',
      [box_id, driver_id]
    );
    
    if (existingCheck.rows.length > 0) {
      // Assignment already exists and is active
      return res.json({ 
        success: true, 
        assignment: existingCheck.rows[0],
        message: 'Assignment already exists'
      });
    }
    
    // Create new assignment record
    const query = `
      INSERT INTO box_assignments (box_id, driver_id, event_id, assigned_by, notes)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    
    const result = await pool.query(query, [box_id, driver_id, event_id || null, assigned_by || null, notes || null]);
    
    res.json({ success: true, assignment: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// POST /api/box-assignments/unassign - Close a box-to-driver assignment (set unassigned_at)
router.post('/unassign', async (req, res, next) => {
  try {
    const { box_id, driver_id } = req.body;
    
    if (!box_id || !driver_id) {
      return res.status(400).json({ 
        success: false, 
        error: 'box_id and driver_id are required' 
      });
    }
    
    // Update the most recent active assignment for this box-driver pair
    const query = `
      UPDATE box_assignments
      SET unassigned_at = NOW()
      WHERE box_id = $1 
        AND driver_id = $2 
        AND unassigned_at IS NULL
      RETURNING *
    `;
    
    const result = await pool.query(query, [box_id, driver_id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'No active assignment found' 
      });
    }
    
    res.json({ success: true, assignment: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// GET /api/box-assignments - Get all box assignments (with optional filters)
router.get('/', async (req, res, next) => {
  try {
    const { box_id, driver_id, event_id, active_only } = req.query;
    
    let query = `
      SELECT ba.*, 
             b.name as box_name, 
             b.barcode as box_barcode,
             d.name as driver_name
      FROM box_assignments ba
      LEFT JOIN boxes b ON ba.box_id = b.id
      LEFT JOIN drivers d ON ba.driver_id = d.id
      WHERE 1=1
    `;
    
    const params = [];
    let paramIndex = 1;
    
    if (box_id) {
      query += ` AND ba.box_id = $${paramIndex++}`;
      params.push(box_id);
    }
    
    if (driver_id) {
      query += ` AND ba.driver_id = $${paramIndex++}`;
      params.push(driver_id);
    }
    
    if (event_id) {
      query += ` AND ba.event_id = $${paramIndex++}`;
      params.push(event_id);
    }
    
    if (active_only === 'true') {
      query += ' AND ba.unassigned_at IS NULL';
    }
    
    query += ' ORDER BY ba.assigned_at DESC';
    
    const result = await pool.query(query, params);
    
    res.json({ success: true, assignments: result.rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/box-assignments/:id - Get single assignment by ID
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const query = `
      SELECT ba.*, 
             b.name as box_name, 
             b.barcode as box_barcode,
             d.name as driver_name
      FROM box_assignments ba
      LEFT JOIN boxes b ON ba.box_id = b.id
      LEFT JOIN drivers d ON ba.driver_id = d.id
      WHERE ba.id = $1
    `;
    
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Assignment not found' });
    }
    
    res.json({ success: true, assignment: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
