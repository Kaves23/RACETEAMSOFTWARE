const fs = require('fs');
const { pool } = require('./server/db.js');

const csvPath = '/Users/John/Downloads/asset (8).csv';

// Parse CSV manually (handles semicolon-separated values)
function parseCSV(content) {
  const lines = content.split('\n').filter(line => line.trim());
  const headers = lines[0].split(';').map(h => h.trim());
  
  const data = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(';');
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ? values[index].trim() : '';
    });
    data.push(row);
  }
  return data;
}

// Map CSV status to database status
function mapStatus(csvStatus) {
  const statusMap = {
    'Available': 'available',
    'Checked out': 'in_use',
    'Maintenance': 'maintenance',
    'Retired': 'retired'
  };
  return statusMap[csvStatus] || 'available';
}

// Determine item type based on category
function getItemType(category) {
  const highValueCategories = ['KARTS', 'MINI', 'MINI ROK CT POOL', 'MINI RAIN COVERS'];
  return highValueCategories.includes(category) ? 'asset' : 'equipment';
}

async function importAssets() {
  console.log('📦 Starting asset import from CSV...\n');
  
  try {
    // Read CSV file
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const assets = parseCSV(csvContent);
    
    console.log(`Found ${assets.length} assets in CSV file\n`);
    
    let imported = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const asset of assets) {
      try {
        // Check if asset already exists by barcode/tag ID
        const existing = await pool.query(
          'SELECT id FROM items WHERE barcode = $1',
          [asset['Asset Tag ID']]
        );
        
        if (existing.rows.length > 0) {
          console.log(`⏭️  Skipping ${asset['Asset Tag ID']} - already exists`);
          skipped++;
          continue;
        }
        
        // Prepare data for insertion
        const itemData = {
          barcode: asset['Asset Tag ID'],
          name: asset['Description'],
          item_type: getItemType(asset['Category']),
          category: asset['Category'],
          status: mapStatus(asset['Status']),
          serial_number: asset['SEAL NO.'] || null,
          description: `${asset['Brand']} ${asset['Model']}`.trim(),
          // Add location mapping if you have locations table
          // current_location_id: would need to map Site/Location to location IDs
        };
        
        // Insert into database (use gen_random_uuid() for id)
        const result = await pool.query(
          `INSERT INTO items (
            id, barcode, name, item_type, category, status, 
            serial_number, description, created_at, updated_at
          ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
          RETURNING id`,
          [
            itemData.barcode,
            itemData.name,
            itemData.item_type,
            itemData.category,
            itemData.status,
            itemData.serial_number,
            itemData.description
          ]
        );
        
        console.log(`✅ Imported: ${asset['Asset Tag ID']} - ${asset['Description']}`);
        imported++;
        
      } catch (error) {
        console.error(`❌ Error importing ${asset['Asset Tag ID']}: ${error.message}`);
        errors++;
      }
    }
    
    console.log('\n═══════════════════════════════════════');
    console.log('📊 IMPORT SUMMARY');
    console.log('═══════════════════════════════════════');
    console.log(`✅ Successfully imported: ${imported}`);
    console.log(`⏭️  Skipped (duplicates):  ${skipped}`);
    console.log(`❌ Errors:                ${errors}`);
    console.log(`📦 Total processed:       ${assets.length}`);
    console.log('═══════════════════════════════════════\n');
    
    // Show summary by category
    const summary = await pool.query(`
      SELECT 
        category, 
        COUNT(*) as count,
        item_type
      FROM items 
      GROUP BY category, item_type 
      ORDER BY count DESC
    `);
    
    console.log('📋 Assets by Category:');
    summary.rows.forEach(row => {
      console.log(`   ${row.category}: ${row.count} (${row.item_type})`);
    });
    
  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    await pool.end();
  }
}

// Run the import
importAssets();
