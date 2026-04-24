/**
 * Apex Timing reverse proxy — server-side WebSocket bridge
 *
 * Apex Timing uses a raw Java WebSocket server on a per-event port
 * (e.g. wss://www.apex-timing.com:7553/).
 * The port is embedded in the event page HTML / JS.
 * This module:
 *   1. Discovers the WS port by fetching the event page server-side
 *   2. Maintains a persistent server-side WebSocket connection
 *   3. Parses the proprietary r{row}c{col}|{type}|{value} message format
 *      into a clean driver grid state object
 *   4. Serves that state to the browser via HTTP polling (no CORS issues)
 *
 * Routes:
 *   GET /api/apex-proxy?slug=african-karting-cup
 *   GET /api/apex-proxy/discover?slug=african-karting-cup
 *   GET /api/apex-proxy/messages?slug=...&last=20
 *   GET /api/apex-proxy/raw?slug=...&path=/somepath
 */
'use strict';

const express = require('express');
const net = require('net');
const router  = express.Router();
const https   = require('https');
const http    = require('http');
const WebSocket = require('ws');

// ── HTTP helper ───────────────────────────────────────────────────────────────

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
        return fetchUrl(res.headers.location, opts).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.setTimeout(timeout, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

function slugFromUrl(rawUrl) {
  try {
    const u = new URL(String(rawUrl).trim().replace(/\/$/, ''));
    const parts = u.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || '';
  } catch (e) {
    return String(rawUrl).trim().replace(/^\/+|\/+$/g, '').split('/').pop() || '';
  }
}

// ── Port discovery ────────────────────────────────────────────────────────────

const PORT_PATTERNS = [
  /wsPort\s*[=:]\s*(\d{4,5})/i,
  /ws_port\s*[=:]\s*(\d{4,5})/i,
  /"port"\s*:\s*(\d{4,5})/i,
  /port\s*=\s*(\d{4,5})/i,
  /apex-timing\.com['":\s,+]*(\d{4,5})/i,
  /apex-timing\.com:(\d{4,5})/i,
  /wss?:\/\/[^:'"]+:(\d{4,5})/i,
  /connect\s*\([^)]*,\s*(\d{4,5})\s*\)/i,
  /new\s+WebSocket\s*\(\s*["'`][^"'`]*:(\d{4,5})/i,
];

function extractPort(text) {
  for (const pattern of PORT_PATTERNS) {
    const m = text.match(pattern);
    if (m) {
      const p = parseInt(m[1], 10);
      if (p >= 1024 && p <= 65535) return p;
    }
  }
  return null;
}

async function discoverPort(slug) {
  const pageUrl = `https://live.apex-timing.com/${slug}/`;

  let pageHtml = '';
  try {
    const page = await fetchUrl(pageUrl, { timeout: 8000 });
    if (page.status === 200) {
      pageHtml = page.body;
      const port = extractPort(pageHtml);
      if (port) return { port, source: 'page-html' };
    }
  } catch(e) { /* try scripts */ }

  // Fetch linked JS files
  const scriptSrcs = [];
  for (const m of pageHtml.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) {
    try { scriptSrcs.push(new URL(m[1], pageUrl).href); } catch(e) {}
  }
  for (const src of scriptSrcs.slice(0, 8)) {
    try {
      const js = await fetchUrl(src, { timeout: 6000 });
      if (js.status === 200) {
        const port = extractPort(js.body);
        if (port) return { port, source: src };
      }
    } catch(e) { /* try next */ }
  }

  return null;
}

// ── Per-slug WS session state ─────────────────────────────────────────────────

const sessions = new Map();

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
    drivers: [],
    lastUpdate: null,
  };
}

// ── Apex Timing message parser ─────────────────────────────────────────────────
// Messages: space-separated tokens of the form r{ROW}c{COL}|{TYPE}|{VALUE}
// Columns observed:
//   c1  = row status/flag
//   c2  = kart status (su/sl/sd etc)
//   c3  = position number
//   c4  = driver name
//   c5  = best lap time
//   c9  = laps completed
//   c11 = last lap time
//   c13 = gap to leader
//   c14 = best lap rank

function parseMessages(rawMessages, grid, state) {
  let changed = false;

  for (const raw of rawMessages) {
    const tokens = raw.trim().split(/\s+/);
    for (const token of tokens) {
      if (!token) continue;

      // r{ROW}|*|{val} — row timestamp marker
      const rowMark = token.match(/^r(\d+)\|\*\|(\d*)$/);
      if (rowMark) {
        const row = parseInt(rowMark[1]);
        if (!grid.has(row)) grid.set(row, {});
        grid.get(row)._ts = rowMark[2];
        changed = true;
        continue;
      }

      // r{ROW}c{COL}|{type}|{value}
      const cellMatch = token.match(/^r(\d+)c(\d+)\|([^|]*)\|(.*)$/);
      if (!cellMatch) continue;

      const row = parseInt(cellMatch[1]);
      const col = parseInt(cellMatch[2]);
      const type = cellMatch[3];
      const value = cellMatch[4];

      if (!grid.has(row)) grid.set(row, {});
      grid.get(row)[`c${col}`] = { type, value };
      changed = true;
    }
  }

  if (!changed) return;

  // Rebuild drivers from grid
  const drivers = [];

  for (const [row, cell] of grid) {
    if (row === 0) {
      applySessionCell(cell, state);
      continue;
    }

    // Need at least one meaningful field
    const c3 = cell.c3;   // position
    const c4 = cell.c4;   // driver name
    const c9 = cell.c9;   // laps
    const c11 = cell.c11; // last lap

    if (!c3 && !c4 && !c9 && !c11) continue;

    drivers.push({
      pos: (c3 ? toNum(c3.value) : 0) || row,
      kart: cell.c2 ? cell.c2.value : '',
      name: c4 ? c4.value : '',
      laps: c9 ? toNum(c9.value) : 0,
      lastLap: c11 ? fmtLap(c11.value) : '',
      bestLap: cell.c5 ? fmtLap(cell.c5.value) : '',
      gap: cell.c13 ? cell.c13.value : '',
      inPit: !!(cell.c2 && /sp|pi|pit/i.test(cell.c2.type)),
      flag: cell.c1 ? cell.c1.type : '',
    });
  }

  drivers.sort((a, b) => (a.pos || 999) - (b.pos || 999));
  state.drivers = drivers;
  state.lastUpdate = new Date().toISOString();
  state.connected = true;
}

function applySessionCell(cell, state) {
  for (const cv of Object.values(cell)) {
    if (!cv || typeof cv !== 'object') continue;
    const v = String(cv.value || '').trim();
    const t = String(cv.type || '').toLowerCase();
    if (!v) continue;
    if (/race|qual|prac|warm/i.test(v)) state.sessionName = v;
    if (/race|green|start/i.test(t + v)) state.status = 'racing';
    else if (/qual|hot/i.test(t + v)) state.status = 'qualifying';
    else if (/prac|warm/i.test(t + v)) state.status = 'practice';
    else if (/finish|end|check/i.test(t + v)) state.status = 'finished';
    if (/\d:\d\d/.test(v)) state.timeRemaining = v;
  }
}

function toNum(v) {
  const n = parseFloat(String(v || '').replace(/[^\d.]/g, ''));
  return isNaN(n) ? 0 : n;
}

function fmtLap(v) {
  if (!v) return '';
  const s = String(v).trim();
  if (/^\d+\.\d{3}$/.test(s)) return s;
  const ms = parseInt(s, 10);
  if (!isNaN(ms) && ms > 1000 && ms < 600000) return (ms / 1000).toFixed(3);
  return s;
}

// ── WebSocket session manager ─────────────────────────────────────────────────

async function startSession(slug) {
  const old = sessions.get(slug);
  if (old) {
    if (old.retryTimer) clearTimeout(old.retryTimer);
    if (old.ws) { try { old.ws.terminate(); } catch(e) {} }
  }

  const discovery = await discoverPort(slug);
  if (!discovery) {
    console.warn(`[apex-proxy] No WS port found for: ${slug}`);
    sessions.set(slug, { slug, port: null, connected: false, state: emptyState(), grid: new Map(), messageQueue: [], error: 'port_not_found' });
    return;
  }

  const { port } = discovery;
  console.log(`[apex-proxy] Port ${port} for ${slug} (${discovery.source})`);

  // Try ws:// first — Apex Timing Java server uses plain WS; browser sees wss:// only
  // because Cloudflare/nginx terminates TLS in front of it.
  const wsUrls = [
    `ws://www.apex-timing.com:${port}/`,
    `wss://www.apex-timing.com:${port}/`,
  ];
  const session = { slug, port, wsUrl: wsUrls[0], wsUrls, wsUrlIndex: 0, ws: null, connected: false, state: emptyState(), grid: new Map(), messageQueue: [], retryTimer: null, error: null, closeCode: null };
  sessions.set(slug, session);
  connectWs(session);
}

function connectWs(session) {
  if (session.retryTimer) { clearTimeout(session.retryTimer); session.retryTimer = null; }
  const wsUrl = session.wsUrls[session.wsUrlIndex % session.wsUrls.length];
  session.wsUrl = wsUrl;
  console.log(`[apex-proxy] Connecting: ${wsUrl}`);
  try {
    const ws = new WebSocket(wsUrl, {
      headers: {
        'Origin': 'https://live.apex-timing.com',
        'Host': `www.apex-timing.com:${session.port}`,
        'User-Agent': 'Mozilla/5.0 (compatible; RaceTeamOS/5.0)',
      },
      rejectUnauthorized: false,
      handshakeTimeout: 8000,   // fail fast if TLS/upgrade hangs
      followRedirects: true,
    });
    session.ws = ws;

    ws.on('open', () => {
      console.log(`[apex-proxy] Connected: ${session.wsUrl}`);
      session.connected = true;
      session.error = null;
      session.closeCode = null;
      session.state.connected = true;
      // Some Apex Timing servers require an initial message to start sending data
      // Try sending a ping/subscribe — harmless if not needed
      try { ws.send(''); } catch(e) {}
    });

    ws.on('message', (data) => {
      const msg = data.toString();
      session.messageQueue.push(msg);
      if (session.messageQueue.length > 200) session.messageQueue.shift();
      parseMessages([msg], session.grid, session.state);
    });

    ws.on('close', (code) => {
      console.log(`[apex-proxy] WS closed ${code} for ${session.slug} (was ${session.wsUrl})`);
      session.connected = false;
      session.closeCode = code;
      session.state.connected = false;
      session.ws = null;
      if (code !== 1000) {
        // Rotate to next URL candidate (wss→ws) before retrying
        session.wsUrlIndex = (session.wsUrlIndex + 1) % session.wsUrls.length;
        const delay = session.wsUrlIndex === 0 ? 5000 : 500; // short delay when switching scheme
        session.retryTimer = setTimeout(() => connectWs(session), delay);
      }
    });

    ws.on('error', (err) => {
      console.warn(`[apex-proxy] WS error (${session.slug}):`, err.message);
      session.error = err.message;
      session.connected = false;
    });
  } catch(e) {
    session.error = e.message;
    session.retryTimer = setTimeout(() => connectWs(session), 8000);
  }
}

// Evict sessions inactive for > 30 min
setInterval(() => {
  const now = Date.now();
  for (const [slug, s] of sessions) {
    const age = s.state.lastUpdate ? now - new Date(s.state.lastUpdate).getTime() : now - (s._startTime || now);
    if (age > 30 * 60 * 1000) {
      if (s.ws) try { s.ws.terminate(); } catch(e) {}
      if (s.retryTimer) clearTimeout(s.retryTimer);
      sessions.delete(slug);
      console.log(`[apex-proxy] Evicted stale session: ${slug}`);
    }
  }
}, 5 * 60 * 1000);

// ── Routes ────────────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  const slug = slugFromUrl(req.query.slug || req.query.url || '');
  if (!slug) return res.status(400).json({ ok: false, error: 'slug param required' });
  if (!/^[a-zA-Z0-9_-]+$/.test(slug)) return res.status(400).json({ ok: false, error: 'Invalid slug' });

  let session = sessions.get(slug);

  if (!session) {
    startSession(slug).catch(e => console.error('[apex-proxy] startSession error:', e));
    return res.json({ ok: true, slug, connecting: true, state: emptyState() });
  }

  if (session.error === 'port_not_found') {
    return res.json({ ok: false, slug, error: 'port_not_found', message: 'Could not discover WebSocket port. The event page may be offline or the port pattern has changed.' });
  }

  const wsState = session.ws ? session.ws.readyState : -1; // 0=CONNECTING 1=OPEN 2=CLOSING 3=CLOSED
  return res.json({ ok: true, slug, port: session.port, wsUrl: session.wsUrl, connected: session.connected, wsError: session.error || null, wsReadyState: wsState, wsCloseCode: session.closeCode || null, state: session.state, queueLength: session.messageQueue.length });
});

