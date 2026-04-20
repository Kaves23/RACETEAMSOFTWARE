// routes/leave.js
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, leave_type } = req.query;
    const c=[], p=[];
    if (status)     { p.push(status);     c.push(`status=$${p.length}`); }
    if (leave_type) { p.push(leave_type); c.push(`leave_type=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM leave_requests ${where} ORDER BY start_date DESC NULLS LAST`, p);
    res.json(r.rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { staff_name, leave_type, status, start_date, end_date, days, approved_by, notes } = req.body;
    if (!staff_name) return res.status(400).json({ error: 'staff_name required' });
    const r = await pool.query(
      `INSERT INTO leave_requests (staff_name,leave_type,status,start_date,end_date,days,approved_by,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [staff_name,leave_type||'annual',status||'pending',start_date||null,end_date||null,days||null,approved_by,notes]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { staff_name, leave_type, status, start_date, end_date, days, approved_by, notes } = req.body;
    const r = await pool.query(
      `UPDATE leave_requests SET staff_name=$1,leave_type=$2,status=$3,start_date=$4,end_date=$5,days=$6,
       approved_by=$7,notes=$8,updated_at=NOW() WHERE id=$9 RETURNING *`,
      [staff_name,leave_type,status,start_date||null,end_date||null,days||null,approved_by,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM leave_requests WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch (e) { next(e); }
});

module.exports = router;
