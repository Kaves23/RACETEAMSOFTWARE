// routes/build-qc.js
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { result, inspection_type } = req.query;
    const c=[], p=[];
    if (result)          { p.push(result);          c.push(`result=$${p.length}`); }
    if (inspection_type) { p.push(inspection_type); c.push(`inspection_type=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM build_qc ${where} ORDER BY inspection_date DESC NULLS LAST`, p);
    res.json(r.rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { title, car, inspection_type, inspector, result, inspection_date, linked_sheet, findings, defects, corrective_actions, sign_off } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    const r = await pool.query(
      `INSERT INTO build_qc (title,car,inspection_type,inspector,result,inspection_date,linked_sheet,findings,defects,corrective_actions,sign_off)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [title,car,inspection_type,inspector,result||'pending',inspection_date||null,linked_sheet,findings,defects,corrective_actions,sign_off]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { title, car, inspection_type, inspector, result, inspection_date, linked_sheet, findings, defects, corrective_actions, sign_off } = req.body;
    const r = await pool.query(
      `UPDATE build_qc SET title=$1,car=$2,inspection_type=$3,inspector=$4,result=$5,inspection_date=$6,
       linked_sheet=$7,findings=$8,defects=$9,corrective_actions=$10,sign_off=$11,updated_at=NOW() WHERE id=$12 RETURNING *`,
      [title,car,inspection_type,inspector,result,inspection_date||null,linked_sheet,findings,defects,corrective_actions,sign_off,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM build_qc WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch (e) { next(e); }
});

module.exports = router;
