'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, review_type } = req.query;
    const c=[], p=[];
    if (status)     { p.push(status);      c.push(`status=$${p.length}`); }
    if (review_type){ p.push(review_type); c.push(`review_type=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM review_board ${where} ORDER BY review_date DESC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { title,review_type,review_date,attendees,agenda,findings,recommendations,actions_agreed,status } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    const r = await pool.query(
      `INSERT INTO review_board (title,review_type,review_date,attendees,agenda,findings,recommendations,actions_agreed,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [title,review_type||'monthly',review_date||new Date(),attendees,agenda,findings,recommendations,actions_agreed,status||'scheduled']
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { title,review_type,review_date,attendees,agenda,findings,recommendations,actions_agreed,status } = req.body;
    const r = await pool.query(
      `UPDATE review_board SET title=$1,review_type=$2,review_date=$3,attendees=$4,agenda=$5,findings=$6,recommendations=$7,actions_agreed=$8,status=$9,updated_at=NOW() WHERE id=$10 RETURNING *`,
      [title,review_type,review_date,attendees,agenda,findings,recommendations,actions_agreed,status,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM review_board WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
