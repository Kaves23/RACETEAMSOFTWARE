const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { logActivity } = require('../lib/activityLog');
const SHOPIFY_LINKED_CONDITION = '(shopify_variant_id IS NOT NULL OR shopify_product_id IS NOT NULL)';

async function logShopifyGuardBlock(req, entityId, reason, details = {}) {
  await logActivity(pool, {
    entityType: 'inventory',
    entityId: String(entityId || 'unknown'),
    entityName: 'Shopify-linked inventory',
    action: 'policy_blocked',
    userId: req.user?.userId || null,
    userName: req.user?.username || null,
    details: {
      policy: 'shopify_inventory_separation',
      reason,
      ...details
    }
  });
}

// POST /api/inventory/pack - Pack inventory item into box (with quantity)
router.post('/pack', async (req, res, next) => {
  try {
    const { boxId, itemId, quantity, variantLabel } = req.body;
    
    console.log('📦 /api/inventory/pack called:', { boxId, itemId, quantity, variantLabel });
    
    if (!boxId || !itemId) {
      console.error('❌ Missing fields:', { boxId, itemId });
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: boxId, itemId',
        received: { boxId, itemId, quantity }
      });
    }
    
    const quantityToPack = parseInt(quantity) || 1;
    const override = req.body.override === true; // allow packing even if Shopify stock shows 0
    
    if (quantityToPack <= 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Quantity must be greater than 0' 
      });
    }
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get current inventory item
      const invResult = await client.query(
        'SELECT * FROM inventory WHERE id = $1',
        [itemId]
      );
      
      if (invResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Inventory item not found' });
      }
      
      const inventoryItem = invResult.rows[0];
      
      // Calculate already packed quantity across all boxes
      const packedResult = await client.query(
        `SELECT COALESCE(SUM(quantity_packed), 0) as total_packed 
         FROM box_contents 
         WHERE item_id = $1 AND item_type = 'inventory'`,
        [itemId]
      );
      
      const alreadyPacked = parseInt(packedResult.rows[0].total_packed) || 0;
      const availableQuantity = inventoryItem.quantity - alreadyPacked;
      
      if (quantityToPack > availableQuantity && !override) {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          success: false, 
          error: `Insufficient quantity. Available: ${availableQuantity}, Requested: ${quantityToPack}` 
        });
      }
      
      // Check if this item (+ optional variant) is already in this box
      const existingEntry = await client.query(
        `SELECT * FROM box_contents WHERE box_id = $1 AND item_id = $2 AND item_type = 'inventory' AND (variant_label = $3 OR (variant_label IS NULL AND $3 IS NULL))`,
        [boxId, itemId, variantLabel || null]
      );
      
      if (existingEntry.rows.length > 0) {
        // Update existing entry - add to quantity
        await client.query(
          `UPDATE box_contents 
           SET quantity_packed = quantity_packed + $1, packed_at = NOW() 
           WHERE box_id = $2 AND item_id = $3 AND item_type = 'inventory' AND (variant_label = $4 OR (variant_label IS NULL AND $4 IS NULL))`,
          [quantityToPack, boxId, itemId, variantLabel || null]
        );
      } else {
        // Create new box_contents entry
        await client.query(
          `INSERT INTO box_contents (box_id, item_id, item_type, quantity_packed, packed_at, variant_label)
           VALUES ($1, $2, 'inventory', $3, NOW(), $4)`,
          [boxId, itemId, quantityToPack, variantLabel || null]
        );
      }
      
      // Don't update current_box_id for inventory - it can be in multiple boxes
      // Just update the timestamp
      await client.query(
        'UPDATE inventory SET updated_at = NOW() WHERE id = $1',
        [itemId]
      );
      
      await client.query('COMMIT');
      
      res.json({ 
        success: true, 
        message: `Packed ${quantityToPack} units into box`,
        item: inventoryItem,
        quantityPacked: quantityToPack,
        totalPacked: alreadyPacked + quantityToPack,
        availableQuantity: availableQuantity - quantityToPack
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
});

