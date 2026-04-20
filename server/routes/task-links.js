/**
 * /api/task-links — URL-based attachments / reference links per event-notes task
 */
const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const { pool } = require('../db');

// GET /api/task-links?item_id=:id
router.get('/', async (req, res, next) => {
  try {
    const { item_id } = req.query;
    if (!item_id) return res.status(400).json({ success: false, error: 'item_id required' });
    const result = await pool.query(
      'SELECT * FROM task_links WHERE item_id = $1 ORDER BY created_at ASC',
      [item_id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
});

// POST /api/task-links
router.post('/', async (req, res, next) => {
  try {
    const { item_id, list_id, label, url } = req.body;
    if (!item_id || !list_id || !url?.trim()) {
      return res.status(400).json({ success: false, error: 'item_id, list_id, and url required' });
    }
    // Basic URL validation — must start with http/https/mailto/ftp
    if (!/^(https?|mailto|ftp):\/\//i.test(url.trim())) {
      return res.status(400).json({ success: false, error: 'url must begin with http://, https://, or mailto://' });
    }
    const result = await pool.query(
      `INSERT INTO task_links (id, item_id, list_id, label, url)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [crypto.randomUUID(), item_id, list_id, label?.trim() || null, url.trim()]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
});

// PUT /api/task-links/:id
router.put('/:id', async (req, res, next) => {
  try {
    const { label, url } = req.body;
    if (url && !/^(https?|mailto|ftp):\/\//i.test(url.trim())) {
      return res.status(400).json({ success: false, error: 'url must begin with http://, https://, or mailto://' });
    }
    const result = await pool.query(
      `UPDATE task_links SET label = COALESCE($1, label), url = COALESCE($2, url)
       WHERE id = $3 RETURNING *`,
      [label?.trim() || null, url?.trim() || null, req.params.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ success: false, error: 'Link not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
});

// DELETE /api/task-links/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      'DELETE FROM task_links WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ success: false, error: 'Link not found' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
