# Inventory Quantity Tracking - FIXED ✅

**Date**: 7 April 2026  
**Status**: 🟢 INVENTORY CAN NOW BE SPLIT ACROSS MULTIPLE BOXES

---

## PROBLEM SOLVED

**Before**: If you had 5 units of an inventory item, you could only pack it into ONE box. After packing 1 unit, the item would grey out and become unavailable.

**After**: You can now pack different quantities into different boxes:
- Total: 5 units
- Pack 2 units → Box A
- Pack 1 unit → Box B  
- Pack 2 units → Box C
- Available: 0 units (all packed)

---

## HOW IT WORKS NOW

### 📦 Packing Inventory Items

1. **Drag an inventory item** to a box or box card
2. **Quantity prompt appears**: 
   - Shows available units
   - Shows total units  
   - Shows already packed units
3. **Enter quantity** (e.g., "2")
4. **Item packs** with that quantity
5. **Item stays available** until all units are packed

### 📊 Visual Indicators

**In the items list:**
```
🛢️ Engine Oil - 10W40
📦 Qty: 3 available / 2 packed / 5 total
```

**In box contents:**
```
2× OIL-10W40   Engine Oil - 10W40
```

The `2×` badge shows how many units are in that box.

### ✅ Smart Greying Out

- **Equipment/Assets**: Grey out when packed (can only be in 1 box)
- **Inventory**: Only grey out when **ALL units are packed**
  - 5 total, 2 packed → Still draggable (3 available)
  - 5 total, 5 packed → Greyed out (0 available)

---

## DATABASE CHANGES

### New Migration: `028_add_quantity_to_box_contents.sql`

1. **Added `quantity_packed` column** to `box_contents` table
   - Tracks how many units of each inventory item in each box
   - Default = 1 for equipment/assets

2. **Changed primary key structure**
   - Removed unique constraint on `(box_id, item_id)`
   - Added new `id` column as primary key
   - Allows same inventory item in multiple boxes

3. **Added constraint**
   - Only equipment/assets enforce uniqueness per box
   - Inventory items can be in multiple boxes

---

## API CHANGES

### `/api/inventory/pack` (POST)

**Before**:
```javascript
{ boxId: "box-123", itemId: "inv-456" }
```

**After**:
```javascript
{ 
  boxId: "box-123", 
  itemId: "inv-456", 
  quantity: 2  // ← NEW!
}
```

**Response includes**:
```javascript
{
  success: true,
  quantityPacked: 2,
  totalPacked: 4,
  availableQuantity: 1
}
```

### `/api/inventory/unpack` (POST)

**New features**:
```javascript
// Unpack specific quantity from specific box
{ itemId: "inv-456", boxId: "box-123", quantity: 1 }

// Unpack all from specific box
{ itemId: "inv-456", boxId: "box-123" }

// Unpack from ALL boxes
{ itemId: "inv-456" }
```

---

## FRONTEND CHANGES

### `box-packing-engine.js`

1. **Quantity tracking** instead of binary packed/unpacked
2. **Quantity prompt** when packing inventory
3. **Available quantity display** in item cards
4. **Quantity badges** in box contents (`2×`)
5. **Smart greying** based on available units

### `core.js`

- Updated `packInventoryItem()` to accept `quantity` parameter

---

## 🚀 DEPLOYMENT

### Step 1: Run Migration
```bash
cd server
node run-migrations.js
```

This will:
- Add `quantity_packed` column
- Change primary key structure
- Set defaults for existing data

### Step 2: Restart Server
```bash
npm start
```

### Step 3: Clear Browser Cache
- Dev Tools (F12) → Right-click Refresh → "Empty Cache and Hard Reload"

---

## 🧪 TEST SCENARIOS

### ✅ Pack Inventory Across Multiple Boxes

1. Go to box-packing.html
2. Filter to "Inventory" items
3. Find an item with quantity > 1 (e.g., "Engine Oil - 5 units")
4. Drag it to Box A
5. Enter quantity: 2
6. ✅ Item still appears in list (3 available)
7. Drag same item to Box B
8. Enter quantity: 3
9. ✅ Item greys out (0 available)
10. Check Box A → Shows "2× Engine Oil"
11. Check Box B → Shows "3× Engine Oil"

### ✅ Unpack Partial Quantity

1. Click ✕ button on inventory item in a box
2. ✅ Removes ALL units from that box
3. Item becomes available again

### ✅ Equipment/Assets Still Work

1. Equipment/assets pack as before (no quantity prompt)
2. They can only be in one box at a time
3. Greyed out immediately when packed

---

## 📋 FILES CHANGED

1. ✅ `server/migrations/028_add_quantity_to_box_contents.sql` - NEW
2. ✅ `server/run-migrations.js` - Added migration to list
3. ✅ `server/routes/inventory.js` - Quantity support in pack/unpack
4. ✅ `box-packing-engine.js` - Quantity tracking & UI
5. ✅ `core.js` - API method updated

---

## 💡 EXAMPLES

### Before (BROKEN)
```
Inventory: Brake Fluid (5 units total)
→ Pack into Box A: 1 unit
→ Item GREYS OUT ❌
→ Can't pack into Box B ❌
```

### After (FIXED)
```
Inventory: Brake Fluid (5 units total)
→ Pack into Box A: 2 units
   Prompt: "How many? (Available: 5)" → Enter 2
→ Item STILL AVAILABLE ✅ (3 units left)
→ Pack into Box B: 2 units
   Prompt: "How many? (Available: 3)" → Enter 2
→ Item STILL AVAILABLE ✅ (1 unit left)
→ Pack into Box C: 1 unit
   Prompt: "How many? (Available: 1)" → Enter 1
→ Item GREYS OUT ✅ (0 units left)

Box A contents: 2× Brake Fluid
Box B contents: 2× Brake Fluid
Box C contents: 1× Brake Fluid
Total packed: 5 units ✅
```

---

## 🎯 BENEFITS

1. ✅ **Realistic inventory management** - matches real-world packing
2. ✅ **Better visibility** - see how many units in each box
3. ✅ **Prevents errors** - can't pack more than available
4. ✅ **Flexible unpacking** - remove all from one box, still in others
5. ✅ **Works with existing data** - migration handles old records

---

**The system now properly handles consumable inventory with quantities across multiple boxes!**