router.get('/messages', (req, res) => {
  const slug = slugFromUrl(req.query.slug || '');
  if (!slug || !/^[a-zA-Z0-9_-]+$/.test(slug)) return res.status(400).json({ ok: false });
  const session = sessions.get(slug);
  if (!session) return res.json({ ok: false, error: 'no session — call /api/apex-proxy?slug=... first' });
  const last = Math.min(parseInt(req.query.last || '20', 10), 200);
  const wsStateM = session.ws ? session.ws.readyState : -1;
  return res.json({ ok: true, slug, port: session.port, wsUrl: session.wsUrl, connected: session.connected, wsError: session.error || null, wsReadyState: wsStateM, wsCloseCode: session.closeCode || null, messages: session.messageQueue.slice(-last) });
});

router.get('/discover', async (req, res) => {
  const slug = slugFromUrl(req.query.slug || req.query.url || '');
  if (!slug) return res.status(400).json({ ok: false, error: 'slug param required' });

  const pageUrl = `https://live.apex-timing.com/${slug}/`;
  const result = { slug, pageUrl, portFound: null, portSource: null, scriptSrcs: [], inlineScripts: [], jsPortScans: [] };

  let pageHtml = '';
  try {
    const page = await fetchUrl(pageUrl, { timeout: 8000 });
    result.pageStatus = page.status;
    pageHtml = page.body;
    result.numbersInPage = [...new Set([...pageHtml.matchAll(/\b(\d{4,5})\b/g)].map(m => m[1]))];
    for (const m of pageHtml.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) {
      try { result.scriptSrcs.push(new URL(m[1], pageUrl).href); } catch(e) {}
    }
    for (const m of pageHtml.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)) {
      const t = m[1].trim();
      if (t) result.inlineScripts.push(t.slice(0, 400));
    }
  } catch(e) { result.pageError = e.message; }

  const disc = await discoverPort(slug).catch(() => null);
  if (disc) { result.portFound = disc.port; result.portSource = disc.source; }

  for (const src of result.scriptSrcs.slice(0, 6)) {
    try {
      const js = await fetchUrl(src, { timeout: 5000 });
      if (js.status !== 200) continue;
      const port = extractPort(js.body);
      const snippets = PORT_PATTERNS.flatMap(p => {
        const m = js.body.match(new RegExp(`.{0,60}${p.source}.{0,60}`));
        return m ? [m[0]] : [];
      }).slice(0, 3);
      result.jsPortScans.push({ src, port, snippets });
    } catch(e) { result.jsPortScans.push({ src, error: e.message }); }
  }

  const session = sessions.get(slug);
  if (session) result.currentSession = { port: session.port, connected: session.connected, messages: session.messageQueue.slice(-3) };

  return res.json(result);
});

