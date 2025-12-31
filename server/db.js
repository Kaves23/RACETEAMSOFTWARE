const fs = require('fs');
const path = require('path');

// Use Postgres if DATABASE_URL env present, otherwise fallback to a simple file-backed sqlite using better-sqlite3
const DATABASE_URL = process.env.DATABASE_URL || process.env.PG_CONNECTION_STRING || null;

let impl = null;

if (DATABASE_URL) {
  // postgres implementation
  const { Client } = require('pg');
  const client = new Client({ connectionString: DATABASE_URL });
  client.connect().catch(err => console.error('Postgres connect error', err));

  impl = {
    async getSettings() {
      const res = await client.query('SELECT data FROM settings WHERE id=$1', ['singleton']);
      if (res.rows.length) return JSON.parse(res.rows[0].data || '{}');
      return {};
    },
    async getAll(collection) {
      const res = await client.query('SELECT id, data FROM collections WHERE collection=$1', [collection]);
      return res.rows.map(r => ({ id: r.id, ...JSON.parse(r.data || '{}') }));
    },
    async upsertMany(collection, items) {
      for (const it of items) {
        const id = it.id || (Date.now() + Math.random()).toString(36);
        const data = JSON.stringify(it);
        await client.query(`INSERT INTO collections(collection,id,data) VALUES($1,$2,$3) ON CONFLICT (collection,id) DO UPDATE SET data = $3`, [collection, id, data]);
      }
      return items;
    }
  };
} else {
  // sqlite fallback
  const Database = require('better-sqlite3');
  const dbFile = path.resolve(__dirname, 'pitwall.sqlite');
  const db = new Database(dbFile);
  // simple tables
  db.prepare("CREATE TABLE IF NOT EXISTS settings(id TEXT PRIMARY KEY, data TEXT)").run();
  db.prepare("CREATE TABLE IF NOT EXISTS collections(collection TEXT, id TEXT, data TEXT, PRIMARY KEY(collection,id))").run();

  impl = {
    async getSettings() {
      const row = db.prepare('SELECT data FROM settings WHERE id = ?').get('singleton');
      return row ? JSON.parse(row.data || '{}') : {};
    },
    async getAll(collection) {
      const stm = db.prepare('SELECT id, data FROM collections WHERE collection = ?');
      const rows = stm.all(collection);
      return rows.map(r => ({ id: r.id, ...JSON.parse(r.data || '{}') }));
    },
    async upsertMany(collection, items) {
      const insert = db.prepare('INSERT OR REPLACE INTO collections(collection,id,data) VALUES(?,?,?)');
      const tx = db.transaction((arr) => { arr.forEach(it => insert.run(collection, it.id || (Date.now()+Math.random()).toString(36), JSON.stringify(it))); });
      tx(items || []);
      return items || [];
    }
  };
}

module.exports = impl;
