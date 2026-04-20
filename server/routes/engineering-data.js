// routes/engineering-data.js
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { test_type, result } = req.query;
    const c=[], p=[];
    if (test_type) { p.push(test_type); c.push(`test_type=$${p.length}`); }
    if (result)    { p.push(result);    c.push(`result=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM engineering_data ${where} ORDER BY test_date DESC NULLS LAST`, p);
    res.json(r.rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { test_type, test_date, component_under_test, operator, facility, test_parameters, result, result_summary, data_ref, notes } = req.body;
    if (!component_under_test) return res.status(400).json({ error: 'component_under_test required' });
    const r = await pool.query(
      `INSERT INTO engineering_data (test_type,test_date,component_under_test,operator,facility,test_parameters,result,result_summary,data_ref,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [test_type,test_date||null,component_under_test,operator,facility,test_parameters,result,result_summary,data_ref,notes]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { test_type, test_date, component_under_test, operator, facility, test_parameters, result, result_summary, data_ref, notes } = req.body;
    const r = await pool.query(
      `UPDATE engineering_data SET test_type=$1,test_date=$2,component_under_test=$3,operator=$4,facility=$5,
       test_parameters=$6,result=$7,result_summary=$8,data_ref=$9,notes=$10,updated_at=NOW() WHERE id=$11 RETURNING *`,
      [test_type,test_date||null,component_under_test,operator,facility,test_parameters,result,result_summary,data_ref,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM engineering_data WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch (e) { next(e); }
});

module.exports = router;
