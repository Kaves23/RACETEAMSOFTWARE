# Production Deployment Guide
## Deploying Race Team OS to kokororacing.co.za

---

## 🏗️ Architecture

**Recommended Setup:**
```
Main Website:     https://kokororacing.co.za
                  (Your marketing site / landing page)

Race Team OS:     https://app.kokororacing.co.za  
                  (Frontend HTML/CSS/JS)

API Backend:      https://api.kokororacing.co.za
                  (Node.js server on Render)

Database:         PlanetScale PostgreSQL
                  (Already configured)
```

---

## 📋 Step-by-Step Deployment

### 1. Configure Render Custom Domain

#### A. Add API Subdomain
1. Log into [Render Dashboard](https://dashboard.render.com)
2. Select your web service: **raceteamsoftware**
3. Go to **Settings** → **Custom Domain**
4. Click **Add Custom Domain**
5. Enter: `api.kokororacing.co.za`
6. Render will provide DNS records (note them down)

#### B. SSL Certificate
- Render automatically provisions **Let's Encrypt SSL certificates**
- HTTPS will be enabled within 1-5 minutes after DNS propagation
- Certificate auto-renews every 90 days

---

### 2. Update DNS Records

Log into your domain registrar (where you bought kokororacing.co.za) and add:

#### DNS Records to Add:

```
Type: CNAME
Name: api
Value: raceteamsoftware.onrender.com
TTL: 3600 (1 hour)
```

**Note:** Render will show you the exact CNAME value in the dashboard.

#### Optional: Add App Subdomain

If you want the frontend on `app.kokororacing.co.za`:

```
Type: CNAME
Name: app
Value: <your-frontend-host>
TTL: 3600
```

Or use **Netlify/Vercel/Cloudflare Pages** for the frontend (recommended).

---

### 3. Deploy Frontend

#### Option A: Netlify (Recommended - Free)

1. **Create Account:** [netlify.com](https://netlify.com)
2. **New Site from Git:**
   - Connect your GitHub repo
   - Branch: `main`
   - Build command: (leave empty - static site)
   - Publish directory: `/` (root)
   
3. **Custom Domain:**
   - Go to Domain Settings
   - Add: `app.kokororacing.co.za`
   - Follow DNS instructions
   
4. **Build Settings:**
   - No build needed (pure HTML/CSS/JS)
   - Auto-deploys on every git push

#### Option B: Cloudflare Pages (Also Free)

1. **Create Account:** [pages.cloudflare.com](https://pages.cloudflare.com)
2. **Connect GitHub repo**
3. **Custom domain:** `app.kokororacing.co.za`
4. Auto-deploy on push

#### Option C: Render Static Site (Free)

1. Create new **Static Site** in Render
2. Connect GitHub repo
3. Build command: (none)
4. Publish directory: `/`
5. Add custom domain: `app.kokororacing.co.za`

---

### 4. Update Environment Variables

In **Render Dashboard** → **Environment**:

```bash
DATABASE_URL=<your-planetscale-url>  # Already set
NODE_ENV=production
PORT=3000  # Render auto-assigns
```

---

### 5. Test Deployment

#### Check API Endpoint:
```bash
curl https://api.kokororacing.co.za/api/health
```

**Expected response:**
```json
{"ok":true,"ts":"2026-04-06T..."}
```

#### Check Frontend:
1. Open: `https://app.kokororacing.co.za`
2. Login with: `admin` / `password`
3. Test creating a task or asset
4. Verify data saves to database

---

### 6. DNS Propagation

**Timeline:**
- **Local DNS:** 5-30 minutes
- **Global propagation:** 1-48 hours (usually <2 hours)

**Check propagation:**
```bash
# Check DNS
dig api.kokororacing.co.za

# Or use online tool
https://dnschecker.org
```

---

## 🔒 Security Checklist

### ✅ Already Configured:
- [x] CORS whitelist (kokororacing.co.za domains only)
- [x] Helmet.js security headers
- [x] Content Security Policy (CSP)
- [x] Request size limits (anti-DOS)
- [x] SQL injection protection (parameterized queries)
- [x] HTTPS enforcement (upgradeInsecureRequests)

### 🔐 Recommended Next Steps:

#### 1. Change Default Password
**File:** `server/routes/auth.js`

```javascript
// In production, use environment variables
const users = [
  {
    id: 'admin-001',
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'YOUR_SECURE_PASSWORD',
    name: 'Administrator',
    role: 'admin'
  }
];
```

**Add to Render Environment:**
```bash
ADMIN_USERNAME=your_username
ADMIN_PASSWORD=your_secure_password_here
```

#### 2. Enable Password Hashing

Install bcrypt:
```bash
npm install bcrypt
```

**Update auth.js:**
```javascript
const bcrypt = require('bcrypt');

// Hash password on user creation (run once)
const hashedPassword = await bcrypt.hash('your_password', 10);

// Verify on login
const match = await bcrypt.compare(password, user.password);
```

#### 3. Add Rate Limiting

```bash
npm install express-rate-limit
```

**In server/index.js:**
```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);
```

---

## 📊 Monitoring

### Render Built-in Monitoring:
- **Logs:** Dashboard → Logs (real-time)
- **Metrics:** CPU, Memory, Response times
- **Alerts:** Email notifications on crashes

### External Monitoring (Optional):
- **Uptime:** [UptimeRobot](https://uptimerobot.com) (free)
- **APM:** [Sentry](https://sentry.io) for error tracking
- **Analytics:** [Plausible](https://plausible.io) privacy-friendly

---

## 🚨 Troubleshooting

### CORS Errors
**Error:** `Access to fetch at 'https://api...' has been blocked by CORS`

**Fix:** Verify origin is in `allowedOrigins` array in `server/index.js`

### 502 Bad Gateway
**Cause:** Server crashed or not responding

**Check:**
1. Render Dashboard → Logs
2. Look for startup errors
3. Verify DATABASE_URL is set
4. Check server starts in <30 seconds

### Database Connection Failed
**Error:** `Database connection failed`

**Fix:**
1. Check PlanetScale connection string
2. Verify SSL mode: `?sslmode=require`
3. Test connection from local machine

### DNS Not Resolving
**Check:**
```bash
nslookup api.kokororacing.co.za
```

**Fix:** Wait for propagation or check CNAME record

---

## 📦 Deployment Checklist

Before going live:

- [ ] API custom domain configured in Render
- [ ] DNS CNAME records added at registrar
- [ ] CORS allowedOrigins updated with production domains
- [ ] Environment variables set (DATABASE_URL, NODE_ENV)
- [ ] Default admin password changed
- [ ] SSL certificate active (check https://)
- [ ] Health endpoint responding: `/api/health`
- [ ] Test login works
- [ ] Test creating/updating data
- [ ] Mobile apps tested with production API
- [ ] Error monitoring configured (Sentry)
- [ ] Uptime monitoring configured

---

## 🔄 Continuous Deployment

**Already configured:**
- ✅ GitHub repo connected to Render
- ✅ Auto-deploy on push to `main` branch
- ✅ Build logs visible in dashboard

**Workflow:**
```bash
git add .
git commit -m "Your changes"
git push origin main
```

Render will:
1. Pull latest code
2. Install dependencies (`npm install`)
3. Start server
4. Health check
5. Route traffic to new deployment

**Rollback:** Render Dashboard → Manual Deploy → Previous version

---

## 💰 Costs

### Current Setup:
- **Render Free Tier:**
  - Web service spins down after 15 min inactivity
  - 750 hours/month free
  - Cold starts: ~30 seconds
  
- **PlanetScale Free Tier:**
  - 5 GB storage
  - 1 billion row reads/month
  - 10 million row writes/month

### Upgrade to Paid (Optional):

**Render Starter Plan ($7/month):**
- Always on (no spin down)
- Instant response times
- Worth it for production

**PlanetScale Scaler Plan ($29/month):**
- 10 GB storage
- Branching & deploy requests
- Production insights

---

## 📞 Support

**Issues:**
- GitHub Issues: Your repo
- Render Docs: [render.com/docs](https://render.com/docs)
- PlanetScale Docs: [planetscale.com/docs](https://planetscale.com/docs)

**Emergency Rollback:**
```bash
git revert HEAD
git push origin main
```

---

## ✅ Success Indicators

After deployment, you should see:

1. ✅ `https://api.kokororacing.co.za/api/health` returns `{"ok":true}`
2. ✅ `https://app.kokororacing.co.za` loads frontend
3. ✅ Login works (redirects, no CORS errors)
4. ✅ Can create/edit tasks, assets, events
5. ✅ Mobile apps connect successfully
6. ✅ SSL lock icon shows in browser
7. ✅ No console errors
8. ✅ Response times < 500ms

---

**Last Updated:** April 2026  
**Version:** 5.0
