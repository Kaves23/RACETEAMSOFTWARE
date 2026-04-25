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
// Each WS frame contains one or more pipe-delimited tokens separated by spaces
// or newlines.  Token format:  ELEMENT_ID|CSS_CLASS|VALUE
//
// ELEMENT_ID types:
//   r{N}c{N}   — grid cell (row N, column N)
//   r{N}       — row timestamp  (cssClass = "*")
//   light      — current flag/status  (cssClass = lg/ly/lr/lc/lo/sc …)
//   title1     — session class name   (value = "Mini ROK")
//   title2     — session event name   (value = "Race 4")
//   init       — session lifecycle    (cssClass = r=race / n=ended)
//   dyn1       — lap counter display  (value = "Lap 34/200")
//   dyn2       — countdown timer ms   (value = "1236639")
//   br{N}c{N}  — best result cell
//   msg/track  — free-text messages
//
// Grid column mapping (confirmed from DevTools + integration guide):
//   c1  = row flag/status type  (gl/gf/yl/rf …)
//   c2  = row status badge      (sr/sl/su/in/sd)
//   c3  = race rank / position  (empty type, numeric value)
//   c4  = kart number           (empty type, e.g. "46")
//   c5  = driver name           (empty type, e.g. "Tuttelberg Ethan")
//   c6  = team / sponsor
//   c7  = class                 (e.g. "MINI ROK")
//   c8  = nation code
//   c9  = laps completed        (type: in)
//   c10 = best lap time         (type: ib — updated when personal best)
//   c11 = last lap time         (type: tn=normal / ti=improved / tb=time-best)
//   c12 = interval              (gap to car in front)
//   c13 = gap to race leader    (type: in)
//   c14 = best-lap rank         (type: rkb)
//
// IMPORTANT: values can contain spaces ("1 Lap", "Cornofsky Kayde").
// We split tokens using a lookahead on the IDENTIFIER|  pattern, not on \s+.

// Flag cssClass → race status
const FLAG_MAP = {
  lg: 'racing', gr: 'racing', wf: 'racing',
  ly: 'paused', yf: 'paused', lr: 'paused', rf: 'paused',
  lc: 'finished', ch: 'finished',
  lo: 'waiting', ls: 'paused', sc: 'paused', bf: 'paused', no: 'waiting',
};

// Tokenise a raw WS frame respecting multi-word values.
// Splits on whitespace (including newlines) that precedes a new IDENTIFIER|
// IMPORTANT: we must NOT split inside HTML values (grid/gridb elements).
// Strategy: extract large HTML-value tokens first, then split the remainder.
function tokeniseFrame(raw) {
  const tokens = [];
  // Pull out any element whose value contains '<' (HTML) before general splitting.
  // Pattern: match ELEMID|CLASS|<...> spanning to the next ELEMID| on its own line.
  const htmlRe = /^(\S+\|[^|]*\|<[\s\S]*?)(?=\n\S+\||$)/gm;
  let lastIndex = 0;
  const htmlMatches = [];
  let m;
  while ((m = htmlRe.exec(raw)) !== null) {
    htmlMatches.push({ start: m.index, end: m.index + m[1].length, token: m[1] });
  }
  if (htmlMatches.length === 0) {
    // No HTML values — simple split
    return raw.trim().split(/\s+(?=\S+\|)/);
  }
  // Build token list, splitting non-HTML regions normally
  let pos = 0;
  for (const hm of htmlMatches) {
    if (hm.start > pos) {
      const slice = raw.slice(pos, hm.start).trim();
      if (slice) tokens.push(...slice.split(/\s+(?=\S+\|)/));
    }
    tokens.push(hm.token.trim());
    pos = hm.end;
  }
  if (pos < raw.length) {
    const slice = raw.slice(pos).trim();
    if (slice) tokens.push(...slice.split(/\s+(?=\S+\|)/));
  }
  return tokens.filter(Boolean);
}

