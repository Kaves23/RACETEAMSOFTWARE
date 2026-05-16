/**
 * Race Monitor WebSocket proxy
 *
 * Race Monitor Protocol (reverse-engineered from their React bundle):
 *
 *  1. Fetch token + WS host:
 *     GET https://api.race-monitor.com/Info/WebRaceList
 *          ?accountID=&seriesID=&raceID={raceId}&t={ms}
 *     → { CurrentRaces:[{ID,ReceivingData,Instance}],
 *          LiveTimingToken, LiveTimingHost }
 *
 *  2. Open WebSocket:
 *     wss://{LiveTimingHost}/instance/{Instance}/{LiveTimingToken}
 *     → on open: send "$JOIN,{Instance}"
 *
 *  3. Messages (newline-delimited, comma-separated, quoted fields stripped):
 *     $F  lapsToGo, timeToGo, currentTime, sessionTime, flagStatus
 *     $B  sessionID, sessionName
 *     $C  classID, description
 *     $A  racerID, number, transponder, firstName, lastName, nationality, category
 *     $COMP racerID, number, category, firstName, lastName, nationality, additionalData
 *     $G  position, racerID, laps, totalTime      (position / lap update)
 *     $H  bestPosition, racerID, bestLap, bestTime (best-lap update)
 *     $J  racerID, lastLapTime, totalTime          (last-lap time)
 *     $I  (reset session)
 *     $RMS qualifying|race                         (sort mode)
 *
 * Routes (mirror /api/apex-proxy/* shape so front-end is transparent):
 *   GET    /api/race-monitor-proxy?slug={raceId|URL}   — snapshot
 *   GET    /api/race-monitor-proxy/grid                — alias
 *   GET    /api/race-monitor-proxy/messages            — raw frame log
 *   GET    /api/race-monitor-proxy/discover            — diagnostic
 *   DELETE /api/race-monitor-proxy/session?slug={id}   — terminate
 */
'use strict';

const express   = require('express');
const https     = require('https');
const http      = require('http');
const WebSocket = require('ws');
const router    = express.Router();

// ── HTTP helper ───────────────────────────────────────────────────────────────
function fetchUrl(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const timeout = opts.timeout || 10000;
    const req = lib.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RaceTeamOS/5.0)',
        'Accept': 'application/json,text/html,*/*',
        ...(opts.headers || {}),
      },
    }, (res) => {
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        return fetchUrl(next, opts).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.setTimeout(timeout, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
  });
}

// ── State shape (must match apex-proxy.emptyState exactly) ────────────────────
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
// Accepts: 165449 | https://www.race-monitor.com/Live/Race/165449 | ?raceid=165449
function raceIdFromInput(input) {
  const s = String(input || '').trim();
  if (!s) return '';
  if (/^\d{1,9}$/.test(s)) return s;
  const qm = s.match(/[?&]raceid=(\d{1,9})/i);
  if (qm) return qm[1];
  const pm = s.match(/\/Race\/(\d{1,9})/i);
  if (pm) return pm[1];
  if (/\/Section\//i.test(s)) return '';
  try {
    const u = new URL(s.startsWith('http') ? s : 'https://' + s);
    const parts = u.pathname.split('/').filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i--) {
      if (/^\d{1,9}$/.test(parts[i])) return parts[i];
    }
  } catch (_) {}
  return '';
}

const SAFE_RACE_ID = /^\d{1,9}$/;
const RM_API = 'https://api.race-monitor.com';

// ── Fetch token + WS connection info from Race Monitor API ───────────────────
async function fetchConnectionInfo(raceId) {
  const url = `${RM_API}/Info/WebRaceList?accountID=&seriesID=&raceID=${raceId}&t=${Date.now()}`;
  const r = await fetchUrl(url, { timeout: 10000 });
  if (r.status !== 200) throw new Error(`WebRaceList HTTP ${r.status}`);
  const data = JSON.parse(r.body);
  if (!data.LiveTimingToken) throw new Error('No LiveTimingToken in response');
  const race = (data.CurrentRaces || []).find(c => String(c.ID) === String(raceId) || c.ReceivingData);
  if (!race) throw new Error('Race not found or not currently receiving data');
  return {
    instance: race.Instance,
    token:    data.LiveTimingToken,
    host:     data.LiveTimingHost || 'cluster1.race-monitor.com',
  };
}

