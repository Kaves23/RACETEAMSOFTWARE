const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('../db');
const constants = require('../constants');
const { logActivity } = require('../lib/activityLog');

const BCRYPT_ROUNDS = 12;

// Sessions now stored in database for persistence across server restarts

// ── In-memory token cache: avoids 1 DB query per API request ──────────────────
// Entry: { user, expiresAt (ms) }. Max 60s TTL – well within the 2-hour session.
const _tokenCache = new Map();
const TOKEN_CACHE_TTL_MS = 60_000; // 60 seconds
// Prune stale entries every 5 minutes so the Map doesn't grow unbounded
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of _tokenCache) if (v.expiresAt <= now) _tokenCache.delete(k);
}, 5 * 60_000).unref(); // .unref() so this timer never keeps the process alive

// ── On-startup seed: ensure admin user exists with a hashed password ──────────
async function ensureAdminUser() {
  try {
    const DEFAULT_ADMIN_PASS = process.env.ADMIN_PASSWORD || 'changeme';
    const result = await db.query(
      'SELECT id, password_hash FROM users WHERE username = $1',
      ['admin']
    );
    if (result.rows.length === 0) {
      const hash = await bcrypt.hash(DEFAULT_ADMIN_PASS, BCRYPT_ROUNDS);
      await db.query(
        `INSERT INTO users (id, username, email, full_name, role, is_active, password_hash)
         VALUES ('admin-001', 'admin', 'admin@raceteam.local', 'Administrator', 'admin', TRUE, $1)
         ON CONFLICT (id) DO UPDATE SET password_hash = $1`,
        [hash]
      );
      console.log('✅ Admin user seeded (set ADMIN_PASSWORD env var to change default)');
    } else if (!result.rows[0].password_hash) {
      const hash = await bcrypt.hash(DEFAULT_ADMIN_PASS, BCRYPT_ROUNDS);
      await db.query('UPDATE users SET password_hash = $1 WHERE username = $2', [hash, 'admin']);
      console.log('✅ Admin password initialised');
    }
  } catch (err) {
    console.error('⚠️  Could not seed admin user:', err.message);
  }
}
ensureAdminUser();

// Generate secure token
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required' });
    }

    const result = await db.query(
      'SELECT * FROM users WHERE username = $1 AND is_active = TRUE',
      [username]
    );
    const user = result.rows[0];

    if (!user || !user.password_hash) {
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ success: false, error: 'Invalid username or password' });
    }

    const token = generateToken();
    const expiresAt = new Date(Date.now() + constants.SESSION_EXPIRY_MS);

    await db.query(
      `INSERT INTO sessions (token, user_id, username, name, role, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (token) DO UPDATE SET expires_at = $6`,
      [token, user.id, user.username, user.full_name || user.username, user.role, expiresAt]
    );

    await db.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    console.log(`✅ User logged in: ${username} (token: ${token.substring(0, 8)}...)`);

    // Log to activity_log (fire-and-forget — never blocks the login response)
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || req.ip || '';
    logActivity(db, {
      entityType: 'user',
      entityId:   user.id,
      entityName: user.full_name || user.username,
      action:     'login',
      userId:     user.id,
      userName:   user.full_name || user.username,
      details:    { ip, userAgent: req.headers['user-agent'] || '' },
    }).catch(err => console.warn('Failed to log login activity:', err.message));

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.full_name || user.username,
        role: user.role
      }
    });

  } catch (error) {
    next(error);
  }
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (token) {
    _tokenCache.delete(token); // Evict immediately from cache
    const result = await db.query('SELECT user_id, username, name FROM sessions WHERE token = $1', [token]);
    if (result.rows.length > 0) {
      const sess = result.rows[0];
      console.log(`👋 User logged out: ${sess.username}`);
      // Log to activity_log (fire-and-forget)
      logActivity(db, {
        entityType: 'user',
        entityId:   sess.user_id,
        entityName: sess.name || sess.username,
        action:     'logout',
        userId:     sess.user_id,
        userName:   sess.name || sess.username,
        details:    {},
      }).catch(err => console.warn('Failed to log logout activity:', err.message));
    }
    await db.query('DELETE FROM sessions WHERE token = $1', [token]);
  }
  
  res.json({ success: true });
});

// GET /api/auth/verify - Check if token is valid
router.get('/verify', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ 
      success: false, 
      error: 'Invalid or expired token' 
    });
  }
  
  const result = await db.query(
    'SELECT * FROM sessions WHERE token = $1',
    [token]
  );
  
  if (result.rows.length === 0) {
    return res.status(401).json({ 
      success: false, 
      error: 'Invalid or expired token' 
    });
  }
  
  const session = result.rows[0];
  
  res.json({
    success: true,
    user: {
      id: session.user_id,
      username: session.username,
      name: session.name,
      role: session.role
    }
  });
});

