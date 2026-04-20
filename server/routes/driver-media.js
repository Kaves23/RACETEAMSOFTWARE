'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { driver_name, media_type } = req.query;
    const c=[], p=[];
    if (driver_name){ p.push(`%${driver_name}%`); c.push(`driver_name ILIKE $${p.length}`); }
    if (media_type) { p.push(media_type);          c.push(`media_type=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM driver_media ${where} ORDER BY created_at DESC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { driver_name,driver_id,media_type,title,url,thumbnail_url,event_id,session_name,notes } = req.body;
    if (!driver_name||!title) return res.status(400).json({ error: 'driver_name and title required' });
    const r = await pool.query(
      `INSERT INTO driver_media (driver_name,driver_id,media_type,title,url,thumbnail_url,event_id,session_name,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [driver_name,driver_id||null,media_type||'video',title,url,thumbnail_url||null,event_id||null,session_name,notes]
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { driver_name,media_type,title,url,thumbnail_url,event_id,session_name,notes } = req.body;
    const r = await pool.query(
      `UPDATE driver_media SET driver_name=$1,media_type=$2,title=$3,url=$4,thumbnail_url=$5,event_id=$6,session_name=$7,notes=$8,updated_at=NOW() WHERE id=$9 RETURNING *`,
      [driver_name,media_type,title,url,thumbnail_url||null,event_id||null,session_name,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM driver_media WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
