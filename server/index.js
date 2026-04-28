require('dotenv').config();
const express = require('express');
const compression = require('compression');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const os = require('os');
const db = require('./db');
const constants = require('./constants');

// ===== ENVIRONMENT VARIABLE VALIDATION =====
if (!process.env.DATABASE_URL) {
  console.error('❌ FATAL: DATABASE_URL environment variable is required');
  process.exit(1);
}

const app = express();

// Gzip all API responses – cuts JSON payload 60-80%
app.use(compression());

// Security headers with helmet (CSP)
const helmet = require('helmet');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://esm.sh"],
      scriptSrcAttr: ["'unsafe-inline'"], // Allow inline event handlers (onclick, etc.)
      scriptSrcElem: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://esm.sh"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com", "https://esm.sh"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://esm.sh", "https://live.apex-timing.com", "wss://live.apex-timing.com", "https://nominatim.openstreetmap.org", "https://api.open-meteo.com", "https://api.openweathermap.org", "https://api.weatherapi.com"],
      fontSrc: ["'self'", "data:", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: []
    }
  }
}));

// CORS configuration - allow requests from your domain
const allowedOrigins = [
  'https://kokororacing.co.za',
  'https://www.kokororacing.co.za',
  'https://api.kokororacing.co.za',
  'https://raceteamsoftware.onrender.com', // Keep for testing
  'http://localhost:3000', // Local development
  'http://127.0.0.1:3000'
];

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`⚠️ CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Request size limits to prevent DOS attacks
app.use(bodyParser.json({ limit: constants.REQUEST_SIZE_LIMIT }));
app.use(bodyParser.urlencoded({ extended: true, limit: constants.REQUEST_SIZE_LIMIT }))

// Serve static files from parent directory (HTML, CSS, JS files)
// HTML + JS files: no-store so browsers never cache these
app.use(express.static(path.join(__dirname, '..'), {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html') || filePath.endsWith('.js')) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// Request logging (only in development)
app.use((req, res, next) => {
  if (constants.LOG_REQUEST_DETAILS) {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  }
  next();
});

// Simple health
app.get('/api/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// ── Auto-run project-module migrations on startup (all use IF NOT EXISTS — safe to re-run) ──
(async () => {
  const fs   = require('fs');
  const path = require('path');
  const pending = ['071_projects_module_phase2.sql', '072_project_baselines.sql'];
  for (const f of pending) {
    const fp = path.join(__dirname, 'migrations', f);
    if (!fs.existsSync(fp)) continue;
    try {
      await db.pool.query(fs.readFileSync(fp, 'utf8'));
      console.log(`✅ Migration applied: ${f}`);
    } catch (e) {
      console.warn(`⚠️ Migration ${f}: ${e.message}`);
    }
  }
})();

// Auth routes (public - no authentication required)
const { router: authRouter, requireAuth } = require('./routes/auth');
app.use('/api/auth', authRouter);

// Admin: run pending migrations (requires auth + admin role)
app.post('/api/admin/run-migrations', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const fs = require('fs');
  const path = require('path');
  const { pool: dbPool } = require('./db');
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = [
    '057_users_password_hash.sql','058_event_notes_extras.sql','059_finance_module.sql',
    '060_performance_module.sql','061_reliability_module.sql','062_procurement_module.sql',
    '063_driver_module.sql','064_compliance_module.sql','065_executive_module.sql',
    '066_load_plan_assets.sql','phase1_new_modules.sql'
  ];
  const results = [];
  for (const f of files) {
    const fp = path.join(migrationsDir, f);
    if (!fs.existsSync(fp)) { results.push({ file: f, status: 'not found' }); continue; }
    try {
      await dbPool.query(fs.readFileSync(fp, 'utf8'));
      results.push({ file: f, status: 'ok' });
    } catch (e) {
      results.push({ file: f, status: 'error', error: e.message });
    }
  }
  res.json({ results });
});

// PostgreSQL-specific routes for logistics (boxes, items, box_contents) - PROTECTED
const boxesRouter = require('./routes/boxes');
const boxAssignmentsRouter = require('./routes/box-assignments');
const itemsRouter = require('./routes/items');
const boxContentsRouter = require('./routes/box-contents');
const assetTypesRouter = require('./routes/asset-types');
const trucksRouter = require('./routes/trucks');
const loadPlansRouter = require('./routes/load-plans');
const inventoryCategoriesRouter = require('./routes/inventory-categories');
const suppliersRouter = require('./routes/suppliers');
const importLocalStorageRouter = require('./routes/import-localStorage');
const collectionsRouter = require('./routes/collections');
const shopifyRouter = require('./routes/shopify');
const shopifyOAuthRouter = require('./routes/shopify-oauth');
const inventoryRouter = require('./routes/inventory');
const inventoryVariantsRouter = require('./routes/inventory-variants');
const dashboardRouter = require('./routes/dashboard');
const packingRouter = require('./routes/packing');
const scanRouter = require('./routes/scan');
const whatsappRouter = require('./routes/whatsapp');
const staffAssignmentsRouter = require('./routes/staff-assignments');
const apexProxyRouter = require('./routes/apex-proxy');
const driverAssignmentsRouter = require('./routes/driver-assignments');
const lookupRouter = require('./routes/lookup');

app.use('/api/boxes', requireAuth, boxesRouter);
app.use('/api/box-assignments', requireAuth, boxAssignmentsRouter);
app.use('/api/items', requireAuth, itemsRouter);
app.use('/api/box-contents', requireAuth, boxContentsRouter);
app.use('/api/asset-types', requireAuth, assetTypesRouter);
app.use('/api/trucks', requireAuth, trucksRouter);
app.use('/api/load-plans', requireAuth, loadPlansRouter);
app.use('/api/inventory-categories', requireAuth, inventoryCategoriesRouter);
app.use('/api/suppliers', requireAuth, suppliersRouter);
app.use('/api/import-localStorage', requireAuth, importLocalStorageRouter);
app.use('/api/collections', requireAuth, collectionsRouter);
// Shopify OAuth endpoints — public (Shopify redirects here during the OAuth handshake)
app.use('/api/shopify', shopifyOAuthRouter);
// Shopify protected endpoints — require JWT
app.use('/api/shopify', requireAuth, shopifyRouter);
app.use('/api/inventory', requireAuth, inventoryRouter);
app.use('/api/inventory-variants', requireAuth, inventoryVariantsRouter);
app.use('/api/dashboard', requireAuth, dashboardRouter);
app.use('/api/packing-lists', requireAuth, packingRouter);
app.use('/api/scan', requireAuth, scanRouter);
app.use('/api/whatsapp', whatsappRouter);
app.use('/api/apex-proxy', requireAuth, apexProxyRouter);
app.use('/api/staff-assignments', requireAuth, staffAssignmentsRouter);
app.use('/api/driver-assignments', requireAuth, driverAssignmentsRouter);
app.use('/api/lookup', requireAuth, lookupRouter);

const assetCheckoutsRouter  = require('./routes/asset-checkouts');
const activityLogRouter      = require('./routes/activity-log');
const raceFleetRouter        = require('./routes/race-fleet');
const postEventNotesRouter   = require('./routes/post-event-notes');
const mileageLogRouter       = require('./routes/mileage-log');
const projectPlansRouter     = require('./routes/project-plans');
const raceSessionsRouter     = require('./routes/race-sessions');
const incidentsRouter        = require('./routes/incidents');
const raceResultsRouter      = require('./routes/race-results');
const notesRouter            = require('./routes/notes');

app.use('/api/asset-checkouts',  requireAuth, assetCheckoutsRouter);
app.use('/api/activity-log',     requireAuth, activityLogRouter);
app.use('/api/race-fleet',       requireAuth, raceFleetRouter);
app.use('/api/post-event-notes', requireAuth, postEventNotesRouter);
app.use('/api/mileage-log',      requireAuth, mileageLogRouter);
app.use('/api/project-plans',    requireAuth, projectPlansRouter);
app.use('/api/race-sessions',    requireAuth, raceSessionsRouter);
app.use('/api/incidents',        requireAuth, incidentsRouter);
app.use('/api/race-results',     requireAuth, raceResultsRouter);
app.use('/api/notes',            requireAuth, notesRouter);

// Phase 2 — Finance
app.use('/api/fin-budgets',  requireAuth, require('./routes/fin-budgets'));
app.use('/api/fin-payments', requireAuth, require('./routes/fin-payments'));

// Event Notes extras — comments + links per task
app.use('/api/task-comments', requireAuth, require('./routes/task-comments'));
app.use('/api/task-links',    requireAuth, require('./routes/task-links'));

// Phase 1 — Sporting
// Public .ics feed — no auth so Apple/Google Calendar can subscribe without a token
const sportingCalRoutes = require('./routes/sporting-calendar');
app.get('/api/sporting-calendar.ics', sportingCalRoutes.handleICS);
app.use('/api/sporting-calendar', requireAuth, sportingCalRoutes);
app.use('/api/entries',           requireAuth, require('./routes/entries'));
app.use('/api/regulations',       requireAuth, require('./routes/regulations'));
app.use('/api/penalties',         requireAuth, require('./routes/penalties'));
app.use('/api/competitor-intel',  requireAuth, require('./routes/competitor-intel'));
// Phase 1 — Technical
app.use('/api/cars',              requireAuth, require('./routes/cars'));
app.use('/api/components',        requireAuth, require('./routes/components'));
app.use('/api/allocations',       requireAuth, require('./routes/allocations'));
app.use('/api/setups',            requireAuth, require('./routes/setups'));
app.use('/api/homologation',      requireAuth, require('./routes/homologation'));
app.use('/api/session-changes',   requireAuth, require('./routes/session-changes'));
app.use('/api/tech-failures',     requireAuth, require('./routes/tech-failures'));
app.use('/api/engineering-data',  requireAuth, require('./routes/engineering-data'));
// Phase 1 — Build
app.use('/api/build-status',      requireAuth, require('./routes/build-status'));
app.use('/api/build-sheets',      requireAuth, require('./routes/build-sheets'));
app.use('/api/assembly',          requireAuth, require('./routes/assembly'));
app.use('/api/build-qc',          requireAuth, require('./routes/build-qc'));
app.use('/api/repairs',           requireAuth, require('./routes/repairs'));
app.use('/api/rebuilds',          requireAuth, require('./routes/rebuilds'));
app.use('/api/consumables',       requireAuth, require('./routes/consumables'));
app.use('/api/garage-prep',       requireAuth, require('./routes/garage-prep'));
// Phase 1 — HR
app.use('/api/staff',             requireAuth, require('./routes/staff'));
app.use('/api/rotas',             requireAuth, require('./routes/rotas'));
app.use('/api/leave',             requireAuth, require('./routes/leave'));
app.use('/api/training',          requireAuth, require('./routes/training'));
app.use('/api/recruitment',       requireAuth, require('./routes/recruitment'));
app.use('/api/welfare',           requireAuth, require('./routes/welfare'));
app.use('/api/medical',           requireAuth, require('./routes/medical'));
app.use('/api/staff-reviews',     requireAuth, require('./routes/staff-reviews'));

// Phase 3 — Performance
app.use('/api/run-plans',           requireAuth, require('./routes/run-plans'));
app.use('/api/tyre-register',       requireAuth, require('./routes/tyre-register'));
app.use('/api/benchmarking',        requireAuth, require('./routes/benchmarking'));
app.use('/api/driver-trends',       requireAuth, require('./routes/driver-trends'));
app.use('/api/correlation',         requireAuth, require('./routes/correlation'));
app.use('/api/debriefs',            requireAuth, require('./routes/debriefs'));
app.use('/api/engineering-notes',   requireAuth, require('./routes/engineering-notes'));
// Phase 3 — Reliability
app.use('/api/reliability-incidents', requireAuth, require('./routes/reliability-incidents'));
app.use('/api/rca',                   requireAuth, require('./routes/rca'));
app.use('/api/corrective-actions',    requireAuth, require('./routes/corrective-actions'));
app.use('/api/preventive-maintenance',requireAuth, require('./routes/preventive-maintenance'));
app.use('/api/risk-map',             requireAuth, require('./routes/risk-map'));
app.use('/api/review-board',         requireAuth, require('./routes/review-board'));
// Phase 3 — Procurement
app.use('/api/proc-suppliers',       requireAuth, require('./routes/proc-suppliers'));
app.use('/api/rfqs',                 requireAuth, require('./routes/rfqs'));
app.use('/api/quotes',               requireAuth, require('./routes/quotes'));
app.use('/api/proc-contracts',       requireAuth, require('./routes/contracts'));
app.use('/api/slas',                 requireAuth, require('./routes/slas'));
app.use('/api/lead-times',          requireAuth, require('./routes/lead-times'));
app.use('/api/emergency-orders',     requireAuth, require('./routes/emergency-orders'));
app.use('/api/supplier-issues',      requireAuth, require('./routes/supplier-issues'));
// Phase 3 — Driver
app.use('/api/driver-calendar',      requireAuth, require('./routes/driver-calendar'));
app.use('/api/driver-contracts',     requireAuth, require('./routes/driver-contracts'));
app.use('/api/simulator-sessions',   requireAuth, require('./routes/simulator-sessions'));
app.use('/api/driver-fitness',       requireAuth, require('./routes/driver-fitness'));
app.use('/api/driver-debriefs',      requireAuth, require('./routes/driver-debriefs'));
app.use('/api/driver-media',         requireAuth, require('./routes/driver-media'));
app.use('/api/driver-licences',      requireAuth, require('./routes/driver-licences'));
app.use('/api/driver-preferences',   requireAuth, require('./routes/driver-preferences'));
app.use('/api/junior-programme',     requireAuth, require('./routes/junior-programme'));
// Phase 3 — Compliance
app.use('/api/policies',             requireAuth, require('./routes/policies'));
app.use('/api/legal-contracts',      requireAuth, require('./routes/legal-contracts'));
app.use('/api/insurance',            requireAuth, require('./routes/insurance'));
app.use('/api/legal-matters',        requireAuth, require('./routes/legal-matters'));
app.use('/api/data-protection',      requireAuth, require('./routes/data-protection'));
app.use('/api/health-safety',        requireAuth, require('./routes/health-safety'));
app.use('/api/compliance-risks',     requireAuth, require('./routes/compliance-risks'));
app.use('/api/crisis-management',    requireAuth, require('./routes/crisis-management'));
// Phase 3 — Executive
app.use('/api/approvals',            requireAuth, require('./routes/approvals'));
app.use('/api/exec-actions',         requireAuth, require('./routes/exec-actions'));
app.use('/api/decisions',            requireAuth, require('./routes/decisions'));
app.use('/api/announcements',        requireAuth, require('./routes/announcements'));
app.use('/api/strategic-objectives', requireAuth, require('./routes/strategic-objectives'));
app.use('/api/board-reports',        requireAuth, require('./routes/board-reports'));
app.use('/api/doc-control',          requireAuth, require('./routes/doc-control'));
app.use('/api/kpi-metrics',          requireAuth, require('./routes/kpi-metrics'));

// Notifications — stock alerts, email dispatch - PROTECTED
app.use('/api/notifications', requireAuth, require('./routes/notifications'));

// Get settings (read-only endpoint) - PROTECTED
app.get('/api/settings', requireAuth, async (req, res) => {
  try {
    const settings = await db.getSettings();
    res.json({ ok: true, settings });
  } catch (err) {
    console.error('GET /api/settings error', err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// Save settings - PROTECTED
app.post('/api/settings', requireAuth, async (req, res) => {
  try {
    const patch = req.body;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      return res.status(400).json({ ok: false, error: 'Body must be a JSON object' });
    }
    const saved = await db.saveSettings(patch);
    res.json({ ok: true, settings: saved });
  } catch (err) {
    console.error('POST /api/settings error', err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// Sync endpoints for core collections: events, tasks, inventory, runbooks - PROTECTED
app.get('/api/:collection', requireAuth, async (req, res) => {
  const { collection } = req.params;
  try {
    const rows = await db.getAll(collection);
    res.json({ ok: true, collection, items: rows });
  } catch (err) {
    console.error('GET /api/:collection error', err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

app.post('/api/:collection/sync', requireAuth, async (req, res) => {
  const { collection } = req.params;
  const { items, since } = req.body || {};
  try {
    // naive upsert: replace existing by id or insert
    const out = await db.upsertMany(collection, items || []);
    res.json({ ok: true, collection, upserted: out.length });
  } catch (err) {
    console.error('POST /api/:collection/sync error', err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// Create one item with a sequential unique identifier - PROTECTED
app.post('/api/:collection/create', requireAuth, async (req, res) => {
  const { collection } = req.params;
  const payload = req.body || {};
  try {
    const created = await db.createOne(collection, payload);
    res.json({ ok: true, collection, item: created });
  } catch (err) {
    console.error('POST /api/:collection/create error', err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// Lifecycle history logging for inventory/assets/etc. - PROTECTED
app.post('/api/history', requireAuth, async (req, res) => {
  try {
    const { kind, id, action, by, note, tsMs, from_truck_id, to_truck_id, previous_status, new_status } = req.body || {};
    if (!kind || !id || !action) return res.status(400).json({ ok:false, error:'missing kind/id/action' });
    const entry = { action, by: by||null, note: note||'', tsMs: Number(tsMs||Date.now()), from_truck_id: from_truck_id||null, to_truck_id: to_truck_id||null, previous_status: previous_status||null, new_status: new_status||null };
    const out = await db.logHistory(kind, id, entry);
    res.json({ ok:true, result: out });
  } catch (err) {
    console.error('POST /api/history error', err);
    res.status(500).json({ ok:false, error: String(err) });
  }
});

app.get('/api/history/boxes/:id', requireAuth, async (req, res) => {
  try {
    const rows = await db.getBoxHistory(req.params.id);
    res.json({ ok: true, history: rows });
  } catch (err) {
    console.error('GET /api/history/boxes error', err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// ------------------------------------
// Telemetry endpoints (prototype) - PROTECTED
// Store uploads and points in generic collections tables for portability
// Collections used: 'telemetry_uploads' and 'telemetry_points'
// ------------------------------------

// Upload telemetry: { driverId, sessionId, sessionName, tags:[], points:[{ id, uploadId, driverId, sessionId, tsMs, rpm, speed, throttle, brake, gear }] }
app.post('/api/telemetry/upload', requireAuth, async (req, res) => {
  try {
    const payload = req.body || {};
    const driverId = payload.driverId || '';
    const sessionId = payload.sessionId || ('sess_' + Date.now().toString(36));
    const uploadId = payload.uploadId || ('tele_' + Date.now().toString(36));
    const uploadedTs = Date.now();
    const sessionName = payload.sessionName || '';
    const tags = Array.isArray(payload.tags) ? payload.tags : [];
    const points = Array.isArray(payload.points) ? payload.points : [];

    const uploadRec = [{ id: uploadId, driverId, sessionId, sessionName, uploadedTs, tags, pointsCount: points.length }];
    await db.upsertMany('telemetry_uploads', uploadRec);

    // Add uploadId/driverId/sessionId to each point and upsert in batches
    const pts = points.map(p => ({
      id: p.id || (uploadId + '_' + Math.random().toString(36).slice(2,8)),
      uploadId,
      driverId,
      sessionId,
      tsMs: Number(p.tsMs||p.ts||p.timeMs||0),
      rpm: Number(p.rpm||0),
      speed: Number(p.speed||0),
      throttle: Number(p.throttle||0),
      brake: Number(p.brake||0),
      gear: Number(p.gear||0)
    }));
    if (pts.length) await db.upsertMany('telemetry_points', pts);

    res.json({ ok: true, uploadId, pointsUpserted: pts.length });
  } catch (err){
    console.error('POST /api/telemetry/upload error', err);
    res.status(500).json({ ok:false, error: String(err) });
  }
});

// List uploads (optionally filtered by driverId) - PROTECTED
app.get('/api/telemetry/uploads', requireAuth, async (req, res) => {
  try {
    const driverId = (req.query.driverId || '').trim();
    let sql = 'SELECT * FROM telemetry_uploads';
    const params = [];
    if (driverId) { sql += ' WHERE "driverId" = $1'; params.push(driverId); }
    sql += ' ORDER BY "uploadedTs" DESC LIMIT 500';
    const result = await db.query(sql, params);
    res.json({ ok:true, uploads: result.rows });
  } catch (err){
    console.error('GET /api/telemetry/uploads error', err);
    res.status(500).json({ ok:false, error: String(err) });
  }
});

// Get points for a driver/session with optional limit - PROTECTED
app.get('/api/telemetry/points', requireAuth, async (req, res) => {
  try {
    const driverId  = (req.query.driverId  || '').trim();
    const sessionId = (req.query.sessionId || '').trim();
    const limit = Math.min(Math.max(1, parseInt(req.query.limit || '1000', 10)), 10000);
    const conditions = [];
    const params = [];
    if (driverId)  { conditions.push(`"driverId" = $${params.length+1}`);  params.push(driverId); }
    if (sessionId) { conditions.push(`"sessionId" = $${params.length+1}`); params.push(sessionId); }
    let sql = 'SELECT * FROM telemetry_points';
    if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
    sql += ` ORDER BY "tsMs" ASC LIMIT ${limit}`;
    const result = await db.query(sql, params);
    res.json({ ok:true, points: result.rows });
  } catch (err){
    console.error('GET /api/telemetry/points error', err);
    res.status(500).json({ ok:false, error: String(err) });
  }
});

// ===== GLOBAL ERROR HANDLER (must be last middleware) =====
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err.message, err.stack);
  res.status(err.status || 500).json({ 
    success: false, 
    error: err.message  // always return real message so client can show it
  });
});

// ===== SESSION CLEANUP CRON JOB =====
// Remove expired sessions every hour to prevent database bloat
// Also run immediately on startup to clean any accumulated stale sessions
async function cleanExpiredSessions() {
  try {
    const result = await db.query('DELETE FROM sessions WHERE expires_at < NOW()');
    if (constants.LOG_REQUEST_DETAILS && result.rowCount > 0) {
      console.log(`✅ Cleaned ${result.rowCount} expired session(s)`);
    }
  } catch (error) {
    console.error('❌ Session cleanup error:', error);
  }
}

cleanExpiredSessions(); // Run once on startup
setInterval(cleanExpiredSessions, constants.SESSION_CLEANUP_INTERVAL_MS);

// Helper to get network IP addresses
function getNetworkAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

// Start server
const port = Number(process.env.PORT || constants.DEFAULT_PORT);
app.listen(port, '0.0.0.0', () => {
  const networkIPs = getNetworkAddresses();
  const networkIP = networkIPs.length > 0 ? networkIPs[0] : 'N/A';
  
  console.log(`\n🚀 Race Team API Server`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📡 Server running on port: ${port}`);
  console.log(`🏠 Local: http://localhost:${port}`);
  console.log(`🌐 Network: http://${networkIP}:${port}`);
  console.log(`🏥 Health check: http://${networkIP}:${port}/api/health`);
  console.log(`📦 Boxes API: http://${networkIP}:${port}/api/boxes`);
  console.log(`🔧 Items API: http://${networkIP}:${port}/api/items`);
  console.log(`📋 Contents API: http://${networkIP}:${port}/api/box-contents`);
  console.log(`🔒 Security: Helmet CSP enabled`);
  console.log(`⏰ Session cleanup: Every ${constants.SESSION_CLEANUP_INTERVAL_MS / 60000} minutes`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing server...');
  if (db.pool && db.pool.end) await db.pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\nSIGINT received, closing server...');
  if (db.pool && db.pool.end) await db.pool.end();
  process.exit(0);
});
