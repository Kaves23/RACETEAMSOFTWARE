// routes/assembly.js
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, priority, car } = req.query;
    const c=[], p=[];
    if (status)   { p.push(status);   c.push(`status=$${p.length}`); }
    if (priority) { p.push(priority); c.push(`priority=$${p.length}`); }
    if (car)      { p.push(car);      c.push(`car=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM assembly_tasks ${where} ORDER BY due_date ASC NULLS LAST`, p);
    res.json(r.rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { task_desc, build_link, assigned_to, car, priority, status, est_time, due_date, completion_notes, notes } = req.body;
    if (!task_desc) return res.status(400).json({ error: 'task_desc required' });
    const r = await pool.query(
      `INSERT INTO assembly_tasks (task_desc,build_link,assigned_to,car,priority,status,est_time,due_date,completion_notes,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [task_desc,build_link,assigned_to,car,priority||'medium',status||'todo',est_time,due_date||null,completion_notes,notes]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { task_desc, build_link, assigned_to, car, priority, status, est_time, due_date, completion_notes, notes } = req.body;
    const r = await pool.query(
      `UPDATE assembly_tasks SET task_desc=$1,build_link=$2,assigned_to=$3,car=$4,priority=$5,status=$6,est_time=$7,
       due_date=$8,completion_notes=$9,notes=$10,updated_at=NOW() WHERE id=$11 RETURNING *`,
      [task_desc,build_link,assigned_to,car,priority,status,est_time,due_date||null,completion_notes,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM assembly_tasks WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch (e) { next(e); }
});

module.exports = router;
