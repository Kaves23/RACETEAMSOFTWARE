// server/lib/xrk-reader.js
// AiM / Race Studio 3 telemetry file reader
//
// This module wraps the official AiM MatLabXRK DLL / libxdrk shared library via koffi FFI.
// If the library is not present the module falls back gracefully: CSV uploads still work fully,
// and XRK uploads are accepted but not parsed (status 'error').
//
// DLL setup:
//   - Download libxdrk-x86_64.so from https://github.com/bmc-labs/xdrk/tree/trunk/aim
//     OR install Race Studio 3 on Windows and point AIM_XRK_LIB to MatLabXRK-2017-64-ReleaseU.dll
//   - Set env var:  AIM_XRK_LIB=/absolute/path/to/libxdrk-x86_64.so
//   - OR place the .so file at server/lib/aim/libxdrk-x86_64.so
//
// Thread safety: The DLL uses process-global state. All calls are serialised through a simple
// async queue (dllQueue). Never call DLL functions concurrently.
'use strict';

const fs   = require('fs');
const path = require('path');

// ── koffi loading (optional — graceful fallback) ───────────────────────────
let koffi       = null;
let dllLib      = null;  // koffi library handle
let dllAvailable = false;

try {
  koffi = require('koffi');
} catch (e) {
  console.warn('[xrk-reader] koffi not available — XRK parsing disabled, CSV mode only:', e.message);
}

// ── Async DLL mutex — the DLL uses global state; serialize ALL calls ────────
// Simple in-process queue: each call wraps itself in a promise that waits for
// the previous one to settle before starting.
let _dllBusy = Promise.resolve();
function withDll(fn) {
  _dllBusy = _dllBusy.then(fn, fn);
  return _dllBusy;
}

