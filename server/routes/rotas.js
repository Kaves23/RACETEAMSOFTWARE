// routes/rotas.js
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status } = req.query;
    const c=[], p=[];
    if (status) { p.push(status); c.push(`status=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM rotas ${where} ORDER BY start_date DESC NULLS LAST`, p);
    res.json(r.rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { rota_name, event_name, start_date, end_date, status, created_by, staff_assignments, staff_count, notes } = req.body;
    if (!rota_name) return res.status(400).json({ error: 'rota_name required' });
    const r = await pool.query(
      `INSERT INTO rotas (rota_name,event_name,start_date,end_date,status,created_by,staff_assignments,staff_count,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [rota_name,event_name,start_date||null,end_date||null,status||'draft',created_by,staff_assignments,staff_count||0,notes]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { rota_name, event_name, start_date, end_date, status, created_by, staff_assignments, staff_count, notes } = req.body;
    const r = await pool.query(
      `UPDATE rotas SET rota_name=$1,event_name=$2,start_date=$3,end_date=$4,status=$5,created_by=$6,
       staff_assignments=$7,staff_count=$8,notes=$9,updated_at=NOW() WHERE id=$10 RETURNING *`,
      [rota_name,event_name,start_date||null,end_date||null,status,created_by,staff_assignments,staff_count||0,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM rotas WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch (e) { next(e); }
});

module.exports = router;
