// PlanetScale PostgreSQL Database Connection
require('dotenv').config();
const { Client, Pool } = require('pg');

// Create connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: true
  }
});

// Helper function to execute queries
async function query(sql, params = []) {
  try {
    const result = await pool.query(sql, params);
    return result;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

// Test connection function
async function testConnection() {
  try {
    const result = await pool.query('SELECT 1 as test, NOW() as current_time');
    console.log('✅ Database connection successful!');
    console.log('   Server time:', result.rows[0].current_time);
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
}

// Log history entry for items/boxes/trucks
async function logHistory(kind, id, entry) {
  const { action, by, eventId, note, tsMs } = entry;
  
  // Map kind to table name
  const tableMap = {
    'items': 'item_history',
    'boxes': 'box_history',
    'trucks': 'truck_history'
  };
  
  const tableName = tableMap[kind];
  if (!tableName) {
    throw new Error(`Unknown history kind: ${kind}`);
  }
  
  // Generate UUID for history entry
  const historyId = require('crypto').randomUUID();
  const timestamp = new Date(tsMs || Date.now());
  
  // Different tables have different column names
  if (kind === 'items') {
    const sql = `
      INSERT INTO item_history (id, item_id, action, details, performed_by_user_id, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const result = await query(sql, [historyId, id, action, note, by, timestamp]);
    return result.rows[0];
  } else if (kind === 'boxes') {
    const sql = `
      INSERT INTO box_history (id, box_id, action, details, performed_by_user_id, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const result = await query(sql, [historyId, id, action, note, by, timestamp]);
    return result.rows[0];
  } else if (kind === 'trucks') {
    const sql = `
      INSERT INTO truck_history (id, truck_id, action, details, performed_by_user_id, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    const result = await query(sql, [historyId, id, action, note, by, timestamp]);
    return result.rows[0];
  }
}

// Close pool
async function closePool() {
  await pool.end();
}

// Generic getAll function for any table
async function getAll(tableName) {
  // Whitelist allowed table names to prevent SQL injection
  const allowedTables = [
    'locations', 'events', 'tasks', 'notes', 'runbooks', 'drivers',
    'expenses', 'purchase_orders', 'inventory',
    'telemetry_uploads', 'telemetry_points', 'sessions'
  ];
  
  if (!allowedTables.includes(tableName)) {
    throw new Error(`Table ${tableName} is not allowed`);
  }
  
  const sql = `SELECT * FROM ${tableName} ORDER BY created_at DESC`;
  const result = await query(sql);
  return result.rows;
}

// Get settings from generic settings table
async function getSettings() {
  try {
    const result = await query(`SELECT data FROM settings WHERE id = 'global' LIMIT 1`);
    if (result.rows.length > 0 && result.rows[0].data) {
      return result.rows[0].data;
    }
    return {};
  } catch (error) {
    console.warn('Error loading settings:', error.message);
    return {};
  }
}

// Generic upsertMany function (placeholder - basic implementation)
async function upsertMany(tableName, items) {
  // This is a simplified implementation
  // In production, you'd want proper UPSERT logic with ON CONFLICT
  return items;
}

// Generic createOne function (placeholder - basic implementation)
async function createOne(tableName, data) {
  // This is a simplified implementation
  // In production, you'd construct proper INSERT statement
  return data;
}

module.exports = {
  pool,
  query,
  testConnection,
  closePool,
  logHistory,
  getAll,
  getSettings,
  upsertMany,
  createOne
};
