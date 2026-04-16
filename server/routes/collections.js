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

// Module-level cache for column lists — populated on first write per table,
// valid for the process lifetime. Avoids a system-catalog query on every POST/PUT.
const _schemaCache = new Map();

async function getValidColumns(tableName) {
  if (_schemaCache.has(tableName)) return _schemaCache.get(tableName);
  const colResult = await db.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'`,
    [tableName]
  );
  const cols = new Set(colResult.rows.map(r => r.column_name));
  _schemaCache.set(tableName, cols);
  return cols;
}

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
    
    sql += ' ORDER BY created_at DESC LIMIT 500';
    
    const result = await db.query(sql, params);
    // Reference collections (drivers, staff, locations) change infrequently — allow browser to cache for 30 s
    const CACHEABLE = ['drivers', 'staff', 'locations'];
    if (!status && !event_id && !category && CACHEABLE.includes(table)) {
      res.set('Cache-Control', 'private, max-age=30');
    }
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
    
    // Strip keys that don't correspond to real columns (prevents 500 on schema changes)
    const validColumns = await getValidColumns(table);
    Object.keys(data).forEach(k => { if (!validColumns.has(k)) delete data[k]; });

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
    
    // Fix 19: Validate driver color uniqueness before saving
    if (table === 'drivers' && data.color) {
      const colorCheck = await db.query(
        'SELECT id, name FROM drivers WHERE color = $1 AND id != $2',
        [data.color, id]
      );
      if (colorCheck.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: `Color ${data.color} is already used by driver "${colorCheck.rows[0].name}". Each driver must have a unique colour.`
        });
      }
    }

    // Remove id from data to avoid updating it
    delete data.id;
    
    // Strip keys that don't correspond to real columns
    const validCols = await getValidColumns(table);
    Object.keys(data).forEach(k => { if (!validCols.has(k)) delete data[k]; });

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

// Map collection table names to their entity_tags entity_type value
const ENTITY_TAG_TYPE = {
  tasks: 'task',
  notes: 'note',
  runbooks: 'runbook',
  drivers: 'driver',
  events: 'event'
};

// DELETE /api/collections/:table/:id - Delete record
router.delete('/:table/:id', async (req, res) => {
  try {
    const table = validateTable(req.params.table);
    const { id } = req.params;

    // Defence-in-depth: clean up orphans that DB triggers also handle.
    // Triggers in migration 041 are the primary guarantee; these run first
    // so that if this code path somehow precedes the trigger, rows are gone.
    const entityType = ENTITY_TAG_TYPE[table];
    if (entityType) {
      await db.query(
        'DELETE FROM entity_tags WHERE entity_type = $1 AND entity_id = $2',
        [entityType, id]
      );
    }
    // When deleting an inventory item, remove it from any boxes it's packed in
    if (table === 'inventory') {
      await db.query(
        "DELETE FROM box_contents WHERE item_id = $1 AND item_type = 'inventory'",
        [id]
      );
    }

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
