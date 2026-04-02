# PlanetScale Connection Setup Guide

## Step 1: Get Your Connection Details

### Method 1: PlanetScale Web Dashboard (Easiest)
1. Go to https://app.planetscale.com
2. Click on your database: **"raceteam-logistics-v5"** (or whatever you named it)
3. Click **"Connect"** button in the top right
4. Select **"Connect with: Node.js"** from the dropdown
5. You'll see something like this:

```javascript
const connection = mysql.createConnection({
  host: 'aws.connect.psdb.cloud',
  username: 'xxxxxxxxxxx',
  password: 'pscale_pw_xxxxxxxxxxxxxxxxx',
  database: 'raceteam-logistics-v5',
  ssl: {
    rejectUnauthorized: true
  }
})
```

### Method 2: Create New Password
1. In PlanetScale dashboard, go to your database
2. Click **"Connect"** → **"New password"**
3. Name it: "RaceTeamApp"
4. Select branch: **"main"**
5. Click **"Create password"**
6. **IMPORTANT:** Copy all credentials immediately - password shown only once!

## Step 2: Save Connection Details

Copy the file `.env.example` to `.env`:

```bash
cp .env.example .env
```

Then edit `.env` with your actual credentials:

```env
DATABASE_HOST=aws.connect.psdb.cloud
DATABASE_USERNAME=xxxxxxxxxx
DATABASE_PASSWORD=pscale_pw_xxxxxxxxxxxxxx
DATABASE_NAME=raceteam-logistics-v5
PORT=3000
NODE_ENV=development
```

**⚠️ Security:** Never commit `.env` to git - it's already in `.gitignore`

## Step 3: Install Node.js Packages

Run this command in your terminal:

```bash
cd "/Users/John/Dropbox/RACE TEAM SOFTWARE V5"
npm init -y
npm install @planetscale/database dotenv express cors body-parser
npm install --save-dev nodemon
```

## Step 4: Test Database Connection

I'll create a test script for you. Once you've filled in your `.env` file, we can run it to verify the connection works.

## Connection String Format

PlanetScale uses this format:
```
mysql://USERNAME:PASSWORD@HOST/DATABASE?ssl={"rejectUnauthorized":true}
```

Or for @planetscale/database (what we're using):
```javascript
{
  host: 'aws.connect.psdb.cloud',
  username: 'xxxxxxxxxxx',
  password: 'pscale_pw_xxxxxxxxxxxxxxxxx'
}
```

## Troubleshooting

### "Can't find database"
- Make sure database name matches exactly (case-sensitive)
- Check you're using the correct branch (usually "main")

### "Access denied"
- Password might be expired or incorrect
- Create a new password in PlanetScale dashboard

### "Connection timeout"
- Check your internet connection
- Verify host is correct (usually `*.connect.psdb.cloud`)

### "SSL certificate error"
- Make sure you're using `ssl: { rejectUnauthorized: true }`
- PlanetScale requires SSL connections

## Next Steps

After getting connection details:
1. Fill in `.env` file
2. Install npm packages
3. Run test connection script
4. Run database migrations
5. Start API server
