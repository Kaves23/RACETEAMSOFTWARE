# Driver Migration Guide

## Migrate Drivers from localStorage to PlanetScale Database

This guide provides **3 methods** to migrate your drivers from browser localStorage to the PlanetScale database.

---

## Method 1: Web UI Migration Tool (Easiest) ✅

### Step 1: View Current Drivers
1. Open: `export-drivers.html`
2. Click **"📤 Export Drivers"**
3. Review the list of drivers in localStorage

### Step 2: Migrate to Database
1. Open: `migrate-drivers.html`
2. Click **"📂 Load Drivers"**
3. Review the drivers to be migrated
4. Click **"🚀 Migrate All Drivers to PlanetScale"**
5. Wait for migration to complete
6. Click **"Go to Settings → Drivers"** to verify

**✅ Done!** Your drivers are now in PlanetScale.

---

## Method 2: Command Line Script

### Step 1: Export Drivers to JSON
1. Open: `export-drivers.html`
2. Click **"📤 Export Drivers"**
3. Click **"💾 Download JSON File"**
4. Save as `drivers-export.json`

### Step 2: Run Migration Script
```bash
cd server
node migrate-drivers.js ../drivers-export.json
```

The script will:
- Read drivers from the JSON file
- Insert/update them in PlanetScale
- Show migration summary

---

## Method 3: Direct API Import (Advanced)

### Step 1: Get Driver Data
```javascript
// In browser console (on any page with core.js)
const settings = RTS.getSettings();
const drivers = settings.drivers || [];
console.log(JSON.stringify(drivers, null, 2));
```

### Step 2: Send to API
```bash
curl -X POST https://raceteamsoftware.onrender.com/api/import-localStorage \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "drivers": [
      {
        "id": "driver-001",
        "name": "Lewis Hamilton",
        "license_number": "LH44",
        "phone": "+44 123 456 7890",
        "email": "lewis@example.com",
        "is_active": true
      }
    ]
  }'
```

---

## What Gets Migrated?

The migration handles these driver fields:

**Core Fields:**
- `id` - Unique identifier
- `name` - Driver name
- `license_number` - License/race number
- `phone` - Contact phone
- `email` - Email address
- `is_active` - Active status

**Extended Fields:**
- `license_expiry` - License expiration date
- `emergency_contact` - Emergency contact name
- `emergency_phone` - Emergency phone number
- `blood_type` - Blood type
- `medical_notes` - Medical information
- `address` - Address
- `insurance_provider` - Insurance company
- `insurance_policy` - Policy number

**Handles both formats:**
- String format: `"Lewis Hamilton"`
- Object format: `{ name: "Lewis Hamilton", license_number: "LH44" }`

---

## Verification

After migration, verify drivers appear in:

1. **Settings Page:**
   - Go to `settings.html`
   - Click **Drivers** tab
   - See all migrated drivers

2. **Box Packing Page:**
   - Go to `box-packing.html`
   - Create a driver box
   - Driver dropdown should show all migrated drivers

3. **Database Query:**
   ```sql
   SELECT * FROM drivers ORDER BY name;
   ```

---

## Troubleshooting

### "No drivers found"
- Check localStorage: Open browser console and run `RTS.getSettings().drivers`
- Make sure you've added drivers in Settings first

### "Migration failed"
- Check database connection in `.env` (DATABASE_URL)
- Verify authentication token is valid
- Check server logs for errors

### "Drivers not appearing in UI"
- Hard refresh the page (Ctrl+Shift+R / Cmd+Shift+R)
- Clear browser cache
- Check browser console for errors

---

## Files Involved

- **`export-drivers.html`** - Export drivers from localStorage to JSON
- **`migrate-drivers.html`** - Web UI migration tool
- **`server/migrate-drivers.js`** - Command-line migration script
- **`server/routes/import-localStorage.js`** - API endpoint for bulk import

---

## After Migration

Once drivers are migrated:

1. ✅ Drivers stored in PlanetScale database
2. ✅ Available across all devices/browsers
3. ✅ Persistent (won't be lost if localStorage is cleared)
4. ✅ Can be used in:
   - Settings → Drivers management
   - Box Packing → Driver box assignments
   - Events → Driver assignments
   - Orders → Driver delivery tracking

**Note:** The migration is **safe and idempotent** - running it multiple times won't create duplicates (uses UPSERT based on driver ID).

---

## Need Help?

1. Check browser console for errors
2. Check server logs: `npm start` output
3. Test database connection: `node server/test-connection.js`
