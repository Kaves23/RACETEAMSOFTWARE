// routes/driver-packages.js
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

// GET /api/driver-packages?driver_id=...
router.get('/', async (req, res, next) => {
  try {
    const { driver_id } = req.query;
    const c=[], p=[];
    if (driver_id) { p.push(driver_id); c.push(`driver_id=$${p.length}`); }
    const where = c.length ? 'WHERE '+c.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM driver_packages ${where} ORDER BY driver_id, package_key`, p);
    res.json(r.rows);
  } catch (e) { next(e); }
});

// PUT /api/driver-packages  — upsert one package row for a driver
router.put('/', async (req, res, next) => {
  try {
    const { driver_id, package_key, package_name, mode, unit_price, qty, notes } = req.body || {};
    if (!driver_id || !package_key) return res.status(400).json({ error: 'driver_id and package_key required' });
    const r = await pool.query(
      `INSERT INTO driver_packages (driver_id,package_key,package_name,mode,unit_price,qty,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (driver_id,package_key) DO UPDATE SET
         package_name=EXCLUDED.package_name, mode=EXCLUDED.mode,
         unit_price=EXCLUDED.unit_price, qty=EXCLUDED.qty, notes=EXCLUDED.notes, updated_at=NOW()
       RETURNING *`,
      [driver_id, package_key, package_name||null, mode||'invoice',
       parseFloat(unit_price)||0, parseFloat(qty)||1, notes||null]
    );
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

// DELETE /api/driver-packages?driver_id=...&package_key=...
router.delete('/', async (req, res, next) => {
  try {
    const { driver_id, package_key } = req.query;
    if (!driver_id || !package_key) return res.status(400).json({ error: 'driver_id and package_key required' });
    await pool.query('DELETE FROM driver_packages WHERE driver_id=$1 AND package_key=$2', [driver_id, package_key]);
    res.status(204).end();
  } catch (e) { next(e); }
});

module.exports = router;
