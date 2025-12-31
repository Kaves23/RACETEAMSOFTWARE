const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Simple health
app.get('/api/health', (req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// Get settings (read-only endpoint)
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await db.getSettings();
    res.json({ ok: true, settings });
  } catch (err) {
    console.error('GET /api/settings error', err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

// Sync endpoints for core collections: events, tasks, inventory, runbooks
app.get('/api/:collection', async (req, res) => {
  const { collection } = req.params;
  try {
    const rows = await db.getAll(collection);
    res.json({ ok: true, collection, items: rows });
  } catch (err) {
    console.error('GET /api/:collection error', err);
    res.status(500).json({ ok: false, error: String(err) });
  }
});

app.post('/api/:collection/sync', async (req, res) => {
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

// start server
const port = Number(process.env.PORT || 9090);
app.listen(port, () => console.log(`PITWALL server listening on port ${port}`));
