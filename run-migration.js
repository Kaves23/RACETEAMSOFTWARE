#!/usr/bin/env node
// run-migration.js — run a SQL migration file using the project's DB connection
// Usage: node run-migration.js [sql-file]
// Default file: server/migrations/phase1_new_modules.sql

'use strict';
require('./server/node_modules/dotenv/lib/main.js').config({ path: './.env' });
const path  = require('path');
const fs    = require('fs');
const { Pool } = require('./server/node_modules/pg');

const sqlFile = process.argv[2] || path.join(__dirname, 'server', 'migrations', 'phase1_new_modules.sql');

if (!fs.existsSync(sqlFile)) {
  console.error('ERROR: SQL file not found:', sqlFile);
  process.exit(1);
}

async function run() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const sql = fs.readFileSync(sqlFile, 'utf8');
    console.log('Running migration:', path.basename(sqlFile));
    await pool.query(sql);
    console.log('✅ Migration complete:', path.basename(sqlFile));
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