// ── Locate the AiM shared library ──────────────────────────────────────────
function findAimLib() {
  const envPath = process.env.AIM_XRK_LIB;
  if (envPath && fs.existsSync(envPath)) return envPath;

  const candidates = [
    path.join(__dirname, 'aim', 'libxdrk-x86_64.so'),
    path.join(__dirname, 'aim', 'MatLabXRK-2017-64-ReleaseU.dll'),
    path.join(__dirname, 'aim', 'MatLabXRK-2017-32-ReleaseU.dll'),
    '/usr/local/lib/libxdrk-x86_64.so',
    '/usr/lib/libxdrk-x86_64.so',
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

// ── Load and bind the DLL ──────────────────────────────────────────────────
function loadDll() {
  if (!koffi) return;
  const libPath = findAimLib();
  if (!libPath) {
    console.warn('[xrk-reader] AiM library not found — set AIM_XRK_LIB env var. CSV mode only.');
    return;
  }
  try {
    const lib = koffi.load(libPath);

    // struct tm (matches libc / MSVC CRT layout)
    const struct_tm = koffi.struct('struct_tm', {
      tm_sec:   'int',
      tm_min:   'int',
      tm_hour:  'int',
      tm_mday:  'int',
      tm_mon:   'int',   // 0-based
      tm_year:  'int',   // years since 1900
      tm_wday:  'int',
      tm_yday:  'int',
      tm_isdst: 'int',
    });

    // Bind all functions — keep refs on lib.fn so they don't get GC'd
    lib.fn = {};

    // Library info
    lib.fn.get_library_date   = lib.func('get_library_date',   'string', []);
    lib.fn.get_library_time   = lib.func('get_library_time',   'string', []);

    // File lifecycle
    lib.fn.open_file          = lib.func('open_file',          'int',    ['string']);
    lib.fn.close_file_i       = lib.func('close_file_i',       'int',    ['int']);

    // Session metadata
    lib.fn.get_vehicle_name       = lib.func('get_vehicle_name',       'string', ['int']);
    lib.fn.get_track_name         = lib.func('get_track_name',         'string', ['int']);
    lib.fn.get_racer_name         = lib.func('get_racer_name',         'string', ['int']);
    lib.fn.get_championship_name  = lib.func('get_championship_name',  'string', ['int']);
    lib.fn.get_venue_type_name    = lib.func('get_venue_type_name',    'string', ['int']);
    lib.fn.get_date_and_time      = lib.func('get_date_and_time',      koffi.pointer(struct_tm), ['int']);

    // Laps
    lib.fn.get_laps_count = lib.func('get_laps_count', 'int', ['int']);
    lib.fn.get_lap_info   = lib.func('get_lap_info',   'int', ['int', 'int', koffi.out(koffi.pointer('double')), koffi.out(koffi.pointer('double'))]);

    // Bind channel family for the three groups (logged, GPS, GPS_raw)
    const prefixes = ['', 'GPS_', 'GPS_raw_'];
    for (const p of prefixes) {
      lib.fn[`get_${p}channels_count`]          = lib.func(`get_${p}channels_count`,          'int',    ['int']);
      lib.fn[`get_${p}channel_name`]            = lib.func(`get_${p}channel_name`,            'string', ['int', 'int']);
      lib.fn[`get_${p}channel_units`]           = lib.func(`get_${p}channel_units`,           'string', ['int', 'int']);
      lib.fn[`get_${p}channel_samples_count`]   = lib.func(`get_${p}channel_samples_count`,   'int',    ['int', 'int']);
      // 'void *' params: koffi passes raw TypedArray buffer pointer — C writes directly into Float64Array memory
      lib.fn[`get_${p}channel_samples`]         = lib.func(`get_${p}channel_samples`,         'int',    ['int', 'int', 'void *', 'void *', 'int']);
      lib.fn[`get_lap_${p}channel_samples_count`] = lib.func(`get_lap_${p}channel_samples_count`, 'int', ['int', 'int', 'int']);
      lib.fn[`get_lap_${p}channel_samples`]     = lib.func(`get_lap_${p}channel_samples`,     'int',    ['int', 'int', 'int', 'void *', 'void *', 'int']);
    }

    dllLib       = lib;
    dllAvailable = true;
    console.log('[xrk-reader] AiM library loaded:', libPath);
  } catch (e) {
    console.error('[xrk-reader] Failed to load AiM library:', e.message);
  }
}

loadDll();

// ── Channel metadata helpers ───────────────────────────────────────────────
const CHANNEL_CATEGORIES = {
  Engine:        /^(rpm|tps|throttle|gear|lambda|afr|oil.*temp|water.*temp|coolant|engine|fuel|exhaust|battery|vbatt|volt)/i,
  GPS:           /^(gps|latitude|longitude|lat$|lon$|heading|nsat|altitude|speed$|gps_speed)/i,
  Accelerometers:/^(accx|accy|accz|lat.*acc|lon.*acc|gyro|acc_|lateral|longitudinal)/i,
  Brakes:        /^(brake|brk|press)/i,
  Suspension:    /^(susp|shock|ride|height|damp|spring|travel|pot)/i,
  Temperature:   /^(temp|temperature|thermal|cht|egt|ir_)/i,
};

function categorizeChannel(name) {
  const n = name || '';
  for (const [cat, re] of Object.entries(CHANNEL_CATEGORIES)) {
    if (re.test(n)) return cat;
  }
  return 'Misc';
}

const CHANNEL_COLORS = {
  rpm:      '#e74c3c',
  tps:      '#2ecc71',
  throttle: '#2ecc71',
  gps_speed:'#3498db',
  speed:    '#3498db',
  brake:    '#e67e22',
  gear:     '#9b59b6',
  watertemp:'#e74c3c',
  oiltemp:  '#e67e22',
  lambda:   '#1abc9c',
  accx:     '#f39c12',
  accy:     '#d35400',
  accz:     '#2980b9',
  lat_acc:  '#f39c12',
  lon_acc:  '#d35400',
};

function defaultChannelColor(name) {
  const key = (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const [k, color] of Object.entries(CHANNEL_COLORS)) {
    if (key.includes(k)) return color;
  }
  return '#3498db';
}

// ── LTTB downsampling (Largest-Triangle-Three-Buckets) ─────────────────────
// Returns { t: number[], v: number[] } with at most `threshold` points.
// Preserves peaks and important transitions; ideal for telemetry charts.
function lttb(times, values, threshold = 500) {
  const len = times.length;
  if (len <= threshold) {
    return { t: Array.from(times), v: Array.from(values) };
  }

  const sampled_t = [];
  const sampled_v = [];

  // Always include first + last
  sampled_t.push(times[0]);
  sampled_v.push(values[0]);

  const every = (len - 2) / (threshold - 2);
  let a = 0;  // previously selected index

  for (let i = 0; i < threshold - 2; i++) {
    // Calculate point average for next bucket
    let avgX = 0, avgY = 0, avgRangeStart = Math.floor((i + 1) * every) + 1;
    const avgRangeEnd = Math.min(Math.floor((i + 2) * every) + 1, len);
    const avgRangeLen = avgRangeEnd - avgRangeStart;

    for (let j = avgRangeStart; j < avgRangeEnd; j++) {
      avgX += times[j];
      avgY += values[j];
    }
    avgX /= avgRangeLen;
    avgY /= avgRangeLen;

    // Point range for this bucket
    const rangeOffs = Math.floor(i * every) + 1;
    const rangeTo   = Math.min(Math.floor((i + 1) * every) + 1, len);

    const pointAX = times[a];
    const pointAY = values[a];

    let maxArea = -1, nextA = rangeOffs;
    for (let j = rangeOffs; j < rangeTo; j++) {
      const area = Math.abs(
        (pointAX - avgX) * (values[j] - pointAY) -
        (pointAX - times[j]) * (avgY - pointAY)
      ) * 0.5;
      if (area > maxArea) {
        maxArea = area;
        nextA   = j;
      }
    }

    sampled_t.push(times[nextA]);
    sampled_v.push(values[nextA]);
    a = nextA;
  }

  sampled_t.push(times[len - 1]);
  sampled_v.push(values[len - 1]);

  return { t: sampled_t, v: sampled_v };
}

// ── DLL-based XRK parsing ──────────────────────────────────────────────────

const GROUP_PREFIX = { logged: '', gps: 'GPS_', gps_raw: 'GPS_raw_' };

/**
 * Open an XRK/XRZ/DRK file and return { session, laps, channels }.
 * Does NOT return sample data — that is fetched separately for performance.
 * @param {string} absPath - absolute path to file
 */
async function parseXrk(absPath) {
  if (!dllAvailable) throw new Error('AiM DLL not available. Set AIM_XRK_LIB env var.');

  return withDll(() => {
    const fn = dllLib.fn;
    const idx = fn.open_file(absPath);
    if (!idx || idx <= 0) {
      throw new Error(`open_file returned ${idx} — file may be corrupt or unsupported`);
    }

    try {
      // ── Metadata ─────────────────────────────────────────────────
      let startedAt = null;
      try {
        const tmPtr = fn.get_date_and_time(idx);
        if (tmPtr) {
          const tm = koffi.decode(tmPtr, 'struct_tm');
          const d = new Date(
            tm.tm_year + 1900,
            tm.tm_mon,
            tm.tm_mday,
            tm.tm_hour,
            tm.tm_min,
            tm.tm_sec
          );
          if (!isNaN(d.getTime())) startedAt = d.toISOString();
        }
      } catch (_) { /* date unavailable */ }

      const session = {
        racer_name:   fn.get_racer_name(idx)        || '',
        vehicle_name: fn.get_vehicle_name(idx)       || '',
        track_name:   fn.get_track_name(idx)         || '',
        championship: fn.get_championship_name(idx)  || '',
        venue_type:   fn.get_venue_type_name(idx)    || '',
        started_at:   startedAt,
      };

      // ── Laps ─────────────────────────────────────────────────────
      const lapCount = fn.get_laps_count(idx) || 0;
      const laps = [];
      for (let k = 0; k < lapCount; k++) {
        const startBuf = [0.0], durBuf = [0.0];
        const rc = fn.get_lap_info(idx, k, startBuf, durBuf);
        if (rc > 0) {
          laps.push({ lap_index: k, start_s: startBuf[0], duration_s: durBuf[0] });
        }
      }

      // Mark outlaps/inlaps: laps significantly longer than median
      if (laps.length > 2) {
        const sorted = laps.map(l => l.duration_s).sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        laps[0].is_outlap = laps[0].duration_s > median * 1.5;
        laps[laps.length - 1].is_inlap = laps[laps.length - 1].duration_s > median * 1.5;
      }

      // ── Channels ─────────────────────────────────────────────────
      const channels = [];
      for (const [group, prefix] of Object.entries(GROUP_PREFIX)) {
        const n = fn[`get_${prefix}channels_count`](idx) || 0;
        for (let c = 0; c < n; c++) {
          const name  = fn[`get_${prefix}channel_name`](idx, c)  || `CH_${c}`;
          const units = fn[`get_${prefix}channel_units`](idx, c) || '';
          const sc    = fn[`get_${prefix}channel_samples_count`](idx, c) || 0;
          const rateHz = laps.length > 0 && laps[0].duration_s > 0
            ? sc / (laps.reduce((s, l) => s + l.duration_s, 0))
            : null;

          channels.push({
            channel_group:  group,
            channel_index:  c,
            name,
            units,
            sample_count:   sc,
            sample_rate_hz: rateHz ? parseFloat(rateHz.toFixed(2)) : null,
            value_min:      null,   // computed when samples are fetched
            value_max:      null,
            category:       categorizeChannel(name),
            default_color:  defaultChannelColor(name),
          });
        }
      }

      const totalDuration = laps.reduce((s, l) => s + l.duration_s, 0);

      return { session: { ...session, duration_s: totalDuration }, laps, channels };

    } finally {
      try { fn.close_file_i(idx); } catch (_) { /* best effort */ }
    }
  });
}

// ── Safe min/max for TypedArrays — avoids Math.min(...largeArray) stack overflow
function typedMinMax(arr, n) {
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < n; i++) {
    if (arr[i] < min) min = arr[i];
    if (arr[i] > max) max = arr[i];
  }
  return { min: isFinite(min) ? min : 0, max: isFinite(max) ? max : 0 };
}

/**
 * Open an XRK/XRZ/DRK file ONCE and read ALL channels × ALL laps in a single
 * DLL session. All sample data is LTTB-downsampled to 500 pts and returned inline.
 * The caller should delete the source file and set file_path=NULL after storing results.
 *
 * Returns { session, laps, channels, samples }
 * where samples = [{ group, channelIndex, lapIndex, t: number[], v: number[], min, max }]
 */
async function parseXrkFull(absPath) {
  if (!dllAvailable) throw new Error('AiM DLL not available. Set AIM_XRK_LIB env var on the server.');

  return withDll(() => {
    const fn  = dllLib.fn;
    const idx = fn.open_file(absPath);
    if (!idx || idx <= 0) throw new Error(`open_file returned ${idx} — file may be corrupt or unsupported`);

    try {
      // ── Date / time ───────────────────────────────────────────────────
      let startedAt = null;
      try {
        const tmPtr = fn.get_date_and_time(idx);
        if (tmPtr) {
          const tm = koffi.decode(tmPtr, 'struct_tm');
          const d  = new Date(tm.tm_year + 1900, tm.tm_mon, tm.tm_mday, tm.tm_hour, tm.tm_min, tm.tm_sec);
          if (!isNaN(d.getTime())) startedAt = d.toISOString();
        }
      } catch (_) {}

      // ── Metadata ──────────────────────────────────────────────────────
      const session = {
        racer_name:   fn.get_racer_name(idx)        || '',
        vehicle_name: fn.get_vehicle_name(idx)       || '',
        track_name:   fn.get_track_name(idx)         || '',
        championship: fn.get_championship_name(idx)  || '',
        venue_type:   fn.get_venue_type_name(idx)    || '',
        started_at:   startedAt,
      };

      // ── Laps ──────────────────────────────────────────────────────────
      const lapCount = fn.get_laps_count(idx) || 0;
      const laps = [];
      for (let k = 0; k < lapCount; k++) {
        const startBuf = [0.0], durBuf = [0.0];
        try {
          const rc = fn.get_lap_info(idx, k, startBuf, durBuf);
          if (rc > 0) laps.push({ lap_index: k, start_s: startBuf[0], duration_s: durBuf[0], is_outlap: false, is_inlap: false });
        } catch (_) {}
      }
      if (laps.length > 2) {
        const sorted = laps.map(l => l.duration_s).slice().sort((a, b) => a - b);
        const mid    = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        laps[0].is_outlap               = laps[0].duration_s              > median * 1.5;
        laps[laps.length - 1].is_inlap  = laps[laps.length - 1].duration_s > median * 1.5;
      }
      const totalDuration = laps.reduce((s, l) => s + l.duration_s, 0);

      // ── Channels ──────────────────────────────────────────────────────
      const channels    = [];
      const chanMetaMap = {}; // `${group}_${c}` → channel object (for updating min/max)

      for (const [group, prefix] of Object.entries(GROUP_PREFIX)) {
        const n = fn[`get_${prefix}channels_count`](idx) || 0;
        for (let c = 0; c < n; c++) {
          const name   = fn[`get_${prefix}channel_name`](idx, c)  || `CH_${c}`;
          const units  = fn[`get_${prefix}channel_units`](idx, c) || '';
          const sc     = fn[`get_${prefix}channel_samples_count`](idx, c) || 0;
          const rateHz = totalDuration > 0 ? parseFloat((sc / totalDuration).toFixed(2)) : null;
          const ch = {
            channel_group: group, channel_index: c,
            name, units, sample_count: sc, sample_rate_hz: rateHz,
            value_min: null, value_max: null,
            category: categorizeChannel(name), default_color: defaultChannelColor(name),
          };
          channels.push(ch);
          chanMetaMap[`${group}_${c}`] = ch;
        }
      }

      // ── All samples — file stays open for this entire block ────────────
      const samples = [];
      for (const [group, prefix] of Object.entries(GROUP_PREFIX)) {
        const n = fn[`get_${prefix}channels_count`](idx) || 0;
        for (let c = 0; c < n; c++) {
          for (let lapIdx = 0; lapIdx < lapCount; lapIdx++) {
            let nSamples = 0;
            try { nSamples = fn[`get_lap_${prefix}channel_samples_count`](idx, lapIdx, c) || 0; } catch (_) { continue; }
            if (nSamples <= 0) continue;

            // Float64Array passed via 'void *' — C writes directly into the underlying buffer
            const timeBuf = new Float64Array(nSamples);
            const valBuf  = new Float64Array(nSamples);
            let rc = 0;
            try { rc = fn[`get_lap_${prefix}channel_samples`](idx, lapIdx, c, timeBuf, valBuf, nSamples); } catch (_) { continue; }
            if (rc <= 0) continue;

            const { min, max } = typedMinMax(valBuf, nSamples);
            const { t, v }     = lttb(timeBuf, valBuf, 500);

            // Accumulate aggregate min/max on the channel metadata
            const meta = chanMetaMap[`${group}_${c}`];
            if (meta) {
              meta.value_min = meta.value_min == null ? min : Math.min(meta.value_min, min);
              meta.value_max = meta.value_max == null ? max : Math.max(meta.value_max, max);
            }
            samples.push({ group, channelIndex: c, lapIndex: lapIdx, t, v, min, max });
          }
        }
      }

      return {
        session: { ...session, duration_s: parseFloat(totalDuration.toFixed(3)) },
        laps, channels, samples,
      };

    } finally {
      try { fn.close_file_i(idx); } catch (_) {}
    }
  });
}

/**
 * @deprecated Use parseXrkFull — this returns no sample data and the file must stay on disk.
 */
async function getChannelSamples(absPath, group, channelIndex, lapIndex) {
  if (!dllAvailable) throw new Error('AiM DLL not available');
  const prefix = GROUP_PREFIX[group];
  if (prefix === undefined) throw new Error(`Unknown group: ${group}`);

  return withDll(() => {
    const fn  = dllLib.fn;
    const idx = fn.open_file(absPath);
    if (!idx || idx <= 0) throw new Error(`open_file returned ${idx}`);

    try {
      let n;
      if (lapIndex == null) {
        n = fn[`get_${prefix}channel_samples_count`](idx, channelIndex) || 0;
      } else {
        n = fn[`get_lap_${prefix}channel_samples_count`](idx, lapIndex, channelIndex) || 0;
      }
      if (n <= 0) return { t: [], v: [], min: 0, max: 0 };

      const timeBuf  = new Float64Array(n);
      const valBuf   = new Float64Array(n);

      let rc;
      if (lapIndex == null) {
        rc = fn[`get_${prefix}channel_samples`](idx, channelIndex, Array.from(timeBuf), Array.from(valBuf), n);
      } else {
        rc = fn[`get_lap_${prefix}channel_samples`](idx, lapIndex, channelIndex, Array.from(timeBuf), Array.from(valBuf), n);
      }

      if (rc <= 0) return { t: [], v: [], min: 0, max: 0 };

      const min = Math.min(...valBuf);
      const max = Math.max(...valBuf);
      const { t, v } = lttb(timeBuf, valBuf, 500);

      return { t, v, min, max };

    } finally {
      try { fn.close_file_i(idx); } catch (_) { /* best effort */ }
    }
  });
}

// ── CSV parser — Race Studio 3 export format ───────────────────────────────
// RS3 exports have comment lines starting with '#', then a header row like:
//   "Time [s], RPM [rpm], GPS Speed [km/h], ..."
// followed by numeric data rows.
// This parser is forgiving and handles both comma-separated and tab-separated variants.

/**
 * Parse a Race Studio 3 CSV export string.
 * Returns { session, laps, channels, sampleData }
 * where sampleData[channelIndex] = { t: number[], v: number[] } (LTTB applied)
 */
function parseCSV(content) {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  // Extract metadata from header comment lines
  const meta = {
    vehicle_name: '',
    track_name:   '',
    racer_name:   '',
    championship: '',
    started_at:   null,
  };
  const metaPatterns = [
    [/^#\s*vehicle[:\s]+(.+)/i,      'vehicle_name'],
    [/^#\s*car[:\s]+(.+)/i,          'vehicle_name'],
    [/^#\s*track[:\s]+(.+)/i,        'track_name'],
    [/^#\s*circuit[:\s]+(.+)/i,      'track_name'],
    [/^#\s*racer[:\s]+(.+)/i,        'racer_name'],
    [/^#\s*driver[:\s]+(.+)/i,       'racer_name'],
    [/^#\s*championship[:\s]+(.+)/i, 'championship'],
    [/^#\s*date[:\s]+(.+)/i,         'started_at'],
  ];

  let headerLineIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 100); i++) {
    const l = lines[i].trim();
    if (l.startsWith('#')) {
      for (const [re, key] of metaPatterns) {
        const m = l.match(re);
        if (m) meta[key] = m[1].trim();
      }
    } else if (l.length > 0 && headerLineIdx < 0) {
      headerLineIdx = i;
      break;
    }
  }

  if (headerLineIdx < 0) {
    throw new Error('CSV has no data rows');
  }

  // Parse header: "Time [s], RPM [rpm], GPS Speed [km/h]"
  const sep = lines[headerLineIdx].includes('\t') ? '\t' : ',';
  const headerCols = lines[headerLineIdx].split(sep).map(h => h.trim().replace(/['"]/g, ''));

  // Extract name and units from "Name [unit]" or "Name (unit)"
  const parsedHeaders = headerCols.map(h => {
    const m = h.match(/^(.+?)\s*[\[(]([^\])]*)[\])]?\s*$/) || h.match(/^(.+)$/);
    if (m && m[2] !== undefined) return { name: m[1].trim(), units: m[2].trim() };
    return { name: h, units: '' };
  });

  // Find time column (index 0 or named 'Time'/'t')
  let timeColIdx = 0;
  const timeHdr = parsedHeaders[0];
  if (!timeHdr || !/^(time|t)$/i.test(timeHdr.name)) {
    const idx = parsedHeaders.findIndex(h => /^(time|t)$/i.test(h.name));
    if (idx >= 0) timeColIdx = idx;
  }

  // Parse data rows
  const dataLines = lines.slice(headerLineIdx + 1).filter(l => l.trim() && !l.trim().startsWith('#'));
  const colCount   = parsedHeaders.length;
  const allValues  = parsedHeaders.map(() => []);  // allValues[colIdx][rowIdx]

  for (const line of dataLines) {
    const parts = line.split(sep);
    for (let c = 0; c < colCount; c++) {
      const v = parseFloat((parts[c] || '').trim());
      allValues[c].push(isNaN(v) ? 0 : v);
    }
  }

  const rowCount = allValues[0].length;
  const times    = allValues[timeColIdx];
  const duration = rowCount > 0 ? times[rowCount - 1] - times[0] : 0;

  // Detect lap boundaries — RS3 CSV may embed a 'Lap' channel or we treat whole session as lap 0
  const lapColIdx = parsedHeaders.findIndex(h => /^lap$/i.test(h.name));
  const laps = [];
  if (lapColIdx >= 0) {
    let curLap = -1, lapStart = times[0];
    for (let r = 0; r < rowCount; r++) {
      const l = allValues[lapColIdx][r];
      if (l !== curLap) {
        if (curLap >= 0) {
          laps.push({ lap_index: curLap, start_s: lapStart, duration_s: times[r - 1] - lapStart });
        }
        curLap = l;
        lapStart = times[r];
      }
    }
    if (curLap >= 0) {
      laps.push({ lap_index: curLap, start_s: lapStart, duration_s: times[rowCount - 1] - lapStart });
    }
  } else {
    // Single lap = whole session
    laps.push({ lap_index: 0, start_s: times[0] || 0, duration_s: duration });
  }

  // Build channels and sample data (skip time column and lap column)
  const channels   = [];
  const samples    = [];  // [{ group, channelIndex, lapIndex: null, t, v, min, max }]
  let channelIndex = 0;

  for (let c = 0; c < colCount; c++) {
    if (c === timeColIdx || c === lapColIdx) continue;
    const { name, units } = parsedHeaders[c];
    const vals = allValues[c];
    let min = Infinity, max = -Infinity;
    for (const v of vals) { if (v < min) min = v; if (v > max) max = v; }
    if (!isFinite(min)) { min = 0; max = 0; }
    const rateHz = duration > 0 ? parseFloat((rowCount / duration).toFixed(2)) : null;

    channels.push({
      channel_group:  'csv',
      channel_index:  channelIndex,
      name,
      units,
      sample_count:   rowCount,
      sample_rate_hz: rateHz,
      value_min:      parseFloat(min.toFixed(6)),
      value_max:      parseFloat(max.toFixed(6)),
      category:       categorizeChannel(name),
      default_color:  defaultChannelColor(name),
    });

    const { t, v } = lttb(times, vals, 500);
    // lapIndex: null = whole session (CSV has no per-lap breakdown by default)
    samples.push({ group: 'csv', channelIndex, lapIndex: null, t, v, min, max });
    channelIndex++;
  }

  // Try to parse started_at from meta
  let startedAt = null;
  if (meta.started_at) {
    const d = new Date(meta.started_at);
    if (!isNaN(d.getTime())) startedAt = d.toISOString();
  }

  return {
    session: {
      racer_name:   meta.racer_name,
      vehicle_name: meta.vehicle_name,
      track_name:   meta.track_name,
      championship: meta.championship,
      started_at:   startedAt,
      duration_s:   parseFloat(duration.toFixed(3)),
    },
    laps,
    channels,
    samples,  // [{ group: 'csv', channelIndex, lapIndex: null, t, v, min, max }]
  };
}

// ── Exports ────────────────────────────────────────────────────────────────
module.exports = {
  dllAvailable: () => dllAvailable,
  parseXrkFull,
  parseCSV,
  lttb,
  categorizeChannel,
  defaultChannelColor,
};
