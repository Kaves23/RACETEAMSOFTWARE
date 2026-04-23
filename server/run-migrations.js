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
    '038_inventory_categories.sql',
    '039_suppliers_table.sql',
    '039_performance_indexes.sql',
    '040_fk_and_index_audit.sql',
    '041_orphan_cleanup_triggers.sql',
    '042_description_trgm_index.sql',
    '043_staff_asset_assignments.sql',
    '044_boxes_notes_column.sql',
    '045_load_plan_boxes_scanned_at.sql',
    '046_add_text_color_to_packing_items.sql',
    '047_add_shopify_inventory_item_id.sql',
    '048_history_and_checkout_system.sql',
    '049_items_is_race_fleet.sql',
    '050_project_management.sql',
    '051_engine_fields_and_asset_groups.sql',
    '052_asset_flag_system.sql',
    '053_race_sessions_and_incidents.sql',
    '054_race_results_and_driver_hr_fields.sql',
    '055_driver_asset_assignments.sql',
    '056_notes_knowledge_base.sql',
    '057_users_password_hash.sql',
    '058_event_notes_extras.sql',
    '059_finance_module.sql',
    '060_performance_module.sql',
    '061_reliability_module.sql',
    '062_procurement_module.sql',
    '063_driver_module.sql',
    '064_compliance_module.sql',
    '065_executive_module.sql',
    '066_load_plan_assets.sql',
    '067_fix_variant_box_contents_constraint.sql',
    '068_fleet_management.sql',
    'phase1_new_modules.sql'
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
