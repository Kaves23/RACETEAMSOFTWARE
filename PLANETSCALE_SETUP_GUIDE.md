# PlanetScale Database Setup Guide
## Race Team Logistics System

**Date:** 30 January 2026  
**Database Provider:** PlanetScale (MySQL 8.0)  
**Project:** Race Team Software V5 - Logistics Module

---

## Step 1: Create PlanetScale Account & Database

### 1.1 Sign Up / Login
1. Go to https://planetscale.com
2. Sign in with your existing account (same as your other project)
3. Click "Create a new database"

### 1.2 Database Configuration
```
Database Name: raceteam-logistics-v5
Region: us-east (or closest to your location)
Plan: Hobby (Free) - Can scale to Scaler Pro later
```

### 1.3 Get Connection Details
1. Click on your new database
2. Go to "Connect" → "Connect with Node.js"
3. Copy your connection string (it will look like):
```
mysql://username:password@aws.connect.psdb.cloud/raceteam-logistics-v5?ssl={"rejectUnauthorized":true}
```

---

## Step 2: Install Required Packages

In your project directory, install the necessary Node.js packages:

```bash
cd "/Users/John/Dropbox/RACE TEAM SOFTWARE V5"

# Initialize package.json if you haven't already
npm init -y

# Install PlanetScale and database packages
npm install @planetscale/database
npm install dotenv
npm install express
npm install cors
npm install body-parser

# Development tools
npm install --save-dev nodemon
```

---

## Step 3: Environment Configuration

Create a `.env` file in your project root:

```bash
# .env file (DO NOT COMMIT TO GIT)
DATABASE_URL=mysql://username:password@aws.connect.psdb.cloud/raceteam-logistics-v5?ssl={"rejectUnauthorized":true}
DATABASE_HOST=aws.connect.psdb.cloud
DATABASE_USERNAME=your_username_here
DATABASE_PASSWORD=your_password_here
DATABASE_NAME=raceteam-logistics-v5

PORT=3000
NODE_ENV=development
```

Create a `.gitignore` file to protect your credentials:

```bash
# .gitignore
node_modules/
.env
.env.local
.DS_Store
*.log
```

---

## Step 4: Run Database Migrations

### 4.1 Using PlanetScale CLI (Recommended)

Install PlanetScale CLI:
```bash
brew install planetscale/tap/pscale
pscale auth login
```

Connect to your database:
```bash
pscale shell raceteam-logistics-v5 main
```

Run the migration SQL files:
```bash
pscale shell raceteam-logistics-v5 main < server/migrations/001_create_core_tables.sql
pscale shell raceteam-logistics-v5 main < server/migrations/002_create_history_tables.sql
pscale shell raceteam-logistics-v5 main < server/migrations/003_create_support_tables.sql
pscale shell raceteam-logistics-v5 main < server/migrations/004_seed_initial_data.sql
```

### 4.2 Alternative: Using Web Console

1. Go to PlanetScale Dashboard → Your Database → "Console"
2. Copy and paste each migration file content
3. Execute them in order (001, 002, 003, 004)

---

## Step 5: Test Database Connection

Create a test script `server/test-connection.js`:

```javascript
const { connect } = require('@planetscale/database');
require('dotenv').config();

const config = {
  host: process.env.DATABASE_HOST,
  username: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD,
};

async function testConnection() {
  const conn = connect(config);
  
  try {
    const results = await conn.execute('SELECT 1 + 1 as result');
    console.log('✅ Database connection successful!');
    console.log('Test query result:', results.rows[0]);
    
    // Test if tables exist
    const tables = await conn.execute('SHOW TABLES');
    console.log('\n📊 Available tables:', tables.rows.length);
    tables.rows.forEach(row => {
      console.log('  -', Object.values(row)[0]);
    });
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
  }
}

testConnection();
```

Run the test:
```bash
node server/test-connection.js
```

---

## Step 6: Start the API Server

Start your Express API server:

```bash
# Development mode with auto-reload
npm run dev

# Or production mode
npm start
```

Your API will be available at `http://localhost:3000`

---

## Step 7: Update Frontend to Use API

Modify your frontend files to use the API instead of localStorage:

