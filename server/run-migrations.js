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
    '007_create_asset_types_table.sql',
    '008_add_custom_asset_types.sql',
    '009_seed_locations.sql',
    '010_create_remaining_tables.sql',
    '011_add_shopify_support.sql',
    '012_add_inventory_box_tracking.sql',
    '013_add_driver_boxes.sql',
    '014_fix_drivers_schema.sql',
    '015_add_asset_box_relationships.sql',
    '016_event_packing_system.sql',
    '017_events_extended_schema.sql',
    '018_allow_null_event_id_for_general_lists.sql',
    '019_add_whatsapp_columns.sql',
    '020_optimize_box_contents_query.sql',
    '021_add_box_performance_indexes.sql',
    '022_add_driver_fields.sql',
    '023_enhance_event_notes_with_task_features.sql',
    '024_add_task_styling_and_event_link.sql',
    '025_add_inventory_fields.sql',
    '026_add_location_distribution.sql',
    '027_add_item_type_to_box_contents.sql',
    '028_add_quantity_to_box_contents.sql',
    '029_add_driver_colors.sql',
    '030_clean_drivers_columns.sql',
    '031_replace_locations_with_real_data.sql',
    '032_cleanup_orphaned_box_references.sql',
    '033_fix_location_ids_and_add_fks.sql',
    '034_data_quality_and_constraints.sql',
    '035_schema_improvements.sql',
    '036_performance_and_integrity.sql',
    '037_trucks_notes_column.sql',
    '038_inventory_categories.sql'
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
