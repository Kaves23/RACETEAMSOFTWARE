// routes/sporting-calendar.js
'use strict';
const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res, next) => {
  try {
    const { status, series } = req.query;
    const conds = [], params = [];
    if (status) { params.push(status); conds.push(`status = $${params.length}`); }
    if (series) { params.push(series); conds.push(`series = $${params.length}`); }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    const result = await pool.query(`SELECT * FROM sporting_calendar ${where} ORDER BY start_date ASC NULLS LAST`, params);
    res.json(result.rows);
  } catch (e) { next(e); }
});

router.post('/', async (req, res, next) => {
  try {
    const { event_name, series, round_number, circuit, country, city, start_date, end_date, status, notes } = req.body;
    if (!event_name) return res.status(400).json({ error: 'event_name required' });
    const r = await pool.query(
      `INSERT INTO sporting_calendar (event_name,series,round_number,circuit,country,city,start_date,end_date,status,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [event_name,series,round_number||null,circuit,country,city,start_date||null,end_date||null,status||'scheduled',notes]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) { next(e); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { event_name, series, round_number, circuit, country, city, start_date, end_date, status, notes } = req.body;
    const r = await pool.query(
      `UPDATE sporting_calendar SET event_name=$1,series=$2,round_number=$3,circuit=$4,country=$5,city=$6,
       start_date=$7,end_date=$8,status=$9,notes=$10,updated_at=NOW() WHERE id=$11 RETURNING *`,
      [event_name,series,round_number||null,circuit,country,city,start_date||null,end_date||null,status,notes,req.params.id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (e) { next(e); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM sporting_calendar WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (e) { next(e); }
});

// ── iCal export (/api/sporting-calendar.ics) ─────────────────────────────────
// Serves the full calendar as RFC 5545 iCal so team can subscribe from
// iPhone Calendar, Google Calendar etc via a webcal:// link.
async function handleICS(req, res, next) {
  try {
    const result = await pool.query(
      `SELECT * FROM sporting_calendar WHERE status != 'cancelled' ORDER BY start_date ASC NULLS LAST`
    );
    const rows = result.rows;

    function escICS(s) { return String(s||'').replace(/,/g,'\\,').replace(/;/g,'\\;').replace(/\n/g,'\\n'); }
    function toICSDate(d) {
      if (!d) return null;
      const s = String(d).slice(0,10).replace(/-/g,'');
      return s.length === 8 ? s : null;
    }

    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Race Team OS//Sporting Calendar//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Race Team Sporting Calendar',
      'X-WR-TIMEZONE:Africa/Johannesburg',
    ];

    rows.forEach(ev => {
      const uid = `${ev.id || Math.random().toString(36).slice(2)}@racesteamos`;
      const startISO = toICSDate(ev.start_date);
      if (!startISO) return;
      // All-day DTEND is exclusive — add 1 day
      const endExcl = new Date(ev.end_date || ev.start_date);
      endExcl.setDate(endExcl.getDate() + 1);
      const endStr = endExcl.toISOString().slice(0,10).replace(/-/g,'');
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${uid}`);
      lines.push(`DTSTART;VALUE=DATE:${startISO}`);
      lines.push(`DTEND;VALUE=DATE:${endStr}`);
      lines.push(`SUMMARY:${escICS(ev.event_name || 'Event')}`);
      const loc = [ev.circuit, ev.city, ev.country].filter(Boolean).join(', ');
      if (loc) lines.push(`LOCATION:${escICS(loc)}`);
      if (ev.series)       lines.push(`CATEGORIES:${escICS(ev.series)}`);
      if (ev.round_number) lines.push(`DESCRIPTION:Round ${escICS(ev.round_number)}${ev.notes ? '\\n'+escICS(ev.notes) : ''}`);
      else if (ev.notes)   lines.push(`DESCRIPTION:${escICS(ev.notes)}`);
      const icsStatus = (ev.status||'').toUpperCase() === 'CANCELLED' ? 'CANCELLED' : 'CONFIRMED';
      lines.push(`STATUS:${icsStatus}`);
      lines.push(`LAST-MODIFIED:${(ev.updated_at || new Date()).toISOString().replace(/[-:.]/g,'').slice(0,15)}Z`);
      lines.push('END:VEVENT');
    });

    lines.push('END:VCALENDAR');
    const body = lines.join('\r\n');
    res.set('Content-Type', 'text/calendar; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="sporting-calendar.ics"');
    res.send(body);
  } catch (e) { next(e); }
}

// Register on the router too (for authenticated clients hitting /api/sporting-calendar.ics)
router.get('.ics', handleICS);

// ── External iCal feed proxy (/api/sporting-calendar/proxy-ics?url=...) ──────
// Fetches an external .ics URL server-side to avoid CORS restrictions.
// Only allows http/https URLs to calendar sources (no SSRF to internal hosts).
router.get('/proxy-ics', async (req, res, next) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url parameter required' });

  // Security: only allow http/https, block private IP ranges
  let parsed;
  try { parsed = new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL' }); }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.status(400).json({ error: 'Only http/https URLs permitted' });
  }
  // Block requests to private/loopback addresses
  const blocked = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|::1)/i;
  if (blocked.test(parsed.hostname)) {
    return res.status(403).json({ error: 'Private addresses not permitted' });
  }

  try {
    const https = require('https'), http = require('http');
    const proto = parsed.protocol === 'https:' ? https : http;
    await new Promise((resolve, reject) => {
      const request = proto.get(url, { timeout: 8000 }, proxyRes => {
        if (proxyRes.statusCode !== 200) {
          reject(new Error(`Upstream returned ${proxyRes.statusCode}`));
          return;
        }
        res.set('Content-Type', 'text/calendar; charset=utf-8');
        res.set('Cache-Control', 'public, max-age=3600');
        proxyRes.pipe(res);
        proxyRes.on('end', resolve);
      });
      request.on('error', reject);
      request.on('timeout', () => { request.destroy(); reject(new Error('Upstream timeout')); });
    });
  } catch (e) {
    if (!res.headersSent) next(e);
  }
});

module.exports = router;
module.exports.handleICS = handleICS;
