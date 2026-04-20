// routes/staff-reviews.js
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { rating, staff_name } = req.query;
    const c=[], p=[];
    if (rating)     { p.push(parseInt(rating,10)); c.push(`rating=$${p.length}`); }
    if (staff_name) { p.push(`%${staff_name}%`);  c.push(`staff_name ILIKE $${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM staff_reviews ${where} ORDER BY review_date DESC NULLS LAST`, p);
    res.json(r.rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { staff_name, reviewer, review_date, period, rating, key_strengths, development_areas, goals_set, notes } = req.body;
    if (!staff_name) return res.status(400).json({ error: 'staff_name required' });
    const r = await pool.query(
      `INSERT INTO staff_reviews (staff_name,reviewer,review_date,period,rating,key_strengths,development_areas,goals_set,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [staff_name,reviewer,review_date||null,period,rating ? parseInt(rating,10) : null,key_strengths,development_areas,goals_set,notes]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { staff_name, reviewer, review_date, period, rating, key_strengths, development_areas, goals_set, notes } = req.body;
    const r = await pool.query(
      `UPDATE staff_reviews SET staff_name=$1,reviewer=$2,review_date=$3,period=$4,rating=$5,
       key_strengths=$6,development_areas=$7,goals_set=$8,notes=$9,updated_at=NOW() WHERE id=$10 RETURNING *`,
      [staff_name,reviewer,review_date||null,period,rating ? parseInt(rating,10) : null,key_strengths,development_areas,goals_set,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM staff_reviews WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch (e) { next(e); }
});

module.exports = router;
