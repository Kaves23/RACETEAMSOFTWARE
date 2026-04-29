// routes/telemetry.js
// AiM / Race Studio 3 telemetry session management API
'use strict';

const express  = require('express');
const router   = express.Router();
const fs       = require('fs');
const path     = require('path');
const multer   = require('multer');
const { pool } = require('../db');
const xrk      = require('../lib/xrk-reader');

// ── Upload directory ────────────────────────────────────────────────────────
const UPLOAD_DIR = process.env.TELEMETRY_UPLOAD_DIR || '/tmp/telemetry-uploads';
if (!fs.existsSync(UPLOAD_DIR)) {
  try { fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch (_) {}
}

const ACCEPTED_EXTENSIONS = new Set(['.xrk', '.xrz', '.drk', '.csv', '.txt']);

// Multer: memory storage, 200 MB limit
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 200 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, ACCEPTED_EXTENSIONS.has(ext));
  },
});

// ── Insights engine ─────────────────────────────────────────────────────────
async function computeInsights(sessionId) {
  try {
    const { rows: laps } = await pool.query(
      `SELECT * FROM telemetry_laps WHERE session_id = $1 ORDER BY lap_index`, [sessionId]
    );
    if (!laps.length) return;

    const validLaps = laps.filter(l => !l.is_outlap && !l.is_inlap && l.duration_s > 0);
    if (!validLaps.length) return;

    const durs   = validLaps.map(l => parseFloat(l.duration_s));
    const bestDur = Math.min(...durs);
    const bestLap = validLaps.find(l => parseFloat(l.duration_s) === bestDur);

    const inserts = [];

    // Best lap insight
    inserts.push({
      type: 'best_lap', lap: bestLap.lap_index, severity: 'good',
      title: `Best Lap: ${fmtLap(bestDur)}`,
      detail: `Lap ${bestLap.lap_index + 1} is the fastest lap in this session.`,
      value: bestDur, unit: 's',
    });

    // Consistency insight (std dev)
    if (durs.length > 1) {
      const mean = durs.reduce((s, d) => s + d, 0) / durs.length;
      const std  = Math.sqrt(durs.map(d => (d - mean) ** 2).reduce((s, d) => s + d, 0) / durs.length);
      const severity = std < 0.5 ? 'good' : std < 1.0 ? 'info' : std < 2.0 ? 'warning' : 'critical';
      inserts.push({
        type: 'consistency', lap: null, severity,
        title: `Consistency: σ = ${std.toFixed(3)}s`,
        detail: `Standard deviation across ${durs.length} valid laps. Mean lap: ${fmtLap(mean)}.`,
        value: parseFloat(std.toFixed(6)), unit: 's',
      });
    }

    // Gap-to-best for each valid lap
    for (const lap of validLaps) {
      const gap = parseFloat(lap.duration_s) - bestDur;
      if (gap > 0.01) {
        inserts.push({
          type: 'gap', lap: lap.lap_index, severity: gap < 0.5 ? 'info' : gap < 1.5 ? 'warning' : 'critical',
          title: `Lap ${lap.lap_index + 1}: +${gap.toFixed(3)}s`,
          detail: `${gap.toFixed(3)}s off best lap.`,
          value: parseFloat(gap.toFixed(6)), unit: 's',
        });
      }
    }

    // Max speed insight
    const speedLap = laps.reduce((best, l) => {
      if (!l.max_speed_kph) return best;
      return !best || parseFloat(l.max_speed_kph) > parseFloat(best.max_speed_kph) ? l : best;
    }, null);
    if (speedLap && speedLap.max_speed_kph) {
      inserts.push({
        type: 'speed', lap: speedLap.lap_index, severity: 'info',
        title: `Peak Speed: ${parseFloat(speedLap.max_speed_kph).toFixed(1)} km/h`,
        detail: `Achieved on Lap ${speedLap.lap_index + 1}.`,
        value: parseFloat(speedLap.max_speed_kph), unit: 'km/h',
      });
    }

    // Outlap/inlap notices
    for (const lap of laps) {
      if (lap.is_outlap) {
        inserts.push({ type: 'recommendation', lap: lap.lap_index, severity: 'info',
          title: `Lap ${lap.lap_index + 1} flagged as Out Lap`, detail: 'Lap time significantly longer than median — excluded from consistency analysis.', value: null, unit: null });
      }
      if (lap.is_inlap) {
        inserts.push({ type: 'recommendation', lap: lap.lap_index, severity: 'info',
          title: `Lap ${lap.lap_index + 1} flagged as In Lap`, detail: 'Lap time significantly longer than median — excluded from consistency analysis.', value: null, unit: null });
      }
    }

    // Bulk insert
    for (const ins of inserts) {
      await pool.query(
        `INSERT INTO telemetry_insights (session_id, insight_type, lap_index, severity, title, detail, value_num, unit)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [sessionId, ins.type, ins.lap ?? null, ins.severity, ins.title, ins.detail ?? null, ins.value ?? null, ins.unit ?? null]
      );
    }

    // Update session best_lap_index + best_lap_s
    await pool.query(
      `UPDATE telemetry_sessions SET best_lap_index = $1, best_lap_s = $2, updated_at = NOW() WHERE id = $3`,
      [bestLap.lap_index, bestDur, sessionId]
    );
  } catch (err) {
    console.error(`[telemetry] computeInsights(${sessionId}) error:`, err.message);
  }
}

function fmtLap(s) {
  const min = Math.floor(s / 60);
  const sec = (s % 60).toFixed(3).padStart(6, '0');
  return `${min}:${sec}`;
}

// ── Helper: store parsed results in DB ─────────────────────────────────────
async function storeParseResults(sessionId, parsed, sampleDataMap) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { session, laps, channels } = parsed;

    // Update session metadata
    await client.query(
      `UPDATE telemetry_sessions SET
         racer_name   = $1, vehicle_name = $2, track_name   = $3,
         championship = $4, venue_type   = $5, started_at   = $6,
         duration_s   = $7, lap_count    = $8, parse_status = 'parsed', parse_error = NULL,
         updated_at   = NOW()
       WHERE id = $9`,
      [
        session.racer_name || null, session.vehicle_name || null, session.track_name || null,
        session.championship || null, session.venue_type || null, session.started_at || null,
        session.duration_s || null, laps.length, sessionId
      ]
    );

    // Upsert laps
    for (const lap of laps) {
      await client.query(
        `INSERT INTO telemetry_laps (session_id, lap_index, start_s, duration_s, is_outlap, is_inlap)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (session_id, lap_index) DO UPDATE SET
           start_s    = EXCLUDED.start_s,
           duration_s = EXCLUDED.duration_s,
           is_outlap  = EXCLUDED.is_outlap,
           is_inlap   = EXCLUDED.is_inlap`,
        [sessionId, lap.lap_index, lap.start_s, lap.duration_s, lap.is_outlap || false, lap.is_inlap || false]
      );
    }

    // Upsert channels + samples
    for (const ch of channels) {
      const { rows: [row] } = await client.query(
        `INSERT INTO telemetry_channels
           (session_id, channel_group, channel_index, name, units, sample_count,
            sample_rate_hz, value_min, value_max, category, default_color)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (session_id, channel_group, channel_index) DO UPDATE SET
           name           = EXCLUDED.name,
           units          = EXCLUDED.units,
           sample_count   = EXCLUDED.sample_count,
           sample_rate_hz = EXCLUDED.sample_rate_hz,
           value_min      = EXCLUDED.value_min,
           value_max      = EXCLUDED.value_max,
           category       = EXCLUDED.category,
           default_color  = EXCLUDED.default_color
         RETURNING id`,
        [
          sessionId, ch.channel_group, ch.channel_index, ch.name, ch.units,
          ch.sample_count, ch.sample_rate_hz || null,
          ch.value_min != null ? ch.value_min : null,
          ch.value_max != null ? ch.value_max : null,
          ch.category, ch.default_color
        ]
      );

      // If sample data is available inline (CSV), store it for lap_index = null (whole session)
      if (sampleDataMap && sampleDataMap[ch.channel_index]) {
        const { t, v } = sampleDataMap[ch.channel_index];
        await client.query(
          `INSERT INTO telemetry_samples (channel_id, lap_index, sample_count, times, values)
           VALUES ($1, NULL, $2, $3::jsonb, $4::jsonb)
           ON CONFLICT (channel_id, lap_index) DO UPDATE SET
             sample_count = EXCLUDED.sample_count,
             times        = EXCLUDED.times,
             values       = EXCLUDED.values`,
          [row.id, t.length, JSON.stringify(t), JSON.stringify(v)]
        );
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Routes ──────────────────────────────────────────────────────────────────

// GET /api/telemetry/dll-status
router.get('/dll-status', (_req, res) => {
  res.json({
    available:   xrk.dllAvailable(),
    env_var:     process.env.AIM_XRK_LIB || null,
    instructions: xrk.dllAvailable()
      ? 'AiM library loaded. XRK/XRZ/DRK uploads fully supported.'
      : 'AiM library not found. CSV uploads work fully. To enable XRK support set AIM_XRK_LIB to the path of libxdrk-x86_64.so (Linux) or MatLabXRK-2017-64-ReleaseU.dll (Windows). Download from: https://github.com/bmc-labs/xdrk/tree/trunk/aim'
  });
});

// GET /api/telemetry/events — dropdown
router.get('/events', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT id, name, start_date FROM events ORDER BY start_date DESC NULLS LAST LIMIT 300`);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/telemetry/drivers — dropdown
router.get('/drivers', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT id, name, color FROM drivers WHERE status = 'Active' OR status IS NULL ORDER BY name LIMIT 200`);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/telemetry/cars — dropdown
router.get('/cars', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT id, name, barcode FROM items WHERE is_race_fleet = true ORDER BY name LIMIT 100`);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/telemetry — list sessions
router.get('/', async (req, res, next) => {
  try {
    const { event_id, driver_id, parse_status, limit = 500 } = req.query;
    const conds = [], params = [];

    if (event_id)     { params.push(event_id);     conds.push(`ts.event_id = $${params.length}`); }
    if (driver_id)    { params.push(driver_id);     conds.push(`ts.driver_id = $${params.length}`); }
    if (parse_status) { params.push(parse_status);  conds.push(`ts.parse_status = $${params.length}`); }

    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    params.push(Math.min(parseInt(limit, 10) || 500, 1000));

    const { rows } = await pool.query(`
      SELECT
        ts.*,
        e.name         AS event_name,
        e.start_date   AS event_date,
        d.name         AS driver_name,
        d.color        AS driver_color,
        i.name         AS kart_name,
        di.filename    AS drive_import_filename,
        di.drive_link  AS drive_import_link
      FROM telemetry_sessions ts
      LEFT JOIN events       e  ON e.id  = ts.event_id
      LEFT JOIN drivers      d  ON d.id  = ts.driver_id
      LEFT JOIN items        i  ON i.id  = ts.kart_item_id
      LEFT JOIN drive_imports di ON di.id = ts.drive_import_id
      ${where}
      ORDER BY ts.created_at DESC
      LIMIT $${params.length}
    `, params);
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/telemetry/:id — session detail (no samples)
router.get('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows: [session] } = await pool.query(`
      SELECT ts.*,
             e.name AS event_name, e.start_date AS event_date,
             d.name AS driver_name, d.color AS driver_color,
             i.name AS kart_name
      FROM telemetry_sessions ts
      LEFT JOIN events  e ON e.id = ts.event_id
      LEFT JOIN drivers d ON d.id = ts.driver_id
      LEFT JOIN items   i ON i.id = ts.kart_item_id
      WHERE ts.id = $1
    `, [id]);
    if (!session) return res.status(404).json({ error: 'Not found' });

    const { rows: laps }     = await pool.query(`SELECT * FROM telemetry_laps     WHERE session_id=$1 ORDER BY lap_index`, [id]);
    const { rows: channels } = await pool.query(`SELECT * FROM telemetry_channels WHERE session_id=$1 ORDER BY channel_group, channel_index`, [id]);

    res.json({ success: true, data: { session, laps, channels } });
  } catch (err) { next(err); }
});

// GET /api/telemetry/:id/insights
router.get('/:id/insights', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows } = await pool.query(
      `SELECT * FROM telemetry_insights WHERE session_id=$1 ORDER BY severity DESC, insight_type, lap_index NULLS FIRST`, [id]
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

// GET /api/telemetry/:id/channels/:group/:channelIndex/samples?lap=N
router.get('/:id/channels/:group/:channelIndex/samples', async (req, res, next) => {
  try {
    const sessionId    = parseInt(req.params.id, 10);
    const group        = req.params.group;
    const channelIndex = parseInt(req.params.channelIndex, 10);
    const lapIndex     = req.query.lap != null ? parseInt(req.query.lap, 10) : null;

    // Look up channel id
    const { rows: [ch] } = await pool.query(
      `SELECT * FROM telemetry_channels WHERE session_id=$1 AND channel_group=$2 AND channel_index=$3`,
      [sessionId, group, channelIndex]
    );
    if (!ch) return res.status(404).json({ error: 'Channel not found' });

    // Try cached samples first
    const { rows: [cached] } = await pool.query(
      `SELECT * FROM telemetry_samples WHERE channel_id=$1 AND (lap_index IS NOT DISTINCT FROM $2)`,
      [ch.id, lapIndex]
    );
    if (cached) {
      return res.json({
        success: true,
        data: {
          channel_id:    ch.id,
          group, channel_index: channelIndex,
          name:          ch.name,
          units:         ch.units,
          lap:           lapIndex,
          times:         cached.times,
          values:        cached.values,
          value_min:     ch.value_min,
          value_max:     ch.value_max,
          sample_count:  cached.sample_count,
        }
      });
    }

    // Live parse if file still on disk
    const { rows: [sess] } = await pool.query(`SELECT file_path FROM telemetry_sessions WHERE id=$1`, [sessionId]);
    if (!sess || !sess.file_path || !fs.existsSync(sess.file_path)) {
      return res.status(404).json({ error: 'Sample data not cached and source file unavailable. Re-upload to regenerate.' });
    }

    // Only XRK groups supported for live parse
    if (group === 'csv') {
      return res.status(404).json({ error: 'CSV samples not cached. Re-upload file.' });
    }

    const { t, v, min, max } = await xrk.getChannelSamples(sess.file_path, group, channelIndex, lapIndex);

    // Cache it asynchronously
    pool.query(
      `INSERT INTO telemetry_samples (channel_id, lap_index, sample_count, times, values)
       VALUES ($1,$2,$3,$4::jsonb,$5::jsonb)
       ON CONFLICT (channel_id, lap_index) DO UPDATE SET sample_count=EXCLUDED.sample_count, times=EXCLUDED.times, values=EXCLUDED.values`,
      [ch.id, lapIndex, t.length, JSON.stringify(t), JSON.stringify(v)]
    ).catch(e => console.error('[telemetry] cache write error:', e.message));

    // Update channel min/max
    pool.query(
      `UPDATE telemetry_channels SET value_min=LEAST(COALESCE(value_min,999999),$1), value_max=GREATEST(COALESCE(value_max,-999999),$2) WHERE id=$3`,
      [min, max, ch.id]
    ).catch(() => {});

    res.json({ success: true, data: { channel_id: ch.id, group, channel_index: channelIndex, name: ch.name, units: ch.units, lap: lapIndex, times: t, values: v, value_min: min, value_max: max, sample_count: t.length } });
  } catch (err) { next(err); }
});

// PUT /api/telemetry/:id
router.put('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const fields = [], params = [];
    const allowed = ['event_id','driver_id','kart_item_id','notes','racer_name','vehicle_name','track_name'];
    for (const f of allowed) {
      if (f in req.body) { params.push(req.body[f] ?? null); fields.push(`${f}=$${params.length}`); }
    }
    // race_session link
    if ('race_session_id' in req.body) {
      // update race_sessions too
      const rsId = req.body.race_session_id;
      if (rsId) {
        pool.query(`UPDATE race_sessions SET telemetry_session_id=$1 WHERE id=$2`, [id, rsId]).catch(() => {});
      }
    }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
    params.push(id);
    const { rows: [row] } = await pool.query(
      `UPDATE telemetry_sessions SET ${fields.join(',')}, updated_at=NOW() WHERE id=$${params.length} RETURNING *`, params
    );
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, data: row });
  } catch (err) { next(err); }
});

// DELETE /api/telemetry/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows: [sess] } = await pool.query(`SELECT file_path FROM telemetry_sessions WHERE id=$1`, [id]);
    await pool.query(`DELETE FROM telemetry_sessions WHERE id=$1`, [id]);
    // Clean up temp file
    if (sess?.file_path && fs.existsSync(sess.file_path)) {
      fs.unlink(sess.file_path, () => {});
    }
    res.json({ success: true });
  } catch (err) { next(err); }
});

// POST /api/telemetry/upload
router.post('/upload', upload.single('file'), async (req, res, next) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded or file type not accepted. Allowed: .xrk .xrz .drk .csv .txt' });

  const filename = req.file.originalname;
  const ext      = path.extname(filename).toLowerCase().replace('.', '');
  const filePath = path.join(UPLOAD_DIR, `${Date.now()}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`);

  // Write to disk (needed for XRK DLL parsing which requires absolute path)
  fs.writeFileSync(filePath, req.file.buffer);

  // Pre-parse metadata from req.body
  const eventId  = req.body.event_id  || null;
  const driverId = req.body.driver_id || null;
  const driveImportId = req.body.drive_import_id ? parseInt(req.body.drive_import_id, 10) : null;

  // Insert pending session
  const { rows: [sess] } = await pool.query(
    `INSERT INTO telemetry_sessions (filename, file_format, file_size, file_path, parse_status, event_id, driver_id, drive_import_id)
     VALUES ($1,$2,$3,$4,'pending',$5,$6,$7) RETURNING id`,
    [filename, ext, req.file.size, filePath, eventId, driverId, driveImportId]
  );
  const sessionId = sess.id;

  // Respond immediately with session ID; parse happens asynchronously
  res.status(202).json({ success: true, session_id: sessionId, status: 'pending' });

  // ── Async parse ────────────────────────────────────────────────────────
  setImmediate(async () => {
    try {
      await pool.query(`UPDATE telemetry_sessions SET parse_status='parsing' WHERE id=$1`, [sessionId]);

      const isTextFormat = ['csv', 'txt'].includes(ext);
      const isBinaryFormat = ['xrk', 'xrz', 'drk'].includes(ext);

      let parsed = null;
      let sampleDataMap = null;

      if (isTextFormat) {
        // CSV/TXT: parse fully in-process
        const content = fs.readFileSync(filePath, 'utf8');
        const result = xrk.parseCSV(content);
        parsed       = result;
        sampleDataMap = result.sampleData;
        // Mark as csv_only
        parsed.session._parse_status = 'csv_only';
      } else if (isBinaryFormat) {
        if (!xrk.dllAvailable()) {
          await pool.query(
            `UPDATE telemetry_sessions SET parse_status='error', parse_error=$1 WHERE id=$2`,
            ['AiM DLL not available. Set AIM_XRK_LIB env var to enable XRK parsing.', sessionId]
          );
          return;
        }
        parsed = await xrk.parseXrk(filePath);
        parsed.session._parse_status = 'parsed';
      } else {
        await pool.query(
          `UPDATE telemetry_sessions SET parse_status='error', parse_error='Unsupported file format' WHERE id=$1`,
          [sessionId]
        );
        return;
      }

      await storeParseResults(sessionId, parsed, sampleDataMap);

      // Override parse_status if CSV
      if (isTextFormat) {
        await pool.query(`UPDATE telemetry_sessions SET parse_status='csv_only' WHERE id=$1`, [sessionId]);
      }

      // Run insights
      await computeInsights(sessionId);

      // Clean up file (CSV — parsed into DB; XRK files kept for on-demand sample fetch)
      if (isTextFormat) {
        fs.unlink(filePath, () => {});
        await pool.query(`UPDATE telemetry_sessions SET file_path=NULL WHERE id=$1`, [sessionId]);
      }

    } catch (err) {
      console.error(`[telemetry] parse error session ${sessionId}:`, err.message);
      await pool.query(
        `UPDATE telemetry_sessions SET parse_status='error', parse_error=$1 WHERE id=$2`,
        [err.message.slice(0, 500), sessionId]
      ).catch(() => {});
    }
  });
});

module.exports = router;
