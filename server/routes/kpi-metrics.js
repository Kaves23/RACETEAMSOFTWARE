'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { category, period, status } = req.query;
    const c=[], p=[];
    if (category){ p.push(category); c.push(`category=$${p.length}`); }
    if (period)  { p.push(period);   c.push(`period=$${p.length}`); }
    if (status)  { p.push(status);   c.push(`status=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM kpi_metrics ${where} ORDER BY category ASC, name ASC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { name,category,description,target_value,actual_value,unit,period,status,owner,notes } = req.body;
    if (!name||!category) return res.status(400).json({ error: 'name and category required' });
    const r = await pool.query(
      `INSERT INTO kpi_metrics (name,category,description,target_value,actual_value,unit,period,status,owner,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [name,category,description,target_value||null,actual_value||null,unit,period||'monthly',status||'on_track',owner,notes]
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { name,category,description,target_value,actual_value,unit,period,status,owner,notes } = req.body;
    const r = await pool.query(
      `UPDATE kpi_metrics SET name=$1,category=$2,description=$3,target_value=$4,actual_value=$5,unit=$6,period=$7,status=$8,owner=$9,notes=$10,updated_at=NOW() WHERE id=$11 RETURNING *`,
      [name,category,description,target_value||null,actual_value||null,unit,period,status,owner,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM kpi_metrics WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
