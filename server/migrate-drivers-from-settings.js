/**
 * Migrate Drivers from Settings to Database
 * 
 * This script checks if drivers exist in the database, and if not,
 * creates sample drivers or uses provided data.
 * 
 * Usage: node server/migrate-drivers-from-settings.js
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost') ? false : {
    rejectUnauthorized: true
  }
});

// Default drivers to create if none exist
const defaultDrivers = [
  {
    id: `driver-${Date.now()}-1`,
    name: 'Team Driver 1',
    license_number: 'DRV001',
    contact_phone: '+1 555-0101',
    contact_email: 'driver1@raceteam.com',
    status: 'active',
    category: 'Professional'
  },
  {
    id: `driver-${Date.now()}-2`,
    name: 'Team Driver 2',
    license_number: 'DRV002',
    contact_phone: '+1 555-0102',
    contact_email: 'driver2@raceteam.com',
    status: 'active',
    category: 'Professional'
  },
  {
    id: `driver-${Date.now()}-3`,
    name: 'Team Driver 3',
    license_number: 'DRV003',
    contact_phone: '+1 555-0103',
    contact_email: 'driver3@raceteam.com',
    status: 'active',
    category: 'Professional'
  }
];

async function migrateDrivers() {
  const client = await pool.connect();
  
  try {
    console.log('\n🚗 Starting driver migration...\n');
    
    // Check existing drivers
    const existingResult = await client.query('SELECT COUNT(*) as count FROM drivers');
    const existingCount = parseInt(existingResult.rows[0].count);
    
    console.log(`📊 Current drivers in database: ${existingCount}`);
    
    if (existingCount > 0) {
      console.log('✅ Drivers already exist in database!');
      
      // Show existing drivers
      const driversResult = await client.query(`
        SELECT id, name, license_number, contact_email, contact_phone, status, created_at
        FROM drivers
        ORDER BY created_at DESC
      `);
      
      console.log('\n📋 Existing drivers:');
      driversResult.rows.forEach((driver, idx) => {
        console.log(`   ${idx + 1}. ${driver.name} (${driver.license_number}) - ${driver.contact_email}`);
      });
      
      return;
    }
    
    // No drivers exist, create default ones
    console.log('\n⚠️  No drivers found. Creating default drivers...\n');
    
    for (const driver of defaultDrivers) {
      try {
        await client.query(`
          INSERT INTO drivers (id, name, license_number, contact_phone, contact_email, status, category, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            license_number = EXCLUDED.license_number,
            contact_phone = EXCLUDED.contact_phone,
            contact_email = EXCLUDED.contact_email,
            status = EXCLUDED.status,
            category = EXCLUDED.category,
            updated_at = NOW()
        `, [
          driver.id,
          driver.name,
          driver.license_number,
          driver.contact_phone,
          driver.contact_email,
          driver.status,
          driver.category
        ]);
        
        console.log(`   ✅ Created: ${driver.name} (${driver.license_number})`);
      } catch (err) {
        console.error(`   ❌ Error creating ${driver.name}:`, err.message);
      }
    }
    
    console.log(`\n✅ Migration complete! Created ${defaultDrivers.length} driver(s)`);
    
    // Verify
    const verifyResult = await client.query('SELECT COUNT(*) as count FROM drivers');
    const finalCount = parseInt(verifyResult.rows[0].count);
    console.log(`📊 Final driver count: ${finalCount}`);
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration
migrateDrivers()
  .then(() => {
    console.log('\n🎉 All done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Fatal error:', error);
    process.exit(1);
  });
