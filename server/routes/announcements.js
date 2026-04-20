'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, priority, audience } = req.query;
    const c=[], p=[];
    if (status)  { p.push(status);   c.push(`status=$${p.length}`); }
    if (priority){ p.push(priority); c.push(`priority=$${p.length}`); }
    if (audience){ p.push(audience); c.push(`audience=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM announcements ${where} ORDER BY publish_at DESC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { title,content,audience,priority,publish_at,expires_at,author,status } = req.body;
    if (!title||!content) return res.status(400).json({ error: 'title and content required' });
    const r = await pool.query(
      `INSERT INTO announcements (title,content,audience,priority,publish_at,expires_at,author,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [title,content,audience||'all',priority||'normal',publish_at||new Date(),expires_at||null,author||req.user?.name,status||'draft']
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { title,content,audience,priority,publish_at,expires_at,author,status } = req.body;
    const r = await pool.query(
      `UPDATE announcements SET title=$1,content=$2,audience=$3,priority=$4,publish_at=$5,expires_at=$6,author=$7,status=$8,updated_at=NOW() WHERE id=$9 RETURNING *`,
      [title,content,audience,priority,publish_at,expires_at||null,author,status,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM announcements WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
