'use strict';

const express = require('express');
const router = express.Router();

const OPENF1_BASE = 'https://api.openf1.org/v1';

function isValidEndpoint(s) {
  return /^[a-z_]+$/i.test(String(s || ''));
}

router.get('/:endpoint', async (req, res) => {
  const endpoint = String(req.params.endpoint || '').trim();
  if (!isValidEndpoint(endpoint)) {
    return res.status(400).json({ error: 'Invalid OpenF1 endpoint' });
  }

  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query || {})) {
    if (v == null || v === '') continue;
    if (Array.isArray(v)) {
      for (const item of v) usp.append(k, String(item));
    } else {
      usp.set(k, String(v));
    }
  }

  const url = `${OPENF1_BASE}/${endpoint}${usp.toString() ? '?' + usp.toString() : ''}`;

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 12000);

  try {
    const r = await fetch(url, {
      method: 'GET',
      signal: ctrl.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'RaceTeamOS/5.0 (+openf1-proxy)'
      },
      cache: 'no-store'
    });

    const txt = await r.text();

    // Preserve useful upstream status (404 no data, 429 rate limit, etc.)
    res.status(r.status);
    const ct = r.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try {
        return res.json(JSON.parse(txt));
      } catch {
        return res.type('application/json').send(txt || '[]');
      }
    }
    return res.type('application/json').send(txt || '[]');
  } catch (err) {
    const isAbort = err && (err.name === 'AbortError' || String(err).includes('aborted'));
    return res.status(isAbort ? 504 : 502).json({
      error: isAbort ? 'OpenF1 request timed out' : 'OpenF1 request failed'
    });
  } finally {
    clearTimeout(timeout);
  }
});

module.exports = router;
