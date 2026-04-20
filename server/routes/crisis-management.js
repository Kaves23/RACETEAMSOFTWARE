'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, severity } = req.query;
    const c=[], p=[];
    if (status)  { p.push(status);   c.push(`status=$${p.length}`); }
    if (severity){ p.push(severity); c.push(`severity=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM crisis_management ${where} ORDER BY occurred_at DESC`, p);
    res.json(r.rows);
  } catch(e){ next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { title,description,crisis_type,severity,response_lead,team_members,immediate_actions,communications,resolution,occurred_at,resolved_at,status,lessons_learned } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    const r = await pool.query(
      `INSERT INTO crisis_management (title,description,crisis_type,severity,response_lead,team_members,immediate_actions,communications,resolution,occurred_at,resolved_at,status,lessons_learned)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [title,description,crisis_type||'operational',severity||'high',response_lead,team_members,immediate_actions,communications,resolution,occurred_at||new Date(),resolved_at||null,status||'active',lessons_learned]
    );
    res.status(201).json(r.rows[0]);
  } catch(e){ next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { title,description,crisis_type,severity,response_lead,team_members,immediate_actions,communications,resolution,occurred_at,resolved_at,status,lessons_learned } = req.body;
    const r = await pool.query(
      `UPDATE crisis_management SET title=$1,description=$2,crisis_type=$3,severity=$4,response_lead=$5,team_members=$6,immediate_actions=$7,communications=$8,resolution=$9,occurred_at=$10,resolved_at=$11,status=$12,lessons_learned=$13,updated_at=NOW() WHERE id=$14 RETURNING *`,
      [title,description,crisis_type,severity,response_lead,team_members,immediate_actions,communications,resolution,occurred_at,resolved_at||null,status,lessons_learned,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch(e){ next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM crisis_management WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch(e){ next(e); }
});

module.exports = router;