// Parse an Apex Timing HTML grid table into the cell Map.
// Apex Timing renders the timing board as an HTML table with data-id="r{N}c{N}" on each <td>.
// This is how static data (kart#, driver name, class) is delivered — they're only in the HTML.
function parseHtmlGrid(html, grid) {
  // Parse each data row. For cells without data-id, determine column number by
  // anchoring from the first cell in the same row that HAS a data-id.
  // e.g. if r1c5 is at index 4, then index 0=c1, 1=c2, 2=c3, 3=c4, 4=c5 ...
  const allRows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  for (const rowMatch of allRows) {
    const cells = [...rowMatch[1].matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)];
    if (!cells.length) continue;

    // Find anchor: first td with data-id="r{N}c{M}"
    let anchorIdx = -1, anchorRow = -1, anchorCol = -1;
    for (let i = 0; i < cells.length; i++) {
      const m = cells[i][1].match(/\bdata-id="r(\d+)c(\d+)"/i);
      if (m) { anchorIdx = i; anchorRow = parseInt(m[1]); anchorCol = parseInt(m[2]); break; }
    }
    if (anchorRow < 1) continue; // no anchor → skip (header/bestresult rows)

    if (!grid.has(anchorRow)) grid.set(anchorRow, {});
    const gridRow = grid.get(anchorRow);

    cells.forEach((cell, idx) => {
      const attrs  = cell[1];
      const inner  = cell[2];
      const value  = inner.replace(/<[^>]+>/g, '')
                          .replace(/&amp;/g,'&').replace(/&lt;/g,'<')
                          .replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').trim();
      const classM   = attrs.match(/\bclass="([^"]*)"/i);
      const cssClass = classM ? classM[1].trim() : '';

      // Explicit data-id → use it directly (authoritative)
      const explicitM = attrs.match(/\bdata-id="r\d+c(\d+)"/i);
      if (explicitM) {
        const col = parseInt(explicitM[1]);
        if (!gridRow[`c${col}`]) gridRow[`c${col}`] = { type: cssClass, value };
        return;
      }

      // No data-id → derive column from anchor offset
      const col = anchorCol - anchorIdx + idx;
      if (col < 1) return;
      if (value && !gridRow[`c${col}`]) {
        gridRow[`c${col}`] = { type: cssClass, value };
      }
    });
  }
}

function parseMessages(rawMessages, grid, state, session) {
  let changed = false;

  for (const raw of rawMessages) {
    const tokens = tokeniseFrame(raw);

    for (const token of tokens) {
      if (!token) continue;

      const firstPipe = token.indexOf('|');
      if (firstPipe < 0) continue;
      const elemId  = token.slice(0, firstPipe);
      const rest    = token.slice(firstPipe + 1);
      const secondPipe = rest.indexOf('|');
      if (secondPipe < 0) continue;
      const cssClass = rest.slice(0, secondPipe);
      const value    = rest.slice(secondPipe + 1);

      changed = true;

      // ── Special non-grid elements ─────────────────────────────────────────
      if (elemId === 'light') {
        const mapped = FLAG_MAP[cssClass.toLowerCase()];
        if (mapped) {
          state.status = mapped;
          state.cssClass = cssClass;
          // On chequered flag, schedule a reconnect after 4s to fetch final standings HTML
          if (mapped === 'finished' && session && !session._finishReconnectScheduled) {
            session._finishReconnectScheduled = true;
            console.log(`[apex-proxy] Chequered flag for ${session.slug} — reconnecting in 4s for final standings`);
            setTimeout(() => {
              session._finishReconnectScheduled = false;
              if (session.ws && session.ws.readyState === WebSocket.OPEN) {
                session.grid.clear(); // clear grid so final HTML overwrites everything
                session.ws.terminate();
              }
            }, 4000);
          }
        }
        continue;
      }
      if (elemId === 'title1') { state.title1 = value.trim(); rebuildSessionName(state); continue; }
      if (elemId === 'title2') { state.title2 = value.trim(); rebuildSessionName(state); continue; }
      if (elemId === 'init') {
        if (cssClass === 'r') state.status = 'racing';
        else if (cssClass === 'n') state.status = 'finished';
        continue;
      }
      if (elemId === 'dyn1') {
        // "Lap 34/200"
        const m = value.match(/(\d+)\s*\/\s*(\d+)/);
        if (m) { state.laps = parseInt(m[1], 10); state.totalLaps = parseInt(m[2], 10); }
        if (value) state.lapDisplay = value.trim();
        continue;
      }
      if (elemId === 'dyn2') {
        const ms = parseInt(value, 10);
        if (!isNaN(ms) && ms > 0) {
          const s = Math.floor(ms / 1000);
          state.timeRemaining = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
        }
        continue;
      }

      // ── HTML timing grid  grid||<table …> ────────────────────────────────
      // Apex Timing sends the full timing board as an HTML table on connect.
      // This is the ONLY place static data (kart#, name, class) arrives.
      if (elemId === 'grid' && value.includes('<')) {
        console.log(`[apex-proxy] Parsing HTML grid (${value.length}b) for ${state.sessionName || 'session'}`);
        parseHtmlGrid(value, grid);
        continue;
      }

      // ── Row timestamp  r{N}|*|{ms} ────────────────────────────────────────
      const rOnly = elemId.match(/^r(\d+)$/);
      if (rOnly && cssClass === '*') {
        const row = parseInt(rOnly[1]);
        if (!grid.has(row)) grid.set(row, {});
        grid.get(row)._ts = value;
        continue;
      }

      // ── Grid cell  r{N}c{N}|{type}|{value} ───────────────────────────────
      const rcMatch = elemId.match(/^r(\d+)c(\d+)$/);
      if (rcMatch) {
        const row = parseInt(rcMatch[1]);
        const col = parseInt(rcMatch[2]);
        if (!grid.has(row)) grid.set(row, {});
        grid.get(row)[`c${col}`] = { type: cssClass, value };
        continue;
      }

      // br{N}c{N} — best result rows (kart/time of fastest lap)
      // ignore for driver grid
    }
  }

  if (!changed) return;
  rebuildDrivers(grid, state);
}

