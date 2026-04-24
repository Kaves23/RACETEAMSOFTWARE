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
  '/?format=json',
  '/?json=1',
  '/socket.io/?EIO=4&transport=polling',
  '/socket.io/?EIO=3&transport=polling',
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

  const baseUrl = `https://live.apex-timing.com/${slug}`;

  // Try candidate paths in order, return first 200
  for (const path of CANDIDATE_PATHS) {
    try {
      const r = await fetchUrl(baseUrl + path, { timeout: 4000 });
      if (r.status !== 200) continue;
      const parsed = parseApexBody(r.body, r.headers['content-type']);
      if (parsed.format === 'text') continue; // probably HTML, not data
      const result = { ok: true, slug, path, format: parsed.format, raw: parsed.data };
      setCache(slug, result);
      return res.json(result);
    } catch(e) { /* try next */ }
  }

  // All paths failed — return an indicator so the frontend can show the open-link fallback
  const fallback = { ok: false, slug, error: 'no_data', message: 'No data endpoint found for this event. WebSocket discovery required.' };
  setCache(slug, fallback);
  return res.status(200).json(fallback);
});

module.exports = router;
