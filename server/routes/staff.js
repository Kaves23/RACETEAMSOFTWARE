// routes/staff.js
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { department, employment_type } = req.query;
    const c=[], p=[];
    if (department)      { p.push(department);      c.push(`department=$${p.length}`); }
    if (employment_type) { p.push(employment_type); c.push(`employment_type=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM staff ${where} ORDER BY name ASC`, p);
    res.json(r.rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, role, department, reports_to, contact, employment_type, start_date, nationality, notes,
            salary_annual, hourly_rate, benefits_cost_annual, cost_currency } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const r = await pool.query(
      `INSERT INTO staff (name,role,department,reports_to,contact,employment_type,start_date,nationality,notes,
                          salary_annual,hourly_rate,benefits_cost_annual,cost_currency)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [name,role,department,reports_to,contact,employment_type||'full_time',start_date||null,nationality,notes,
       salary_annual||null,hourly_rate||null,benefits_cost_annual||null,cost_currency||'ZAR']
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { name, role, department, reports_to, contact, employment_type, start_date, nationality, notes,
            salary_annual, hourly_rate, benefits_cost_annual, cost_currency } = req.body;
    const r = await pool.query(
      `UPDATE staff SET name=$1,role=$2,department=$3,reports_to=$4,contact=$5,employment_type=$6,
       start_date=$7,nationality=$8,notes=$9,salary_annual=$10,hourly_rate=$11,benefits_cost_annual=$12,
       cost_currency=$13,updated_at=NOW() WHERE id=$14 RETURNING *`,
      [name,role,department,reports_to,contact,employment_type,start_date||null,nationality,notes,
       salary_annual||null,hourly_rate||null,benefits_cost_annual||null,cost_currency||'ZAR',req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM staff WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch (e) { next(e); }
});

module.exports = router;
