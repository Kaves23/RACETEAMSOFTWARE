// Check what's in the PlanetScale database
require('dotenv').config();
const { pool } = require('./db');

async function checkDatabase() {
  console.log('🔍 Checking PlanetScale Database...\n');
  
  try {
    // Check items (assets + equipment)
    const itemsResult = await pool.query(`
      SELECT 
        item_type,
        COUNT(*) as count,
        STRING_AGG(DISTINCT category, ', ') as categories
      FROM items 
      GROUP BY item_type
    `);
    
    console.log('📦 ITEMS (Assets & Equipment):');
    for (const row of itemsResult.rows) {
      console.log(`   ${row.item_type}: ${row.count} items`);
      if (row.categories) {
        console.log(`      Categories: ${row.categories}`);
      }
    }
    
    // Get some sample items
    const sampleItems = await pool.query(`
      SELECT name, item_type, category, status, serial_number, value_usd
      FROM items 
      ORDER BY created_at DESC 
      LIMIT 10
    `);
    
    console.log('\n   📋 Sample Items:');
    for (const item of sampleItems.rows) {
      console.log(`      • ${item.name} (${item.item_type}) - ${item.category || 'No category'} - $${item.value_usd || 0}`);
    }
    
    // Check for Rotax engines specifically
    const rotaxItems = await pool.query(`
      SELECT name, item_type, category, serial_number, value_usd, status
      FROM items 
      WHERE name ILIKE '%rotax%' OR category ILIKE '%engine%' OR description ILIKE '%rotax%'
      ORDER BY name
    `);
    
    if (rotaxItems.rows.length > 0) {
      console.log('\n   🏁 Rotax/Engine Items Found:');
      for (const item of rotaxItems.rows) {
        console.log(`      • ${item.name} - ${item.category || 'Uncategorized'} - Serial: ${item.serial_number || 'N/A'} - $${item.value_usd || 0}`);
      }
    }
    
    // Check boxes
    const boxesResult = await pool.query(`
      SELECT COUNT(*) as count FROM boxes
    `);
    console.log(`\n📦 BOXES: ${boxesResult.rows[0].count} boxes`);
    
    const sampleBoxes = await pool.query(`
      SELECT name, barcode, status, 
             dimensions_length_cm, dimensions_width_cm, dimensions_height_cm
      FROM boxes 
      LIMIT 5
    `);
    
    console.log('   Sample Boxes:');
    for (const box of sampleBoxes.rows) {
      const dims = `${box.dimensions_length_cm}x${box.dimensions_width_cm}x${box.dimensions_height_cm}cm`;
      console.log(`      • ${box.name} (${box.barcode}) - ${dims} - ${box.status}`);
    }
    
    // Check box contents
    const contentsResult = await pool.query(`
      SELECT COUNT(*) as count FROM box_contents
    `);
    console.log(`\n📋 BOX CONTENTS: ${contentsResult.rows[0].count} items in boxes`);
    
    // Check other tables
    const eventsResult = await pool.query(`SELECT COUNT(*) as count FROM events`);
    console.log(`\n📅 EVENTS: ${eventsResult.rows[0].count} events`);
    
    const locationsResult = await pool.query(`SELECT COUNT(*) as count FROM locations`);
    console.log(`📍 LOCATIONS: ${locationsResult.rows[0].count} locations`);
    
    const trucksResult = await pool.query(`SELECT COUNT(*) as count FROM trucks`);
    console.log(`🚛 TRUCKS: ${trucksResult.rows[0].count} trucks`);
    
    // Summary
    const totalItems = await pool.query(`SELECT COUNT(*) as count FROM items`);
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✅ TOTAL ITEMS IN DATABASE: ${totalItems.rows[0].count}`);
    console.log(`✅ TOTAL BOXES: ${boxesResult.rows[0].count}`);
    console.log(`✅ DATABASE: Connected and operational`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    
  } catch (error) {
    console.error('❌ Database error:', error.message);
  } finally {
    await pool.end();
  }
}

checkDatabase();
