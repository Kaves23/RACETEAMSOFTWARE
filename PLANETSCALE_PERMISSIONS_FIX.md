# Fix PlanetScale Permissions

## Problem
Your database user doesn't have permission to create tables in the `public` schema.

## Solution: Grant Permissions in PlanetScale Dashboard

### Step 1: Go Back to PlanetScale
1. Open https://app.planetscale.com
2. Click your database: **raceteam-logistics-v5**
3. Go to **Settings** → **Passwords**

### Step 2: Create a New Password with Full Permissions
1. Click **"New password"**
2. Name it: **"admin-full-access"**
3. **IMPORTANT:** Make sure these permissions are checked:
   - ✅ **postgres** (Database admin role)
   - ✅ **pg_write_all_data** (Write to all tables)
   - ✅ **pg_read_all_data** (Read from all tables)

### Step 3: Update Your .env File
Replace the credentials in your `.env` file with the new ones.

## Alternative: Use PlanetScale Web Console

### Option A: Run SQL in Web Console
1. In PlanetScale dashboard, click **"Console"** tab
2. Copy and paste the contents of `server/migrations/001_create_core_tables.sql`
3. Click **"Run"**

### Option B: Use the "Schema" Tab
1. Click the **"Schema"** tab in PlanetScale
2. Use the visual schema editor to create tables
3. Or import the SQL file directly

## What We Need
You need a database role that has:
- CREATE permission on the `public` schema
- INSERT, UPDATE, DELETE, SELECT permissions

## Quick Fix Command
Try running this in the PlanetScale web console:

```sql
GRANT ALL PRIVILEGES ON SCHEMA public TO pscale_api_1a7aqbob0172;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO pscale_api_1a7aqbob0172;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO pscale_api_1a7aqbob0172;
```

Then run migrations again:
```bash
node server/run-migrations.js
```
