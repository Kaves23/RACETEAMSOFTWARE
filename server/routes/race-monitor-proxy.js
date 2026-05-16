/**
 * Race Monitor reverse proxy (race-monitor.com)
 *
 * Race Monitor exposes per-race live timing at:
 *   https://www.race-monitor.com/Live/Race/{raceId}
 * which redirects to a SignalR-driven SPA at:
 *   https://api.race-monitor.com/Timing/?raceid={raceId}&source=www.race-monitor.com
 *
 * Stage 1 (current): HTTP-polling skeleton with the SAME API shape as apex-proxy.
 *   The front-end can switch providers transparently. The actual SignalR scraper
 *   is wired in Stage 2 — for now this proxy serves an emptyState() with
 *   { connecting: true } until the scraper lands.
 *
 * Routes (mirror /api/apex-proxy/*):
 *   GET    /                 — snapshot + ensure session running
 *   GET    /grid             — alias for /
 *   GET    /messages         — last raw frames (skeleton; empty until Stage 2)
 *   GET    /discover         — diagnostic: resolves URL → raceId + page status
 *   DELETE /session?slug=…   — terminate session
 */
'use strict';

const express = require('express');
const https   = require('https');
const http    = require('http');
const router  = express.Router();

// ── HTTP helper (same shape as apex-proxy) ────────────────────────────────────
function fetchUrl(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const timeout = opts.timeout || 8000;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RaceTeamOS/5.0)',
        'Accept': 'text/html,application/json,*/*',
        ...(opts.headers || {})
      }
    }, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        return fetchUrl(next, opts).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data, finalUrl: url }));
    });
    req.setTimeout(timeout, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

// ── State shape (must match apex-proxy.emptyState) ────────────────────────────
function emptyState() {
  return {
    connected: false,
    sessionName: '',
    classOnTrack: '',
    nextClass: '',
    status: 'waiting',
    timeRemaining: '',
    laps: 0,
    totalLaps: 0,
    weather: { wth1: '', wth2: '', wth3: '' },
    drivers: [],
    lastUpdate: null,
  };
}

// ── Race ID extraction ────────────────────────────────────────────────────────
// Accepts any of:
//   165374
//   https://www.race-monitor.com/Live/Race/165374
//   https://api.race-monitor.com/Timing/?raceid=165374
//   www.race-monitor.com/Live/Race/165374
function raceIdFromInput(input) {
  const s = String(input || '').trim();
  if (!s) return '';
  // Plain numeric id
  if (/^\d{1,9}$/.test(s)) return s;
  // raceid query param
  const qm = s.match(/[?&]raceid=(\d{1,9})/i);
  if (qm) return qm[1];
  // /Live/Race/{id} path
  const pm = s.match(/\/Race\/(\d{1,9})/i);
  if (pm) return pm[1];
  // /Live/Section/{id} — NOT a race; user pasted the directory page
  if (/\/Section\//i.test(s)) return '';
  // Last numeric path segment as a fallback
  try {
    const u = new URL(s.startsWith('http') ? s : 'https://' + s);
    const parts = u.pathname.split('/').filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i--) {
      if (/^\d{1,9}$/.test(parts[i])) return parts[i];
    }
  } catch (_) {}
  return '';
}

// ── Per-race session state (in-memory) ────────────────────────────────────────
const sessions = new Map(); // raceId -> { raceId, state, messageQueue, lastFetch, error, _startTime }

const SAFE_RACE_ID = /^\d{1,9}$/;

async function startSession(raceId) {
  if (!SAFE_RACE_ID.test(raceId)) return;
  const session = {
    raceId,
    connected: false,
    state: emptyState(),
    messageQueue: [],
    error: null,
    lastFetch: 0,
    _startTime: Date.now(),
  };
  sessions.set(raceId, session);
  // Kick off a first scrape (best-effort, non-blocking for response)
  pollSession(session).catch(e => {
    session.error = e.message;
  });
}

// Stage 1 poll: just hits the SignalR page to confirm reachability + extracts
// any pre-rendered text (some pages render initial HTML, most don't).
async function pollSession(session) {
  const url = `https://api.race-monitor.com/Timing/?raceid=${session.raceId}&source=www.race-monitor.com`;
  try {
    const r = await fetchUrl(url, { timeout: 8000 });
    session.lastFetch = Date.now();
    session.messageQueue.push({ ts: session.lastFetch, status: r.status, len: (r.body || '').length });
    if (session.messageQueue.length > 50) session.messageQueue.shift();
    if (r.status !== 200) {
      session.error = `HTTP ${r.status}`;
      session.connected = false;
      return;
    }
    // Try to extract a "No current race" sentinel
    if (/No current race|not receiving data/i.test(r.body)) {
      session.connected = false;
      session.state.status = 'waiting';
      session.error = 'no_data';
      return;
    }
    // Stage 1 placeholder: SignalR data isn't in static HTML, so we can't
    // populate driver rows yet. We only know the endpoint is reachable.
    // Stage 2 will replace this with a SignalR client.
    session.connected = true;
    session.error = null;
    session.state.connected = true;
    session.state.lastUpdate = new Date().toISOString();
  } catch (e) {
    session.error = e.message;
    session.connected = false;
  }
}

// Evict sessions inactive for > 30 min
setInterval(() => {
  const now = Date.now();
  for (const [raceId, s] of sessions) {
    const age = now - (s.lastFetch || s._startTime || now);
    if (age > 30 * 60 * 1000) {
      sessions.delete(raceId);
      console.log(`[race-monitor-proxy] Evicted stale session: ${raceId}`);
    }
  }
}, 5 * 60 * 1000);

// Re-poll active sessions every 10 s
setInterval(() => {
  for (const s of sessions.values()) {
    if (Date.now() - s.lastFetch > 8000) {
      pollSession(s).catch(() => {});
    }
  }
}, 10 * 1000);

// ── Routes ────────────────────────────────────────────────────────────────────

router.get(['/', '/grid'], async (req, res) => {
  const raceId = raceIdFromInput(req.query.slug || req.query.url || req.query.raceId || '');
  if (!raceId) {
    return res.status(400).json({
      ok: false,
      error: 'race id not found',
      message: 'Provide ?slug=<raceId> or ?url=https://www.race-monitor.com/Live/Race/{id}'
    });
  }
  let session = sessions.get(raceId);
  if (!session) {
    startSession(raceId).catch(e => console.error('[race-monitor-proxy] start error:', e));
    return res.json({ ok: true, slug: raceId, raceId, provider: 'race-monitor', connecting: true, state: emptyState() });
  }
  return res.json({
    ok: true,
    slug: raceId,
    raceId,
    provider: 'race-monitor',
    connected: session.connected,
    error: session.error,
    state: session.state,
    queueLength: session.messageQueue.length,
    stage: 1,
    stageNote: 'HTTP-polling skeleton — SignalR scraper lands in Stage 2',
  });
});

router.get('/messages', (req, res) => {
  const raceId = raceIdFromInput(req.query.slug || '');
  if (!raceId) return res.status(400).json({ ok: false, error: 'race id required' });
  const session = sessions.get(raceId);
  if (!session) return res.json({ ok: false, error: 'no session — call /api/race-monitor-proxy?slug=<raceId> first' });
  const last = Math.min(parseInt(req.query.last || '20', 10), 50);
  return res.json({
    ok: true,
    raceId,
    connected: session.connected,
    error: session.error,
    messages: session.messageQueue.slice(-last),
  });
});

router.get('/discover', async (req, res) => {
  const raw = String(req.query.slug || req.query.url || '').trim();
  const raceId = raceIdFromInput(raw);
  const out = { provider: 'race-monitor', input: raw, raceId };
  if (!raceId) {
    out.ok = false;
    out.error = 'Could not extract a race id. Paste a full race URL like https://www.race-monitor.com/Live/Race/165374';
    return res.status(400).json(out);
  }
  const apiUrl = `https://api.race-monitor.com/Timing/?raceid=${raceId}&source=www.race-monitor.com`;
  out.apiUrl = apiUrl;
  try {
    const r = await fetchUrl(apiUrl, { timeout: 8000 });
    out.pageStatus = r.status;
    out.bodyLength = (r.body || '').length;
    out.hasNoDataSentinel = /No current race|not receiving data/i.test(r.body || '');
    out.ok = r.status === 200;
  } catch (e) {
    out.ok = false;
    out.error = e.message;
  }
  return res.json(out);
});

router.delete('/session', (req, res) => {
  const raceId = raceIdFromInput(req.query.slug || '');
  if (!raceId) return res.status(400).json({ ok: false });
  const existed = sessions.delete(raceId);
  return res.json({ ok: true, raceId, terminated: existed });
});

module.exports = router;
