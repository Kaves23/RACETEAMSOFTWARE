// routes/consumables.js
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { category } = req.query;
    const c=[], p=[];
    if (category) { p.push(category); c.push(`category=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM consumables ${where} ORDER BY item_name ASC`, p);
    res.json(r.rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { item_name, category, unit, qty_available, reorder_at, supplier, sku_ref, unit_cost, storage_location, notes } = req.body;
    if (!item_name) return res.status(400).json({ error: 'item_name required' });
    const r = await pool.query(
      `INSERT INTO consumables (item_name,category,unit,qty_available,reorder_at,supplier,sku_ref,unit_cost,storage_location,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [item_name,category,unit,qty_available||0,reorder_at||0,supplier,sku_ref,unit_cost||null,storage_location,notes]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { item_name, category, unit, qty_available, reorder_at, supplier, sku_ref, unit_cost, storage_location, notes } = req.body;
    const r = await pool.query(
      `UPDATE consumables SET item_name=$1,category=$2,unit=$3,qty_available=$4,reorder_at=$5,supplier=$6,
       sku_ref=$7,unit_cost=$8,storage_location=$9,notes=$10,updated_at=NOW() WHERE id=$11 RETURNING *`,
      [item_name,category,unit,qty_available||0,reorder_at||0,supplier,sku_ref,unit_cost||null,storage_location,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM consumables WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch (e) { next(e); }
});

module.exports = router;
