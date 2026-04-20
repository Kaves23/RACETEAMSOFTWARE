// routes/rebuilds.js
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { stage, component_type } = req.query;
    const c=[], p=[];
    if (stage)          { p.push(stage);          c.push(`stage=$${p.length}`); }
    if (component_type) { p.push(component_type); c.push(`component_type=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM rebuilds ${where} ORDER BY target_complete ASC NULLS LAST`, p);
    res.json(r.rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { component, serial_number, component_type, lead_mechanic, stage, start_date, target_complete, reason, parts_to_replace, inspection_findings, notes } = req.body;
    if (!component) return res.status(400).json({ error: 'component required' });
    const r = await pool.query(
      `INSERT INTO rebuilds (component,serial_number,component_type,lead_mechanic,stage,start_date,target_complete,reason,parts_to_replace,inspection_findings,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [component,serial_number,component_type,lead_mechanic,stage||'scheduled',start_date||null,target_complete||null,reason,parts_to_replace,inspection_findings,notes]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { component, serial_number, component_type, lead_mechanic, stage, start_date, target_complete, reason, parts_to_replace, inspection_findings, notes } = req.body;
    const r = await pool.query(
      `UPDATE rebuilds SET component=$1,serial_number=$2,component_type=$3,lead_mechanic=$4,stage=$5,start_date=$6,
       target_complete=$7,reason=$8,parts_to_replace=$9,inspection_findings=$10,notes=$11,updated_at=NOW() WHERE id=$12 RETURNING *`,
      [component,serial_number,component_type,lead_mechanic,stage,start_date||null,target_complete||null,reason,parts_to_replace,inspection_findings,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM rebuilds WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch (e) { next(e); }
});

module.exports = router;
