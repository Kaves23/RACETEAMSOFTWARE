'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, priority, note_type } = req.query;
    const c=[], p=[];
    if (status)   { p.push(status);   c.push(`status=$${p.length}`); }
    if (priority) { p.push(priority); c.push(`priority=$${p.length}`); }
    if (note_type){ p.push(note_type);c.push(`note_type=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM engineering_notes ${where} ORDER BY created_at DESC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { event_id,car_number,engineer_name,note_type,title,content,priority,status } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    const r = await pool.query(
      `INSERT INTO engineering_notes (event_id,car_number,engineer_name,note_type,title,content,priority,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [event_id||null,car_number,engineer_name,note_type||'general',title,content,priority||'normal',status||'open']
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { event_id,car_number,engineer_name,note_type,title,content,priority,status } = req.body;
    const r = await pool.query(
      `UPDATE engineering_notes SET event_id=$1,car_number=$2,engineer_name=$3,note_type=$4,title=$5,content=$6,priority=$7,status=$8,updated_at=NOW() WHERE id=$9 RETURNING *`,
      [event_id||null,car_number,engineer_name,note_type,title,content,priority,status,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM engineering_notes WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
