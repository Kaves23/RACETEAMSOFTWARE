require('dotenv').config();
const { pool } = require('./db');
const fs = require('fs');
const path = require('path');

/**
 * Migration script to import localStorage data to PostgreSQL database
 * 
 * This script expects a JSON file containing exported localStorage data:
 * {
 *   "boxes": [...],
 *   "equipment": [...],
 *   "assets": [...],
 *   "boxContents": [...]
 * }
 * 
 * Usage:
 * 1. Export localStorage from browser console:
 *    const data = {
 *      boxes: JSON.parse(localStorage.getItem('rts.boxes.v1') || '[]'),
 *      equipment: JSON.parse(localStorage.getItem('rts.equipment.v1') || '[]'),
 *      assets: JSON.parse(localStorage.getItem('rts.assets.v1') || '[]'),
 *      boxContents: JSON.parse(localStorage.getItem('rts.box.contents.v1') || '[]')
 *    };
 *    console.log(JSON.stringify(data, null, 2));
 * 
 * 2. Save output to localStorage-export.json
 * 3. Run: node server/migrate-localStorage-to-db.js localStorage-export.json
 */

async function migrateBoxes(boxes) {
  console.log(`\n📦 Migrating ${boxes.length} boxes...`);
  let inserted = 0, updated = 0, errors = 0;
  
  for (const box of boxes) {
    try {
      const query = `
        INSERT INTO boxes (
          id, barcode, name, 
          dimensions_length_cm, dimensions_width_cm, dimensions_height_cm,
          max_weight_kg, current_weight_kg, 
          current_location_id, current_truck_id, current_zone,
          rfid_tag, status, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (barcode) DO UPDATE SET
          name = EXCLUDED.name,
          dimensions_length_cm = EXCLUDED.dimensions_length_cm,
          dimensions_width_cm = EXCLUDED.dimensions_width_cm,
          dimensions_height_cm = EXCLUDED.dimensions_height_cm,
          updated_at = NOW()
        RETURNING (xmax = 0) AS inserted
      `;
      
      const values = [
        box.id || box.barcode,
        box.barcode,
        box.name,
        box.length || box.dimensions?.length || 0,
        box.width || box.dimensions?.width || 0,
        box.height || box.dimensions?.height || 0,
        box.maxWeight || box.max_weight || null,
        box.currentWeight || box.current_weight || 0,
        box.locationId || box.location_id || null,
        box.truckId || box.truck_id || null,
        box.zone || null,
        box.rfidTag || box.rfid_tag || null,
        box.status || 'warehouse',
        box.createdAt || box.created_at || new Date().toISOString()
      ];
      
      const result = await pool.query(query, values);
      if (result.rows[0].inserted) {
        inserted++;
      } else {
        updated++;
      }
      
      process.stdout.write(`\r   ✅ Boxes: ${inserted} inserted, ${updated} updated`);
    } catch (error) {
      errors++;
      console.error(`\n   ❌ Error migrating box ${box.barcode}: ${error.message}`);
    }
  }
  
  console.log(`\n   ${errors > 0 ? `⚠️  ${errors} errors` : '✅ Complete'}`);
  return { inserted, updated, errors };
}

async function migrateItems(items, itemType) {
  console.log(`\n🔧 Migrating ${items.length} ${itemType}...`);
  let inserted = 0, updated = 0, errors = 0;
  
  for (const item of items) {
    try {
      const query = `
        INSERT INTO items (
          id, barcode, name, item_type, category, description,
          current_box_id, current_location_id,
          last_maintenance_date, next_maintenance_date,
          weight_kg, value_usd, serial_number, status, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (barcode) DO UPDATE SET
          name = EXCLUDED.name,
          item_type = EXCLUDED.item_type,
          category = EXCLUDED.category,
          description = EXCLUDED.description,
          updated_at = NOW()
        RETURNING (xmax = 0) AS inserted
      `;
      
      const values = [
        item.id || item.barcode,
        item.barcode,
        item.name,
        item.type || itemType,
        item.category || null,
        item.description || item.notes || null,
        item.boxId || item.box_id || null,
        item.locationId || item.location_id || null,
        item.lastMaintenance || item.last_maintenance_date || null,
        item.nextMaintenance || item.next_maintenance_date || null,
        item.weight || item.weight_kg || null,
        item.value || item.value_usd || null,
        item.serialNumber || item.serial_number || null,
        item.status || 'warehouse',
        item.createdAt || item.created_at || new Date().toISOString()
      ];
      
      const result = await pool.query(query, values);
      if (result.rows[0].inserted) {
        inserted++;
      } else {
        updated++;
      }
      
      process.stdout.write(`\r   ✅ ${itemType}: ${inserted} inserted, ${updated} updated`);
    } catch (error) {
      errors++;
      console.error(`\n   ❌ Error migrating ${itemType} ${item.barcode}: ${error.message}`);
    }
  }
  
  console.log(`\n   ${errors > 0 ? `⚠️  ${errors} errors` : '✅ Complete'}`);
  return { inserted, updated, errors };
}

