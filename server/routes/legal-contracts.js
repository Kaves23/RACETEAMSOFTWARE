'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, contract_type } = req.query;
    const c=[], p=[];
    if (status)       { p.push(status);       c.push(`status=$${p.length}`); }
    if (contract_type){ p.push(contract_type); c.push(`contract_type=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM legal_contracts ${where} ORDER BY start_date DESC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { title,contract_type,counterparty,start_date,end_date,value,currency,review_date,key_obligations,status,signed_by } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    const r = await pool.query(
      `INSERT INTO legal_contracts (title,contract_type,counterparty,start_date,end_date,value,currency,review_date,key_obligations,status,signed_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [title,contract_type||'general',counterparty,start_date||null,end_date||null,value||null,currency||'GBP',review_date||null,key_obligations,status||'draft',signed_by]
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { title,contract_type,counterparty,start_date,end_date,value,currency,review_date,key_obligations,status,signed_by } = req.body;
    const r = await pool.query(
      `UPDATE legal_contracts SET title=$1,contract_type=$2,counterparty=$3,start_date=$4,end_date=$5,value=$6,currency=$7,review_date=$8,key_obligations=$9,status=$10,signed_by=$11,updated_at=NOW() WHERE id=$12 RETURNING *`,
      [title,contract_type,counterparty,start_date||null,end_date||null,value||null,currency,review_date||null,key_obligations,status,signed_by,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM legal_contracts WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
