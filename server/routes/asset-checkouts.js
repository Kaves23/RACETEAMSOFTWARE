const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { logActivity } = require('../lib/activityLog');

function genId() {
  return `co-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// GET /api/asset-checkouts/active  — all currently checked-out items
router.get('/active', async (req, res, next) => {
  try {
    // First refresh overdue status
    await pool.query(`
      UPDATE asset_checkouts
      SET status = 'overdue'
      WHERE status = 'active'
        AND expected_return_at IS NOT NULL
        AND expected_return_at < NOW()
    `);

    const result = await pool.query(`
      SELECT
        ac.*,
        i.name AS item_name, i.barcode, i.category, i.serial_number,
        u.username AS checked_out_by_username
      FROM asset_checkouts ac
      JOIN items i ON ac.item_id = i.id
      LEFT JOIN users u ON ac.checked_out_by_user_id = u.id
      WHERE ac.status IN ('active','overdue')
      ORDER BY ac.checked_out_at DESC
    `);
    res.json({ success: true, count: result.rows.length, checkouts: result.rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/asset-checkouts/overdue  — overdue items only
router.get('/overdue', async (req, res, next) => {
  try {
    await pool.query(`
      UPDATE asset_checkouts
      SET status = 'overdue'
      WHERE status = 'active'
        AND expected_return_at IS NOT NULL
        AND expected_return_at < NOW()
    `);

    const result = await pool.query(`
      SELECT
        ac.*,
        i.name AS item_name, i.barcode,
        EXTRACT(DAY FROM NOW() - ac.expected_return_at)::INTEGER AS days_overdue
      FROM asset_checkouts ac
      JOIN items i ON ac.item_id = i.id
      WHERE ac.status = 'overdue'
      ORDER BY ac.expected_return_at ASC
    `);
    res.json({ success: true, count: result.rows.length, checkouts: result.rows });
  } catch (err) {
    next(err);
  }
});

// GET /api/asset-checkouts  — history, filterable
router.get('/', async (req, res, next) => {
  try {
    const { item_id, person_id, status, event_id } = req.query;

    let q = `
      SELECT
        ac.*,
        i.name AS item_name, i.barcode, i.category,
        u.username AS checked_out_by_username
      FROM asset_checkouts ac
      JOIN items i ON ac.item_id = i.id
      LEFT JOIN users u ON ac.checked_out_by_user_id = u.id
      WHERE 1=1`;
    const params = [];
    let p = 1;

    if (item_id)   { q += ` AND ac.item_id = $${p++}`;            params.push(item_id); }
    if (person_id) { q += ` AND ac.checked_out_to_id = $${p++}`;  params.push(person_id); }
    if (status)    { q += ` AND ac.status = $${p++}`;              params.push(status); }
    if (event_id)  { q += ` AND ac.event_id = $${p++}`;           params.push(event_id); }

    q += ' ORDER BY ac.checked_out_at DESC LIMIT 200';
    const result = await pool.query(q, params);
    res.json({ success: true, count: result.rows.length, checkouts: result.rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/asset-checkouts  — checkout one or more items
// Body: { item_ids, checked_out_to_name, checked_out_to_type, checked_out_to_id,
//         event_id, expected_return_at, condition_out, notes_out }
router.post('/', async (req, res, next) => {
  try {
    const {
      item_ids,
      checked_out_to_name,
      checked_out_to_type = 'external',
      checked_out_to_id   = null,
      event_id            = null,
      expected_return_at  = null,
      condition_out       = 'good',
      notes_out           = null,
    } = req.body;

    if (!item_ids || !Array.isArray(item_ids) || item_ids.length === 0) {
      return res.status(400).json({ success: false, error: 'item_ids array is required' });
    }
    if (!checked_out_to_name || !checked_out_to_name.trim()) {
      return res.status(400).json({ success: false, error: 'checked_out_to_name is required' });
    }

    const userId   = req.user?.userId   || null;
    const userName = req.user?.username || null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const created = [];
      for (const itemId of item_ids) {
        const itemRow = await client.query(
          'SELECT id, name, status FROM items WHERE id = $1',
          [itemId]
        );
        if (itemRow.rows.length === 0) continue;
        const item = itemRow.rows[0];

        // Prevent double-checkout
        const existing = await client.query(
          "SELECT id FROM asset_checkouts WHERE item_id = $1 AND status IN ('active','overdue')",
          [itemId]
        );
        if (existing.rows.length > 0) {
          await client.query('ROLLBACK');
          return res.status(409).json({
            success: false,
            error: `Item "${item.name}" is already checked out. Return it before checking out again.`,
          });
        }

        const id = genId();
        await client.query(
          `INSERT INTO asset_checkouts
             (id, item_id, checked_out_by_user_id, checked_out_to_type, checked_out_to_id,
              checked_out_to_name, event_id, checked_out_at, expected_return_at,
              condition_out, notes_out, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),$8,$9,$10,'active')`,
          [id, itemId, userId, checked_out_to_type, checked_out_to_id,
           checked_out_to_name.trim(), event_id, expected_return_at,
           condition_out, notes_out]
        );

        // Mark item as in_use
        await client.query(
          "UPDATE items SET status = 'in_use', updated_at = NOW() WHERE id = $1",
          [itemId]
        );

        await logActivity(client, {
          entityType: 'item',
          entityId:   itemId,
          entityName: item.name,
          action:     'checked_out',
          eventId:    event_id,
          userId,
          userName,
          details: {
            checked_out_to:    checked_out_to_name.trim(),
            to_type:           checked_out_to_type,
            condition_out,
            expected_return_at,
          },
        });

        created.push(id);
      }

      await client.query('COMMIT');
      res.status(201).json({ success: true, count: created.length, checkout_ids: created });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

// PUT /api/asset-checkouts/:id/return  — process a return
router.put('/:id/return', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { condition_in = 'good', notes_in = null } = req.body;

    const userId   = req.user?.userId   || null;
    const userName = req.user?.username || null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const coRow = await client.query(
        `SELECT ac.*, i.name AS item_name
         FROM asset_checkouts ac
         JOIN items i ON ac.item_id = i.id
         WHERE ac.id = $1`,
        [id]
      );
      if (coRow.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, error: 'Checkout record not found' });
      }
      const co = coRow.rows[0];
      if (co.status === 'returned') {
        await client.query('ROLLBACK');
        return res.status(409).json({ success: false, error: 'Item was already returned' });
      }

      await client.query(
        `UPDATE asset_checkouts
         SET returned_at = NOW(), returned_by_user_id = $1,
             condition_in = $2, notes_in = $3, status = 'returned'
         WHERE id = $4`,
        [userId, condition_in, notes_in, id]
      );

      // Restore item to available
      await client.query(
        "UPDATE items SET status = 'available', updated_at = NOW() WHERE id = $1",
        [co.item_id]
      );

      await logActivity(client, {
        entityType: 'item',
        entityId:   co.item_id,
        entityName: co.item_name,
        action:     'returned',
        userId,
        userName,
        details: {
          returned_from: co.checked_out_to_name,
          condition_in,
          notes_in,
        },
      });

      await client.query('COMMIT');
      res.json({ success: true, message: 'Item returned successfully' });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});

module.exports = router;
