// routes/drive-import.js
// Google Drive folder watcher — syncs AiM / Race Studio 3 data files into the system
'use strict';

const express      = require('express');
const https        = require('https');
const querystring  = require('querystring');
const crypto       = require('crypto');
const { pool }     = require('../db');

// ── Two routers: public (OAuth callback) + private (everything else) ─────────
const publicRouter  = express.Router();
const privateRouter = express.Router();

const CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI  = process.env.GOOGLE_REDIRECT_URI;
const DRIVE_SCOPE   = 'https://www.googleapis.com/auth/drive.readonly';

// Validate Google Drive folder/file IDs (alphanumeric + hyphens + underscores, 10-60 chars)
const DRIVE_ID_RE = /^[A-Za-z0-9_\-]{10,60}$/;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Lightweight HTTPS request returning { status, data } */
function httpsPost(hostname, path, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = typeof body === 'string' ? body : querystring.stringify(body);
    const req = https.request({
      hostname, path, method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(bodyStr)
      }
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, data: raw }); }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

/** HTTPS GET with Bearer token, returns { status, data } */
function httpsGet(hostname, path, token) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname, path,
      headers: { Authorization: `Bearer ${token}` }
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, data: raw }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

/** Get a valid access token, refreshing if expired */
async function getAccessToken() {
  const { rows } = await pool.query('SELECT * FROM drive_config WHERE id = 1');
  if (!rows.length || !rows[0].refresh_token) {
    throw new Error('NOT_CONNECTED');
  }
  const cfg = rows[0];

  // Return cached token if still valid (5-minute buffer)
  if (cfg.access_token && cfg.token_expiry &&
      new Date(cfg.token_expiry) > new Date(Date.now() + 5 * 60_000)) {
    return cfg.access_token;
  }

  // Exchange refresh token
  const result = await httpsPost('oauth2.googleapis.com', '/token', {
    client_id:     CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: cfg.refresh_token,
    grant_type:    'refresh_token'
  });

  if (result.status !== 200) {
    throw new Error(`Token refresh failed: ${JSON.stringify(result.data)}`);
  }

  const expiry = new Date(Date.now() + result.data.expires_in * 1000);
  await pool.query(
    `UPDATE drive_config SET access_token = $1, token_expiry = $2, updated_at = NOW() WHERE id = 1`,
    [result.data.access_token, expiry]
  );
  return result.data.access_token;
}

/** List all files in a Drive folder (handles pagination) */
async function listDriveFiles(folderId, accessToken) {
  if (!DRIVE_ID_RE.test(folderId)) throw new Error('Invalid folder ID format');

  let allFiles = [];
  let pageToken = null;

  do {
    const params = {
      q:       `'${folderId}' in parents and trashed = false`,
      fields:  'nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink)',
      orderBy: 'modifiedTime desc',
      pageSize: 1000
    };
    if (pageToken) params.pageToken = pageToken;

    const qs     = querystring.stringify(params);
    const result = await httpsGet('www.googleapis.com', `/drive/v3/files?${qs}`, accessToken);

    if (result.status !== 200) {
      throw new Error(`Drive API error ${result.status}: ${JSON.stringify(result.data)}`);
    }

    allFiles = allFiles.concat(result.data.files || []);
    pageToken = result.data.nextPageToken;
  } while (pageToken);

  return allFiles;
}

