// routes/entries.js — Sporting entries CRUD
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

// All writeable columns we expose
const COLS = [
  'event_name','series','entry_number','car_number','driver_name','team_name','category',
  'status','entry_date','notes',
  'driver_id','event_id','licence_number','championship','required_documents','approval_status',
  // phase 2
  'entry_deadline','payment_deadline','entry_fee','amount_paid','paid_date','payment_ref',
  'championship_id','doc_overrides','override_reason'
];

function pickBody(body) {
  const out = {};
  for (const k of COLS) {
    if (k in body) out[k] = body[k];
  }
  // normalise empties → null for dates/numerics
  ['entry_date','entry_deadline','payment_deadline','paid_date'].forEach(k => {
    if (out[k] === '' || out[k] === undefined) out[k] = null;
  });
  ['entry_fee','amount_paid'].forEach(k => {
    if (out[k] === '' || out[k] === undefined) out[k] = null;
  });
  if (out.doc_overrides && typeof out.doc_overrides === 'object') {
    out.doc_overrides = JSON.stringify(out.doc_overrides);
  }
  return out;
}

// Sync fia_entry_confirmed back to drivers when entry becomes confirmed
async function syncDriverConfirmation(driver_id, status) {
  if (!driver_id) return;
  try {
    const flag = status === 'confirmed';
    await pool.query(
      'UPDATE drivers SET fia_entry_confirmed=$1, updated_at=CURRENT_TIMESTAMP WHERE id=$2',
      [flag, driver_id]
    );
  } catch (_) { /* drivers table column may not exist in some envs — non-fatal */ }
}

router.get('/', async (req, res, next) => {
  try {
    const { status, series, event_id, driver_id } = req.query;
    const conds = [], params = [];
    if (status)    { params.push(status);    conds.push(`status=$${params.length}`); }
    if (series)    { params.push(series);    conds.push(`series=$${params.length}`); }
    if (event_id)  { params.push(event_id);  conds.push(`event_id=$${params.length}`); }
    if (driver_id) { params.push(driver_id); conds.push(`driver_id=$${params.length}`); }
    const where = conds.length ? 'WHERE '+conds.join(' AND ') : '';
    const r = await pool.query(`SELECT * FROM sporting_entries ${where} ORDER BY entry_date DESC NULLS LAST, created_at DESC`, params);
    res.json(r.rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const data = pickBody(req.body);
    if (!data.event_name && !data.event_id) return res.status(400).json({ error: 'event_name or event_id required' });
    data.status = data.status || 'submitted';
    const keys = Object.keys(data);
    const placeholders = keys.map((_,i)=>`$${i+1}`).join(',');
    const r = await pool.query(
      `INSERT INTO sporting_entries (${keys.join(',')}) VALUES (${placeholders}) RETURNING *`,
      keys.map(k => data[k])
    );
    await syncDriverConfirmation(data.driver_id, data.status);
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

// Bulk: create one entry per driver for a given event (skip drivers that already have a row for the event)
router.post('/bulk', async (req, res, next) => {
  try {
    const { event_id, event_name, driver_ids, championship, championship_id, entry_deadline, payment_deadline, entry_fee, status } = req.body;
    if (!event_id && !event_name) return res.status(400).json({ error: 'event_id or event_name required' });
    if (!Array.isArray(driver_ids) || !driver_ids.length) return res.status(400).json({ error: 'driver_ids required' });

    // Look up existing entries for this event so we don't duplicate
    const existing = await pool.query(
      `SELECT driver_id FROM sporting_entries WHERE event_id=$1 AND driver_id = ANY($2::text[])`,
      [event_id, driver_ids]
    );
    const skip = new Set(existing.rows.map(r => r.driver_id));

    // Pull driver records so we can prefill licence/car #
    const drs = await pool.query(
      `SELECT id, name, license_number, race_number FROM drivers WHERE id = ANY($1::text[])`,
      [driver_ids]
    );
    const drMap = new Map(drs.rows.map(d => [d.id, d]));

    const inserted = [];
    for (const did of driver_ids) {
      if (skip.has(did)) continue;
      const d = drMap.get(did) || {};
      const r = await pool.query(
        `INSERT INTO sporting_entries
           (event_id, event_name, driver_id, driver_name, licence_number, car_number,
            championship, championship_id, entry_deadline, payment_deadline, entry_fee, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [event_id||null, event_name||null, did, d.name||null, d.license_number||null, d.race_number||null,
         championship||null, championship_id||null,
         entry_deadline||null, payment_deadline||null,
         entry_fee===''||entry_fee==null?null:entry_fee,
         status||'pending']
      );
      inserted.push(r.rows[0]);
    }
    res.status(201).json({ inserted, skipped: [...skip] });
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const data = pickBody(req.body);
    const keys = Object.keys(data);
    if (!keys.length) return res.status(400).json({ error: 'no fields' });
    const setSql = keys.map((k,i)=>`${k}=$${i+1}`).join(', ');
    const r = await pool.query(
      `UPDATE sporting_entries SET ${setSql}, updated_at=NOW() WHERE id=$${keys.length+1} RETURNING *`,
      [...keys.map(k => data[k]), req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    await syncDriverConfirmation(r.rows[0].driver_id, r.rows[0].status);
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try { await pool.query('DELETE FROM sporting_entries WHERE id=$1', [req.params.id]); res.status(204).end(); }
  catch (e) { next(e); }
});

module.exports = router;