// ── Message parser ────────────────────────────────────────────────────────────
const FLAG_STATUS_MAP = {
  green:     'racing',
  red:       'paused',
  yellow:    'paused',
  white:     'racing',
  checkered: 'finished',
  chequered: 'finished',
  finish:    'finished',
  caution:   'paused',
};

function flagStatusToState(s) {
  if (!s) return 'waiting';
  const lower = String(s).toLowerCase().trim();
  return FLAG_STATUS_MAP[lower] || 'racing';
}

// Parse comma-separated command, stripping surrounding quotes from fields
function parseCmd(line) {
  return line.split(',').map(f => f.replace(/^"|"$/g, '').trim());
}

// Format seconds as MM:SS.mmm (e.g. 67.492 → "1:07.492")
// track-map.html's parseLapSec expects this exact format
function fmtLapTime(sec) {
  if (!sec || sec <= 0) return '';
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}

// Parse time strings into seconds:
//   "HH:MM:SS.mmm" | "MM:SS.mmm" | "SS.mmm" | raw integer (assumed ms if >1e6)
function parseSec(str) {
  if (!str) return 0;
  const s = String(str).trim();
  if (!s || s === '00:00:00' || s === '00:00:00.000') return 0;
  // HH:MM:SS.mmm or HH:MM:SS
  const m3 = s.match(/^(\d+):(\d{2}):(\d{2})(?:\.(\d+))?$/);
  if (m3) return parseInt(m3[1]) * 3600 + parseInt(m3[2]) * 60 + parseFloat(m3[3] + (m3[4] ? '.' + m3[4] : ''));
  // MM:SS.mmm
  const m2 = s.match(/^(\d+):(\d{2})\.(\d+)$/);
  if (m2) return parseInt(m2[1]) * 60 + parseFloat(m2[2] + '.' + m2[3]);
  // SS.mmm
  if (/^\d+\.\d+$/.test(s)) return parseFloat(s);
  // Raw integer — if huge, assume milliseconds
  if (/^\d+$/.test(s)) { const n = parseInt(s, 10); return n > 1000000 ? n / 1000 : n; }
  return 0;
}