// Middleware to protect routes
async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ 
      success: false, 
      error: 'Authentication required' 
    });
  }

  // Fast path: serve from in-memory cache (avoids 1 DB query per API call)
  const cached = _tokenCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    req.user = cached.user;
    return next();
  }
  
  const result = await db.query(
    'SELECT * FROM sessions WHERE token = $1',
    [token]
  );
  
  if (result.rows.length === 0) {
    _tokenCache.delete(token); // Remove any stale entry
    return res.status(401).json({ 
      success: false, 
      error: 'Authentication required' 
    });
  }

  const session = result.rows[0];

  // Attach user to request
  req.user = {
    userId: session.user_id,
    username: session.username,
    role: session.role
  };

  // Populate cache for subsequent requests
  _tokenCache.set(token, { user: req.user, expiresAt: Date.now() + TOKEN_CACHE_TTL_MS });
  
  next();
}

// Note: Session cleanup is handled in server/index.js main cron job

// ─────────────────────────────────────────────────────────────────────────────
// requireAdmin middleware
// ─────────────────────────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/users  – list users (any authenticated user, for dropdowns)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/users', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, username, email, full_name, role, is_active, last_login, created_at
       FROM users
       ORDER BY full_name, username`
    );
    res.json({ success: true, users: result.rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/users  – create user (admin only)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { username, email, full_name, role, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'username and password are required' });
    }

    const id = crypto.randomUUID();
    const password_hash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const result = await db.query(
      `INSERT INTO users (id, username, email, full_name, role, is_active, password_hash)
       VALUES ($1, $2, $3, $4, $5, TRUE, $6)
       RETURNING id, username, email, full_name, role, is_active, created_at`,
      [id, username, email || null, full_name || username, role || 'user', password_hash]
    );

    res.status(201).json({ success: true, user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ success: false, error: 'Username or email already exists' });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/auth/users/:id  – update user (admin, or self for name/password)
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/users/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const isSelf = req.user.userId === id;
    const isAdmin = req.user.role === 'admin';

    if (!isSelf && !isAdmin) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { full_name, email, role, is_active, password, new_password } = req.body;
    const sets = [];
    const vals = [];
    let idx = 1;

    if (new_password) {
      if (isSelf && !isAdmin) {
        if (!password) return res.status(400).json({ success: false, error: 'Current password required' });
        const row = await db.query('SELECT password_hash FROM users WHERE id = $1', [id]);
        if (!row.rows[0]) return res.status(404).json({ success: false, error: 'User not found' });
        const ok = await bcrypt.compare(password, row.rows[0].password_hash);
        if (!ok) return res.status(401).json({ success: false, error: 'Current password incorrect' });
      }
      sets.push(`password_hash = $${idx++}`);
      vals.push(await bcrypt.hash(new_password, BCRYPT_ROUNDS));
    }

    if (full_name !== undefined) { sets.push(`full_name = $${idx++}`); vals.push(full_name); }
    if (email !== undefined)     { sets.push(`email = $${idx++}`);     vals.push(email); }
    if (isAdmin && role !== undefined)      { sets.push(`role = $${idx++}`);      vals.push(role); }
    if (isAdmin && is_active !== undefined) { sets.push(`is_active = $${idx++}`); vals.push(is_active); }

    if (sets.length === 0) {
      return res.status(400).json({ success: false, error: 'Nothing to update' });
    }

    sets.push(`updated_at = NOW()`);
    vals.push(id);

    const result = await db.query(
      `UPDATE users SET ${sets.join(', ')} WHERE id = $${idx}
       RETURNING id, username, email, full_name, role, is_active`,
      vals
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Invalidate all sessions if password changed or user deactivated
    if (new_password || is_active === false) {
      const sessions = await db.query('SELECT token FROM sessions WHERE user_id = $1', [id]);
      for (const s of sessions.rows) _tokenCache.delete(s.token);
      await db.query('DELETE FROM sessions WHERE user_id = $1', [id]);
    }

    res.json({ success: true, user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/auth/users/:id  – delete user (admin only)
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    if (id === 'admin-001') {
      return res.status(400).json({ success: false, error: 'Cannot delete the primary admin account' });
    }

    const sessions = await db.query('SELECT token FROM sessions WHERE user_id = $1', [id]);
    for (const s of sessions.rows) _tokenCache.delete(s.token);
    await db.query('DELETE FROM sessions WHERE user_id = $1', [id]);

    const result = await db.query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = { router, requireAuth };
