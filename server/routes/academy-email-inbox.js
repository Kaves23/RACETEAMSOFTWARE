'use strict';
/**
 * academy-email-inbox.js
 * Routes for the pipeline email drop-box inbox.
 *
 * GET    /api/academy/email-inbox              — undismissed unmatched emails, newest first
 * POST   /api/academy/email-inbox/:id/link     — link email to a prospect + append activity
 * DELETE /api/academy/email-inbox/:id          — dismiss (soft-delete) an inbox item
 */

const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ── GET /api/academy/email-inbox ─────────────────────────────────────────── */
router.get('/', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, message_id, from_email, from_name, subject, snippet,
              all_addresses, received_at, linked_prospect_id, linked_at, created_at
       FROM   academy_email_inbox
       WHERE  dismissed = false AND linked_prospect_id IS NULL
       ORDER  BY received_at DESC
       LIMIT  100`
    );
    res.json({ ok: true, items: result.rows });
  } catch (err) {
    next(err);
  }
});

/* ── GET /api/academy/email-inbox/count ───────────────────────────────────── */
router.get('/count', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) AS count
       FROM   academy_email_inbox
       WHERE  dismissed = false AND linked_prospect_id IS NULL`
    );
    res.json({ ok: true, count: parseInt(result.rows[0].count, 10) });
  } catch (err) {
    next(err);
  }
});

/* ── POST /api/academy/email-inbox/:id/link ───────────────────────────────── */
router.post('/:id/link', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { prospect_id } = req.body;

    if (!prospect_id) {
      return res.status(400).json({ ok: false, error: 'prospect_id required' });
    }

    // Fetch the inbox item
    const inboxResult = await pool.query(
      `SELECT * FROM academy_email_inbox WHERE id = $1 AND dismissed = false`,
      [id]
    );
    if (!inboxResult.rows.length) {
      return res.status(404).json({ ok: false, error: 'Inbox item not found' });
    }
    const item = inboxResult.rows[0];

    // Fetch the prospect
    const prospectResult = await pool.query(
      `SELECT id, driver_name, activities FROM academy_prospects WHERE id = $1`,
      [prospect_id]
    );
    if (!prospectResult.rows.length) {
      return res.status(404).json({ ok: false, error: 'Prospect not found' });
    }
    const prospect = prospectResult.rows[0];

    // Append email activity to prospect (dedup by message_id)
    const activities = Array.isArray(prospect.activities) ? prospect.activities : [];
    const alreadyLogged = activities.some(a => a.email_message_id === item.message_id);

    if (!alreadyLogged) {
      const fromLabel = item.from_name ? `${item.from_name} <${item.from_email}>` : item.from_email;
      activities.push({
        id:               uid(),
        type:             'email',
        date:             item.received_at
                            ? new Date(item.received_at).toISOString().slice(0, 10)
                            : new Date().toISOString().slice(0, 10),
        staff:            null,
        summary:          (item.subject || '(no subject)') + ` (from ${fromLabel})`,
        outcome:          item.snippet || null,
        source:           'email_inbound',
        email_message_id: item.message_id,
        created_at:       new Date().toISOString()
      });

      await pool.query(
        `UPDATE academy_prospects SET activities = $1::jsonb, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(activities), prospect_id]
      );
    }

    // Mark inbox item as linked
    await pool.query(
      `UPDATE academy_email_inbox
       SET linked_prospect_id = $1, linked_at = NOW()
       WHERE id = $2`,
      [prospect_id, id]
    );

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

/* ── DELETE /api/academy/email-inbox/:id ─────────────────────────────────── */
router.delete('/:id', async (req, res, next) => {
  try {
    await pool.query(
      `UPDATE academy_email_inbox SET dismissed = true WHERE id = $1`,
      [req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
