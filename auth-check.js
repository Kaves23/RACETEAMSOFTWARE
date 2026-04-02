// Auth Check - Include this script on protected pages
(function() {
  // Skip auth check if on login page
  if (window.location.pathname.endsWith('login.html')) {
    return;
  }
  
  // Check if user is logged in
  const token = localStorage.getItem('auth_token');
  const user = localStorage.getItem('user');
  
  if (!token || !user) {
    console.log('🔒 Not authenticated, redirecting to login...');
    // Use replace instead of href to avoid adding to history
    window.location.replace('/login.html');
    return;
  }
  
  // Optionally verify token with server (commented out for now to reduce API calls)
  // You can enable this for extra security
  /*
  fetch('http://10.0.0.30:3000/api/auth/verify', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  })
  .then(res => res.json())
  .then(data => {
    if (!data.success) {
      console.log('🔒 Invalid token, redirecting to login...');
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user');
      window.location.replace('/login.html');
    }
  })
  .catch(err => {
    console.error('Auth verification error:', err);
  });
  */
  
  console.log('✅ Authenticated as:', JSON.parse(user).username);
})();
