const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db');
const constants = require('../constants');

// Sessions now stored in PlanetScale database for persistence across server restarts

// Simple user database (upgrade to PostgreSQL for production)
const users = [
  {
    id: 'admin-001',
    username: 'admin',
    password: 'password', // In production, use bcrypt hashed passwords
    name: 'Administrator',
    role: 'admin'
  }
];

// Generate secure token
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        error: 'Username and password are required' 
      });
    }
    
    // Find user
    const user = users.find(u => u.username === username);
    
    if (!user || user.password !== password) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid username or password' 
      });
    }
    
    // Generate session token
    const token = generateToken();
    const expiresAt = new Date(Date.now() + constants.SESSION_EXPIRY_MS); // 2 hours
    
    // Store session in database
    await db.query(
      `INSERT INTO sessions (token, user_id, username, name, role, expires_at) 
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (token) DO UPDATE 
       SET expires_at = $6`,
      [token, user.id, user.username, user.name, user.role, expiresAt]
    );
    
    console.log(`✅ User logged in: ${username} (token: ${token.substring(0, 8)}...)`);
    
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
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
    const result = await db.query('SELECT username FROM sessions WHERE token = $1', [token]);
    if (result.rows.length > 0) {
      console.log(`👋 User logged out: ${result.rows[0].username}`);
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
    'SELECT * FROM sessions WHERE token = $1 AND expires_at > NOW()',
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
  
  const result = await db.query(
    'SELECT * FROM sessions WHERE token = $1 AND expires_at > NOW()',
    [token]
  );
  
  if (result.rows.length === 0) {
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
  
  next();
}

// Note: Session cleanup is handled in server/index.js main cron job

module.exports = { router, requireAuth };
