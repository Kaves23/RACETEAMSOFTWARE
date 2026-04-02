# Race Team Software V5 - Deployment Guide

## Quick Start - Deploy to Render

### Prerequisites
1. GitHub account
2. Render account (free tier available at https://render.com)
3. PlanetScale PostgreSQL database (or any PostgreSQL database)

### Step 1: Push to GitHub

```bash
# Make sure you're in the project directory
cd "/Users/John/Dropbox/RACE TEAM SOFTWARE V5"

# Add all files
git add .

# Commit with a message
git commit -m "Add authentication system and API integration"

# Push to GitHub
git push origin feature/pitwall
```

### Step 2: Deploy to Render

1. **Go to Render Dashboard**: https://dashboard.render.com

2. **Create New Web Service**:
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Select the repository with your code
   - Select the branch: `feature/pitwall`

3. **Configure the Service**:
   ```
   Name: race-team-software
   Region: Choose closest to your users
   Branch: feature/pitwall
   Root Directory: server
   Runtime: Node
   Build Command: npm install
   Start Command: npm start
   ```

4. **Add Environment Variables**:
   Click "Advanced" → "Add Environment Variable" and add these:
   ```
   DATABASE_HOST=us-east-1.pg.psdb.cloud
   DATABASE_USERNAME=<your_username>
   DATABASE_PASSWORD=<your_password>
   DATABASE_NAME=postgres
   DATABASE_PORT=5432
   NODE_ENV=production
   PORT=3000
   ```

   **OR** use the connection string:
   ```
   DATABASE_URL=postgresql://username:password@host:5432/postgres?sslmode=verify-full
   NODE_ENV=production
   ```

5. **Create Static Site for Frontend** (Optional - if you want frontend separate):
   - Click "New +" → "Static Site"
   - Same repository
   - Build Command: *(leave empty)*
   - Publish Directory: `.` (root)

6. **Deploy**: Click "Create Web Service"

### Step 3: Update Frontend URLs

Once deployed, Render will give you a URL like: `https://race-team-software.onrender.com`

You'll need to update the frontend to point to this URL instead of localhost.

**Option A: Keep frontend URLs relative** (Current setup - works automatically)
- ✅ Already configured with relative URLs (`/api/...`)
- No changes needed if frontend and backend are served from same domain

**Option B: Separate frontend/backend**
If you deploy frontend separately (e.g., Vercel, Netlify), update `config.js`:
```javascript
api: {
  baseURL: 'https://race-team-software.onrender.com/api',
  timeout: 10000
}
```

### Step 4: Access Your App

Your app will be live at:
```
https://your-app-name.onrender.com
```

Login with:
- Username: `admin`
- Password: `password`

---

## Important Security Notes

**BEFORE PRODUCTION:**

1. **Change default password**: Update `server/routes/auth.js` to change admin password
2. **Use bcrypt**: Hash passwords instead of plain text
3. **Use environment variables for credentials**: Don't hardcode in auth.js
4. **Add HTTPS**: Render provides this automatically
5. **Update CORS settings**: Restrict to your domain only
6. **Use Redis for sessions**: Instead of in-memory Map

---

## Project Structure

```
/
├── server/              # Node.js backend (Express API)
│   ├── routes/          # API routes
│   ├── migrations/      # Database migrations
│   ├── index.js         # Server entry point
│   └── package.json     # Node dependencies
├── *.html               # Frontend pages
├── config.js            # API configuration
├── core.js              # Core utilities
├── topnav.js            # Navigation
└── style.css            # Styles
```

---

## Alternative: Deploy Everything Together

Render can serve both API and static files from one service:

The current `server/index.js` already does this:
```javascript
app.use(express.static(path.join(__dirname, '..')));
```

This means:
- API routes: `https://your-app.onrender.com/api/*`
- Frontend: `https://your-app.onrender.com/*.html`

**This is the simplest approach!** Just deploy the entire repo as one web service.

---

## Troubleshooting

**Issue**: "Cannot connect to database"
- **Solution**: Check environment variables are set correctly in Render dashboard

**Issue**: "Build failed"
- **Solution**: Make sure `Root Directory` is set to `server` in Render settings

**Issue**: "Assets not loading"
- **Solution**: Check that frontend is using relative URLs (`/api/...`) not `localhost:3000`

**Issue**: "Authentication not working"
- **Solution**: Clear browser localStorage and try logging in again

---

## Free Tier Limits

Render free tier includes:
- ✅ 750 hours/month (enough for one always-on service)
- ✅ Automatic HTTPS
- ✅ Auto-deploy from GitHub
- ⚠️ Spins down after 15 minutes of inactivity (first request may be slow)

For production, consider upgrading to paid tier for:
- Always-on (no spin-down)
- More compute resources
- Multiple services