function processMessages(rawMessages, competitors, sessionData, state) {
  let changed = false;
  for (const raw of rawMessages) {
    const lines = raw.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const o = parseCmd(trimmed);
      const cmd = o[0];

      if (cmd === '$F' && o.length >= 6) {
        // $F, lapsToGo, timeToGo, currentTime, sessionTime, flagStatus
        state.timeRemaining = o[2];
        state.status        = flagStatusToState(o[5]);
        changed = true;

      } else if (cmd === '$B' && o.length >= 3) {
        // $B, sessionID, sessionName
        state.sessionName  = o[2];
        state.classOnTrack = o[2];
        changed = true;

      } else if (cmd === '$C' && o.length >= 3) {
        // $C, classID, description
        if (!sessionData.classes) sessionData.classes = {};
        sessionData.classes[o[1]] = o[2];
        // Also mirror into state for rebuildDrivers class lookup
        if (!state._classes) state._classes = {};
        state._classes[o[1]] = o[2];
        changed = true;

      } else if ((cmd === '$A' || cmd === '$COMP') && o.length >= 6) {
        // $A:    racerID, number, transponder, firstName, lastName, nationality, category
        // $COMP: racerID, number, category,    firstName, lastName, nationality, additionalData(team)
        const racerID = o[1];
        if (!competitors[racerID]) competitors[racerID] = { racerID };
        const c = competitors[racerID];
        c.number = o[2];
        if (cmd === '$A') {
          c.firstName   = o[4];
          c.lastName    = o[5];
          c.nationality = o[6] || '';
          c.categoryId  = o[7] || '';
        } else {
          c.categoryId  = o[3];
          c.firstName   = o[4];
          c.lastName    = o[5];
          c.nationality = o[6] || '';
          c.team        = o[7] || '';  // additionalData = team/sponsor
        }
        c.name = [c.firstName, c.lastName].filter(Boolean).join(' ');
        changed = true;

      } else if (cmd === '$G' && o.length >= 5) {
        // $G, position, racerID, laps, totalTime
        const racerID = o[2];
        if (!competitors[racerID]) competitors[racerID] = { racerID };
        const c = competitors[racerID];
        c.position  = parseInt(o[1], 10) || 0;
        c.laps      = parseInt(o[3], 10) || 0;
        c.totalTime = o[4];
        changed = true;

      } else if (cmd === '$H' && o.length >= 5) {
        // $H, bestPosition, racerID, bestLap, bestTime
        const racerID = o[2];
        if (!competitors[racerID]) competitors[racerID] = { racerID };
        const c = competitors[racerID];
        c.bestPosition = parseInt(o[1], 10) || 0;
        c.bestLap      = parseInt(o[3], 10) || 0;
        c.bestTime     = o[4];
        changed = true;

      } else if (cmd === '$J' && o.length >= 4) {
        // $J, racerID, lastLapTime, totalTime
        const racerID = o[1];
        if (!competitors[racerID]) competitors[racerID] = { racerID };
        const c = competitors[racerID];
        c.lastLapTime = o[2];
        c.totalTime   = o[3];
        changed = true;

      } else if (cmd === '$I') {
        // Reset session
        for (const k of Object.keys(competitors)) delete competitors[k];
        sessionData.classes = {};
        state.drivers = [];
        state.laps = 0;
        changed = true;
      }
    }
  }
  if (changed) rebuildDrivers(competitors, state);
}

function rebuildDrivers(competitors, state) {
  const list = Object.values(competitors)
    .filter(c => c.name || c.number)
    .sort((a, b) => {
      const ap = a.position || 0, bp = b.position || 0;
      if (ap > 0 && bp > 0) return ap - bp;
      if (ap > 0) return -1;
      if (bp > 0) return  1;
      return (b.laps || 0) - (a.laps || 0);
    });

  if (!list.length) return;

  // Compute gap to leader:
  //   Qualifying/practice: gap = driver.bestTimeSec - leader.bestTimeSec (bigger best = slower = behind)
  //   Race: gap = |leader.totalTimeSec - driver.totalTimeSec| when leader has done more laps
  //   Fallback: totalTime difference
  const leader = list[0];
  const leaderBestSec  = parseSec(leader.bestTime);
  const leaderTotalSec = parseSec(leader.totalTime);

  const drivers = list.map((c, i) => {
    const bestSec  = parseSec(c.bestTime);
    const totalSec = parseSec(c.totalTime);

    let gapSec = 0;
    if (i > 0) {
      if (bestSec > 1 && leaderBestSec > 1) {
        // Qualifying / practice: slower = higher best time = positive gap
        gapSec = Math.max(0, bestSec - leaderBestSec);
      } else if (totalSec > 0 && leaderTotalSec > 0) {
        gapSec = Math.abs(totalSec - leaderTotalSec);
      }
    }

    // Resolve class name from $C map if category is a numeric ID
    const catId = c.categoryId || c.category || '';
    const className = (state._classes && state._classes[catId]) || catId;

    return {
      pos:      c.position || (i + 1),
      kart:     c.number   || '',
      name:     c.name     || `#${c.number || c.racerID}`,
      team:     c.team     || '',
      laps:     c.laps     || 0,
      bestLap:  fmtLapTime(parseSec(c.bestTime))  || '',
      lastLap:  fmtLapTime(parseSec(c.lastLapTime)) || '',
      gap:      i === 0 ? '' : (gapSec > 0 ? gapSec.toFixed(3) : ''),
      interval: '',
      class:    className,
      inPit:    false,
      flag:     '',
    };
  });

  if (drivers.length > 0) state.laps = drivers[0].laps || 0;
  state.drivers    = drivers;
  state.connected  = true;
  state.lastUpdate = new Date().toISOString();
}