router.get('/raw', async (req, res) => {
  const slug = slugFromUrl(req.query.slug || '');
  const rawPath = req.query.path || '/';
  if (!slug || !/^[a-zA-Z0-9_-]+$/.test(slug)) return res.status(400).json({ ok: false });
  try {
    const r = await fetchUrl(`https://live.apex-timing.com/${slug}${rawPath}`, { timeout: 6000 });
    res.status(r.status).set('Content-Type', r.headers['content-type'] || 'text/plain').send(r.body);
  } catch(e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

/**
 * GET /api/apex-proxy/test-port?host=www.apex-timing.com&port=7553
 * TCP connectivity test — confirms whether this server can reach the WS port.
 * Returns { ok, host, port, reachable, error, ms }
 */
router.get('/test-port', (req, res) => {
  const host = req.query.host || 'www.apex-timing.com';
  const port = parseInt(req.query.port || '7553', 10);
  if (port < 1 || port > 65535 || !/^[\w.-]+$/.test(host)) {
    return res.status(400).json({ ok: false, error: 'invalid host/port' });
  }
  const start = Date.now();
  const sock = new net.Socket();
  sock.setTimeout(6000);
  sock.on('connect', () => {
    sock.destroy();
    res.json({ ok: true, host, port, reachable: true, ms: Date.now() - start });
  });
  sock.on('timeout', () => {
    sock.destroy();
    res.json({ ok: true, host, port, reachable: false, error: 'timeout', ms: Date.now() - start });
  });
  sock.on('error', (e) => {
    res.json({ ok: true, host, port, reachable: false, error: e.message, ms: Date.now() - start });
  });
  sock.connect(port, host);
});

/**
 * GET /api/apex-proxy/scan-ports?host=www.apex-timing.com&base=7550&range=20
 * Scans base..(base+range) ports via TCP to find which are open.
 * Returns { reachable: [7553, 7557, ...], unreachable: [...] }
 */
router.get('/scan-ports', async (req, res) => {
  const host = req.query.host || 'www.apex-timing.com';
  const base = parseInt(req.query.base || '7550', 10);
  const range = Math.min(parseInt(req.query.range || '20', 10), 50);
  if (!/^[\w.-]+$/.test(host)) return res.status(400).json({ ok: false });

  function tcpTest(h, p) {
    return new Promise(resolve => {
      const s = new net.Socket();
      s.setTimeout(2000);
      s.on('connect', () => { s.destroy(); resolve({ port: p, open: true }); });
      s.on('timeout', () => { s.destroy(); resolve({ port: p, open: false, reason: 'timeout' }); });
      s.on('error', e => resolve({ port: p, open: false, reason: e.message }));
      s.connect(p, h);
    });
  }

  const ports = Array.from({ length: range }, (_, i) => base + i);
  const results = await Promise.all(ports.map(p => tcpTest(host, p)));
  const reachable = results.filter(r => r.open).map(r => r.port);
  return res.json({ ok: true, host, base, range, reachable, all: results });
});

/**
 * DELETE /api/apex-proxy/session?slug=...
 * Force-close and delete session so next GET starts fresh.
 */
router.delete('/session', (req, res) => {
  const slug = slugFromUrl(req.query.slug || '');
  if (!slug || !/^[a-zA-Z0-9_-]+$/.test(slug)) return res.status(400).json({ ok: false });
  const s = sessions.get(slug);
  if (s) {
    if (s.retryTimer) clearTimeout(s.retryTimer);
    if (s.ws) try { s.ws.terminate(); } catch(e) {}
    sessions.delete(slug);
  }
  return res.json({ ok: true, deleted: !!s });
});

module.exports = router;
