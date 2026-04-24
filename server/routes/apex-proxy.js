/**
 * Apex Timing reverse proxy
 * Fetches live timing data from live.apex-timing.com server-side,
 * bypassing the browser CORS restriction.
 *
 * GET /api/apex-proxy?slug=african-karting-cup
 *   → Returns { ok, status, sessionName, classOnTrack, drivers[], raw }
 *
 * GET /api/apex-proxy/discover?slug=african-karting-cup
 *   → Returns the page HTML + detected data URL patterns (debug/setup helper)
 *
 * GET /api/apex-proxy/raw?slug=african-karting-cup&path=/somepath.json
 *   → Returns raw content from that path under the event (for discovery)
 */
'use strict';

const express = require('express');
const router  = express.Router();
const https   = require('https');
const http    = require('http');

// ── helpers ──────────────────────────────────────────────────────────────────

function fetchUrl(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const timeout = opts.timeout || 8000;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RaceTeamOS/1.0)',
        'Accept': 'text/html,application/json,*/*',
        ...( opts.headers || {} )
      }
    }, (res) => {
      // Follow one redirect
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        return fetchUrl(res.headers.location, opts).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.setTimeout(timeout, () => { req.destroy(); reject(new Error('Request timeout')); });
    req.on('error', reject);
  });
}

