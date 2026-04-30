// PlanetScale PostgreSQL Database Connection
require('dotenv').config();
const { Client, Pool } = require('pg');
const constants = require('./constants');

// Create connection pool with optimized configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: true
  },
  max: constants.DB_POOL_MAX_CONNECTIONS,
  idleTimeoutMillis: constants.DB_POOL_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: constants.DB_POOL_CONNECTION_TIMEOUT_MS
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
    const { from_truck_id, to_truck_id, previous_status, new_status } = entry;
    const sql = `
      INSERT INTO box_history (id, box_id, action, details, from_truck_id, to_truck_id, previous_status, new_status, performed_by_user_id, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
    const result = await query(sql, [historyId, id, action, note||null, from_truck_id||null, to_truck_id||null, previous_status||null, new_status||null, by||null, timestamp]);
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

// Get settings — returns a flat object of all key→value pairs
async function getSettings() {
  try {
    const result = await query(`SELECT key, value FROM settings`);
    const out = {};
    for (const row of result.rows) {
      try { out[row.key] = JSON.parse(row.value); } catch { out[row.key] = row.value; }
    }
    return out;
  } catch (error) {
    console.warn('Error loading settings:', error.message);
    return {};
  }
}

// Save (upsert) settings — merges patch keys into the key/value table
async function saveSettings(patch) {
  try {
    const current = await getSettings();
    const merged = Object.assign({}, current, patch);
    for (const [k, v] of Object.entries(patch)) {
      const val = typeof v === 'string' ? v : JSON.stringify(v);
      await query(
        `INSERT INTO settings (key, value, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [k, val]
      );
    }
    return merged;
  } catch (error) {
    console.warn('Error saving settings:', error.message);
    throw error;
  }
}

// Generic upsertMany — used by telemetry upload endpoint.
// Inserts rows from the items array into the given table using ON CONFLICT DO UPDATE.
// Column names are derived from the keys of the first item (all must share the same shape).
// Only tables in the allowlist are permitted (prevents SQL injection).
async function upsertMany(tableName, items) {
  const ALLOWED = new Set(['telemetry_uploads', 'telemetry_points']);
  if (!ALLOWED.has(tableName)) {
    console.warn(`upsertMany: table "${tableName}" is not allowed`);
    return items;
  }
  if (!items || items.length === 0) return [];

  const cols = Object.keys(items[0]);
  if (cols.length === 0) return [];

  // Build a multi-row VALUES clause — each item becomes one parameterised row
  const valuePlaceholders = [];
  const flatParams = [];
  let paramIdx = 1;
  for (const item of items) {
    const rowPlaceholders = cols.map(() => `$${paramIdx++}`);
    valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`);
    for (const col of cols) {
      const v = item[col];
      flatParams.push(Array.isArray(v) || (v !== null && typeof v === 'object') ? JSON.stringify(v) : v);
    }
  }

  const colList    = cols.map(c => `"${c}"`).join(', ');
  const updateList = cols.filter(c => c !== 'id').map(c => `"${c}" = EXCLUDED."${c}"`).join(', ');
  const sql = `INSERT INTO ${tableName} (${colList})
    VALUES ${valuePlaceholders.join(', ')}
    ON CONFLICT (id) DO UPDATE SET ${updateList}`;

  await query(sql, flatParams);
  return items;
}

// Generic createOne function — not currently used by active routes; kept for compatibility
async function createOne(tableName, data) {
  return data;
}

async function getBoxHistory(boxId) {
  const sql = `
    SELECT
      bh.id, bh.action, bh.details, bh.previous_status, bh.new_status, bh.timestamp,
      COALESCE(u.full_name, u.username) AS user_name,
      ft.name AS from_truck_name,
      tt.name AS to_truck_name
    FROM box_history bh
    LEFT JOIN users  u  ON u.id  = bh.performed_by_user_id
    LEFT JOIN trucks ft ON ft.id = bh.from_truck_id
    LEFT JOIN trucks tt ON tt.id = bh.to_truck_id
    WHERE bh.box_id = $1
    ORDER BY bh.timestamp DESC
    LIMIT 200
  `;
  return (await query(sql, [boxId])).rows;
}

module.exports = {
  pool,
  query,
  testConnection,
  closePool,
  logHistory,
  getBoxHistory,
  getAll,
  getSettings,
  saveSettings,
  upsertMany,
  createOne
};