// POST /api/inventory/unpack - Unpack inventory item from box (specific box or all boxes)
router.post('/unpack', async (req, res, next) => {
  try {
    const { itemId, boxId, quantity } = req.body;
    
    if (!itemId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required field: itemId' 
      });
    }
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      const itemCheck = await client.query(
        `SELECT id, name FROM inventory WHERE id = $1 AND ${SHOPIFY_LINKED_CONDITION} LIMIT 1`,
        [itemId]
      );
      if (itemCheck.rows.length > 0) {
        await logShopifyGuardBlock(req, itemId, 'inventory_unpack_rejected_linked_row', {
          route: '/api/inventory/unpack',
          boxId: boxId || null
        });
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          error: 'Shopify-linked items cannot be unpacked via generic inventory route. Use Shopify return/billing flow.'
        });
      }
      
      if (boxId) {
        // Unpack from specific box
        const quantityToUnpack = parseInt(quantity) || null;
        
        if (quantityToUnpack && quantityToUnpack > 0) {
          // Unpack specific quantity
          const currentEntry = await client.query(
            'SELECT * FROM box_contents WHERE box_id = $1 AND item_id = $2 AND item_type = \'inventory\'',
            [boxId, itemId]
          );
          
          if (currentEntry.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'Item not found in this box' });
          }
          
          const currentQty = currentEntry.rows[0].quantity_packed;
          
          if (quantityToUnpack >= currentQty) {
            // Remove entire entry
            await client.query(
              `DELETE FROM box_contents WHERE box_id = $1 AND item_id = $2 AND item_type = 'inventory'`,
              [boxId, itemId]
            );
          } else {
            // Reduce quantity
            await client.query(
              `UPDATE box_contents 
               SET quantity_packed = quantity_packed - $1 
               WHERE box_id = $2 AND item_id = $3 AND item_type = 'inventory'`,
              [quantityToUnpack, boxId, itemId]
            );
          }
        } else {
          // Remove all from this box
          await client.query(
            `DELETE FROM box_contents WHERE box_id = $1 AND item_id = $2 AND item_type = 'inventory'`,
            [boxId, itemId]
          );
        }
      } else {
        // Remove from ALL boxes
        await client.query(
          `DELETE FROM box_contents WHERE item_id = $1 AND item_type = 'inventory'`,
          [itemId]
        );
      }
      
      // Update inventory item timestamp
      const result = await client.query(
        'UPDATE inventory SET updated_at = NOW() WHERE id = $1 RETURNING *',
        [itemId]
      );
      
      if (result.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Inventory item not found' });
      }
      
      await client.query('COMMIT');

      // ── Audit logging ────────────────────────────────────────────
      const item     = result.rows[0];
      const userId   = req.user?.userId   || null;
      const userName = req.user?.username || null;

      // inventory_history row
      const ihId = `ih-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
      pool.query(
        `INSERT INTO inventory_history
           (id, inventory_id, action, qty_before, qty_change, qty_after, performed_by_user_id, notes)
         VALUES ($1,$2,'unpacked_from_box',NULL,NULL,NULL,$3,$4)`,
        [ihId, itemId, userId, boxId ? `Unpacked from box ${boxId}` : 'Unpacked from all boxes']
      ).catch(e => console.warn('[inventory_history/unpack]', e.message));

      // activity_log row
      logActivity(pool, {
        entityType: 'inventory',
        entityId:   itemId,
        entityName: item.name,
        action:     'unpacked_from_box',
        userId,
        userName,
        details: { boxId: boxId || null, source: 'mobile' },
      }).catch(() => {});

      res.json({ success: true, item });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
});

// GET /api/inventory/bug-diagnostic - Deep investigation for items silently removed by the unpackInventoryItem-missing-boxId bug.
// Checks: (1) inventory_history, (2) activity_log, (3) orphaned items with no box/location.
// Safe read-only endpoint. Remove once investigation is complete.
router.get('/bug-diagnostic', async (req, res, next) => {
  try {
    const report = {};

    // ── 1. Discover which audit tables exist ──────────────────────────────────
    const tableCheck = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('inventory_history', 'activity_log', 'inventory', 'box_contents')
    `);
    report.tables_present = tableCheck.rows.map(r => r.table_name);

    // Discover which columns exist on inventory to avoid crashing on missing columns
    const colCheck = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'inventory'
    `);
    const inventoryCols = new Set(colCheck.rows.map(r => r.column_name));
    report.inventory_columns = Array.from(inventoryCols);

    // Discover activity_log columns (details may be TEXT or JSONB)
    const alColCheck = await pool.query(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'activity_log'
    `);
    const alColMap = {};
    alColCheck.rows.forEach(r => { alColMap[r.column_name] = r.data_type; });
    report.activity_log_columns = alColMap;

    // Row counts + date ranges for each audit table
    const tableMeta = {};
    for (const t of ['inventory_history', 'activity_log']) {
      if (report.tables_present.includes(t)) {
        try {
          const meta = await pool.query(`SELECT COUNT(*) AS total, MIN(created_at) AS oldest, MAX(created_at) AS newest FROM ${t}`);
          tableMeta[t] = meta.rows[0];
        } catch(e) { tableMeta[t] = { error: e.message }; }
      }
    }
    report.table_meta = tableMeta;

    // ── 2. inventory_history: "Unpacked from all boxes" (bug fingerprint) ─────
    let inventoryHistoryMatches = [];
    if (report.tables_present.includes('inventory_history')) {
      try {
        const r = await pool.query(`
          SELECT ih.inventory_id AS item_id, i.name AS item_name, i.sku,
                 ih.created_at AS unpacked_at, ih.notes
          FROM inventory_history ih
          LEFT JOIN inventory i ON i.id::text = ih.inventory_id::text
          WHERE ih.action = 'unpacked_from_box'
            AND ih.notes  = 'Unpacked from all boxes'
          ORDER BY ih.created_at DESC
        `);
        inventoryHistoryMatches = r.rows;
      } catch(e) { report.inventory_history_error = e.message; }
    }
    report.inventory_history_suspect_count = inventoryHistoryMatches.length;

    // ── 3. activity_log: all inventory unpack events ──────────────────────────
    // Parse details safely in JS rather than using ::jsonb in SQL (column may be TEXT)
    let allUnpackEvents = [];
    if (report.tables_present.includes('activity_log')) {
      try {
        const r = await pool.query(`
          SELECT entity_id AS item_id, entity_name AS item_name,
                 created_at AS unpacked_at, details
          FROM activity_log
          WHERE entity_type = 'inventory'
            AND action      = 'unpacked_from_box'
          ORDER BY created_at DESC
          LIMIT 200
        `);
        allUnpackEvents = r.rows.map(row => {
          let parsedDetails = null;
          try { parsedDetails = row.details ? JSON.parse(row.details) : null; } catch(e) {}
          return { ...row, details: parsedDetails };
        });
      } catch(e) { report.activity_log_error = e.message; }
    }
    report.all_unpack_events = allUnpackEvents;
    // Bug fingerprint: unpack events where boxId is null/missing in details
    const activityLogMatches = allUnpackEvents.filter(r =>
      !r.details || r.details.boxId == null
    );
    report.activity_log_suspect_count = activityLogMatches.length;
    report.activity_log_suspect_events = activityLogMatches;

    // ── 3b. ALL pack/unpack events last 10 days (full timeline view) ──────────
    let last10DaysActivity = [];
    if (report.tables_present.includes('activity_log')) {
      try {
        const r = await pool.query(`
          SELECT entity_id AS item_id, entity_name AS item_name,
                 action, created_at, details
          FROM activity_log
          WHERE entity_type = 'inventory'
            AND action IN ('packed_into_box', 'unpacked_from_box')
            AND created_at >= NOW() - INTERVAL '10 days'
          ORDER BY created_at DESC
          LIMIT 500
        `);
        // Group by item_id for readability
        const byItem = {};
        for (const row of r.rows) {
          let d = null;
          try { d = row.details ? JSON.parse(row.details) : null; } catch(e) {}
          const key = row.item_id;
          if (!byItem[key]) byItem[key] = { item_id: row.item_id, item_name: row.item_name, events: [] };
          byItem[key].events.push({ action: row.action, at: row.created_at, boxId: d?.boxId || null, boxName: d?.boxName || null });
        }
        last10DaysActivity = Object.values(byItem);
      } catch(e) { report.last_10_days_error = e.message; }
    }
    report.last_10_days_by_item = last10DaysActivity;
    report.last_10_days_total_events = last10DaysActivity.reduce((sum, i) => sum + i.events.length, 0);

    // ── 4. CLEVER: Find inventory items in NO box ─────────────────────────────
    // items not in box_contents at all
    let orphans = [];
    if (report.tables_present.includes('inventory') && report.tables_present.includes('box_contents')) {
      try {
        // Build SELECT dynamically based on which columns actually exist
        const selectCols = ['i.id', 'i.name'];
        if (inventoryCols.has('sku'))            selectCols.push('i.sku');
        if (inventoryCols.has('total_quantity'))  selectCols.push('i.total_quantity');
        if (inventoryCols.has('quantity'))        selectCols.push('i.quantity');
        if (inventoryCols.has('updated_at'))      selectCols.push('i.updated_at');
        if (inventoryCols.has('current_location_id')) selectCols.push('i.current_location_id');

        const r = await pool.query(`
          SELECT ${selectCols.join(', ')}
          FROM inventory i
          WHERE NOT EXISTS (
            SELECT 1 FROM box_contents bc
            WHERE bc.item_id::text = i.id::text AND bc.item_type = 'inventory'
          )
          ORDER BY ${inventoryCols.has('updated_at') ? 'i.updated_at DESC' : 'i.id'}
        `);
        orphans = r.rows;
      } catch(e) { report.orphans_error = e.message; }
    }
    report.items_not_in_any_box_count = orphans.length;

    // ── 5. Of orphans, find ones that have ANY pack/unpack event in activity_log
    const orphansWithHistory = [];
    if (report.tables_present.includes('activity_log') && orphans.length > 0) {
      for (const item of orphans.slice(0, 100)) {
        try {
          const hist = await pool.query(`
            SELECT action, details, created_at
            FROM activity_log
            WHERE entity_id::text = $1 AND entity_type = 'inventory'
              AND action IN ('packed_into_box', 'unpacked_from_box')
            ORDER BY created_at DESC LIMIT 5
          `, [String(item.id)]);
          if (hist.rows.length > 0) {
            orphansWithHistory.push({
              item_id:      item.id,
              item_name:    item.name,
              sku:          item.sku || null,
              quantity:     item.total_quantity || item.quantity || null,
              last_updated: item.updated_at || null,
              recent_pack_events: hist.rows.map(r => {
                let d = null;
                try { d = r.details ? JSON.parse(r.details) : null; } catch(e) {}
                return { action: r.action, created_at: r.created_at, details: d };
              })
            });
          }
        } catch(e) { /* skip this item */ }
      }
    }
    report.orphans_with_pack_history = orphansWithHistory;

    // ── Summary ───────────────────────────────────────────────────────────────
    report.summary = {
      logging_was_working: (tableMeta['inventory_history']?.total > 0) || (tableMeta['activity_log']?.total > 0),
      bug_traces_in_inventory_history: inventoryHistoryMatches.length,
      bug_traces_in_activity_log:      activityLogMatches.length,
      items_not_in_any_box:            orphans.length,
      orphans_with_pack_history:       orphansWithHistory.length,
      conclusion: (inventoryHistoryMatches.length === 0 && activityLogMatches.length === 0 && orphansWithHistory.length === 0)
        ? 'No evidence of data loss. Bug likely never fired on real data, or logging was not active at the time.'
        : 'Possible affected items found — review orphans_with_pack_history and activity_log_suspect_events.'
    };

    res.json({ success: true, report });
  } catch (error) {
    next(error);
  }
});