// ── Per-race session manager ──────────────────────────────────────────────────
const sessions = new Map(); // raceId -> session object

async function startSession(raceId) {
  if (!SAFE_RACE_ID.test(raceId)) return;
  const existing = sessions.get(raceId);
  if (existing) {
    if (existing.retryTimer) clearTimeout(existing.retryTimer);
    if (existing.ws) { try { existing.ws.terminate(); } catch (_) {} }
  }

  const session = {
    raceId,
    ws:           null,
    connected:    false,
    connecting:   true,
    state:        emptyState(),
    competitors:  {},
    sessionData:  { classes: {} },
    messageQueue: [],
    error:        null,
    retryTimer:   null,
    _startTime:   Date.now(),
    _frameCount:  0,
  };
  sessions.set(raceId, session);

  try {
    const info = await fetchConnectionInfo(raceId);
    connectWs(session, info);
  } catch (e) {
    console.warn(`[race-monitor-proxy] fetchConnectionInfo failed for ${raceId}:`, e.message);
    session.connecting = false;
    session.error      = e.message;
    session.retryTimer = setTimeout(() => {
      fetchConnectionInfo(raceId)
        .then(info => connectWs(session, info))
        .catch(err => { session.error = err.message; });
    }, 30000);
  }
}

function connectWs(session, info) {
  if (session.retryTimer) { clearTimeout(session.retryTimer); session.retryTimer = null; }
  const wsUrl = `wss://${info.host}/instance/${info.instance}/${info.token}`;
  console.log(`[race-monitor-proxy] Connecting: ${wsUrl}`);
  session.connecting = true;

  try {
    const ws = new WebSocket(wsUrl, {
      headers: {
        'Origin': 'https://api.race-monitor.com',
        'User-Agent': 'Mozilla/5.0 (compatible; RaceTeamOS/5.0)',
      },
      rejectUnauthorized: false,
      handshakeTimeout: 10000,
    });
    session.ws = ws;

    ws.on('open', () => {
      console.log(`[race-monitor-proxy] Connected: ${wsUrl}`);
      session.connected  = true;
      session.connecting = false;
      session.error      = null;
      session.state.connected = true;
      ws.send(`$JOIN,${info.instance}`);
    });

    ws.on('message', (data) => {
      const msg = data.toString();
      session.messageQueue.push(msg);
      if (session.messageQueue.length > 200) session.messageQueue.shift();
      if (session._frameCount < 5) {
        console.log(`[race-monitor-proxy] frame[${session._frameCount}] (${msg.length}b):`, msg.slice(0, 300));
        session._frameCount++;
      }
      processMessages([msg], session.competitors, session.sessionData, session.state);
    });

    ws.on('close', (code) => {
      console.log(`[race-monitor-proxy] WS closed ${code} for raceId=${session.raceId}`);
      session.connected  = false;
      session.connecting = false;
      session.ws         = null;
      session.state.connected = false;
      if (code !== 1000) {
        // Re-fetch token (it may have rotated) then reconnect after 5s
        session.retryTimer = setTimeout(() => {
          fetchConnectionInfo(session.raceId)
            .then(i => connectWs(session, i))
            .catch(err => { session.error = err.message; });
        }, 5000);
      }
    });

    ws.on('error', (err) => {
      console.warn(`[race-monitor-proxy] WS error (raceId=${session.raceId}):`, err.message);
      session.error     = err.message;
      session.connected = false;
    });
  } catch (e) {
    session.error      = e.message;
    session.connecting = false;
    session.retryTimer = setTimeout(() => {
      fetchConnectionInfo(session.raceId)
        .then(i => connectWs(session, i))
        .catch(err => { session.error = err.message; });
    }, 10000);
  }
}

