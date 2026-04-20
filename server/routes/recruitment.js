// routes/recruitment.js
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, department } = req.query;
    const c=[], p=[];
    if (status)     { p.push(status);     c.push(`status=$${p.length}`); }
    if (department) { p.push(department); c.push(`department=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM recruitment ${where} ORDER BY posted_date DESC NULLS LAST`, p);
    res.json(r.rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { role_title, department, status, posted_date, target_start, applicant_count, hiring_manager, employment_type, salary_range, notes } = req.body;
    if (!role_title) return res.status(400).json({ error: 'role_title required' });
    const r = await pool.query(
      `INSERT INTO recruitment (role_title,department,status,posted_date,target_start,applicant_count,hiring_manager,employment_type,salary_range,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [role_title,department,status||'open',posted_date||null,target_start||null,applicant_count||0,hiring_manager,employment_type,salary_range,notes]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { role_title, department, status, posted_date, target_start, applicant_count, hiring_manager, employment_type, salary_range, notes } = req.body;
    const r = await pool.query(
      `UPDATE recruitment SET role_title=$1,department=$2,status=$3,posted_date=$4,target_start=$5,
       applicant_count=$6,hiring_manager=$7,employment_type=$8,salary_range=$9,notes=$10,updated_at=NOW()
       WHERE id=$11 RETURNING *`,
      [role_title,department,status,posted_date||null,target_start||null,applicant_count||0,hiring_manager,employment_type,salary_range,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM recruitment WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch (e) { next(e); }
});

module.exports = router;
