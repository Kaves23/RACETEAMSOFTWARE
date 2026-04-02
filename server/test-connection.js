// Test PlanetScale PostgreSQL Connection
require('dotenv').config();
const { testConnection, pool, closePool } = require('./db');

async function runTests() {
  console.log('🧪 Testing PlanetScale PostgreSQL Connection...\n');
  
  // Check environment variables
  console.log('📋 Configuration:');
  console.log('   DATABASE_HOST:', process.env.DATABASE_HOST ? '✅ ' + process.env.DATABASE_HOST : '❌ Missing');
  console.log('   DATABASE_USERNAME:', process.env.DATABASE_USERNAME ? '✅ Set' : '❌ Missing');
  console.log('   DATABASE_PASSWORD:', process.env.DATABASE_PASSWORD ? '✅ Set (hidden)' : '❌ Missing');
  console.log('   DATABASE_NAME:', process.env.DATABASE_NAME || 'Not set');
  console.log('   DATABASE_URL:', process.env.DATABASE_URL ? '✅ Set' : '❌ Missing');
  console.log('');
  
  // Check for missing credentials
  if (!process.env.DATABASE_URL) {
    console.error('❌ Missing DATABASE_URL!');
    console.error('   Please check your .env file.');
    process.exit(1);
  }
  
  // Test basic connection
  console.log('🔌 Testing connection...');
  const connected = await testConnection();
  
  if (!connected) {
    console.error('\n❌ Connection failed! Check your credentials in .env file.');
    await closePool();
    process.exit(1);
  }
  
  // Test query execution
  console.log('\n📊 Testing query execution...');
  try {
    const result = await pool.query('SELECT current_database() as db, version() as version');
    console.log('✅ Query successful!');
    console.log('   Database:', result.rows[0].db);
    console.log('   PostgreSQL Version:', result.rows[0].version.split(' ')[0] + ' ' + result.rows[0].version.split(' ')[1]);
  } catch (error) {
    console.error('❌ Query failed:', error.message);
    await closePool();
    process.exit(1);
  }
  
  // Check for existing tables
  console.log('\n📋 Checking for tables...');
  try {
    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    if (result.rows.length === 0) {
      console.log('⚠️  No tables found - database is empty.');
      console.log('   Run migrations next: node server/run-migrations.js');
    } else {
      console.log(`✅ Found ${result.rows.length} tables:`);
      result.rows.forEach(row => {
        console.log(`   - ${row.table_name}`);
      });
    }
  } catch (error) {
    console.log('⚠️  Could not check tables:', error.message);
  }
  
  console.log('\n✅ All tests passed! Database is ready.');
  console.log('\n📝 Next steps:');
  console.log('   1. Run migrations: node server/run-migrations.js');
  console.log('   2. Start API server: node server/index.js');
  console.log('   3. Test API endpoints: http://localhost:3000/api/health');
  
  await closePool();
  process.exit(0);
}

// Run tests
runTests().catch(async error => {
  console.error('❌ Test failed:', error);
  await closePool();
  process.exit(1);
});
