'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, category } = req.query;
    const c=[], p=[];
    if (status)  { p.push(status);   c.push(`status=$${p.length}`); }
    if (category){ p.push(category); c.push(`category=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM proc_suppliers ${where} ORDER BY name ASC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { name,category,contact_name,email,phone,address,payment_terms,currency,rating,status,notes } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const r = await pool.query(
      `INSERT INTO proc_suppliers (name,category,contact_name,email,phone,address,payment_terms,currency,rating,status,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [name,category||'general',contact_name,email,phone,address,payment_terms||'net30',currency||'GBP',rating||3,status||'active',notes]
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { name,category,contact_name,email,phone,address,payment_terms,currency,rating,status,notes } = req.body;
    const r = await pool.query(
      `UPDATE proc_suppliers SET name=$1,category=$2,contact_name=$3,email=$4,phone=$5,address=$6,payment_terms=$7,currency=$8,rating=$9,status=$10,notes=$11,updated_at=NOW() WHERE id=$12 RETURNING *`,
      [name,category,contact_name,email,phone,address,payment_terms,currency,rating,status,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM proc_suppliers WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
