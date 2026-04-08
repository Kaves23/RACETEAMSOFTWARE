const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/suppliers
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM suppliers WHERE is_active = TRUE ORDER BY name ASC'
    );
    res.json({ success: true, suppliers: result.rows });
  } catch (err) {
    console.error('GET /api/suppliers error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/suppliers/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM suppliers WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, supplier: result.rows[0] });
  } catch (err) {
    console.error('GET /api/suppliers/:id error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/suppliers
router.post('/', async (req, res) => {
  try {
    const { id, name, email, phone, lead_time_days, vat_number, account_number, notes } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }
    const suppId = id || require('crypto').randomUUID();
    const result = await db.query(
      `INSERT INTO suppliers (id, name, email, phone, lead_time_days, vat_number, account_number, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [suppId, name.trim(), email||'', phone||'', lead_time_days||0, vat_number||'', account_number||'', notes||'']
    );
    res.status(201).json({ success: true, supplier: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: 'A supplier with that ID already exists' });
    }
    console.error('POST /api/suppliers error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/suppliers/:id
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, lead_time_days, vat_number, account_number, notes } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }
    const result = await db.query(
      `UPDATE suppliers SET name=$1, email=$2, phone=$3, lead_time_days=$4,
       vat_number=$5, account_number=$6, notes=$7, updated_at=NOW()
       WHERE id=$8 RETURNING *`,
      [name.trim(), email||'', phone||'', lead_time_days||0, vat_number||'', account_number||'', notes||'', id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, supplier: result.rows[0] });
  } catch (err) {
    console.error('PUT /api/suppliers/:id error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/suppliers/:id  (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const result = await db.query(
      'UPDATE suppliers SET is_active=FALSE, updated_at=NOW() WHERE id=$1 RETURNING id',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/suppliers/:id error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
