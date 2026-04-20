'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, report_type } = req.query;
    const c=[], p=[];
    if (status)     { p.push(status);      c.push(`status=$${p.length}`); }
    if (report_type){ p.push(report_type); c.push(`report_type=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM board_reports ${where} ORDER BY report_date DESC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { title,report_type,report_date,executive_summary,performance_summary,financial_summary,key_risks,decisions_required,attachments,author,status } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    const r = await pool.query(
      `INSERT INTO board_reports (title,report_type,report_date,executive_summary,performance_summary,financial_summary,key_risks,decisions_required,attachments,author,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [title,report_type||'monthly',report_date||new Date(),executive_summary,performance_summary,financial_summary,key_risks,decisions_required,attachments,author||req.user?.name,status||'draft']
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { title,report_type,report_date,executive_summary,performance_summary,financial_summary,key_risks,decisions_required,attachments,author,status } = req.body;
    const r = await pool.query(
      `UPDATE board_reports SET title=$1,report_type=$2,report_date=$3,executive_summary=$4,performance_summary=$5,financial_summary=$6,key_risks=$7,decisions_required=$8,attachments=$9,author=$10,status=$11,updated_at=NOW() WHERE id=$12 RETURNING *`,
      [title,report_type,report_date,executive_summary,performance_summary,financial_summary,key_risks,decisions_required,attachments,author,status,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM board_reports WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
