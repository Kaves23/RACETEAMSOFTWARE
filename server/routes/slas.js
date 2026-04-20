'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, supplier_id } = req.query;
    const c=[], p=[];
    if (status)     { p.push(status);      c.push(`status=$${p.length}`); }
    if (supplier_id){ p.push(supplier_id); c.push(`supplier_id=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM slas ${where} ORDER BY created_at DESC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { supplier_id,contract_id,metric_name,target_value,actual_value,measurement_period,status,breach_penalty,notes } = req.body;
    if (!metric_name) return res.status(400).json({ error: 'metric_name required' });
    const r = await pool.query(
      `INSERT INTO slas (supplier_id,contract_id,metric_name,target_value,actual_value,measurement_period,status,breach_penalty,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [supplier_id||null,contract_id||null,metric_name,target_value||null,actual_value||null,measurement_period||'monthly',status||'active',breach_penalty||null,notes]
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { supplier_id,contract_id,metric_name,target_value,actual_value,measurement_period,status,breach_penalty,notes } = req.body;
    const r = await pool.query(
      `UPDATE slas SET supplier_id=$1,contract_id=$2,metric_name=$3,target_value=$4,actual_value=$5,measurement_period=$6,status=$7,breach_penalty=$8,notes=$9,updated_at=NOW() WHERE id=$10 RETURNING *`,
      [supplier_id||null,contract_id||null,metric_name,target_value||null,actual_value||null,measurement_period,status,breach_penalty||null,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM slas WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
