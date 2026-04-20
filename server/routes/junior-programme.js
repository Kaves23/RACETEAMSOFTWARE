'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, driver_name } = req.query;
    const c=[], p=[];
    if (status)     { p.push(status);              c.push(`status=$${p.length}`); }
    if (driver_name){ p.push(`%${driver_name}%`);  c.push(`driver_name ILIKE $${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM junior_programme ${where} ORDER BY created_at DESC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { driver_name,age,nationality,karting_background,current_category,target_category,seasons_supported,budget_contribution,development_plan,evaluations,status,mentor_name } = req.body;
    if (!driver_name) return res.status(400).json({ error: 'driver_name required' });
    const r = await pool.query(
      `INSERT INTO junior_programme (driver_name,age,nationality,karting_background,current_category,target_category,seasons_supported,budget_contribution,development_plan,evaluations,status,mentor_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [driver_name,age||null,nationality,karting_background,current_category,target_category,seasons_supported||1,budget_contribution||null,development_plan,evaluations,status||'active',mentor_name]
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { driver_name,age,nationality,current_category,target_category,seasons_supported,budget_contribution,development_plan,evaluations,status,mentor_name } = req.body;
    const r = await pool.query(
      `UPDATE junior_programme SET driver_name=$1,age=$2,nationality=$3,current_category=$4,target_category=$5,seasons_supported=$6,budget_contribution=$7,development_plan=$8,evaluations=$9,status=$10,mentor_name=$11,updated_at=NOW() WHERE id=$12 RETURNING *`,
      [driver_name,age||null,nationality,current_category,target_category,seasons_supported,budget_contribution||null,development_plan,evaluations,status,mentor_name,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM junior_programme WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
