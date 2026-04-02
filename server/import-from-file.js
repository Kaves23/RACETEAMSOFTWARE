// Import localStorage export file to database
require('dotenv').config();
const { pool } = require('./db');
const fs = require('fs');

const exportFile = '/Users/John/Downloads/rts-export-2026-04-02T17-07-31-991Z.json';

async function importData() {
  console.log('🚀 Starting import from export file...\n');
  
  // Read the export file
  const rawData = JSON.parse(fs.readFileSync(exportFile, 'utf8'));
  
  const data = {
    assets: rawData['rts.assets.v1'] || [],
    equipment: rawData['rts.equipment.v1'] || [],
    boxes: rawData['rts.boxes.v1'] || [],
    boxContents: rawData['rts.box.contents.v1'] || []
  };
  
  console.log(`📊 Found:`);
  console.log(`   Assets: ${data.assets.length}`);
  console.log(`   Equipment: ${data.equipment.length}`);
  console.log(`   Boxes: ${data.boxes.length}`);
  console.log(`   Box Contents: ${data.boxContents.length}\n`);
  
  const results = {
    boxes: { inserted: 0, updated: 0, errors: 0 },
    items: { inserted: 0, updated: 0, errors: 0 },
    boxContents: { inserted: 0, updated: 0, errors: 0 }
  };
  
  // Import Boxes
  console.log('📦 Importing boxes...');
  for (const box of data.boxes) {
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
        box.id || box.barcode || `box-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        box.barcode || box.id,
        box.name,
        box.length || 0,
        box.width || 0,
        box.height || 0,
        box.maxWeight || null,
        box.currentWeight || 0,
        box.locationId || null,
        box.truckId || null,
        box.zone || null,
        box.rfidTag || null,
        box.status || 'warehouse',
        box.createdAt || new Date().toISOString()
      ];
      
      const result = await pool.query(query, values);
      if (result.rows[0].inserted) {
        results.boxes.inserted++;
      } else {
        results.boxes.updated++;
      }
    } catch (error) {
      console.error(`   Error: ${box.barcode || box.id}: ${error.message}`);
      results.boxes.errors++;
    }
  }
  console.log(`   ✅ Boxes: ${results.boxes.inserted} inserted, ${results.boxes.updated} updated, ${results.boxes.errors} errors\n`);
  
  // Import Items (combine assets and equipment)
  const allItems = [
    ...data.assets.map(item => ({ ...item, type: 'asset' })),
    ...data.equipment.map(item => ({ ...item, type: 'equipment' }))
  ];
  
  console.log(`🔧 Importing ${allItems.length} items...`);
  for (const item of allItems) {
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
        item.id || item.barcode || `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        item.barcode || item.id,
        item.name,
        item.type || 'asset',
        item.category || null,
        item.description || item.notes || null,
        item.boxId || null,
        item.locationId || null,
        item.lastMaintenance || null,
        item.nextMaintenance || null,
        item.weight || null,
        item.value || null,
        item.serialNumber || item.serial || null,
        item.status || 'available',
        item.createdAt || new Date().toISOString()
      ];
      
      const result = await pool.query(query, values);
      if (result.rows[0].inserted) {
        results.items.inserted++;
      } else {
        results.items.updated++;
      }
      
      if (results.items.inserted % 10 === 0) {
        process.stdout.write(`\r   Progress: ${results.items.inserted}/${allItems.length}`);
      }
    } catch (error) {
      console.error(`\n   Error: ${item.name}: ${error.message}`);
      results.items.errors++;
    }
  }
  console.log(`\n   ✅ Items: ${results.items.inserted} inserted, ${results.items.updated} updated, ${results.items.errors} errors\n`);
  
  console.log('✅ IMPORT COMPLETE!\n');
  console.log('📊 Final Results:');
  console.log(`   Boxes: ${results.boxes.inserted} inserted, ${results.boxes.updated} updated`);
  console.log(`   Items: ${results.items.inserted} inserted, ${results.items.updated} updated`);
  console.log(`   Total: ${results.boxes.inserted + results.items.inserted} new records\n`);
  
  await pool.end();
  console.log('🎉 Your Rotax Junior Max engine and all other data is now in the database!');
  console.log('🌐 Access at: https://raceteamsoftware.onrender.com\n');
}

importData().catch(error => {
  console.error('❌ Import failed:', error);
  process.exit(1);
});
