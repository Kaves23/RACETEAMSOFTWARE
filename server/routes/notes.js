/**
 * /api/notes — Team Knowledge Base
 * Full CRUD with folder grouping, tags, entity linking, and full-text search.
 */
const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const { pool } = require('../db');

function genId() { return crypto.randomUUID(); }

/** Compute word count server-side */
function wordCount(text) {
  if (!text || !text.trim()) return 0;
  return text.trim().split(/\s+/).length;
}

// ── GET /api/notes ────────────────────────────────────────────────
// Query params: folder, tag, linked_entity_type, linked_entity_id, search, pinned
router.get('/', async (req, res, next) => {
  try {
    const { folder, tag, linked_entity_type, linked_entity_id, search, pinned } = req.query;
    let q = 'SELECT * FROM notes WHERE 1=1';
    const params = [];
    let p = 1;

    if (folder)              { q += ` AND folder = $${p++}`;                       params.push(folder); }
    if (linked_entity_type)  { q += ` AND linked_entity_type = $${p++}`;           params.push(linked_entity_type); }
    if (linked_entity_id)    { q += ` AND linked_entity_id = $${p++}`;             params.push(linked_entity_id); }
    if (pinned === 'true')   { q += ` AND is_pinned = true`; }
    if (tag)                 { q += ` AND $${p++} = ANY(tags)`;                    params.push(tag); }
    if (search) {
      q += ` AND to_tsvector('english', title || ' ' || COALESCE(content, '')) @@ plainto_tsquery('english', $${p++})`;
      params.push(search);
    }

    q += ' ORDER BY is_pinned DESC, updated_at DESC';

    const result = await pool.query(q, params);
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
});

// ── GET /api/notes/folders ────────────────────────────────────────
// Returns distinct folders with note counts
router.get('/folders', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT folder, COUNT(*) AS count FROM notes GROUP BY folder ORDER BY folder`
    );
    res.json({ success: true, data: result.rows });
  } catch (err) { next(err); }
});

// ── GET /api/notes/:id ────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const result = await pool.query('SELECT * FROM notes WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Note not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
});

// ── POST /api/notes ───────────────────────────────────────────────
router.post('/', async (req, res, next) => {
  try {
    const {
      title = 'Untitled',
      content = '',
      folder = 'General',
      tags = [],
      is_pinned = false,
      linked_entity_type = null,
      linked_entity_id = null,
      linked_entity_name = null
    } = req.body;

    const id  = genId();
    const wc  = wordCount(content);
    const by  = req.user?.email || req.user?.username || null;

    const result = await pool.query(`
      INSERT INTO notes (id, title, content, folder, tags, is_pinned,
        linked_entity_type, linked_entity_id, linked_entity_name,
        word_count, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *
    `, [id, title, content, folder, tags, is_pinned,
        linked_entity_type, linked_entity_id, linked_entity_name,
        wc, by]);

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
});

// ── PUT /api/notes/:id ────────────────────────────────────────────
router.put('/:id', async (req, res, next) => {
  try {
    const {
      title, content, folder, tags, is_pinned,
      linked_entity_type, linked_entity_id, linked_entity_name
    } = req.body;

    // Only recompute word_count if content is being updated
    const wc = content !== undefined ? wordCount(content) : undefined;

    const result = await pool.query(`
      UPDATE notes SET
        title               = COALESCE($1, title),
        content             = COALESCE($2, content),
        folder              = COALESCE($3, folder),
        tags                = COALESCE($4, tags),
        is_pinned           = COALESCE($5, is_pinned),
        linked_entity_type  = $6,
        linked_entity_id    = $7,
        linked_entity_name  = $8,
        word_count          = COALESCE($9, word_count),
        updated_at          = NOW()
      WHERE id = $10
      RETURNING *
    `, [
      title   !== undefined ? title   : null,
      content !== undefined ? content : null,
      folder  !== undefined ? folder  : null,
      tags    !== undefined ? tags    : null,
      is_pinned !== undefined ? is_pinned : null,
      linked_entity_type  !== undefined ? (linked_entity_type  || null) : undefined,
      linked_entity_id    !== undefined ? (linked_entity_id    || null) : undefined,
      linked_entity_name  !== undefined ? (linked_entity_name  || null) : undefined,
      wc !== undefined ? wc : null,
      req.params.id
    ]);

    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Note not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (err) { next(err); }
});

// ── DELETE /api/notes/:id ─────────────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await pool.query('DELETE FROM notes WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Note not found' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