/** Download file text content from Drive (for small CSV/TXT files only) */
async function downloadFileText(fileId, accessToken) {
  if (!DRIVE_ID_RE.test(fileId)) throw new Error('Invalid file ID format');
  const result = await httpsGet(
    'www.googleapis.com',
    `/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    accessToken
  );
  return typeof result.data === 'string' ? result.data : JSON.stringify(result.data);
}

/** Basic CSV parser — returns { headers, rowCount, preview } */
function parseCSV(content) {
  // Handle Windows/Mac line endings
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (!lines.length) return { headers: [], rowCount: 0, preview: [] };

  function parseLine(line) {
    const out = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else { inQ = !inQ; }
      } else if (ch === ',' && !inQ) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  }

  const headers  = parseLine(lines[0]);
  const rowCount = lines.length - 1;
  // Limit preview to first 5 data rows, max 20 columns
  const preview  = lines.slice(1, 6).map(l => parseLine(l).slice(0, 20));

  return { headers: headers.slice(0, 50), rowCount, preview };
}

/** Find nearest event by date, within 30 days. Returns event_id or null. */
async function findNearestEvent(fileDateStr) {
  if (!fileDateStr) return null;
  const { rows } = await pool.query(`
    SELECT id,
           ABS(EXTRACT(EPOCH FROM (start_date::date - $1::date))) AS diff_sec
    FROM   events
    WHERE  start_date IS NOT NULL
    ORDER  BY diff_sec ASC
    LIMIT  1
  `, [fileDateStr]);

  if (!rows.length) return null;
  const diffDays = rows[0].diff_sec / 86400;
  return diffDays <= 30 ? rows[0].id : null;
}

/** Generate HMAC-signed OAuth state to prevent CSRF */
function makeState() {
  const ts    = Date.now().toString();
  const nonce = crypto.randomBytes(8).toString('hex');
  const raw   = `${ts}:${nonce}`;
  const sig   = crypto.createHmac('sha256', CLIENT_SECRET || 'fallback').update(raw).digest('hex');
  return Buffer.from(`${raw}:${sig}`).toString('base64url');
}

/** Verify state, returns true if valid and < 10 minutes old */
function verifyState(state) {
  try {
    const decoded = Buffer.from(state, 'base64url').toString();
    const parts   = decoded.split(':');
    if (parts.length !== 3) return false;
    const [ts, nonce, sig] = parts;
    const raw       = `${ts}:${nonce}`;
    const expected  = crypto.createHmac('sha256', CLIENT_SECRET || 'fallback').update(raw).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
    return Date.now() - parseInt(ts, 10) < 10 * 60 * 1000; // 10 min window
  } catch { return false; }
}

// ── PUBLIC ROUTES (no auth — Google redirects here during OAuth) ─────────────

/** GET /api/drive-import/callback — OAuth2 callback from Google */
publicRouter.get('/callback', async (req, res, next) => {
  try {
    const { code, error, state } = req.query;

    if (error) {
      return res.redirect(`/drive-import.html?error=${encodeURIComponent(error)}`);
    }
    if (!code || typeof code !== 'string') {
      return res.redirect('/drive-import.html?error=missing_code');
    }
    // CSRF check
    if (!state || !verifyState(state)) {
      return res.redirect('/drive-import.html?error=invalid_state');
    }

    const result = await httpsPost('oauth2.googleapis.com', '/token', {
      code,
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri:  REDIRECT_URI,
      grant_type:    'authorization_code'
    });

    if (result.status !== 200) {
      const msg = result.data?.error_description || result.data?.error || 'token_exchange_failed';
      return res.redirect(`/drive-import.html?error=${encodeURIComponent(msg)}`);
    }

    const { access_token, refresh_token, expires_in } = result.data;
    const expiry = new Date(Date.now() + (expires_in || 3600) * 1000);

    await pool.query(
      `INSERT INTO drive_config (id, access_token, refresh_token, token_expiry, updated_at)
       VALUES (1, $1, $2, $3, NOW())
       ON CONFLICT (id) DO UPDATE SET
         access_token  = $1,
         refresh_token = COALESCE($2, drive_config.refresh_token),
         token_expiry  = $3,
         updated_at    = NOW()`,
      [access_token, refresh_token || null, expiry]
    );

    res.redirect('/drive-import.html?connected=1');
  } catch (err) { next(err); }
});

// ── PRIVATE ROUTES (require auth — mounted with requireAuth in index.js) ──────

/** GET /api/drive-import/config */
privateRouter.get('/config', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, folder_id, folder_name, last_sync_at, updated_at,
             (refresh_token IS NOT NULL AND refresh_token <> '') AS connected
      FROM drive_config WHERE id = 1
    `);
    res.json({ success: true, data: rows[0] || {} });
  } catch (err) { next(err); }
});

