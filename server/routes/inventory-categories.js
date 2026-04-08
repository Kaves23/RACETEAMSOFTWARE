const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/inventory-categories
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, name, sort_order FROM inventory_categories ORDER BY sort_order ASC, name ASC'
    );
    res.json({ success: true, categories: result.rows });
  } catch (err) {
    console.error('GET /api/inventory-categories error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/inventory-categories
router.post('/', async (req, res) => {
  try {
    const { id, name, sort_order } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }
    const catId = id || require('crypto').randomUUID();
    const result = await db.query(
      'INSERT INTO inventory_categories (id, name, sort_order) VALUES ($1, $2, $3) RETURNING *',
      [catId, name.trim(), sort_order ?? 0]
    );
    res.status(201).json({ success: true, category: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: 'A category with that ID already exists' });
    }
    console.error('POST /api/inventory-categories error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/inventory-categories/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, sort_order } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }
    const result = await db.query(
      'UPDATE inventory_categories SET name = $1, sort_order = $2 WHERE id = $3 RETURNING *',
      [name.trim(), sort_order ?? 0, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }
    res.json({ success: true, category: result.rows[0] });
  } catch (err) {
    console.error('PUT /api/inventory-categories/:id error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/inventory-categories/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      'DELETE FROM inventory_categories WHERE id = $1 RETURNING id',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/inventory-categories/:id error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