### 7.1 Update `config.js`
```javascript
const RTS = {
  // ... existing code ...
  
  API_BASE_URL: 'http://localhost:3000/api',
  
  // New API helper methods
  async apiGet(endpoint) {
    const response = await fetch(`${this.API_BASE_URL}${endpoint}`);
    return response.json();
  },
  
  async apiPost(endpoint, data) {
    const response = await fetch(`${this.API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return response.json();
  },
  
  async apiPut(endpoint, data) {
    const response = await fetch(`${this.API_BASE_URL}${endpoint}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return response.json();
  },
  
  async apiDelete(endpoint) {
    const response = await fetch(`${this.API_BASE_URL}${endpoint}`, {
      method: 'DELETE'
    });
    return response.json();
  }
};
```

---

## Step 8: Migration from localStorage to Database

Create a migration script `server/migrate-localstorage.js`:

This script will:
1. Read your existing localStorage data from browser
2. Transform it to match database schema
3. Insert it into PlanetScale
4. Maintain all relationships and history

Run migration:
```bash
node server/migrate-localstorage.js
```

---

## Step 9: Verify Everything Works

### Test Checklist:

✅ Database connection successful  
✅ All tables created (16 core tables)  
✅ API server running on port 3000  
✅ Frontend can fetch data from API  
✅ Box packing screen loads data from database  
✅ Load planning screen loads data from database  
✅ Creating new items saves to database  
✅ History tracking works  
✅ Barcode scanning updates database  

---

## API Endpoints Available

Once setup is complete, you'll have these endpoints:

### Items
- `GET /api/items` - List all items
- `GET /api/items/:id` - Get single item
- `POST /api/items` - Create new item
- `PUT /api/items/:id` - Update item
- `DELETE /api/items/:id` - Delete item
- `GET /api/items/:id/history` - Get item history

### Boxes
- `GET /api/boxes` - List all boxes
- `GET /api/boxes/:id` - Get single box with contents
- `POST /api/boxes` - Create new box
- `PUT /api/boxes/:id` - Update box
- `DELETE /api/boxes/:id` - Delete box
- `GET /api/boxes/:id/contents` - Get box contents
- `POST /api/boxes/:id/pack` - Pack item into box
- `POST /api/boxes/:id/unpack` - Unpack item from box

### Trucks
- `GET /api/trucks` - List all trucks
- `GET /api/trucks/:id` - Get single truck
- `POST /api/trucks` - Create new truck
- `PUT /api/trucks/:id` - Update truck

### Load Plans
- `GET /api/load-plans` - List all load plans
- `GET /api/load-plans/:id` - Get load plan with boxes
- `POST /api/load-plans` - Create new load plan
- `PUT /api/load-plans/:id` - Update load plan
- `POST /api/load-plans/:id/load-box` - Load box onto truck
- `POST /api/load-plans/:id/unload-box` - Unload box from truck

### Locations
- `GET /api/locations` - List all locations
- `POST /api/locations` - Create new location

### Barcodes
- `GET /api/barcodes/:barcode` - Lookup by barcode
- `POST /api/barcodes/scan` - Record barcode scan

---

## Troubleshooting

### Connection Issues
```bash
# Test connection string format
echo $DATABASE_URL

# Check if PlanetScale is accessible
ping aws.connect.psdb.cloud
```

### Migration Errors
```bash
# Reset database (careful!)
pscale database delete raceteam-logistics-v5
pscale database create raceteam-logistics-v5

# Re-run migrations
pscale shell raceteam-logistics-v5 main < server/migrations/001_create_core_tables.sql
```

### Port Already in Use
```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9

# Or use different port in .env
PORT=3001
```

---

## Next Steps After Setup

1. **Deploy API to Production**
   - Railway, Render, or Vercel for Node.js API
   - Update frontend API_BASE_URL to production URL

2. **Add Authentication**
   - Implement user login/JWT tokens
   - Protect API endpoints

3. **Mobile Barcode App**
   - Build React Native or PWA for scanning
   - Connect to same API

4. **Real-time Updates**
   - Add WebSocket support for live updates
   - Multiple users can see changes instantly

5. **Reporting Dashboard**
   - Build analytics using the database
   - Track inventory turnover, load efficiency

---

## Support & Resources

- PlanetScale Docs: https://planetscale.com/docs
- PlanetScale Support: https://support.planetscale.com
- MySQL 8.0 Reference: https://dev.mysql.com/doc/

---

**Ready to start?** Run through Steps 1-5 first, then I'll help you with the actual migration scripts!
