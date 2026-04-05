# WhatsApp Integration - FREE Production Setup (Meta)

## Cost: $0/month 🎉

Meta WhatsApp Business API is **completely free** for production use.

### Pricing Breakdown
- ✅ **Free:** First 1,000 conversations/month
- ✅ **After 1,000:** ~$0.005-0.09 per conversation (country dependent)
- ✅ **No subscription fees**
- ✅ **No monthly charges**
- ℹ️ A "conversation" = 24hr window with a user (unlimited messages in that window)

**Example:** If 10 team members each message 3x/day = ~10 conversations/month = **FREE**

---

## Quick Start Setup (15 minutes)

### Step 1: Create Meta Developer Account

1. Go to https://developers.facebook.com
2. Click "Get Started"
3. Log in with Facebook (or create account)
4. Complete simple verification

### Step 2: Create WhatsApp App

1. Click "Create App"
2. Select "Business" type
3. Fill in app name: "Race Team Notes"
4. Click "Create App"

### Step 3: Add WhatsApp Product

1. In your new app, find "WhatsApp" in products list
2. Click "Set Up"
3. You'll be taken to WhatsApp setup page

### Step 4: Get Test Number (Instant)

1. In WhatsApp → Getting Started
2. You'll see a **test number** provided by Meta (free!)
3. Example: `+1 555 025 5745`
4. Click "Send Message" to add up to 5 test recipients

### Step 5: Add Your Team Numbers

1. Click "Add recipient number"
2. Enter each team member's WhatsApp number
3. They'll receive a message - must reply to verify
4. Can add up to 5 numbers in test mode

### Step 6: Get Credentials

1. **Phone Number ID:**
   - In WhatsApp → API Setup
   - Copy the Phone Number ID (long number like `109876543210987`)

2. **Temporary Access Token:**
   - In same section, copy temporary token
   - ⚠️ This expires in 24hrs - we'll fix this next

3. **Create Permanent Token:**
   - Go to: Settings → Basic → App Secret
   - Click "Show" and copy App Secret
   - Then go to Tools → Access Token Tool
   - Select your app → Generate Token
   - Set expiration to "Never"
   - Copy this token

### Step 7: Setup Webhook

1. In WhatsApp → Configuration → Webhook
2. Click "Edit"
3. Enter webhook details:
   ```
   Callback URL: https://your-domain.com/api/whatsapp/webhook
   Verify Token: mySecretVerifyToken123
   ```
4. Click "Verify and Save"
5. Subscribe to webhook fields: `messages`

### Step 8: Configure Your Server

Update `.env` file:

```env
WHATSAPP_PROVIDER=meta
WHATSAPP_ACCOUNT_SID=109876543210987
WHATSAPP_API_TOKEN=EAAxxxxxxxxxxxxxxxx
WHATSAPP_PHONE_NUMBER=+15550255745
WHATSAPP_VERIFY_TOKEN=mySecretVerifyToken123
```

### Step 9: Test It!

1. Restart your server
2. Send a message from a verified recipient number to the test number:
   ```
   Remember to pack tire warmers
   ```
3. Check your event notes - it should appear!
4. Server should reply with confirmation

---

## Production Setup (After Testing)

### Option A: Keep Using Test Number
- Good for internal team use
- Supports 5 phone numbers
- Stays free forever
- Limited to your team only

### Option B: Add Your Own Number (Recommended)

1. **Requirements:**
   - A phone number not on WhatsApp
   - Or migrate existing WhatsApp Business number
   - Business verification (see below)

2. **Add Number:**
   - WhatsApp → API Setup → Add Phone Number
   - Enter number and verify with SMS code
   - Number is immediately active

3. **Display Name:**
   - Set business name that appears in WhatsApp
   - Example: "Race Team Logistics"

### Business Verification (For Public Use)

**Only needed if you want public/unlimited access**

1. **Submit Documents:**
   - Business registration
   - Tax ID
   - Proof of address
   - Website (optional)

2. **Wait for Review:**
   - Usually 3-5 business days
   - Meta reviews manually
   - You'll get email when approved

3. **After Approval:**
   - Can message anyone (not just 5 test numbers)
   - Higher messaging limits
   - Official green checkmark
   - Still completely FREE

---

## Webhook Deployment Options

Your webhook needs to be publicly accessible. Options:

### Option 1: Railway/Render (FREE)

**Railway.app (Recommended):**
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Deploy from your server folder
cd server
railway up

# Get your URL
railway domain
# Example: https://myapp-production.up.railway.app
```

Then use: `https://myapp-production.up.railway.app/api/whatsapp/webhook`

**Render.com:**
- Sign up at https://render.com
- New → Web Service
- Connect GitHub repo
- Auto-deploys on push
- Free tier available

### Option 2: ngrok (Testing Only)

```bash
# Install
brew install ngrok

# Run
ngrok http 3000

# Copy HTTPS URL
# Example: https://abc123.ngrok.io
```

Use: `https://abc123.ngrok.io/api/whatsapp/webhook`

⚠️ URL changes every restart - not for production

### Option 3: Your Own Server

If you have a VPS/server with a domain:
```
https://yourdomain.com/api/whatsapp/webhook
```

Just ensure SSL certificate (Let's Encrypt is free).

---

## Cost Analysis

### Your Use Case (10 team members):
- Daily messages: ~30 total
- Conversations: ~10/month (each person = 1 conversation/24hrs)
- **Cost: $0/month** ✅ (Under 1,000 limit)

### If You Scale (100 team members):
- 100 conversations/month
- **Cost: $0/month** ✅ (Still under limit)

### If You Go Huge (5,000 conversations/month):
- First 1,000: Free
- Next 4,000: ~$20-40/month (depends on country)
- **Still no subscription!**

---

## Alternative: Twilio Costs (For Comparison)

- Free trial: $15 credit
- Production: $0.005 per message
- Monthly phone rental: $1/month
- ~30 messages/day = $45/month + $1 = **$46/month**

**Meta is FREE** ✅

---

## Troubleshooting

**Can't add more than 5 recipients?**
→ You're in test mode. Either stick with 5 or go through business verification.

**Access token expired?**
→ Generate a permanent token (see Step 6)

**Webhook verification failing?**
→ Check WHATSAPP_VERIFY_TOKEN matches exactly

**Messages not arriving?**
→ Check recipient is verified and hasn't blocked the number

**Rate limited?**
→ You hit Meta's sending limits. Wait 24hrs or apply for higher limits.

---

## Summary

✅ **Free for your team** (under 1,000 conversations/month)  
✅ **No subscriptions** - pay only if you scale massively  
✅ **Professional** - official WhatsApp Business number  
✅ **Quick setup** - 15 mins with test number  
✅ **Production ready** - add real number anytime  

**Start with test number today, verify business later if needed!**
