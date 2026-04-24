/* Race Team OS — Live Timing Module
 * Connects to Apex Timing live feeds and exposes race data globally.
 * Loaded dynamically by topnav.js only when live timing is enabled in settings.
 *
 * Exposes: window.RTSLiveTiming
 *
 * Usage (from topnav.js after settings loaded):
 *   RTSLiveTiming.start(config);   // config = settings.liveTiming
 *   RTSLiveTiming.stop();
 *   RTSLiveTiming.onUpdate(fn);    // fn(state) called on every data update
 *   RTSLiveTiming.state            // latest parsed state snapshot
 *
 * Debug mode: append ?ltdebug=1 to any page URL to log all raw WS messages.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // State object — canonical shape shared with consumers (topnav.js ticker)
  // ---------------------------------------------------------------------------
  const EMPTY_STATE = {
    connected: false,
    status: 'waiting',        // 'waiting' | 'racing' | 'qualifying' | 'practice' | 'finished' | 'paused'
    sessionName: '',
    classOnTrack: '',
    nextClass: '',
    laps: 0,
    totalLaps: 0,
    timeRemaining: '',
    drivers: [],              // all drivers on timing board: { pos, kart, name, class, laps, lastLap, bestLap, gap, inPit, isOurs, ourColor, ourName }
    ourDrivers: [],           // subset: only matched team drivers
    lastUpdate: null,
    raw: null,                // last raw message (for debug)
    error: null
  };

  let state = JSON.parse(JSON.stringify(EMPTY_STATE));
  let config = null;
  let ws = null;
  let pollTimer = null;
  let updateCallbacks = [];
  let wsUrlIndex = 0;
  let wsRetryTimer = null;
  let stopped = false;
  let driverMatchMap = {};   // timingName (normalised) -> { ourName, ourColor, ourId }

  const DEBUG = /[?&]ltdebug=1/.test(location.search);

  function dbg(...args) {
    if (DEBUG) console.groupCollapsed('[RTSLiveTiming]', ...args), console.trace(), console.groupEnd();
    if (DEBUG) console.log('[RTSLiveTiming]', ...args);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  window.RTSLiveTiming = {
    get state() { return state; },

    start(cfg) {
      stopped = false;
      config = cfg;
      if (!config || !config.url) return;
      buildDriverMatchMap();
      connectWebSocket();
    },

    stop() {
      stopped = true;
      clearTimers();
      closeWs();
      state = JSON.parse(JSON.stringify(EMPTY_STATE));
    },

    onUpdate(fn) {
      if (typeof fn === 'function') updateCallbacks.push(fn);
    },

    offUpdate(fn) {
      updateCallbacks = updateCallbacks.filter(f => f !== fn);
    },

    // Expose for forced rebuild (e.g. after driver settings change)
    rebuildMatchMap() { buildDriverMatchMap(); },

    // Returns matched driver info for the settings info panel
    // Combines our driverMatchMap with live timing names from state.drivers
    getDriverMatches() {
      const matches = [];
      // Go through currently tracked drivers and find the ours
      const ourDriversInState = state.drivers.filter(d => d.isOurs);
      ourDriversInState.forEach(d => {
        const normKey = normalise(d.ourName || '');
        const mapEntry = driverMatchMap[normKey] || {};
        matches.push({
          ourId: mapEntry.ourId || '',
          ourName: d.ourName || '',
          ourColor: d.ourColor || mapEntry.ourColor || '#ffd700',
          ourClass: mapEntry.ourClass || '',
          timingName: d.name || '',
          confidence: d.matchConfidence || 'medium',
          pos: d.pos,
          lastLap: d.lastLap,
          bestLap: d.bestLap
        });
      });
      // Also show unmatched team drivers
      Object.values(driverMatchMap).forEach(m => {
        if (!matches.some(x => x.ourId === m.ourId)) {
          matches.push({ ...m, timingName: '—', confidence: 'unmatched' });
        }
      });
      return matches;
    }
  };

  // ---------------------------------------------------------------------------
  // Slug extraction
  // e.g. https://live.apex-timing.com/african-karting-cup/  ->  african-karting-cup
  // ---------------------------------------------------------------------------
  function extractSlug(url) {
    try {
      const u = new URL(url.trim().replace(/\/$/, ''));
      // Pathname is e.g.  /african-karting-cup
      const parts = u.pathname.split('/').filter(Boolean);
      return parts[parts.length - 1] || '';
    } catch (e) {
      // URL parse failed  — treat whole string as slug (trimmed, lowercase, no slashes)
      return url.trim().replace(/^\/+|\/+$/g, '').split('/').pop() || '';
    }
  }

  // WebSocket URL candidates to probe (in order)
  function wsUrlCandidates(slug) {
    return [
      `wss://live.apex-timing.com/${slug}/`,
      `wss://live.apex-timing.com/${slug}/ws`,
      `wss://live.apex-timing.com/ws/${slug}`,
      `wss://live.apex-timing.com/${slug}/timing`,
      `wss://live.apex-timing.com/${slug}/feed`
    ];
  }

  // ---------------------------------------------------------------------------
  // WebSocket connection
  // ---------------------------------------------------------------------------
  function connectWebSocket() {
    if (stopped) return;
    const slug = extractSlug(config.url);
    if (!slug) { state.error = 'Invalid URL — could not extract event slug'; fireUpdate(); return; }

    const candidates = wsUrlCandidates(slug);
    if (wsUrlIndex >= candidates.length) {
      // All WebSocket patterns exhausted — fall back to iframe scraping
      dbg('All WebSocket patterns failed, falling back to iframe-based polling');
      state.error = 'WebSocket connection not available — using embedded view';
      wsUrlIndex = 0;
      startIframeFallback();
      fireUpdate();
      return;
    }

    const url = candidates[wsUrlIndex];
    dbg('Trying WebSocket:', url);

    closeWs();
    try {
      ws = new WebSocket(url);
    } catch (e) {
      dbg('WebSocket constructor failed:', e.message);
      tryNextWsUrl();
      return;
    }

    // Connection timeout — if no open within 5 s, move to next candidate
    const openTimeout = setTimeout(() => {
      if (ws && ws.readyState !== WebSocket.OPEN) {
        dbg('WebSocket open timeout');
        tryNextWsUrl();
      }
    }, 5000);

    ws.addEventListener('open', () => {
      clearTimeout(openTimeout);
      dbg('WebSocket connected:', url);
      state.connected = true;
      state.error = null;
      wsUrlIndex = 0; // reset so reconnects use the working URL index 0... actually stay on winning index
      wsUrlIndex = candidates.indexOf(url);
      fireUpdate();
    });

    ws.addEventListener('message', (evt) => {
      state.raw = evt.data;
      dbg('WS message:', evt.data);
      try {
        parseApexMessage(evt.data);
      } catch(e) {
        dbg('Parse error:', e);
      }
      fireUpdate();
    });

    ws.addEventListener('error', (evt) => {
      clearTimeout(openTimeout);
      dbg('WebSocket error on', url);
      // Will also fire close
    });

    ws.addEventListener('close', (evt) => {
      clearTimeout(openTimeout);
      dbg('WebSocket closed', evt.code, evt.reason);
      if (stopped) return;
      state.connected = false;
      if (evt.code === 1000 || evt.code === 1001) {
        // Normal close — reconnect after delay
        wsRetryTimer = setTimeout(() => connectWebSocket(), 5000);
      } else {
        tryNextWsUrl();
      }
      fireUpdate();
    });
  }

  function tryNextWsUrl() {
    wsUrlIndex++;
    wsRetryTimer = setTimeout(() => connectWebSocket(), 800);
  }

  function closeWs() {
    if (ws) {
      try { ws.close(); } catch(e) {}
      ws = null;
    }
  }

  function clearTimers() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (wsRetryTimer) { clearTimeout(wsRetryTimer); wsRetryTimer = null; }
  }

  // ---------------------------------------------------------------------------
  // Iframe fallback — embed the Apex Timing page in a hidden iframe and
  // extract the publicly visible leaderboard DOM via postMessage or
  // direct contentDocument access (same-origin only).
  //
  // Since Apex Timing is cross-origin, we cannot read the iframe DOM.
  // Instead we use a periodic CORS fetch of known JSON endpoints, and
  // if that also fails we surface a "Tap to open" badge that links to
  // the timing page rather than showing stale/empty data.
  // ---------------------------------------------------------------------------
  function startIframeFallback() {
    if (stopped) return;
    const intervalMs = ((config.intervalSec || 10)) * 1000;
    tryFetchSnapshot();
    pollTimer = setInterval(() => { if (!stopped) tryFetchSnapshot(); }, intervalMs);
  }

  // Try known Apex Timing HTTP snapshot endpoints
  const SNAPSHOT_PATHS = [
    '/json',
    '/data.json',
    '/timing.json',
    '/race.json',
    '/results.json',
    '/status.json',
    '/api/data',
    '/api/standings',
    '/api/timing',
    '/standings.json'
  ];
  let snapshotPathIndex = 0;

  async function tryFetchSnapshot() {
    if (stopped) return;
    const baseUrl = config.url.trim().replace(/\/$/, '');
    const path = SNAPSHOT_PATHS[snapshotPathIndex % SNAPSHOT_PATHS.length];
    const url = baseUrl + path;
    dbg('Trying HTTP snapshot:', url);

    try {
      const resp = await fetch(url, { mode: 'cors', cache: 'no-store', signal: AbortSignal.timeout(4000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      // Try JSON parse
      let data;
      try { data = JSON.parse(text); } catch(e) { throw new Error('Not JSON'); }
      dbg('Snapshot received:', data);
      state.raw = data;
      parseApexSnapshot(data);
      state.connected = true;
      state.error = null;
      snapshotPathIndex = 0; // stick to working path
      fireUpdate();
      return;
    } catch (err) {
      dbg('Snapshot fetch failed:', url, err.message);
      snapshotPathIndex++;
      if (snapshotPathIndex >= SNAPSHOT_PATHS.length) {
        // All paths exhausted
        state.connected = false;
        state.error = 'live';  // special sentinel: UI should show "Live" link button
        fireUpdate();
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Message parsers
  // Apex Timing doesn't publish a public spec.  We handle several
  // common formats observed in typical karting timing systems:
  //
  //  Format A — JSON array of arrays (column-indexed)
  //  Format B — JSON object { session:{}, drivers:[] }
  //  Format C — JSON array of objects (one per driver)
  //  Format D — Tab/CSV text rows
  //  Format E — Apex-style packed string "POS\tKART\tNAME\tLAPS\t..."
  // ---------------------------------------------------------------------------

  function parseApexMessage(raw) {
    if (typeof raw !== 'string') return;
    const trimmed = raw.trim();
    if (!trimmed) return;

    // Try JSON first
    if (trimmed[0] === '{' || trimmed[0] === '[') {
      try {
        const data = JSON.parse(trimmed);
        parseApexSnapshot(data);
        return;
      } catch(e) { /* fall through */ }
    }

    // Try delimited text
    parseDelimitedRows(trimmed);
  }

  function parseApexSnapshot(data) {
    if (Array.isArray(data)) {
      // Could be array-of-arrays or array-of-objects
      if (data.length === 0) return;
      if (Array.isArray(data[0])) {
        parseArrayOfArrays(data);
      } else if (typeof data[0] === 'object') {
        parseArrayOfObjects(data);
      }
    } else if (data && typeof data === 'object') {
      // Object envelope
      if (data.drivers) {
        // Format B
        if (data.session) applySessionInfo(data.session);
        parseArrayOfObjects(Array.isArray(data.drivers) ? data.drivers : []);
      } else if (data.results) {
        if (data.session) applySessionInfo(data.session);
        parseArrayOfObjects(Array.isArray(data.results) ? data.results : []);
      } else if (data.standings) {
        parseArrayOfObjects(Array.isArray(data.standings) ? data.standings : []);
      } else if (data.data) {
        parseApexSnapshot(data.data);
      } else {
        // Try to detect session signals
        applySessionInfo(data);
      }
    }
  }

  // Format A: [[pos, kart, name, laps, bestLap, lastLap, gap, class], ...]
  function parseArrayOfArrays(rows) {
    const drivers = [];
    rows.forEach((row, idx) => {
      if (!Array.isArray(row) || row.length < 3) return;
      // Heuristic column detection — first row may be headers
      if (idx === 0 && isNaN(Number(row[0]))) return; // skip header row
      const driver = {
        pos: toNum(row[0]) || (idx + 1),
        kart: String(row[1] || '').trim(),
        name: String(row[2] || '').trim(),
        laps: toNum(row[3]),
        bestLap: fmtLap(row[4]),
        lastLap: fmtLap(row[5]),
        gap: String(row[6] || '').trim(),
        class: String(row[7] || '').trim(),
        inPit: false,
        isOurs: false,
        ourColor: '',
        ourName: ''
      };
      if (!driver.name) return;
      applyDriverMatch(driver);
      drivers.push(driver);
    });
    state.drivers = drivers;
    state.ourDrivers = drivers.filter(d => d.isOurs);
    state.lastUpdate = new Date();
  }

  // Format C: [{ position, number, name, bestLapTime, lastLapTime, gap, class, laps }, ...]
  function parseArrayOfObjects(arr) {
    const drivers = [];
    arr.forEach((obj, idx) => {
      if (!obj || typeof obj !== 'object') return;
      const driver = {
        pos: toNum(obj.position || obj.pos || obj.rank || obj.standing) || (idx + 1),
        kart: String(obj.number || obj.kart || obj.kartNumber || obj.kart_number || obj.no || '').trim(),
        name: String(obj.name || obj.driver || obj.driverName || obj.driver_name || obj.pilot || obj.pilotName || '').trim(),
        laps: toNum(obj.laps || obj.lapCount || obj.lap_count || obj.totalLaps || obj.passings),
        bestLap: fmtLap(obj.bestLapTime || obj.best_lap_time || obj.bestLap || obj.best || obj.fastestLap),
        lastLap: fmtLap(obj.lastLapTime || obj.last_lap_time || obj.lastLap || obj.last),
        gap: String(obj.gap || obj.diff || obj.interval || '').trim(),
        class: String(obj.class || obj.category || obj.group || obj.classification || '').trim(),
        inPit: !!(obj.inPit || obj.in_pit || obj.pit || obj.inPits || obj.pitting),
        isOurs: false,
        ourColor: '',
        ourName: ''
      };
      if (!driver.name) return;
      applyDriverMatch(driver);
      drivers.push(driver);
    });
    state.drivers = drivers;
    state.ourDrivers = drivers.filter(d => d.isOurs);
    state.lastUpdate = new Date();
  }

  // Format D: tab/CSV text
  function parseDelimitedRows(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (!lines.length) return;
    const delim = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
    const parsed = lines.map(l => l.split(delim).map(c => c.trim()));
    // Check if first row is a header
    const firstIsHeader = isNaN(Number(parsed[0][0]));
    const dataRows = firstIsHeader ? parsed.slice(1) : parsed;
    parseArrayOfArrays(dataRows.map((r, i) => [i + 1, r[0], r[1], r[2], r[3], r[4], r[5], r[6]]));
  }

  function applySessionInfo(obj) {
    if (!obj || typeof obj !== 'object') return;
    const statusRaw = String(obj.status || obj.state || obj.sessionStatus || obj.session_status || obj.flag || '').toLowerCase();
    if (statusRaw) {
      if (/rac|green|start/.test(statusRaw)) state.status = 'racing';
      else if (/qual|hot\s*lap/.test(statusRaw)) state.status = 'qualifying';
      else if (/prac|warm/.test(statusRaw)) state.status = 'practice';
      else if (/finish|end|check/.test(statusRaw)) state.status = 'finished';
      else if (/pause|yellow|safety|sc/.test(statusRaw)) state.status = 'paused';
      else if (/wait|idle|stop/.test(statusRaw)) state.status = 'waiting';
    }
    state.sessionName = String(obj.name || obj.sessionName || obj.session_name || obj.title || obj.event || state.sessionName || '').trim();
    state.classOnTrack = String(obj.class || obj.category || obj.classOnTrack || obj.class_on_track || state.classOnTrack || '').trim();
    state.nextClass = String(obj.nextClass || obj.next_class || obj.nextCategory || state.nextClass || '').trim();
    if (obj.laps !== undefined) state.laps = toNum(obj.laps);
    if (obj.totalLaps !== undefined) state.totalLaps = toNum(obj.totalLaps || obj.total_laps);
    state.timeRemaining = String(obj.timeRemaining || obj.time_remaining || obj.remaining || obj.countdown || state.timeRemaining || '').trim();
  }

  // ---------------------------------------------------------------------------
  // Fuzzy driver name matching
  // ---------------------------------------------------------------------------
  function normalise(name) {
    return String(name || '').toUpperCase()
      .replace(/[^A-Z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function buildDriverMatchMap() {
    driverMatchMap = {};
    try {
      let ourDrivers = [];
      // Try to get from RTS settings
      if (window.RTS && typeof RTS.getSettings === 'function') {
        ourDrivers = RTS.getSettings().drivers || [];
      }
      // Fallback: localStorage direct
      if (!ourDrivers.length) {
        try {
          const s = JSON.parse(localStorage.getItem('rts.settings.v1') || '{}');
          ourDrivers = s.drivers || [];
        } catch(e) {}
      }
      ourDrivers.forEach(d => {
        if (!d || !d.name) return;
        const norm = normalise(d.name);
        driverMatchMap[norm] = {
          ourId: d.id,
          ourName: d.name,
          ourColor: d.color || '#ffd700',
          ourClass: d.racing_class || d.class || '',
          ourKart: d.race_number || d.raceNumber || ''
        };
      });
    } catch (e) {
      dbg('buildDriverMatchMap error:', e);
    }
  }

  // Levenshtein distance (capped at 3 for performance)
  function levenshtein(a, b) {
    if (a === b) return 0;
    if (a.length === 0) return Math.min(b.length, 3);
    if (b.length === 0) return Math.min(a.length, 3);
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i-1) === a.charAt(j-1)) matrix[i][j] = matrix[i-1][j-1];
        else matrix[i][j] = Math.min(matrix[i-1][j-1] + 1, Math.min(matrix[i][j-1] + 1, matrix[i-1][j] + 1));
        if (matrix[i][j] >= 3) { matrix[i][j] = 3; } // cap
      }
    }
    return matrix[b.length][a.length];
  }

  function matchToOurDriver(timingName) {
    const normTiming = normalise(timingName);
    if (!normTiming) return null;

    // 1. Exact match
    if (driverMatchMap[normTiming]) return { ...driverMatchMap[normTiming], confidence: 'high' };

    const timingParts = normTiming.split(' ');
    const timingSurname = timingParts[0]; // Most timing systems show SURNAME INITIAL or SURNAME FIRST

    let best = null;
    let bestScore = 999;

    for (const [normOur, match] of Object.entries(driverMatchMap)) {
      const ourParts = normOur.split(' ');
      const ourSurname = ourParts[0];

      // 2. Surname exact match
      if (timingSurname === ourSurname) {
        // Check initial if available
        const timingInitial = timingParts[1] ? timingParts[1][0] : null;
        const ourInitial = ourParts[1] ? ourParts[1][0] : null;
        if (timingInitial && ourInitial && timingInitial === ourInitial) {
          return { ...match, confidence: 'high' }; // SMITH J == SMITH JOHN
        }
        return { ...match, confidence: 'medium' }; // surname only
      }

      // 3. Kart number match (if available)
      if (match.ourKart) {
        // Nothing in timing — skip for now
      }

      // 4. Levenshtein on full name (low confidence)
      const dist = levenshtein(normTiming, normOur);
      if (dist < bestScore && dist <= 2) {
        bestScore = dist;
        best = { ...match, confidence: 'low' };
      }
    }

    // Return medium+ confidence; log low
    if (best && best.confidence === 'low') {
      dbg('Low-confidence match:', timingName, '->', best.ourName, '(dist:', bestScore, ')');
      return best; // still return for display but mark as low
    }
    return best;
  }

  function applyDriverMatch(driver) {
    const match = matchToOurDriver(driver.name);
    if (match) {
      driver.isOurs = true;
      driver.ourColor = match.ourColor;
      driver.ourName = match.ourName;
      driver.matchConfidence = match.confidence;
    }
  }

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------
  function toNum(v) {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  }

  function fmtLap(v) {
    if (v === null || v === undefined || v === '') return '';
    const s = String(v).trim();
    // If it's already formatted (e.g. "1:32.456") return as-is
    if (/^\d+:\d/.test(s)) return s;
    // If it's a raw seconds float, format as M:SS.mmm
    const n = parseFloat(s);
    if (!isNaN(n) && n > 0) {
      const m = Math.floor(n / 60);
      const sec = (n % 60).toFixed(3).padStart(6, '0');
      return `${m}:${sec}`;
    }
    return s;
  }

  function fireUpdate() {
    state.lastUpdate = state.lastUpdate || new Date();
    updateCallbacks.forEach(fn => { try { fn(state); } catch(e) {} });
  }

})();
