/**
 * /api/task-comments — Threaded comments per event-notes task item
 */
const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const { pool } = require('../db');

// GET /api/task-comments?item_id=:id
router.get('/', async (req, res, next) => {
  try {
    const { item_id } = req.query;
    if (!item_id) return res.status(400).json({ success: false, error: 'item_id required' });
    const result = await pool.query(
      'SELECT * FROM task_comments WHERE item_id = $1 ORDER BY created_at ASC',
      [item_id]
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
});

// POST /api/task-comments
router.post('/', async (req, res, next) => {
  try {
    const { item_id, list_id, content } = req.body;
    if (!item_id || !list_id || !content?.trim()) {
      return res.status(400).json({ success: false, error: 'item_id, list_id, and content required' });
    }
    const author = req.user?.name || req.user?.email || req.user?.username || 'Unknown';
    const result = await pool.query(
      `INSERT INTO task_comments (id, item_id, list_id, author, content)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [crypto.randomUUID(), item_id, list_id, author, content.trim()]
    );
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
});

// DELETE /api/task-comments/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      'DELETE FROM task_comments WHERE id = $1 RETURNING id',
      [req.params.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ success: false, error: 'Comment not found' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
