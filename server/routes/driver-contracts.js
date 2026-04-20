'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, driver_name } = req.query;
    const c=[], p=[];
    if (status)     { p.push(status);              c.push(`status=$${p.length}`); }
    if (driver_name){ p.push(`%${driver_name}%`);  c.push(`driver_name ILIKE $${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM driver_contracts ${where} ORDER BY start_date DESC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { driver_name,driver_id,start_date,end_date,race_fee,retainer,bonus_terms,image_rights_pct,status,signed_by,notes } = req.body;
    if (!driver_name) return res.status(400).json({ error: 'driver_name required' });
    const r = await pool.query(
      `INSERT INTO driver_contracts (driver_name,driver_id,start_date,end_date,race_fee,retainer,bonus_terms,image_rights_pct,status,signed_by,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [driver_name,driver_id||null,start_date||null,end_date||null,race_fee||null,retainer||null,bonus_terms,image_rights_pct||0,status||'draft',signed_by,notes]
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { driver_name,driver_id,start_date,end_date,race_fee,retainer,bonus_terms,image_rights_pct,status,signed_by,notes } = req.body;
    const r = await pool.query(
      `UPDATE driver_contracts SET driver_name=$1,driver_id=$2,start_date=$3,end_date=$4,race_fee=$5,retainer=$6,bonus_terms=$7,image_rights_pct=$8,status=$9,signed_by=$10,notes=$11,updated_at=NOW() WHERE id=$12 RETURNING *`,
      [driver_name,driver_id||null,start_date||null,end_date||null,race_fee||null,retainer||null,bonus_terms,image_rights_pct,status,signed_by,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM driver_contracts WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
