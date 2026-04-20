'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, priority, owner } = req.query;
    const c=[], p=[];
    if (status)  { p.push(status);        c.push(`status=$${p.length}`); }
    if (priority){ p.push(priority);      c.push(`priority=$${p.length}`); }
    if (owner)   { p.push(`%${owner}%`);  c.push(`owner ILIKE $${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM corrective_actions ${where} ORDER BY created_at DESC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { incident_id,rca_id,title,description,action_type,owner,due_date,priority,status,completed_at } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    const r = await pool.query(
      `INSERT INTO corrective_actions (incident_id,rca_id,title,description,action_type,owner,due_date,priority,status,completed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [incident_id||null,rca_id||null,title,description,action_type||'corrective',owner,due_date||null,priority||'medium',status||'open',completed_at||null]
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { incident_id,rca_id,title,description,action_type,owner,due_date,priority,status,completed_at } = req.body;
    const r = await pool.query(
      `UPDATE corrective_actions SET incident_id=$1,rca_id=$2,title=$3,description=$4,action_type=$5,owner=$6,due_date=$7,priority=$8,status=$9,completed_at=$10,updated_at=NOW() WHERE id=$11 RETURNING *`,
      [incident_id||null,rca_id||null,title,description,action_type,owner,due_date||null,priority,status,completed_at||null,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM corrective_actions WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
