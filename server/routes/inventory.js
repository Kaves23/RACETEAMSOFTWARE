const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { logActivity } = require('../lib/activityLog');

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

    // ── 1. Check whether audit tables exist and have any data at all ──────────
    const tableCheck = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('inventory_history', 'activity_log')
    `);
    report.tables_present = tableCheck.rows.map(r => r.table_name);

    // Row counts and date ranges for each table so we know if logging was working
    const tableMeta = {};
    for (const t of report.tables_present) {
      const meta = await pool.query(`SELECT COUNT(*) AS total, MIN(created_at) AS oldest, MAX(created_at) AS newest FROM ${t}`);
      tableMeta[t] = meta.rows[0];
    }
    report.table_meta = tableMeta;

    // ── 2. inventory_history: "Unpacked from all boxes" (bug fingerprint) ─────
    let inventoryHistoryMatches = [];
    if (report.tables_present.includes('inventory_history')) {
      const r = await pool.query(`
        SELECT ih.inventory_id AS item_id, i.name AS item_name, i.sku,
               ih.created_at AS unpacked_at
        FROM inventory_history ih
        JOIN inventory i ON i.id = ih.inventory_id
        WHERE ih.action = 'unpacked_from_box'
          AND ih.notes  = 'Unpacked from all boxes'
        ORDER BY ih.created_at DESC
      `);
      inventoryHistoryMatches = r.rows;
    }
    report.inventory_history_suspect_count = inventoryHistoryMatches.length;

    // ── 3. activity_log: unpacked_from_box events with no boxId in details ────
    let activityLogMatches = [];
    if (report.tables_present.includes('activity_log')) {
      const r = await pool.query(`
        SELECT entity_id AS item_id, entity_name AS item_name, created_at AS unpacked_at,
               details
        FROM activity_log
        WHERE entity_type = 'inventory'
          AND action      = 'unpacked_from_box'
          AND (details IS NULL OR details::jsonb->>'boxId' IS NULL OR details::jsonb->>'boxId' = 'null')
        ORDER BY created_at DESC
      `);
      activityLogMatches = r.rows;
    }
    report.activity_log_suspect_count = activityLogMatches.length;

    // ── 4. All unpack events from activity_log (any boxId) — full picture ─────
    let allUnpackEvents = [];
    if (report.tables_present.includes('activity_log')) {
      const r = await pool.query(`
        SELECT entity_id AS item_id, entity_name AS item_name, created_at AS unpacked_at,
               details
        FROM activity_log
        WHERE entity_type = 'inventory'
          AND action      = 'unpacked_from_box'
        ORDER BY created_at DESC
        LIMIT 200
      `);
      allUnpackEvents = r.rows;
    }
    report.all_unpack_events_sample = allUnpackEvents;

    // ── 5. CLEVER: Find inventory items currently in NO box and NO location ───
    // These are the "lost" items — not in box_contents, and current_location_id is null.
    // Cross-reference with pack history to see if they were ever packed.
    const orphans = await pool.query(`
      SELECT
        i.id, i.name, i.sku, i.total_quantity,
        i.current_location_id,
        i.updated_at,
        (SELECT COUNT(*) FROM box_contents bc WHERE bc.item_id = i.id AND bc.item_type = 'inventory') AS boxes_packed_in
      FROM inventory i
      WHERE i.current_location_id IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM box_contents bc
          WHERE bc.item_id = i.id AND bc.item_type = 'inventory'
        )
      ORDER BY i.updated_at DESC
    `);
    report.orphaned_items_no_box_no_location = orphans.rows;
    report.orphaned_count = orphans.rows.length;

    // ── 6. For each orphan, find their most recent pack event in activity_log ─
    const orphanHistory = [];
    if (report.tables_present.includes('activity_log')) {
      for (const item of orphans.rows.slice(0, 50)) { // cap at 50
        const lastPack = await pool.query(`
          SELECT details, created_at
          FROM activity_log
          WHERE entity_id   = $1
            AND entity_type = 'inventory'
            AND action      = 'packed_into_box'
          ORDER BY created_at DESC
          LIMIT 1
        `, [String(item.id)]);
        const lastUnpack = await pool.query(`
          SELECT details, created_at
          FROM activity_log
          WHERE entity_id   = $1
            AND entity_type = 'inventory'
            AND action      = 'unpacked_from_box'
          ORDER BY created_at DESC
          LIMIT 1
        `, [String(item.id)]);
        if (lastPack.rows.length > 0 || lastUnpack.rows.length > 0) {
          orphanHistory.push({
            item_id:        item.id,
            item_name:      item.name,
            sku:            item.sku,
            total_quantity: item.total_quantity,
            last_updated:   item.updated_at,
            last_pack_event:   lastPack.rows[0]  || null,
            last_unpack_event: lastUnpack.rows[0] || null,
          });
        }
      }
    }
    report.orphans_with_pack_history = orphanHistory;

    // ── Summary ───────────────────────────────────────────────────────────────
    report.summary = {
      logging_was_working: tableMeta['inventory_history']?.total > 0 || tableMeta['activity_log']?.total > 0,
      bug_traces_in_inventory_history: inventoryHistoryMatches.length,
      bug_traces_in_activity_log:      activityLogMatches.length,
      orphaned_items_possibly_affected: orphanHistory.length,
      conclusion: (inventoryHistoryMatches.length === 0 && activityLogMatches.length === 0 && orphanHistory.length === 0)
        ? 'No evidence of data loss found in any source. Bug likely never fired on real data.'
        : 'Possible affected items found — review orphans_with_pack_history.'
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
