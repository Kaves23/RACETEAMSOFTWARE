'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { supplier_id, category } = req.query;
    const c=[], p=[];
    if (supplier_id){ p.push(supplier_id); c.push(`supplier_id=$${p.length}`); }
    if (category)   { p.push(category);    c.push(`category=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM lead_times ${where} ORDER BY part_name ASC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { supplier_id,part_name,part_number,category,standard_lead_days,express_lead_days,standard_cost,express_premium_pct,notes } = req.body;
    if (!part_name) return res.status(400).json({ error: 'part_name required' });
    const r = await pool.query(
      `INSERT INTO lead_times (supplier_id,part_name,part_number,category,standard_lead_days,express_lead_days,standard_cost,express_premium_pct,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [supplier_id||null,part_name,part_number,category||'general',standard_lead_days||7,express_lead_days||2,standard_cost||null,express_premium_pct||50,notes]
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { supplier_id,part_name,part_number,category,standard_lead_days,express_lead_days,standard_cost,express_premium_pct,notes } = req.body;
    const r = await pool.query(
      `UPDATE lead_times SET supplier_id=$1,part_name=$2,part_number=$3,category=$4,standard_lead_days=$5,express_lead_days=$6,standard_cost=$7,express_premium_pct=$8,notes=$9,updated_at=NOW() WHERE id=$10 RETURNING *`,
      [supplier_id||null,part_name,part_number,category,standard_lead_days,express_lead_days,standard_cost||null,express_premium_pct,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM lead_times WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
