# Twilio WhatsApp Integration Setup Guide

## Cost: ~$46/month for 30 messages/day

This guide will help you set up WhatsApp integration using Twilio (no Facebook/Meta account needed).

---

## Part 1: Create Twilio Account (3 minutes)

### Step 1: Sign Up
1. Go to: https://www.twilio.com/try-twilio
2. Click **"Sign up"**
3. Fill in:
   - Email
   - Password
   - First & Last Name
4. Verify your email address (check inbox for verification link)

### Step 2: Verify Phone Number
1. Twilio will ask for your phone number
2. Enter your mobile number
3. You'll receive an SMS code
4. Enter the code to verify

✅ **Twilio account created!**

---

## Part 2: Get WhatsApp Sandbox Access (2 minutes)

### Step 1: Access WhatsApp Sandbox
1. In Twilio Console, go to: **Messaging** → **Try it out** → **Send a WhatsApp message**
   - OR go directly to: https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn
2. You'll see the **WhatsApp Sandbox** page

### Step 2: Connect Your Phone
1. You'll see a sandbox number (like: `+1 415 523 8886`)
2. You'll see a join code (like: `join-abc-xyz`)
3. **On your phone:**
   - Open WhatsApp
   - Send a message to the sandbox number
   - Message content: The exact join code shown (e.g., `join-abc-xyz`)
4. You'll receive a confirmation message in WhatsApp

✅ **Your phone is connected to the sandbox!**

---

## Part 3: Get Your Credentials (2 minutes)

### Step 1: Get Account SID and Auth Token
1. Go to Twilio Console: https://console.twilio.com
2. On the main dashboard, you'll see:
   - **Account SID** (looks like: `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`)
   - **Auth Token** (click to reveal, looks like: `xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`)
3. **Copy both** - you'll need these!

### Step 2: Get Your WhatsApp Number
1. Still in the WhatsApp Sandbox page, copy the sandbox number
   - Example: `+14155238886` or `whatsapp:+14155238886`
   - Remove the `whatsapp:` prefix if present

📝 **You should now have:**
- ✅ Account SID
- ✅ Auth Token  
- ✅ WhatsApp Sandbox Number
- ✅ Your phone connected to sandbox

---

## Part 4: Configure Webhook (1 minute)

1. Still on the WhatsApp Sandbox page: https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn
2. Scroll down to **"Sandbox Configuration"**
3. Find **"WHEN A MESSAGE COMES IN"** field
4. Enter: `https://raceteamsoftware.onrender.com/api/whatsapp/webhook`
5. Method: **POST** (default)
6. Click **"Save"**

✅ **Webhook configured!**

---

## Part 5: Update Render with Credentials

### Add Environment Variables to Render:
1. Go to: https://dashboard.render.com
2. Open your **raceteamsoftware** service
3. Go to **Environment** tab
4. Update/add these variables:

| Variable Name | Value |
|---------------|-------|
| `WHATSAPP_PROVIDER` | `twilio` |
| `WHATSAPP_ACCOUNT_SID` | Your Account SID from Twilio |
| `WHATSAPP_API_TOKEN` | Your Auth Token from Twilio |
| `WHATSAPP_PHONE_NUMBER` | Your sandbox number (e.g., `+14155238886`) |
| `WHATSAPP_VERIFY_TOKEN` | `mySecretVerifyToken123` |

5. Click **"Save Changes"**
6. Render will automatically redeploy (~2 minutes)

---

## Part 6: Test It! 🎉

### Send a Test Message:
1. Open WhatsApp on your phone
2. Find the conversation with the Twilio sandbox number
3. Type: `Remember to bring spare tires`
4. Send the message

### What Should Happen:
1. ✅ You receive an auto-reply confirming the note was added
2. ✅ Go to https://raceteamsoftware.onrender.com
3. ✅ Open **Event Notes** page
4. ✅ Select **GENERAL LIST** (red card at top)
5. ✅ Your note appears in the list!

### Other Commands:
- `list` - Shows all pending notes
- `Done: #3` - Marks note #3 as complete
- `help` - Shows available commands

---

## Important Notes

### Sandbox Limitations:
- ✅ FREE during development ($0.00)
- ⚠️ Only works with verified phone numbers (you + up to 5 people)
- ⚠️ Recipients must send the join code first before they can use it
- ⚠️ Messages expire after 24 hours if sandbox is inactive

### Adding Team Members:
1. Each team member sends the join code to the sandbox number
2. They're added automatically (up to 5 total recipients)
3. They can immediately start sending notes

### Production (After Testing):
When ready to go live (removes all limitations):
1. Upgrade to a paid Twilio account
2. Request a WhatsApp Business Profile
3. Get approved by Twilio/Meta (1-5 days)
4. Purchase a dedicated WhatsApp number (~$1/month)
5. Messaging costs: ~$0.005-$0.01 per message

**Estimated production cost:** ~$46/month for 30 messages/day from 10-20 people

---

## Troubleshooting

### "Message not received"
- Check Render logs for errors
- Verify webhook URL is correct
- Make sure you joined the sandbox (sent join code)

### "No auto-reply"
- Check your credentials in Render are correct
- Make sure WHATSAPP_PROVIDER is set to `twilio`
- Check Twilio logs: https://console.twilio.com/us1/monitor/logs/sms

### "Note doesn't appear in system"
- Check database connection is working
- Verify GENERAL LIST exists (it auto-creates if needed)
- Check browser console for errors

---

## Next Steps

1. ✅ Complete Twilio account setup
2. ✅ Get credentials
3. ✅ Configure webhook
4. ✅ Update Render environment variables  
5. ✅ Test with a message
6. ✅ Add your team members (have them send join code)
7. 🚀 Start using it!

**Ready? Start with Part 1 above!**
