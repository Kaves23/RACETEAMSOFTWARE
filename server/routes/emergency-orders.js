'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, priority } = req.query;
    const c=[], p=[];
    if (status)  { p.push(status);   c.push(`status=$${p.length}`); }
    if (priority){ p.push(priority); c.push(`priority=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM emergency_orders ${where} ORDER BY created_at DESC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { title,description,part_name,quantity,supplier_id,event_id,required_by,priority,cost,currency,justification,status,requested_by,approved_by } = req.body;
    if (!title||!part_name) return res.status(400).json({ error: 'title and part_name required' });
    const r = await pool.query(
      `INSERT INTO emergency_orders (title,description,part_name,quantity,supplier_id,event_id,required_by,priority,cost,currency,justification,status,requested_by,approved_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [title,description,part_name,quantity||1,supplier_id||null,event_id||null,required_by||null,priority||'high',cost||null,currency||'GBP',justification,status||'requested',requested_by||req.user?.name,approved_by||null]
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { title,description,part_name,quantity,supplier_id,event_id,required_by,priority,cost,currency,justification,status,approved_by } = req.body;
    const r = await pool.query(
      `UPDATE emergency_orders SET title=$1,description=$2,part_name=$3,quantity=$4,supplier_id=$5,event_id=$6,required_by=$7,priority=$8,cost=$9,currency=$10,justification=$11,status=$12,approved_by=$13,updated_at=NOW() WHERE id=$14 RETURNING *`,
      [title,description,part_name,quantity,supplier_id||null,event_id||null,required_by||null,priority,cost||null,currency,justification,status,approved_by||null,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM emergency_orders WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
