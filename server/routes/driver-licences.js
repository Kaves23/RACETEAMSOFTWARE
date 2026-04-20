'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { driver_name, status } = req.query;
    const c=[], p=[];
    if (driver_name){ p.push(`%${driver_name}%`); c.push(`driver_name ILIKE $${p.length}`); }
    if (status)     { p.push(status);              c.push(`status=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM driver_licences ${where} ORDER BY expiry_date ASC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { driver_name,driver_id,licence_type,issuing_body,licence_number,issue_date,expiry_date,status,notes } = req.body;
    if (!driver_name||!licence_type) return res.status(400).json({ error: 'driver_name and licence_type required' });
    const r = await pool.query(
      `INSERT INTO driver_licences (driver_name,driver_id,licence_type,issuing_body,licence_number,issue_date,expiry_date,status,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [driver_name,driver_id||null,licence_type,issuing_body,licence_number,issue_date||null,expiry_date||null,status||'active',notes]
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { driver_name,licence_type,issuing_body,licence_number,issue_date,expiry_date,status,notes } = req.body;
    const r = await pool.query(
      `UPDATE driver_licences SET driver_name=$1,licence_type=$2,issuing_body=$3,licence_number=$4,issue_date=$5,expiry_date=$6,status=$7,notes=$8,updated_at=NOW() WHERE id=$9 RETURNING *`,
      [driver_name,licence_type,issuing_body,licence_number,issue_date||null,expiry_date||null,status,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM driver_licences WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
