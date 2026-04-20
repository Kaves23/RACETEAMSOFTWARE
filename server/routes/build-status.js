// routes/build-status.js
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, car } = req.query;
    const c=[], p=[];
    if (status) { p.push(status); c.push(`status=$${p.length}`); }
    if (car)    { p.push(car);    c.push(`car=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM build_status ${where} ORDER BY target_date ASC NULLS LAST`, p);
    res.json(r.rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { build_name, car, lead, status, priority, start_date, target_date, progress, description, blockers, notes } = req.body;
    if (!build_name) return res.status(400).json({ error: 'build_name required' });
    const r = await pool.query(
      `INSERT INTO build_status (build_name,car,lead,status,priority,start_date,target_date,progress,description,blockers,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [build_name,car,lead,status||'scheduled',priority||'medium',start_date||null,target_date||null,progress||0,description,blockers,notes]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { build_name, car, lead, status, priority, start_date, target_date, progress, description, blockers, notes } = req.body;
    const r = await pool.query(
      `UPDATE build_status SET build_name=$1,car=$2,lead=$3,status=$4,priority=$5,start_date=$6,target_date=$7,
       progress=$8,description=$9,blockers=$10,notes=$11,updated_at=NOW() WHERE id=$12 RETURNING *`,
      [build_name,car,lead,status,priority,start_date||null,target_date||null,progress||0,description,blockers,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM build_status WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch (e) { next(e); }
});

module.exports = router;
