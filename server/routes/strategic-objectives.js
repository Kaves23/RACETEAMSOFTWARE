'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, pillar } = req.query;
    const c=[], p=[];
    if (status){ p.push(status); c.push(`status=$${p.length}`); }
    if (pillar){ p.push(pillar); c.push(`pillar=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM strategic_objectives ${where} ORDER BY pillar ASC, title ASC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { title,description,pillar,owner,kpi_name,kpi_target,kpi_current,target_year,status,notes } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    const r = await pool.query(
      `INSERT INTO strategic_objectives (title,description,pillar,owner,kpi_name,kpi_target,kpi_current,target_year,status,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [title,description,pillar||'performance',owner,kpi_name,kpi_target||null,kpi_current||null,target_year||new Date().getFullYear()+1,status||'active',notes]
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { title,description,pillar,owner,kpi_name,kpi_target,kpi_current,target_year,status,notes } = req.body;
    const r = await pool.query(
      `UPDATE strategic_objectives SET title=$1,description=$2,pillar=$3,owner=$4,kpi_name=$5,kpi_target=$6,kpi_current=$7,target_year=$8,status=$9,notes=$10,updated_at=NOW() WHERE id=$11 RETURNING *`,
      [title,description,pillar,owner,kpi_name,kpi_target||null,kpi_current||null,target_year,status,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM strategic_objectives WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