async function migrateBoxContents(boxContents) {
  if (!boxContents || boxContents.length === 0) {
    console.log('\n📋 No box contents to migrate');
    return { inserted: 0, errors: 0 };
  }
  
  console.log(`\n📋 Migrating ${boxContents.length} box content relationships...`);
  let inserted = 0, errors = 0;
  
  for (const content of boxContents) {
    try {
      const query = `
        INSERT INTO box_contents (box_id, item_id, packed_at, packed_by_user_id, position_in_box)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (box_id, item_id) DO UPDATE SET
          packed_at = EXCLUDED.packed_at,
          packed_by_user_id = EXCLUDED.packed_by_user_id
      `;
      
      const values = [
        content.boxId || content.box_id,
        content.itemId || content.item_id,
        content.packedAt || content.packed_at || new Date().toISOString(),
        content.packedBy || content.packed_by_user_id || 'admin-001',
        content.position || content.position_in_box || null
      ];
      
      await pool.query(query, values);
      inserted++;
      process.stdout.write(`\r   ✅ Contents: ${inserted} inserted`);
    } catch (error) {
      errors++;
      console.error(`\n   ❌ Error migrating content: ${error.message}`);
    }
  }
  
  console.log(`\n   ${errors > 0 ? `⚠️  ${errors} errors` : '✅ Complete'}`);
  return { inserted, errors };
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error(`
❌ Usage: node server/migrate-localStorage-to-db.js <export-file.json>

To export localStorage data from browser console:

  const data = {
    boxes: JSON.parse(localStorage.getItem('rts.boxes.v1') || '[]'),
    equipment: JSON.parse(localStorage.getItem('rts.equipment.v1') || '[]'),
    assets: JSON.parse(localStorage.getItem('rts.assets.v1') || '[]'),
    boxContents: JSON.parse(localStorage.getItem('rts.box.contents.v1') || '[]')
  };
  console.log(JSON.stringify(data, null, 2));

Then save output to a file and run:
  node server/migrate-localStorage-to-db.js localStorage-export.json
    `);
    process.exit(1);
  }
  
  const filePath = path.resolve(args[0]);
  
  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    process.exit(1);
  }
  
  console.log(`\n🚀 localStorage → PostgreSQL Migration`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📁 Reading: ${filePath}`);
  
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  
  console.log(`\n📊 Data summary:`);
  console.log(`   - Boxes: ${data.boxes?.length || 0}`);
  console.log(`   - Equipment: ${data.equipment?.length || 0}`);
  console.log(`   - Assets: ${data.assets?.length || 0}`);
  console.log(`   - Box Contents: ${data.boxContents?.length || 0}`);
  
  const stats = {
    boxes: { inserted: 0, updated: 0, errors: 0 },
    equipment: { inserted: 0, updated: 0, errors: 0 },
    assets: { inserted: 0, updated: 0, errors: 0 },
    contents: { inserted: 0, errors: 0 }
  };
  
  try {
    // Migrate boxes first
    if (data.boxes && data.boxes.length > 0) {
      stats.boxes = await migrateBoxes(data.boxes);
    }
    
    // Migrate equipment
    if (data.equipment && data.equipment.length > 0) {
      stats.equipment = await migrateItems(data.equipment, 'equipment');
    }
    
    // Migrate assets
    if (data.assets && data.assets.length > 0) {
      stats.assets = await migrateItems(data.assets, 'asset');
    }
    
    // Migrate box contents (must be last)
    if (data.boxContents && data.boxContents.length > 0) {
      stats.contents = await migrateBoxContents(data.boxContents);
    }
    
    // Summary
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✅ Migration Complete!`);
    console.log(`\n📦 Boxes: ${stats.boxes.inserted} inserted, ${stats.boxes.updated} updated`);
    console.log(`🔧 Equipment: ${stats.equipment.inserted} inserted, ${stats.equipment.updated} updated`);
    console.log(`🏷️  Assets: ${stats.assets.inserted} inserted, ${stats.assets.updated} updated`);
    console.log(`📋 Box Contents: ${stats.contents.inserted} relationships created`);
    
    const totalErrors = stats.boxes.errors + stats.equipment.errors + stats.assets.errors + stats.contents.errors;
    if (totalErrors > 0) {
      console.log(`\n⚠️  ${totalErrors} errors encountered (see above)`);
    }
    
    console.log(`\n🔍 Verify data at: http://localhost:3000/api/boxes`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    
  } catch (error) {
    console.error(`\n❌ Migration failed: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
