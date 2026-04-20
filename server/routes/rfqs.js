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
    const r = await pool.query(`SELECT * FROM rfqs ${where} ORDER BY created_at DESC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { rfq_number,title,description,requested_by,required_by,priority,status,budget,currency,items,notes } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    const r = await pool.query(
      `INSERT INTO rfqs (rfq_number,title,description,requested_by,required_by,priority,status,budget,currency,items,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [rfq_number,title,description,requested_by||req.user?.name,required_by||null,priority||'normal',status||'draft',budget||null,currency||'GBP',items,notes]
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { rfq_number,title,description,requested_by,required_by,priority,status,budget,currency,items,notes } = req.body;
    const r = await pool.query(
      `UPDATE rfqs SET rfq_number=$1,title=$2,description=$3,requested_by=$4,required_by=$5,priority=$6,status=$7,budget=$8,currency=$9,items=$10,notes=$11,updated_at=NOW() WHERE id=$12 RETURNING *`,
      [rfq_number,title,description,requested_by,required_by||null,priority,status,budget||null,currency,items,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM rfqs WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