/** PUT /api/drive-import/config — save folder ID / name */
privateRouter.put('/config', async (req, res, next) => {
  try {
    const folder_id   = req.body.folder_id   ? String(req.body.folder_id).trim()   : null;
    const folder_name = req.body.folder_name ? String(req.body.folder_name).trim() : null;

    if (folder_id && !DRIVE_ID_RE.test(folder_id)) {
      return res.status(400).json({ error: 'Invalid folder_id format' });
    }

    await pool.query(
      `INSERT INTO drive_config (id, folder_id, folder_name, updated_at)
       VALUES (1, $1, $2, NOW())
       ON CONFLICT (id) DO UPDATE SET folder_id = $1, folder_name = $2, updated_at = NOW()`,
      [folder_id, folder_name]
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

/** GET /api/drive-import/auth-url — generate Google OAuth URL */
privateRouter.get('/auth-url', (req, res) => {
  if (!CLIENT_ID || !REDIRECT_URI) {
    return res.status(503).json({
      error: 'Google OAuth not configured — set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI'
    });
  }
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + querystring.stringify({
    client_id:     CLIENT_ID,
    redirect_uri:  REDIRECT_URI,
    response_type: 'code',
    scope:         DRIVE_SCOPE,
    access_type:   'offline',
    prompt:        'consent',
    state:         makeState()
  });
  res.json({ url });
});

/** POST /api/drive-import/disconnect */
privateRouter.post('/disconnect', async (req, res, next) => {
  try {
    await pool.query(
      `UPDATE drive_config
       SET access_token = NULL, refresh_token = NULL, token_expiry = NULL, updated_at = NOW()
       WHERE id = 1`
    );
    res.json({ success: true });
  } catch (err) { next(err); }
});

/** POST /api/drive-import/sync — fetch all files from configured folder */
privateRouter.post('/sync', async (req, res, next) => {
  try {
    const { rows: cfgRows } = await pool.query('SELECT * FROM drive_config WHERE id = 1');
    const cfg = cfgRows[0];

    if (!cfg?.refresh_token) {
      return res.status(400).json({ error: 'Not connected to Google Drive' });
    }
    if (!cfg.folder_id) {
      return res.status(400).json({ error: 'No Drive folder configured' });
    }

    const accessToken = await getAccessToken();
    const files       = await listDriveFiles(cfg.folder_id, accessToken);

    let newCount = 0, updatedCount = 0, errorCount = 0;

    for (const file of files) {
      try {
        const ext      = (file.name.split('.').pop() || '').toLowerCase();
        const fileType = ext || 'unknown';
        const eventId  = await findNearestEvent(file.modifiedTime);

        // Check if we've already seen this file
        const { rows: existing } = await pool.query(
          'SELECT id, status FROM drive_imports WHERE drive_file_id = $1',
          [file.id]
        );

        if (existing.length) {
          // Only refresh metadata for 'new' (unreviewed) files
          if (existing[0].status === 'new') {
            await pool.query(
              `UPDATE drive_imports SET
                 filename         = $1,
                 file_type        = $2,
                 mime_type        = $3,
                 drive_link       = $4,
                 file_size        = $5,
                 file_modified_at = $6,
                 event_id         = COALESCE(event_id, $7)
               WHERE drive_file_id = $8`,
              [
                file.name, fileType, file.mimeType, file.webViewLink,
                file.size ? parseInt(file.size, 10) : null,
                file.modifiedTime, eventId, file.id
              ]
            );
            updatedCount++;
          }
          continue;
        }

        // ── New file ───────────────────────────────────────────────────────
        let csvHeaders   = null;
        let csvRowCount  = null;
        let csvPreview   = null;

        // Download + parse small CSV/TXT exports from Race Studio 3
        const isText    = ['csv', 'txt'].includes(ext);
        const isSmall   = !file.size || parseInt(file.size, 10) < 10 * 1024 * 1024; // < 10 MB
        if (isText && isSmall) {
          try {
            const content = await downloadFileText(file.id, accessToken);
            const parsed  = parseCSV(content);
            csvHeaders    = JSON.stringify(parsed.headers);
            csvRowCount   = parsed.rowCount;
            csvPreview    = JSON.stringify(parsed.preview);
          } catch (_) { /* non-fatal — store metadata only */ }
        }

        await pool.query(
          `INSERT INTO drive_imports
             (drive_file_id, filename, file_type, mime_type, drive_link, file_size,
              file_modified_at, event_id, status, csv_headers, csv_row_count, csv_preview)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'new',$9,$10,$11)`,
          [
            file.id, file.name, fileType, file.mimeType, file.webViewLink,
            file.size ? parseInt(file.size, 10) : null,
            file.modifiedTime, eventId,
            csvHeaders, csvRowCount, csvPreview
          ]
        );
        newCount++;
      } catch (fileErr) {
        console.error(`drive-import: error processing ${file.name}:`, fileErr.message);
        errorCount++;
      }
    }

    await pool.query(
      'UPDATE drive_config SET last_sync_at = NOW(), updated_at = NOW() WHERE id = 1'
    );

    res.json({
      success: true,
      total:   files.length,
      new:     newCount,
      updated: updatedCount,
      errors:  errorCount
    });
  } catch (err) {
    if (err.message === 'NOT_CONNECTED') {
      return res.status(400).json({ error: 'Not connected to Google Drive' });
    }
    next(err);
  }
});

/** GET /api/drive-import/files — list imported file records */
privateRouter.get('/files', async (req, res, next) => {
  try {
    const { status, event_id, file_type } = req.query;
    const limit = Math.min(parseInt(req.query.limit, 10) || 500, 1000);

    const conditions = [];
    const params     = [];

    if (status)    { params.push(status);    conditions.push(`di.status    = $${params.length}`); }
    if (event_id)  { params.push(event_id);  conditions.push(`di.event_id  = $${params.length}`); }
    if (file_type) { params.push(file_type); conditions.push(`di.file_type = $${params.length}`); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    params.push(limit);

    const { rows } = await pool.query(`
      SELECT
        di.id, di.drive_file_id, di.filename, di.file_type, di.mime_type,
        di.drive_link, di.file_size, di.file_modified_at, di.imported_at,
        di.event_id, di.status, di.notes, di.csv_headers, di.csv_row_count, di.csv_preview,
        e.name       AS event_name,
        e.start_date AS event_date
      FROM drive_imports di
      LEFT JOIN events e ON e.id = di.event_id
      ${where}
      ORDER BY di.file_modified_at DESC NULLS LAST
      LIMIT $${params.length}
    `, params);

    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

/** GET /api/drive-import/events — lightweight event list for the link dropdown */
privateRouter.get('/events', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, start_date FROM events ORDER BY start_date DESC NULLS LAST LIMIT 200`
    );
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
});

/** PUT /api/drive-import/files/:id — update status / event link / notes */
privateRouter.put('/files/:id', async (req, res, next) => {
  try {
    const id     = parseInt(req.params.id, 10);
    const fields = [];
    const params = [];

    if ('event_id' in req.body) { params.push(req.body.event_id ?? null); fields.push(`event_id = $${params.length}`); }
    if ('status'   in req.body) { params.push(req.body.status);           fields.push(`status   = $${params.length}`); }
    if ('notes'    in req.body) { params.push(req.body.notes);            fields.push(`notes    = $${params.length}`); }

    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });

    params.push(id);
    const { rows } = await pool.query(
      `UPDATE drive_imports SET ${fields.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );

    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { next(err); }
});

/** DELETE /api/drive-import/files/:id — remove a single import record */
privateRouter.delete('/files/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    await pool.query('DELETE FROM drive_imports WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = { publicRouter, privateRouter };
