/**
 * Migrate Drivers from localStorage to PlanetScale
 * 
 * Usage: node server/migrate-drivers.js
 * 
 * This script reads drivers from a localStorage export and migrates them to the database.
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: true
  }
});

// Sample drivers data - replace with your actual localStorage data
// Or read from a JSON file exported from localStorage
const sampleDrivers = [
  {
    id: 'driver-001',
    name: 'Lewis Hamilton',
    license_number: 'LH44',
    phone: '+44 123 456 7890',
    email: 'lewis@example.com',
    is_active: true
  },
  {
    id: 'driver-002',
    name: 'Max Verstappen',
    license_number: 'MV33',
    phone: '+31 123 456 7890',
    email: 'max@example.com',
    is_active: true
  }
];

async function migrateDrivers(drivers) {
  console.log(`\n🚗 Starting driver migration...`);
  console.log(`Found ${drivers.length} driver(s) to migrate\n`);

  let migrated = 0;
  let updated = 0;
  let errors = 0;

  for (const driver of drivers) {
    try {
      const driverName = typeof driver === 'string' ? driver : (driver.name || 'Unnamed Driver');
      
      console.log(`Migrating: ${driverName}`);

      const query = `
        INSERT INTO drivers (
          id, name, license_number, license_expiry,
          phone, email, emergency_contact, emergency_phone,
          blood_type, medical_notes, address,
          insurance_provider, insurance_policy,
          is_active, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          license_number = EXCLUDED.license_number,
          phone = EXCLUDED.phone,
          email = EXCLUDED.email,
          updated_at = NOW()
        RETURNING (xmax = 0) AS inserted
      `;
      
      const driverId = driver.id || `driver-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const values = [
        driverId,
        driverName,
        driver.license_number || driver.licenseNumber || null,
        driver.license_expiry || driver.licenseExpiry || null,
        driver.phone || null,
        driver.email || null,
        driver.emergency_contact || driver.emergencyContact || null,
        driver.emergency_phone || driver.emergencyPhone || null,
        driver.blood_type || driver.bloodType || null,
        driver.medical_notes || driver.medicalNotes || null,
        driver.address || null,
        driver.insurance_provider || driver.insuranceProvider || null,
        driver.insurance_policy || driver.insurancePolicy || null,
        driver.is_active !== false && driver.active !== false,
        driver.created_at || driver.createdAt || new Date().toISOString(),
        new Date().toISOString()
      ];
      
      const result = await pool.query(query, values);
      
      if (result.rows[0].inserted) {
        console.log(`  ✅ Inserted: ${driverName}`);
        migrated++;
      } else {
        console.log(`  🔄 Updated: ${driverName}`);
        updated++;
      }

    } catch (error) {
      console.error(`  ❌ Error migrating driver:`, error.message);
      errors++;
    }
  }

  console.log(`\n📊 Migration Summary:`);
  console.log(`   Inserted: ${migrated}`);
  console.log(`   Updated:  ${updated}`);
  console.log(`   Errors:   ${errors}`);
  console.log(`   Total:    ${drivers.length}\n`);

  return { migrated, updated, errors };
}

async function loadDriversFromFile(filePath) {
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    const json = JSON.parse(data);
    
    // Try to find drivers in the JSON
    if (json.drivers) return json.drivers;
    if (json.settings && json.settings.drivers) return json.settings.drivers;
    if (Array.isArray(json)) return json;
    
    throw new Error('No drivers found in file');
  } catch (error) {
    console.error('Error reading file:', error.message);
    return null;
  }
}

async function main() {
  try {
    // Check if a file path was provided
    const filePath = process.argv[2];
    
    let drivers;
    
    if (filePath) {
      console.log(`📂 Reading drivers from: ${filePath}`);
      drivers = await loadDriversFromFile(filePath);
      
      if (!drivers || drivers.length === 0) {
        console.log('❌ No drivers found in file. Exiting.');
        process.exit(1);
      }
    } else {
      console.log('⚠️  No file provided, using sample data');
      console.log('💡 Usage: node server/migrate-drivers.js path/to/drivers.json');
      console.log('💡 Or export localStorage data and pass the file path\n');
      
      drivers = sampleDrivers;
    }

    // Perform migration
    const results = await migrateDrivers(drivers);
    
    if (results.errors > 0) {
      console.log('⚠️  Migration completed with errors');
      process.exit(1);
    } else {
      console.log('✅ Migration completed successfully!');
      process.exit(0);
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = { migrateDrivers };
