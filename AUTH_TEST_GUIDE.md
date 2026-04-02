# Authentication System Test Guide

## Testing the Authentication System

### 1. Restart the Server

Stop the current server (Ctrl+C) and restart it:

```bash
cd "/Users/John/Dropbox/RACE TEAM SOFTWARE V5/server"
npm start
```

### 2. Test Login Process

1. **Clear your browser's localStorage** (to simulate a fresh start):
   - Press F12 to open Developer Tools
   - Go to "Application" tab (Chrome) or "Storage" tab (Firefox)
   - Click "Local Storage" → `http://10.0.0.30:3000`
   - Click "Clear All" or delete `auth_token` and `user` keys

2. **Try to access a protected page**:
   - Go to: `http://10.0.0.30:3000/assets.html`  
   - You should be **redirected to login.html**

3. **Login**:
   - Username: `admin`
   - Password: `password`
   - Click "Sign In"
   - You should be redirected back to index.html

4. **Verify authentication**:
   - Check the top-right corner - you should see "👤 Administrator"
   - Try navigating to assets.html - should work now
   - Open browser console (F12) - you should see "✅ Authenticated as: admin"

### 3. Test Logout

1. Click the "Logout" button in the top-right corner
2. You should be redirected to login.html
3. Try accessing assets.html again - should redirect to login

### 4. Test API Protection

Open browser console (F12) and try:

```javascript
// Try to fetch items without auth (should fail)
fetch('http://10.0.0.30:3000/api/items')
  .then(r => r.json())
  .then(data => console.log(data));
// Should see: {success: false, error: 'Authentication required'}
```

### 5. Test Session Expiry

Sessions last 24 hours. You can test expiry by:
- Logging in
- Waiting 24 hours (or modify the code to use 1 minute for testing)
- Try to access any page - should redirect to login

---

## Default Credentials

- **Username**: `admin`
- **Password**: `password`

## Security Notes

**For local testing only!**

This is a simple authentication system suitable for local testing. Before deploying to production:

1. **Use bcrypt for password hashing** (currently plaintext)
2. **Use environment variables for credentials** (not hardcoded)
3. **Upgrade to Redis for session storage** (currently in-memory)
4. **Use HTTPS only** (currently HTTP)
5. **Add rate limiting** (prevent brute force)
6. **Add CSRF protection**
7. **Consider OAuth/SSO integration**

## Troubleshooting

**Problem**: Can't login / "Invalid username or password"
- **Solution**: Check server console for errors, verify credentials are correct

**Problem**: Keep getting redirected to login even after logging in
- **Solution**: Check browser console for errors, clear localStorage, try again

**Problem**: Server returns 401 after some time
- **Solution**: Session expired (24 hours), login again

**Problem**: Changes not taking effect
- **Solution**: Restart the server, clear browser cache

---

## Production Deployment Notes

When deploying, you'll want to:

1. Move credentials to environment variables
2. Use a proper database for users (PostgreSQL)
3. Use Redis for sessions
4. Enable HTTPS
5. Add proper password hashing with bcrypt
6. Consider adding roles/permissions
7. Add audit logging for security events
