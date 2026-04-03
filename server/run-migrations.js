// Run Database Migrations for PostgreSQL
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool, closePool } = require('./db');

async function runMigrations() {
  console.log('🚀 Starting database migrations...\n');
  
  const migrationsDir = path.join(__dirname, 'migrations');
  const migrationFiles = [
    '001_create_core_tables.sql',
    '002_create_history_tables_pg.sql',
    '006_create_sessions_table.sql',
    '007_create_asset_types_table.sql'
  ];
  
  for (const filename of migrationFiles) {
    const filepath = path.join(migrationsDir, filename);
    
    console.log(`📄 Running: ${filename}`);
    
    if (!fs.existsSync(filepath)) {
      console.error(`   ❌ File not found: ${filepath}`);
      continue;
    }
    
    // Read entire SQL file
    const sqlContent = fs.readFileSync(filepath, 'utf8');
    
    try {
      // Execute entire file at once
      await pool.query(sqlContent);
      console.log(`   ✅ Completed: ${filename}\n`);
    } catch (error) {
      console.error(`   ❌ Error:`, error.message);
      console.error(`   Details:`, error.detail || '');
    }
  }
  
  // Verify tables were created
  console.log('\n📋 Verifying tables...');
  try {
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    console.log(`✅ Database now has ${result.rows.length} tables:`);
    result.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });
  } catch (error) {
    console.error('❌ Could not verify tables:', error.message);
  }
  
  console.log('\n✅ Migrations complete!');
  console.log('\n📝 Next steps:');
  console.log('   1. Check tables above');
  console.log('   2. Start API server: node server/index.js');
  console.log('   3. Import localStorage data to database');
  
  await closePool();
  process.exit(0);
}

// Run migrations
runMigrations().catch(async error => {
  console.error('❌ Migration failed:', error);
  await closePool();
  process.exit(1);
});