// PUT /api/inventory/:id - Update inventory item
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (updates.shopify_variant_id || updates.shopify_product_id) {
      await logShopifyGuardBlock(req, id, 'inventory_update_rejected_shopify_fields', {
        route: '/api/inventory/:id',
        has_shopify_variant_id: !!updates.shopify_variant_id,
        has_shopify_product_id: !!updates.shopify_product_id
      });
      return res.status(409).json({
        success: false,
        error: 'Shopify link fields are managed only by Shopify routes.'
      });
    }

    const linkedItem = await pool.query(
      `SELECT id FROM inventory WHERE id = $1 AND ${SHOPIFY_LINKED_CONDITION} LIMIT 1`,
      [id]
    );
    if (linkedItem.rows.length > 0) {
      await logShopifyGuardBlock(req, id, 'inventory_update_rejected_linked_row', {
        route: '/api/inventory/:id'
      });
      return res.status(409).json({
        success: false,
        error: 'Shopify-linked items cannot be edited via generic inventory route.'
      });
    }
    
    // Build dynamic UPDATE query
    const fields = [];
    const values = [];
    let paramCount = 1;
    
    const allowedFields = [
      'name', 'sku', 'category', 'description', 'quantity',
      'min_quantity', 'unit', 'unit_of_measure', 'unit_cost', 'location_id',
      'supplier', 'supplier_id', 'lead_time_days', 'last_restocked_date', 'notes',
      'current_box_id', 'location_distribution', 'auto_reorder'
    ];
    
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }
    
    if (fields.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid fields to update' });
    }
    
    fields.push(`updated_at = NOW()`);
    values.push(id);

    // Capture qty_before so we can record a delta in inventory_history
    const beforeRow = await pool.query('SELECT quantity FROM inventory WHERE id = $1', [id]);
    const qtyBefore = parseInt(beforeRow.rows[0]?.quantity) || 0;

    const query = `UPDATE inventory SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Inventory item not found' });
    }

    const item   = result.rows[0];
    const userId = req.user?.userId || null;

    if (updates.quantity !== undefined) {
      const qtyAfter  = parseInt(updates.quantity) || 0;
      const qtyChange = qtyAfter - qtyBefore;
      if (qtyChange !== 0) {
        const histId     = `ih-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        const histAction = qtyChange > 0 ? 'restocked' : 'used';
        pool.query(
          `INSERT INTO inventory_history
             (id, inventory_id, action, qty_before, qty_change, qty_after, performed_by_user_id, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [histId, id, histAction, qtyBefore, qtyChange, qtyAfter, userId, updates.notes || null]
        ).catch(e => console.warn('[inventory_history]', e.message));
      }
    }

    logActivity(pool, {
      entityType: 'inventory',
      entityId:   id,
      entityName: item.name,
      action:     'updated',
      userId,
      userName:   req.user?.username || null,
      details: updates.quantity !== undefined
        ? { qty_before: qtyBefore, qty_after: parseInt(updates.quantity) || 0 }
        : undefined,
    }).catch(() => {});

    res.json({ success: true, item });
  } catch (error) {
    next(error);
  }
});

// GET /api/inventory/:id/history - Fetch change history for one item
router.get('/:id/history', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT ih.*,
              u.full_name AS performed_by_name
       FROM inventory_history ih
       LEFT JOIN users u ON u.id = ih.performed_by_user_id::int
       WHERE ih.inventory_id = $1
       ORDER BY ih.created_at DESC
       LIMIT 100`,
      [req.params.id]
    );
    res.json({ success: true, history: result.rows });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/inventory/:id - Delete inventory item
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const linkedItem = await pool.query(
      `SELECT id FROM inventory WHERE id = $1 AND ${SHOPIFY_LINKED_CONDITION} LIMIT 1`,
      [id]
    );
    if (linkedItem.rows.length > 0) {
      await logShopifyGuardBlock(req, id, 'inventory_delete_rejected_linked_row', {
        route: '/api/inventory/:id'
      });
      return res.status(409).json({
        success: false,
        error: 'Shopify-linked items cannot be deleted via generic inventory route.'
      });
    }
    
    const result = await pool.query(
      'DELETE FROM inventory WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Inventory item not found' });
    }
    
    // Also remove from box_contents if packed
    await pool.query(
      `DELETE FROM box_contents WHERE item_id = $1 AND item_type = 'inventory'`,
      [id]
    );
    
    res.json({ success: true, item: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
