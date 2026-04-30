// Auth Check - Include this script on protected pages
// Creates a promise that pages can await before loading data

function _showSessionToast(msg) {
  const t = document.createElement('div');
  t.style.cssText = 'position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%);z-index:99999;'
    + 'background:#1f2937;color:#fff;padding:.75rem 1.4rem;border-radius:10px;font-size:.9rem;'
    + 'box-shadow:0 4px 20px rgba(0,0,0,.35);display:flex;align-items:center;gap:.6rem;white-space:nowrap';
  t.innerHTML = '<span style="font-size:1.1rem">&#128274;</span> ' + msg;
  document.body.appendChild(t);
  return t;
}

window.authReady = (async function() {
  // Skip auth check if on login page
  if (window.location.pathname.endsWith('login.html')) {
    return true;
  }
  
  console.log('🔐 Auth check running...');
  
  // Check if user is logged in
  const token = localStorage.getItem('auth_token');
  const user = localStorage.getItem('user');
  
  if (!token || !user) {
    console.log('🔒 Not authenticated, redirecting to login...');
    window.location.replace('/login.html');
    throw new Error('Not authenticated');
  }
  
  // Verify token is valid with the server - this MUST complete before page loads data
  try {
    const res = await fetch('/api/auth/verify', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!res.ok) {
      console.log('🔒 Token expired, showing toast then redirecting to login...');
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user');
      _showSessionToast('Session expired &mdash; please log back in');
      await new Promise(r => setTimeout(r, 2200));
      window.location.replace('/login.html');
      throw new Error('Invalid token');
    }
    
    console.log('✅ Auth verified, token valid');
    return true;
  } catch (err) {
    if (err.message !== 'Invalid token') {
      console.error('⚠️ Auth verification failed:', err);
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user');
      _showSessionToast('Session expired &mdash; please log back in');
      await new Promise(r => setTimeout(r, 2200));
      window.location.replace('/login.html');
    }
    throw err;
  }
})();
