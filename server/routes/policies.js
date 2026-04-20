'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, policy_type, department } = req.query;
    const c=[], p=[];
    if (status)     { p.push(status);      c.push(`status=$${p.length}`); }
    if (policy_type){ p.push(policy_type); c.push(`policy_type=$${p.length}`); }
    if (department) { p.push(department);  c.push(`department=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM policies ${where} ORDER BY title ASC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { title,policy_type,department,version,effective_date,review_date,content,owner,approver,status } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    const r = await pool.query(
      `INSERT INTO policies (title,policy_type,department,version,effective_date,review_date,content,owner,approver,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [title,policy_type||'general',department,version||'1.0',effective_date||null,review_date||null,content,owner,approver,status||'draft']
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { title,policy_type,department,version,effective_date,review_date,content,owner,approver,status } = req.body;
    const r = await pool.query(
      `UPDATE policies SET title=$1,policy_type=$2,department=$3,version=$4,effective_date=$5,review_date=$6,content=$7,owner=$8,approver=$9,status=$10,updated_at=NOW() WHERE id=$11 RETURNING *`,
      [title,policy_type,department,version,effective_date||null,review_date||null,content,owner,approver,status,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM policies WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
