// Complete Auth Flow Audit
require('dotenv').config();
const { pool } = require('./db');

async function auditAuth() {
  console.log('🔍 AUTHENTICATION & DATABASE AUDIT\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // 1. Check database connection
  console.log('1️⃣  DATABASE CONNECTION:');
  try {
    const result = await pool.query('SELECT NOW()');
    console.log('   ✅ PlanetScale connected:', result.rows[0].now);
    
    // Check if tables exist
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    console.log(`   ✅ Tables found: ${tables.rows.length}`);
    tables.rows.forEach(t => console.log(`      - ${t.table_name}`));
    
  } catch (error) {
    console.log('   ❌ Database error:', error.message);
    return;
  }
  
  // 2. Check items count
  console.log('\n2️⃣  DATA CHECK:');
  try {
    const items = await pool.query('SELECT COUNT(*) FROM items');
    const boxes = await pool.query('SELECT COUNT(*) FROM boxes');
    console.log(`   ✅ Items: ${items.rows[0].count}`);
    console.log(`   ✅ Boxes: ${boxes.rows[0].count}`);
  } catch (error) {
    console.log('   ❌ Data check error:', error.message);
  }
  
  // 3. Check auth routes file
  console.log('\n3️⃣  AUTH ROUTES CHECK:');
  const fs = require('fs');
  const authPath = './routes/auth.js';
  
  if (fs.existsSync(authPath)) {
    console.log('   ✅ auth.js file exists');
    const authContent = fs.readFileSync(authPath, 'utf8');
    
    // Check for key functions
    const hasLogin = authContent.includes('POST /api/auth/login') || authContent.includes("post('/login'");
    const hasVerify = authContent.includes('GET /api/auth/verify') || authContent.includes("get('/verify'");
    const hasRequireAuth = authContent.includes('requireAuth') || authContent.includes('function requireAuth');
    
    console.log(`   ${hasLogin ? '✅' : '❌'} Login endpoint defined`);
    console.log(`   ${hasVerify ? '✅' : '❌'} Verify endpoint defined`);
    console.log(`   ${hasRequireAuth ? '✅' : '❌'} requireAuth middleware defined`);
    
    // Check credentials
    if (authContent.includes("username: 'admin'")) {
      console.log("   ✅ Admin user configured");
    }
  } else {
    console.log('   ❌ auth.js file NOT FOUND');
  }
  
  // 4. Check index.js setup
  console.log('\n4️⃣  SERVER SETUP CHECK:');
  const indexPath = './index.js';
  
  if (fs.existsSync(indexPath)) {
    const indexContent = fs.readFileSync(indexPath, 'utf8');
    
    const hasAuthRouter = indexContent.includes('require(\'./routes/auth\')') || indexContent.includes('require("./routes/auth")');
    const hasAuthMount = indexContent.includes('/api/auth');
    const hasRequireAuthImport = indexContent.includes('requireAuth');
    const hasProtectedRoutes = indexContent.includes('requireAuth,') || indexContent.includes('requireAuth)');
    
    console.log(`   ${hasAuthRouter ? '✅' : '❌'} Auth router imported`);
    console.log(`   ${hasAuthMount ? '✅' : '❌'} Auth routes mounted at /api/auth`);
    console.log(`   ${hasRequireAuthImport ? '✅' : '❌'} requireAuth middleware imported`);
    console.log(`   ${hasProtectedRoutes ? '✅' : '❌'} Protected routes configured`);
    
    // Check if items and boxes routes are protected
    const itemsProtected = indexContent.match(/\/api\/items.*requireAuth/);
    const boxesProtected = indexContent.match(/\/api\/boxes.*requireAuth/);
    
    console.log(`   ${itemsProtected ? '✅' : '❌'} /api/items protected with requireAuth`);
    console.log(`   ${boxesProtected ? '✅' : '❌'} /api/boxes protected with requireAuth`);
  }
  
  // 5. Environment check
  console.log('\n5️⃣  ENVIRONMENT:');
  console.log(`   DATABASE_HOST: ${process.env.DATABASE_HOST || '❌ Not set'}`);
  console.log(`   DATABASE_NAME: ${process.env.DATABASE_NAME || '❌ Not set'}`);
  console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   PORT: ${process.env.PORT || 3000}`);
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ AUDIT COMPLETE\n');
  
  await pool.end();
}

auditAuth().catch(error => {
  console.error('Audit failed:', error);
  process.exit(1);
});