// Evict sessions inactive for > 30 min
setInterval(() => {
  const now = Date.now();
  for (const [raceId, s] of sessions) {
    const lastSeen = s.state.lastUpdate ? new Date(s.state.lastUpdate).getTime() : s._startTime;
    if (now - lastSeen > 30 * 60 * 1000) {
      if (s.ws) try { s.ws.terminate(); } catch (_) {}
      if (s.retryTimer) clearTimeout(s.retryTimer);
      sessions.delete(raceId);
      console.log(`[race-monitor-proxy] Evicted stale session: ${raceId}`);
    }
  }
}, 5 * 60 * 1000);

// ── Routes ────────────────────────────────────────────────────────────────────

router.get(['/', '/grid'], async (req, res) => {
  const raceId = raceIdFromInput(req.query.slug || req.query.url || req.query.raceId || '');
  if (!raceId) {
    return res.status(400).json({
      ok: false,
      error: 'race id not found',
      message: 'Provide ?slug=<raceId> or ?url=https://www.race-monitor.com/Live/Race/{id}',
    });
  }

  let session = sessions.get(raceId);
  if (!session) {
    startSession(raceId).catch(e => console.error('[race-monitor-proxy] start error:', e));
    return res.json({ ok: true, slug: raceId, raceId, provider: 'race-monitor', connecting: true, state: emptyState() });
  }

  return res.json({
    ok:          true,
    slug:        raceId,
    raceId,
    provider:    'race-monitor',
    connected:   session.connected,
    connecting:  session.connecting,
    error:       session.error || null,
    state:       session.state,
    queueLength: session.messageQueue.length,
  });
});

router.get('/messages', (req, res) => {
  const raceId = raceIdFromInput(req.query.slug || '');
  if (!raceId) return res.status(400).json({ ok: false, error: 'race id required' });
  const session = sessions.get(raceId);
  if (!session) return res.json({ ok: false, error: 'no session — call /api/race-monitor-proxy?slug=<raceId> first' });
  const last = Math.min(parseInt(req.query.last || '20', 10), 200);
  return res.json({
    ok:        true,
    raceId,
    connected: session.connected,
    error:     session.error,
    messages:  session.messageQueue.slice(-last),
  });
});

router.get('/discover', async (req, res) => {
  const raw    = String(req.query.slug || req.query.url || '').trim();
  const raceId = raceIdFromInput(raw);
  const out    = { provider: 'race-monitor', input: raw, raceId };
  if (!raceId) {
    out.ok    = false;
    out.error = 'Could not extract a race id. Paste a URL like https://www.race-monitor.com/Live/Race/165449';
    return res.status(400).json(out);
  }

  try {
    const info   = await fetchConnectionInfo(raceId);
    out.ok       = true;
    out.instance = info.instance;
    out.host     = info.host;
    out.wsUrl    = `wss://${info.host}/instance/${info.instance}/${info.token}`;
    out.tokenOk  = !!info.token;
  } catch (e) {
    out.ok    = false;
    out.error = e.message;
  }
  const session = sessions.get(raceId);
  if (session) {
    out.sessionActive = true;
    out.connected     = session.connected;
    out.driverCount   = session.state.drivers.length;
  }
  return res.json(out);
});

router.delete('/session', (req, res) => {
  const raceId = raceIdFromInput(req.query.slug || '');
  if (!raceId) return res.status(400).json({ ok: false });
  const s = sessions.get(raceId);
  if (s) {
    if (s.ws) try { s.ws.terminate(); } catch (_) {}
    if (s.retryTimer) clearTimeout(s.retryTimer);
  }
  const existed = sessions.delete(raceId);
  return res.json({ ok: true, raceId, terminated: existed });
});

module.exports = router;
