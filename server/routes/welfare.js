// routes/welfare.js
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { type, follow_up_required } = req.query;
    const c=[], p=[];
    if (type)               { p.push(type);   c.push(`type=$${p.length}`); }
    if (follow_up_required !== undefined && follow_up_required !== '') {
      p.push(follow_up_required === 'true');
      c.push(`follow_up_required=$${p.length}`);
    }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM welfare ${where} ORDER BY date DESC NULLS LAST`, p);
    res.json(r.rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { staff_name, type, date, notes, follow_up_required, follow_up_date, confidential } = req.body;
    if (!staff_name) return res.status(400).json({ error: 'staff_name required' });
    const r = await pool.query(
      `INSERT INTO welfare (staff_name,type,date,notes,follow_up_required,follow_up_date,confidential)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [staff_name,type||'check_in',date||null,notes,!!follow_up_required,follow_up_date||null,!!confidential]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { staff_name, type, date, notes, follow_up_required, follow_up_date, confidential } = req.body;
    const r = await pool.query(
      `UPDATE welfare SET staff_name=$1,type=$2,date=$3,notes=$4,follow_up_required=$5,
       follow_up_date=$6,confidential=$7,updated_at=NOW() WHERE id=$8 RETURNING *`,
      [staff_name,type,date||null,notes,!!follow_up_required,follow_up_date||null,!!confidential,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM welfare WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch (e) { next(e); }
});

module.exports = router;
