'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, policy_type } = req.query;
    const c=[], p=[];
    if (status)     { p.push(status);      c.push(`status=$${p.length}`); }
    if (policy_type){ p.push(policy_type); c.push(`policy_type=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM insurance ${where} ORDER BY renewal_date ASC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { policy_number,policy_type,insurer,description,coverage_amount,currency,premium,start_date,renewal_date,status,broker,notes } = req.body;
    if (!policy_number||!policy_type) return res.status(400).json({ error: 'policy_number and policy_type required' });
    const r = await pool.query(
      `INSERT INTO insurance (policy_number,policy_type,insurer,description,coverage_amount,currency,premium,start_date,renewal_date,status,broker,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [policy_number,policy_type,insurer,description,coverage_amount||null,currency||'GBP',premium||null,start_date||null,renewal_date||null,status||'active',broker,notes]
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { policy_number,policy_type,insurer,description,coverage_amount,currency,premium,start_date,renewal_date,status,broker,notes } = req.body;
    const r = await pool.query(
      `UPDATE insurance SET policy_number=$1,policy_type=$2,insurer=$3,description=$4,coverage_amount=$5,currency=$6,premium=$7,start_date=$8,renewal_date=$9,status=$10,broker=$11,notes=$12,updated_at=NOW() WHERE id=$13 RETURNING *`,
      [policy_number,policy_type,insurer,description,coverage_amount||null,currency,premium||null,start_date||null,renewal_date||null,status,broker,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM insurance WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