function rebuildSessionName(state) {
  const parts = [state.title1, state.title2].filter(Boolean);
  if (parts.length) state.sessionName = parts.join(' – ');
  // classOnTrack = title1 (e.g. "Mini ROK")
  if (state.title1) state.classOnTrack = state.title1;
}

function rebuildDrivers(grid, state) {
  const drivers = [];

  for (const [row, cell] of grid) {
    // c1 flag applies to whole session state (broadcast from any row)
    if (cell.c1 && cell.c1.type) {
      const mapped = FLAG_MAP[cell.c1.type.toLowerCase()];
      if (mapped) { state.status = mapped; state.cssClass = cell.c1.type; }
    }

    // Include the row if it has any driver data
    const hasData = cell.c3 || cell.c4 || cell.c5 || cell.c9 || cell.c11;
    if (!hasData) continue;

    // Confirmed column mapping from live data:
    //   c3  = position (from incremental updates only, not in HTML grid)
    //   c4  = kart number (numeric, may be in HTML if not wrapped; also incremental)
    //   c5  = driver name (from HTML grid)
    //   c6  = team/sponsor (from HTML grid)
    //   c7  = class (from HTML grid)
    //   c9  = laps completed
    //   c10 = best lap time
    //   c11 = last lap time (incremental)
    //   c12 = interval to car ahead (e.g. "4.750", "1 Lap")
    //   c13 = gap to race leader (e.g. "4.750", "1 Lap") — use c12 for display
    const name = cell.c5 ? cell.c5.value.trim() : '';
    const kart = cell.c4 ? cell.c4.value.trim() : '';

    const driver = {
      pos:     cell.c3  ? toNum(cell.c3.value)   : row,  // fall back to HTML grid row order (Apex renders rows in position order)
      kart:    kart,
      name:    name,
      team:    cell.c6  ? cell.c6.value           : '',
      laps:    cell.c9  ? toNum(cell.c9.value)    : 0,
      bestLap: cell.c10 ? fmtLap(cell.c10.value)  : '',
      lastLap: cell.c11 ? fmtLap(cell.c11.value)  : '',
      gap:     cell.c12 ? cell.c12.value           : (cell.c13 ? cell.c13.value : ''),
      class:   cell.c7  ? cell.c7.value           : '',
      inPit:   !!(cell.c2 && /sd|pi/.test(cell.c2.type)),
      flag:    cell.c1  ? cell.c1.type            : '',
    };

    drivers.push(driver);
  }

  drivers.sort((a, b) => {
    // Primary: use explicit position (c3) if available and non-zero
    const aPos = a.pos || 0;
    const bPos = b.pos || 0;
    if (aPos > 0 && bPos > 0) return aPos - bPos;
    if (aPos > 0) return -1;
    if (bPos > 0) return 1;
    // Fallback: sort by laps desc, then gap asc (gap = "10.083" seconds from leader)
    if (b.laps !== a.laps) return b.laps - a.laps;
    const aGap = parseFloat(String(a.gap).replace(/[^\d.]/g, '')) || 0;
    const bGap = parseFloat(String(b.gap).replace(/[^\d.]/g, '')) || 0;
    return aGap - bGap;
  });
  state.drivers = drivers;
  state.lastUpdate = new Date().toISOString();
  state.connected = true;
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

  const displayPort = discovery.port;
  // Port formula: display port + 3 = WSS port, display port + 2 = WS port
  const wssPort = displayPort + 3;
  const wsPort  = displayPort + 2;
  console.log(`[apex-proxy] Display port ${displayPort} → WSS ${wssPort} / WS ${wsPort} for ${slug}`);

  const wsUrls = [
    `wss://www.apex-timing.com:${wssPort}/`,
    `ws://www.apex-timing.com:${wsPort}/`,
  ];
  const session = { slug, port: wssPort, displayPort, wsUrl: wsUrls[0], wsUrls, wsUrlIndex: 0, ws: null, connected: false, state: emptyState(), grid: new Map(), messageQueue: [], retryTimer: null, error: null, closeCode: null };
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

      // Apex Timing sends a full state dump on connect, then incremental updates.
      // If we missed the dump (e.g. server was reused mid-session), reconnect after
      // a short delay to get a fresh dump that includes driver names (c4/c5).
      // Apex Timing streams data unprompted — no subscribe message needed.
      // Driver names come from the 'grid' HTML element in the initial dump (parsed by parseHtmlGrid).
    });

    ws.on('message', (data) => {
      const msg = data.toString();
      session.messageQueue.push(msg);
      if (session.messageQueue.length > 200) session.messageQueue.shift();
      // Log first 5 frames verbatim so we can verify column structure in Render logs
      if (!session._frameCount) session._frameCount = 0;
      if (session._frameCount < 5) {
        console.log(`[apex-proxy] frame[${session._frameCount}] (${msg.length}b):`, msg.slice(0, 500));
        session._frameCount++;
      }
      parseMessages([msg], session.grid, session.state, session);
    });

    ws.on('close', (code) => {
      console.log(`[apex-proxy] WS closed ${code} for ${session.slug} (was ${session.wsUrl})`);
      session.connected = false;
      session.closeCode = code;
      session.state.connected = false;
      session.ws = null;
      if (session.nameCheckTimer) { clearTimeout(session.nameCheckTimer); session.nameCheckTimer = null; }
      if (code !== 1000) {
        // Rotate to next URL candidate (wss→ws) before retrying
        session.wsUrlIndex = (session.wsUrlIndex + 1) % session.wsUrls.length;
        const delay = session.wsUrlIndex === 0 ? 5000 : 500;
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
 * GET /api/apex-proxy/grid?slug=...
 * Debug: returns raw grid state so column mapping can be verified.
 */
router.get('/grid', (req, res) => {
  const slug = slugFromUrl(req.query.slug || '');
  if (!slug || !/^[a-zA-Z0-9_-]+$/.test(slug)) return res.status(400).json({ ok: false });
  const session = sessions.get(slug);
  if (!session) return res.json({ ok: false, error: 'no session' });
  const grid = {};
  for (const [row, cell] of session.grid) { grid[`r${row}`] = cell; }
  return res.json({ ok: true, slug, connected: session.connected, gridRows: session.grid.size, grid, state: session.state });
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
