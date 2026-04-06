require('dotenv').config();
const express = require('express');
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

// Security headers with helmet (CSP)
const helmet = require('helmet');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      scriptSrcAttr: ["'unsafe-inline'"], // Allow inline event handlers (onclick, etc.)
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
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
app.use(express.static(path.join(__dirname, '..')));

// Request logging (only in development)
app.use((req, res, next) => {
  if (constants.LOG_REQUEST_DETAILS) {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  }
  next();
});

// Simple health
app.get('/api/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// Auth routes (public - no authentication required)
const { router: authRouter, requireAuth } = require('./routes/auth');
app.use('/api/auth', authRouter);

// PostgreSQL-specific routes for logistics (boxes, items, box_contents) - PROTECTED
const boxesRouter = require('./routes/boxes');
const boxAssignmentsRouter = require('./routes/box-assignments');
const itemsRouter = require('./routes/items');
const boxContentsRouter = require('./routes/box-contents');
const assetTypesRouter = require('./routes/asset-types');
const importLocalStorageRouter = require('./routes/import-localStorage');
const collectionsRouter = require('./routes/collections');
const shopifyRouter = require('./routes/shopify');
const inventoryRouter = require('./routes/inventory');
const packingRouter = require('./routes/packing');
const whatsappRouter = require('./routes/whatsapp');

app.use('/api/boxes', requireAuth, boxesRouter);
app.use('/api/box-assignments', requireAuth, boxAssignmentsRouter);
app.use('/api/items', requireAuth, itemsRouter);
app.use('/api/box-contents', requireAuth, boxContentsRouter);
app.use('/api/asset-types', requireAuth, assetTypesRouter);
app.use('/api/import-localStorage', requireAuth, importLocalStorageRouter);
app.use('/api/collections', requireAuth, collectionsRouter);
app.use('/api/shopify', requireAuth, shopifyRouter);
app.use('/api/inventory', requireAuth, inventoryRouter);
app.use('/api/packing-lists', requireAuth, packingRouter);
app.use('/api/whatsapp', whatsappRouter); // Webhook must be public, individual routes handle auth

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
    const { kind, id, action, by, eventId, note, tsMs } = req.body || {};
    if (!kind || !id || !action) return res.status(400).json({ ok:false, error:'missing kind/id/action' });
    const entry = { action, by: by||'admin', eventId: eventId||'', note: note||'', tsMs: Number(tsMs||Date.now()) };
    const out = await db.logHistory(kind, id, entry);
    res.json({ ok:true, result: out });
  } catch (err) {
    console.error('POST /api/history error', err);
    res.status(500).json({ ok:false, error: String(err) });
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
    const all = await db.getAll('telemetry_uploads');
    const driverId = req.query.driverId || '';
    const out = driverId ? all.filter(u => u.driverId === driverId) : all;
    res.json({ ok:true, uploads: out });
  } catch (err){
    console.error('GET /api/telemetry/uploads error', err);
    res.status(500).json({ ok:false, error: String(err) });
  }
});

// Get points for a driver/session with optional limit - PROTECTED
app.get('/api/telemetry/points', requireAuth, async (req, res) => {
  try {
    const driverId = req.query.driverId || '';
    const sessionId = req.query.sessionId || '';
    const limit = Math.max(0, parseInt(req.query.limit||'0',10));
    const all = await db.getAll('telemetry_points');
    let pts = all;
    if (driverId) pts = pts.filter(p => p.driverId === driverId);
    if (sessionId) pts = pts.filter(p => p.sessionId === sessionId);
    if (limit && pts.length > limit) pts = pts.slice(0, limit);
    res.json({ ok:true, points: pts });
  } catch (err){
    console.error('GET /api/telemetry/points error', err);
    res.status(500).json({ ok:false, error: String(err) });
  }
});

// ===== GLOBAL ERROR HANDLER (must be last middleware) =====
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  res.status(err.status || 500).json({ 
    success: false, 
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message 
  });
});

// ===== SESSION CLEANUP CRON JOB =====
// Remove expired sessions every hour to prevent database bloat
setInterval(async () => {
  try {
    await db.query('DELETE FROM sessions WHERE expires_at < NOW()');
    if (constants.LOG_REQUEST_DETAILS) {
      console.log('✅ Expired sessions cleaned up');
    }
  } catch (error) {
    console.error('❌ Session cleanup error:', error);
  }
}, constants.SESSION_CLEANUP_INTERVAL_MS);

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
