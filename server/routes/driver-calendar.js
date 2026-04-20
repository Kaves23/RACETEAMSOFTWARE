'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { driver_name, event_type, status } = req.query;
    const c=[], p=[];
    if (driver_name){ p.push(`%${driver_name}%`); c.push(`driver_name ILIKE $${p.length}`); }
    if (event_type) { p.push(event_type);          c.push(`event_type=$${p.length}`); }
    if (status)     { p.push(status);              c.push(`status=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM driver_calendar ${where} ORDER BY start_date ASC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { driver_name,driver_id,event_type,title,start_date,end_date,location,notes,status } = req.body;
    if (!driver_name||!title) return res.status(400).json({ error: 'driver_name and title required' });
    const r = await pool.query(
      `INSERT INTO driver_calendar (driver_name,driver_id,event_type,title,start_date,end_date,location,notes,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [driver_name,driver_id||null,event_type||'race',title,start_date||new Date(),end_date||null,location,notes,status||'confirmed']
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { driver_name,driver_id,event_type,title,start_date,end_date,location,notes,status } = req.body;
    const r = await pool.query(
      `UPDATE driver_calendar SET driver_name=$1,driver_id=$2,event_type=$3,title=$4,start_date=$5,end_date=$6,location=$7,notes=$8,status=$9,updated_at=NOW() WHERE id=$10 RETURNING *`,
      [driver_name,driver_id||null,event_type,title,start_date,end_date||null,location,notes,status,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM driver_calendar WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
