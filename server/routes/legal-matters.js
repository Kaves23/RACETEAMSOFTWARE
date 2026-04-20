'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, matter_type, priority } = req.query;
    const c=[], p=[];
    if (status)     { p.push(status);      c.push(`status=$${p.length}`); }
    if (matter_type){ p.push(matter_type); c.push(`matter_type=$${p.length}`); }
    if (priority)   { p.push(priority);    c.push(`priority=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM legal_matters ${where} ORDER BY created_at DESC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { title,matter_type,description,opposing_party,solicitor,estimated_cost,priority,status,deadline,notes } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    const r = await pool.query(
      `INSERT INTO legal_matters (title,matter_type,description,opposing_party,solicitor,estimated_cost,priority,status,deadline,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [title,matter_type||'dispute',description,opposing_party,solicitor,estimated_cost||null,priority||'normal',status||'open',deadline||null,notes]
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { title,matter_type,description,opposing_party,solicitor,estimated_cost,priority,status,deadline,notes } = req.body;
    const r = await pool.query(
      `UPDATE legal_matters SET title=$1,matter_type=$2,description=$3,opposing_party=$4,solicitor=$5,estimated_cost=$6,priority=$7,status=$8,deadline=$9,notes=$10,updated_at=NOW() WHERE id=$11 RETURNING *`,
      [title,matter_type,description,opposing_party,solicitor,estimated_cost||null,priority,status,deadline||null,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM legal_matters WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
