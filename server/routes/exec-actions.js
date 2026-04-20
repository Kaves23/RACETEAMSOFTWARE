'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, priority, owner } = req.query;
    const c=[], p=[];
    if (status)  { p.push(status);       c.push(`status=$${p.length}`); }
    if (priority){ p.push(priority);     c.push(`priority=$${p.length}`); }
    if (owner)   { p.push(`%${owner}%`); c.push(`owner ILIKE $${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM exec_actions ${where} ORDER BY due_date ASC NULLS LAST`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { title,description,action_source,owner,due_date,priority,status,outcome } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    const r = await pool.query(
      `INSERT INTO exec_actions (title,description,action_source,owner,due_date,priority,status,outcome)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [title,description,action_source,owner,due_date||null,priority||'normal',status||'open',outcome]
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { title,description,action_source,owner,due_date,priority,status,outcome } = req.body;
    const r = await pool.query(
      `UPDATE exec_actions SET title=$1,description=$2,action_source=$3,owner=$4,due_date=$5,priority=$6,status=$7,outcome=$8,updated_at=NOW() WHERE id=$9 RETURNING *`,
      [title,description,action_source,owner,due_date||null,priority,status,outcome,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM exec_actions WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
