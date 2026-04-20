// routes/build-sheets.js
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, assembly_area } = req.query;
    const c=[], p=[];
    if (status)        { p.push(status);        c.push(`status=$${p.length}`); }
    if (assembly_area) { p.push(assembly_area); c.push(`assembly_area=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM build_sheets ${where} ORDER BY title ASC`, p);
    res.json(r.rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { title, assembly_area, revision, status, assigned_to, est_time, approved_by, torque_specs, tools_required, procedure_steps, notes } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    const r = await pool.query(
      `INSERT INTO build_sheets (title,assembly_area,revision,status,assigned_to,est_time,approved_by,torque_specs,tools_required,procedure_steps,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [title,assembly_area,revision,status||'draft',assigned_to,est_time,approved_by,torque_specs,tools_required,procedure_steps,notes]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { title, assembly_area, revision, status, assigned_to, est_time, approved_by, torque_specs, tools_required, procedure_steps, notes } = req.body;
    const r = await pool.query(
      `UPDATE build_sheets SET title=$1,assembly_area=$2,revision=$3,status=$4,assigned_to=$5,est_time=$6,
       approved_by=$7,torque_specs=$8,tools_required=$9,procedure_steps=$10,notes=$11,updated_at=NOW() WHERE id=$12 RETURNING *`,
      [title,assembly_area,revision,status,assigned_to,est_time,approved_by,torque_specs,tools_required,procedure_steps,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM build_sheets WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch (e) { next(e); }
});

module.exports = router;
