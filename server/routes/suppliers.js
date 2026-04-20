'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { is_active } = req.query;
    const c=[], p=[];
    if (is_active !== undefined){ p.push(is_active === 'true'); c.push(`is_active=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM suppliers ${where} ORDER BY name ASC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { id, name, email, phone, lead_time_days, vat_number, account_number, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const r = await pool.query(
      `INSERT INTO suppliers (id,name,email,phone,lead_time_days,vat_number,account_number,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,email=EXCLUDED.email,phone=EXCLUDED.phone,lead_time_days=EXCLUDED.lead_time_days,vat_number=EXCLUDED.vat_number,account_number=EXCLUDED.account_number,notes=EXCLUDED.notes,updated_at=NOW()
       RETURNING *`,
      [id||require('crypto').randomUUID(),name,email||'',phone||'',lead_time_days||0,vat_number||'',account_number||'',notes||'']
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { name, email, phone, lead_time_days, vat_number, account_number, notes, is_active } = req.body;
    const r = await pool.query(
      `UPDATE suppliers SET name=$1,email=$2,phone=$3,lead_time_days=$4,vat_number=$5,account_number=$6,notes=$7,is_active=$8,updated_at=NOW() WHERE id=$9 RETURNING *`,
      [name,email||'',phone||'',lead_time_days||0,vat_number||'',account_number||'',notes||'',is_active!==false,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM suppliers WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
