const express = require('express');
const router = express.Router();
const crypto = require('crypto');

// In-memory session storage (upgrade to Redis for production)
const sessions = new Map();

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
    const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
    
    // Store session
    sessions.set(token, {
      userId: user.id,
      username: user.username,
      role: user.role,
      createdAt: Date.now(),
      expiresAt
    });
    
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
router.post('/logout', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (token && sessions.has(token)) {
    const session = sessions.get(token);
    console.log(`👋 User logged out: ${session.username}`);
    sessions.delete(token);
  }
  
  res.json({ success: true });
});

// GET /api/auth/verify - Check if token is valid
router.get('/verify', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ 
      success: false, 
      error: 'Invalid or expired token' 
    });
  }
  
  const session = sessions.get(token);
  
  // Check if expired
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return res.status(401).json({ 
      success: false, 
      error: 'Session expired' 
    });
  }
  
  const user = users.find(u => u.id === session.userId);
  
  res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role
    }
  });
});

// Middleware to protect routes
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ 
      success: false, 
      error: 'Authentication required' 
    });
  }
  
  const session = sessions.get(token);
  
  // Check if expired
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return res.status(401).json({ 
      success: false, 
      error: 'Session expired' 
    });
  }
  
  // Attach user to request
  req.user = {
    userId: session.userId,
    username: session.username,
    role: session.role
  };
  
  next();
}

// Clean up expired sessions every hour
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [token, session] of sessions.entries()) {
    if (now > session.expiresAt) {
      sessions.delete(token);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`🧹 Cleaned up ${cleaned} expired session(s)`);
  }
}, 60 * 60 * 1000); // Every hour

module.exports = { router, requireAuth };
