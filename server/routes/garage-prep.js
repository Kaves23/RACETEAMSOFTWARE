// routes/garage-prep.js
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, event_name } = req.query;
    const c=[], p=[];
    if (status)     { p.push(status);     c.push(`status=$${p.length}`); }
    if (event_name) { p.push(event_name); c.push(`event_name=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM garage_prep ${where} ORDER BY target_date ASC NULLS LAST`, p);
    res.json(r.rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { kit_name, event_name, responsible, status, target_date, completion, items_list, special_requirements, notes } = req.body;
    if (!kit_name) return res.status(400).json({ error: 'kit_name required' });
    const r = await pool.query(
      `INSERT INTO garage_prep (kit_name,event_name,responsible,status,target_date,completion,items_list,special_requirements,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [kit_name,event_name,responsible,status||'planning',target_date||null,completion||0,items_list,special_requirements,notes]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { kit_name, event_name, responsible, status, target_date, completion, items_list, special_requirements, notes } = req.body;
    const r = await pool.query(
      `UPDATE garage_prep SET kit_name=$1,event_name=$2,responsible=$3,status=$4,target_date=$5,completion=$6,
       items_list=$7,special_requirements=$8,notes=$9,updated_at=NOW() WHERE id=$10 RETURNING *`,
      [kit_name,event_name,responsible,status,target_date||null,completion||0,items_list,special_requirements,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM garage_prep WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch (e) { next(e); }
});

module.exports = router;
