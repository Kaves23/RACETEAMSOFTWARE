// Generic CRUD routes for all collections
// Handles: tasks, notes, runbooks, drivers, expenses, purchase_orders, inventory, events, locations
const express = require('express');
const router = express.Router();
const db = require('../db');

// Valid table names (whitelist for security)
const VALID_TABLES = [
  'tasks', 'notes', 'runbooks', 'drivers', 'staff',
  'expenses', 'purchase_orders', 'inventory', 'events', 'locations'
];

// Validate table name
function validateTable(tableName) {
  if (!VALID_TABLES.includes(tableName)) {
    throw new Error(`Invalid table name: ${tableName}`);
  }
  return tableName;
}

// GET /api/collections/:table - Get all records from a table
router.get('/:table', async (req, res) => {
  try {
    const table = validateTable(req.params.table);
    const { status, event_id, category } = req.query;
    
    let sql = `SELECT * FROM ${table}`;
    const params = [];
    const conditions = [];
    
    // Add filters if provided
    if (status) {
      conditions.push('status = $' + (params.length + 1));
      params.push(status);
    }
    if (event_id) {
      conditions.push('event_id = $' + (params.length + 1));
      params.push(event_id);
    }
    if (category) {
      conditions.push('category = $' + (params.length + 1));
      params.push(category);
    }
    
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    
    sql += ' ORDER BY created_at DESC';
    
    const result = await db.query(sql, params);
    res.json({ success: true, items: result.rows, count: result.rows.length });
  } catch (error) {
    console.error(`Error getting ${req.params.table}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/collections/:table/:id - Get single record
router.get('/:table/:id', async (req, res) => {
  try {
    const table = validateTable(req.params.table);
    const { id } = req.params;
    
    const sql = `SELECT * FROM ${table} WHERE id = $1`;
    const result = await db.query(sql, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }
    
    res.json({ success: true, item: result.rows[0] });
  } catch (error) {
    console.error(`Error getting ${req.params.table}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/collections/:table - Create new record
router.post('/:table', async (req, res) => {
  try {
    const table = validateTable(req.params.table);
    const data = req.body;
    
    // Generate ID if not provided
    if (!data.id) {
      data.id = require('crypto').randomUUID();
    }
    
    // Build insert SQL dynamically
    const columns = Object.keys(data);
    const values = Object.values(data).map(val => {
      // Convert arrays and objects to JSON strings for JSONB columns
      if (typeof val === 'object' && val !== null && !(val instanceof Date)) {
        return JSON.stringify(val);
      }
      return val;
    });
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
    
    const sql = `
      INSERT INTO ${table} (${columns.join(', ')})
      VALUES (${placeholders})
      RETURNING *
    `;
    
    const result = await db.query(sql, values);
    res.json({ success: true, item: result.rows[0] });
  } catch (error) {
    console.error(`Error creating ${req.params.table}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/collections/:table/:id - Update record
router.put('/:table/:id', async (req, res) => {
  try {
    const table = validateTable(req.params.table);
    const { id } = req.params;
    const data = req.body;
    
    // Remove id from data to avoid updating it
    delete data.id;
    
    // Add updated_at timestamp
    data.updated_at = new Date();
    
    // Build update SQL dynamically
    const columns = Object.keys(data);
    const values = Object.values(data).map(val => {
      // Convert arrays and objects to JSON strings for JSONB columns
      if (typeof val === 'object' && val !== null && !(val instanceof Date)) {
        return JSON.stringify(val);
      }
      return val;
    });
    const setClause = columns.map((col, i) => `${col} = $${i + 1}`).join(', ');
    
    const sql = `
      UPDATE ${table}
      SET ${setClause}
      WHERE id = $${values.length + 1}
      RETURNING *
    `;
    
    const result = await db.query(sql, [...values, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }
    
    res.json({ success: true, item: result.rows[0] });
  } catch (error) {
    console.error(`Error updating ${req.params.table}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/collections/:table/:id - Delete record
router.delete('/:table/:id', async (req, res) => {
  try {
    const table = validateTable(req.params.table);
    const { id } = req.params;
    
    const sql = `DELETE FROM ${table} WHERE id = $1 RETURNING *`;
    const result = await db.query(sql, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }
    
    res.json({ success: true, message: 'Record deleted', item: result.rows[0] });
  } catch (error) {
    console.error(`Error deleting ${req.params.table}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/collections/:table/bulk - Bulk upsert (sync)
router.post('/:table/bulk', async (req, res) => {
  try {
    const table = validateTable(req.params.table);
    const { items } = req.body;
    
    if (!Array.isArray(items)) {
      return res.status(400).json({ success: false, error: 'Items must be an array' });
    }
    
    const results = [];
    
    for (const item of items) {
      if (!item.id) {
        item.id = require('crypto').randomUUID();
      }
      
      // Try to update first, if not found then insert
      const columns = Object.keys(item);
      const values = Object.values(item).map(val => {
        // Convert arrays and objects to JSON strings for JSONB columns
        if (typeof val === 'object' && val !== null && !(val instanceof Date)) {
          return JSON.stringify(val);
        }
        return val;
      });
      
      // Build upsert using INSERT ... ON CONFLICT
      const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
      const setClause = columns
        .filter(col => col !== 'id')
        .map(col => `${col} = EXCLUDED.${col}`)
        .join(', ');
      
      const sql = `
        INSERT INTO ${table} (${columns.join(', ')})
        VALUES (${placeholders})
        ON CONFLICT (id) DO UPDATE SET ${setClause}
        RETURNING *
      `;
      
      const result = await db.query(sql, values);
      results.push(result.rows[0]);
    }
    
    res.json({ success: true, items: results, count: results.length });
  } catch (error) {
    console.error(`Error bulk upserting ${req.params.table}:`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