function postData(rawUrl, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const u = new URL(rawUrl);
    const lib = rawUrl.startsWith('https') ? https : http;
    const buf = Buffer.from(String(body), 'utf8');
    const req = lib.request({
      hostname: u.hostname,
      port: u.port || (rawUrl.startsWith('https') ? 443 : 80),
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8',
        'Content-Length': buf.length,
        'User-Agent': 'Mozilla/5.0 (compatible; RaceTeamOS/1.0)',
        'Origin': 'https://live.apex-timing.com',
        'Referer': 'https://live.apex-timing.com/',
      }
    }, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.setTimeout(timeoutMs || 6000, () => { req.destroy(); reject(new Error('POST timeout')); });
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

function slugFromUrl(rawUrl) {
  try {
    const u = new URL(rawUrl.trim().replace(/\/$/, ''));
    const parts = u.pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || '';
  } catch (e) {
    return String(rawUrl).trim().replace(/^\/+|\/+$/g, '').split('/').pop() || '';
  }
}

// Attempt to parse various known Apex Timing response formats
function parseApexBody(body, contentType) {
  // Try JSON
  const ct = String(contentType || '').toLowerCase();
  if (ct.includes('json') || body.trimStart().startsWith('{') || body.trimStart().startsWith('[')) {
    try {
      return { format: 'json', data: JSON.parse(body) };
    } catch(e) { /* fall through */ }
  }

  // Try JSONP: callback({...})
  const jsonpMatch = body.match(/^\s*\w+\s*\(\s*(\{[\s\S]*\}|\[[\s\S]*\])\s*\)\s*;?\s*$/);
  if (jsonpMatch) {
    try {
      return { format: 'jsonp', data: JSON.parse(jsonpMatch[1]) };
    } catch(e) { /* fall through */ }
  }

  // Return raw text
  return { format: 'text', data: body };
}

// Extract potential data URLs / WebSocket URLs from page HTML/JS
function extractDataUrls(html, baseUrl) {
  const found = new Set();
  // WebSocket URLs
  const wsMatches = html.matchAll(/["'`](wss?:\/\/[^"'`\s]+)["'`]/g);
  for (const m of wsMatches) found.add(m[1]);
  // Relative JSON-like paths
  const relMatches = html.matchAll(/["'`](\/[^"'`\s]*(?:json|data|timing|results|standings|status|race|feed|socket)[^"'`\s]*)["'`]/gi);
  for (const m of relMatches) {
    try {
      found.add(new URL(m[1], baseUrl).href);
    } catch(e) {}
  }
  // socket.io detection
  if (html.includes('socket.io') || html.includes('Socket.IO')) found.add('socket.io');
  return [...found];
}

// Known candidate data paths to probe (server-side, no CORS)
// NOTE: /?format=json and /?json=1 are excluded — Apex Timing returns HTML for
// those regardless of query params (false positives in status-200 checks).
const CANDIDATE_PATHS = [
  '/racedata.json',
  '/data.json',
  '/json',
  '/timing.json',
  '/race.json',
  '/results.json',
  '/standings.json',
  '/status.json',
  '/api/data',
  '/api/timing',
  '/api/standings',
  '/api/results',
  '/live.json',
  '/current.json',
  '/session.json',
];

// Simple in-memory cache: slug -> { ts, result }
const cache = new Map();
const CACHE_TTL = 8000; // 8 seconds

function getCached(slug) {
  const entry = cache.get(slug);
  if (entry && (Date.now() - entry.ts) < CACHE_TTL) return entry.result;
  return null;
}
function setCache(slug, result) {
  cache.set(slug, { ts: Date.now(), result });
  // prune old entries
  if (cache.size > 50) {
    const oldest = [...cache.entries()].sort((a,b) => a[1].ts - b[1].ts)[0];
    cache.delete(oldest[0]);
  }
}

// ── Socket.IO HTTP polling ───────────────────────────────────────────────────
// Apex Timing uses Socket.IO. We implement the HTTP long-polling transport
// server-side (no browser CORS restrictions apply to server→server requests).

// Per-slug Socket.IO session state (lives in Node process memory)
const sioSessions = new Map();
// slug -> { base, eio, sid, ns, expires }

// Parse EIO4/EIO3 packet frames and return the first socket.io event payload
function parseSIOPackets(raw) {
  if (!raw || raw.trim().length < 3) return null;
  const packets = [];
  let s = raw.trim();
  while (s.length > 0) {
    // Length-delimited: "27:42[\"ev\",{...}]"
    const m = s.match(/^(\d+):([\s\S]*)/);
    if (m) {
      const len = parseInt(m[1], 10);
      packets.push(m[2].slice(0, len));
      s = m[2].slice(len);
    } else {
      packets.push(s);
      break;
    }
  }
  for (const pkt of packets) {
    // Socket.IO message: "42[...]" or "42/ns,[...]"
    const dm = pkt.match(/^42(?:\/[^,]+,)?(\[[\s\S]*\])$/);
    if (!dm) continue;
    try {
      const arr = JSON.parse(dm[1]);
      if (Array.isArray(arr) && arr.length >= 2) return { event: arr[0], data: arr[1] };
    } catch(e) {}
  }
  return null;
}

// Create or return an existing Socket.IO session for the given slug.
// Attempts both root-level and slug-scoped socket.io endpoints with EIO 4 and 3.
async function ensureSIOSession(slug) {
  const now = Date.now();
  const existing = sioSessions.get(slug);
  if (existing && existing.expires > now) return existing;

  const bases = [
    `https://live.apex-timing.com/socket.io`,
    `https://live.apex-timing.com/${slug}/socket.io`,
  ];
  const nsCandidates = ['/', `/${slug}`];

  for (const base of bases) {
    for (const eio of ['4', '3']) {
      // Step 1: Handshake
      let sid, pingInterval;
      try {
        const hs = await fetchUrl(`${base}/?EIO=${eio}&transport=polling`, { timeout: 5000 });
        if (hs.status !== 200) continue;
        const m = hs.body.match(/0(\{[^}]*"sid"[^}]*\})/);
        if (!m) continue;
        const hsData = JSON.parse(m[1]);
        sid = hsData.sid;
        pingInterval = hsData.pingInterval || 25000;
        if (!sid) continue;
      } catch(e) { continue; }

      // Step 2: Connect to namespace
      for (const ns of nsCandidates) {
        try {
          const connectPkt = (ns === '/') ? '40' : `40${ns},`;
          await postData(`${base}/?EIO=${eio}&transport=polling&sid=${sid}`, connectPkt, 5000);
          // Step 3: Poll once to verify
          const verify = await fetchUrl(`${base}/?EIO=${eio}&transport=polling&sid=${sid}`, { timeout: 6000 });
          if (verify.status !== 200) continue;
          const session = { base, eio, sid, ns, expires: now + pingInterval - 3000 };
          sioSessions.set(slug, session);
          return session;
        } catch(e) { /* try next ns */ }
      }
    }
  }
  return null;
}

// Poll an existing Socket.IO session for new event data
async function pollSIO(slug, session) {
  try {
    const pollUrl = `${session.base}/?EIO=${session.eio}&transport=polling&sid=${session.sid}`;
    const res = await fetchUrl(pollUrl, { timeout: 6000 });
    if (res.status !== 200) { sioSessions.delete(slug); return null; }
    return parseSIOPackets(res.body);
  } catch(e) {
    sioSessions.delete(slug);
    return null;
  }
}

// Get live Socket.IO data for a slug (creates session if needed, then polls)
async function getSIOData(slug) {
  const now = Date.now();
  const existing = sioSessions.get(slug);
  if (existing && existing.expires > now) return pollSIO(slug, existing);
  const session = await ensureSIOSession(slug);
  if (!session) return null;
  return pollSIO(slug, session);
}

// ── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/apex-proxy/discover?slug=...
 * Fetches the page HTML and reports what data URLs / scripts it finds.
 * Also probes all candidate paths and reports which return 200.
 */
router.get('/discover', async (req, res) => {
  const slug = slugFromUrl(req.query.slug || req.query.url || '');
  if (!slug) return res.status(400).json({ ok: false, error: 'slug or url param required' });

  const baseUrl = `https://live.apex-timing.com/${slug}`;
  const result = { slug, baseUrl, pageStatus: null, foundUrls: [], workingPaths: [], scriptSrcs: [] };

  // Fetch main page
  try {
    const page = await fetchUrl(baseUrl + '/', { timeout: 8000 });
    result.pageStatus = page.status;
    result.foundUrls = extractDataUrls(page.body, baseUrl);

    // Extract <script src="...">
    const scriptMatches = page.body.matchAll(/<script[^>]+src=["']([^"']+)["']/gi);
    for (const m of scriptMatches) {
      try { result.scriptSrcs.push(new URL(m[1], baseUrl).href); } catch(e) {}
    }
  } catch(e) {
    result.pageError = e.message;
  }

  // Probe all candidate paths
  const probes = CANDIDATE_PATHS.map(async (path) => {
    try {
      const r = await fetchUrl(baseUrl + path, { timeout: 4000 });
      if (r.status === 200) {
        const parsed = parseApexBody(r.body, r.headers['content-type']);
        return { path, status: r.status, format: parsed.format, preview: String(r.body).slice(0, 200) };
      }
      return { path, status: r.status };
    } catch(e) {
      return { path, error: e.message };
    }
  });
  result.workingPaths = (await Promise.all(probes)).filter(p => p.status === 200);

  // Probe Socket.IO at root and slug-scoped bases
  result.sio = {};
  for (const sioBase of [`https://live.apex-timing.com/socket.io`, `https://live.apex-timing.com/${slug}/socket.io`]) {
    for (const eio of ['4', '3']) {
      const key = `${sioBase.replace('https://live.apex-timing.com', '')}?EIO=${eio}`;
      try {
        const hs = await fetchUrl(`${sioBase}/?EIO=${eio}&transport=polling`, { timeout: 5000 });
        result.sio[key] = { status: hs.status, preview: hs.body.slice(0, 200) };
      } catch(e) {
        result.sio[key] = { error: e.message };
      }
    }
  }

  // Fetch first few JS files and scan for socket.io connection code
  result.sioSnippets = [];
  for (const scriptUrl of result.scriptSrcs.slice(0, 6)) {
    try {
      const js = await fetchUrl(scriptUrl, { timeout: 5000 });
      if (js.status === 200) {
        const snippets = [];
        for (const m of js.body.matchAll(/io\s*\(\s*["'`]([^"'`\s]+)["'`]/g)) snippets.push({ fn: 'io()', arg: m[1] });
        for (const m of js.body.matchAll(/\.connect\s*\(\s*["'`]([^"'`\s]+)["'`]/g)) snippets.push({ fn: '.connect()', arg: m[1] });
        for (const m of js.body.matchAll(/new\s+io\s*\(\s*["'`]([^"'`\s]+)["'`]/g)) snippets.push({ fn: 'new io()', arg: m[1] });
        if (snippets.length) result.sioSnippets.push({ src: scriptUrl, snippets });
      }
    } catch(e) { /* skip */ }
  }

  return res.json(result);
});

/**
 * GET /api/apex-proxy/raw?slug=...&path=/somepath
 * Proxies a single path under the event URL — for manual exploration.
 */
router.get('/raw', async (req, res) => {
  const slug = slugFromUrl(req.query.slug || req.query.url || '');
  const rawPath = req.query.path || '/';
  if (!slug) return res.status(400).json({ ok: false, error: 'slug param required' });

  // Only allow paths under live.apex-timing.com — validate slug is safe
  if (!/^[a-zA-Z0-9_-]+$/.test(slug)) return res.status(400).json({ ok: false, error: 'Invalid slug' });

  const targetUrl = `https://live.apex-timing.com/${slug}${rawPath}`;
  try {
    const r = await fetchUrl(targetUrl, { timeout: 6000 });
    res.status(r.status).set('Content-Type', r.headers['content-type'] || 'text/plain').send(r.body);
  } catch(e) {
    res.status(502).json({ ok: false, error: e.message });
  }
});

/**
 * GET /api/apex-proxy?slug=african-karting-cup
 * Main polling endpoint. Returns cached timing data.
 * Probes candidate paths and returns first successful result.
 */
router.get('/', async (req, res) => {
  const slug = slugFromUrl(req.query.slug || req.query.url || '');
  if (!slug) return res.status(400).json({ ok: false, error: 'slug or url param required' });
  if (!/^[a-zA-Z0-9_-]+$/.test(slug)) return res.status(400).json({ ok: false, error: 'Invalid slug' });

  // Serve cached result if fresh
  const cached = getCached(slug);
  if (cached) return res.json(cached);

  // 1. Try Socket.IO HTTP polling (Apex Timing's native transport)
  try {
    const sioResult = await getSIOData(slug);
    if (sioResult) {
      const result = { ok: true, slug, path: 'socket.io', format: 'socket.io', event: sioResult.event, raw: sioResult.data };
      setCache(slug, result);
      return res.json(result);
    }
  } catch(e) { /* fall through to candidate paths */ }

  // 2. Try candidate HTTP paths
  const baseUrl = `https://live.apex-timing.com/${slug}`;
  for (const path of CANDIDATE_PATHS) {
    try {
      const r = await fetchUrl(baseUrl + path, { timeout: 4000 });
      if (r.status !== 200) continue;
      const parsed = parseApexBody(r.body, r.headers['content-type']);
      if (parsed.format === 'text') continue; // HTML page, not data
      const result = { ok: true, slug, path, format: parsed.format, raw: parsed.data };
      setCache(slug, result);
      return res.json(result);
    } catch(e) { /* try next */ }
  }

  // All paths failed
  const fallback = { ok: false, slug, error: 'no_data', message: 'No data endpoint found. Run /api/apex-proxy/discover?slug=' + slug + ' to investigate.' };
  setCache(slug, fallback);
  return res.status(200).json(fallback);
});

module.exports = router;
