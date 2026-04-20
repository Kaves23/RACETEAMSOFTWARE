'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, priority, requested_by } = req.query;
    const c=[], p=[];
    if (status)      { p.push(status);               c.push(`status=$${p.length}`); }
    if (priority)    { p.push(priority);             c.push(`priority=$${p.length}`); }
    if (requested_by){ p.push(`%${requested_by}%`);  c.push(`requested_by ILIKE $${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM approvals ${where} ORDER BY created_at DESC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { title,description,approval_type,requested_by,approver,required_by,priority,amount,currency,notes,status } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    const r = await pool.query(
      `INSERT INTO approvals (title,description,approval_type,requested_by,approver,required_by,priority,amount,currency,notes,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [title,description,approval_type||'spend',requested_by||req.user?.name,approver,required_by||null,priority||'normal',amount||null,currency||'GBP',notes,status||'pending']
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { title,description,approval_type,requested_by,approver,required_by,priority,amount,currency,notes,status } = req.body;
    const r = await pool.query(
      `UPDATE approvals SET title=$1,description=$2,approval_type=$3,requested_by=$4,approver=$5,required_by=$6,priority=$7,amount=$8,currency=$9,notes=$10,status=$11,updated_at=NOW() WHERE id=$12 RETURNING *`,
      [title,description,approval_type,requested_by,approver,required_by||null,priority,amount||null,currency,notes,status,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM approvals WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
