'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

/* GET all prospects */
router.get('/', async (req, res, next) => {
  try {
    const { status, search } = req.query;
    const c = [], p = [];
    if (status) { p.push(status); c.push(`status=$${p.length}`); }
    if (search) { p.push(`%${search}%`); c.push(`(driver_name ILIKE $${p.length} OR parent_name ILIKE $${p.length})`); }
    const where = c.length ? 'WHERE ' + c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM academy_prospects ${where} ORDER BY created_at DESC`, p);
    res.json(r.rows);
  } catch (e) { next(e); }
});

/* POST create prospect */
router.post('/', async (req, res, next) => {
  try {
    const {
      driver_name, driver_dob, category, nationality,
      parent_name, parent_phone, parent_email,
      source, assigned_to, status, notes,
      sessions, attachments
    } = req.body;
    if (!driver_name) return res.status(400).json({ error: 'driver_name required' });
    const r = await pool.query(
      `INSERT INTO academy_prospects
         (driver_name, driver_dob, category, nationality,
          parent_name, parent_phone, parent_email,
          source, assigned_to, status, notes,
          sessions, attachments)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        driver_name, driver_dob || null, category || null, nationality || null,
        parent_name || null, parent_phone || null, parent_email || null,
        source || null, assigned_to || null, status || 'lead', notes || null,
        JSON.stringify(sessions || []), JSON.stringify(attachments || [])
      ]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

/* PUT update prospect */
router.put('/:id', async (req, res, next) => {
  try {
    const {
      driver_name, driver_dob, category, nationality,
      parent_name, parent_phone, parent_email,
      source, assigned_to, status, notes,
      sessions, attachments
    } = req.body;
    const r = await pool.query(
      `UPDATE academy_prospects SET
         driver_name=$1, driver_dob=$2, category=$3, nationality=$4,
         parent_name=$5, parent_phone=$6, parent_email=$7,
         source=$8, assigned_to=$9, status=$10, notes=$11,
         sessions=$12, attachments=$13, updated_at=NOW()
       WHERE id=$14 RETURNING *`,
      [
        driver_name, driver_dob || null, category || null, nationality || null,
        parent_name || null, parent_phone || null, parent_email || null,
        source || null, assigned_to || null, status || 'lead', notes || null,
        JSON.stringify(sessions || []), JSON.stringify(attachments || []),
        req.params.id
      ]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

/* DELETE prospect */
router.delete('/:id', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM academy_prospects WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (e) { next(e); }
});

module.exports = router;
