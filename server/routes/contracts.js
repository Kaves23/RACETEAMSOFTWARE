'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, contract_type, supplier_id } = req.query;
    const c=[], p=[];
    if (status)       { p.push(status);       c.push(`status=$${p.length}`); }
    if (contract_type){ p.push(contract_type); c.push(`contract_type=$${p.length}`); }
    if (supplier_id)  { p.push(supplier_id);  c.push(`supplier_id=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM proc_contracts ${where} ORDER BY start_date DESC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { contract_type,title,supplier_id,start_date,end_date,total_value,currency,payment_schedule,key_terms,renewal_notice_days,status,signed_by } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    const r = await pool.query(
      `INSERT INTO proc_contracts (contract_type,title,supplier_id,start_date,end_date,total_value,currency,payment_schedule,key_terms,renewal_notice_days,status,signed_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [contract_type||'supplier',title,supplier_id||null,start_date||null,end_date||null,total_value||null,currency||'GBP',payment_schedule,key_terms,renewal_notice_days||30,status||'draft',signed_by]
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { contract_type,title,supplier_id,start_date,end_date,total_value,currency,payment_schedule,key_terms,renewal_notice_days,status,signed_by } = req.body;
    const r = await pool.query(
      `UPDATE proc_contracts SET contract_type=$1,title=$2,supplier_id=$3,start_date=$4,end_date=$5,total_value=$6,currency=$7,payment_schedule=$8,key_terms=$9,renewal_notice_days=$10,status=$11,signed_by=$12,updated_at=NOW() WHERE id=$13 RETURNING *`,
      [contract_type,title,supplier_id||null,start_date||null,end_date||null,total_value||null,currency,payment_schedule,key_terms,renewal_notice_days,status,signed_by,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM proc_contracts WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
