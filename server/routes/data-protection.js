'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, record_type } = req.query;
    const c=[], p=[];
    if (status)     { p.push(status);      c.push(`status=$${p.length}`); }
    if (record_type){ p.push(record_type); c.push(`record_type=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM data_protection ${where} ORDER BY created_at DESC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { record_type,title,description,data_categories,legal_basis,retention_period,processing_purpose,third_parties,status,review_date } = req.body;
    if (!title||!record_type) return res.status(400).json({ error: 'title and record_type required' });
    const r = await pool.query(
      `INSERT INTO data_protection (record_type,title,description,data_categories,legal_basis,retention_period,processing_purpose,third_parties,status,review_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [record_type,title,description,data_categories,legal_basis||'legitimate_interest',retention_period||'2 years',processing_purpose,third_parties,status||'active',review_date||null]
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { record_type,title,description,data_categories,legal_basis,retention_period,processing_purpose,third_parties,status,review_date } = req.body;
    const r = await pool.query(
      `UPDATE data_protection SET record_type=$1,title=$2,description=$3,data_categories=$4,legal_basis=$5,retention_period=$6,processing_purpose=$7,third_parties=$8,status=$9,review_date=$10,updated_at=NOW() WHERE id=$11 RETURNING *`,
      [record_type,title,description,data_categories,legal_basis,retention_period,processing_purpose,third_parties,status,review_date||null,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM data_protection WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
