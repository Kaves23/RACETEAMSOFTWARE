// Auth Check - Include this script on protected pages
// Creates a promise that pages can await before loading data
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
      console.log('🔒 Token invalid (server restarted), redirecting to login...');
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user');
      window.location.replace('/login.html');
      throw new Error('Invalid token');
    }
    
    console.log('✅ Auth verified, token valid');
    return true;
  } catch (err) {
    console.error('⚠️ Auth verification failed:', err);
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    window.location.replace('/login.html');
    throw err;
  }
})();
