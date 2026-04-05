# WhatsApp Integration Setup Guide

## Overview
Your event notes system now supports WhatsApp integration! Send messages to a WhatsApp number and they automatically become notes in your lists.

## Features
✅ **Add notes** - Just send any text message
✅ **Mark as done** - Reply "Done: #3"
✅ **View list** - Send "list" or "show"  
✅ **Help** - Send "help"
✅ **Auto-replies** - Get confirmation for every action

## Setup Options

### Option 1: Twilio (Recommended - Easiest)

1. **Create Twilio Account**
   - Go to https://www.twilio.com/
   - Sign up (free trial includes WhatsApp sandbox)

2. **Get WhatsApp Sandbox**
   - In Twilio Console → Messaging → Try it out → Send a WhatsApp message
   - Follow instructions to join the sandbox
   - You'll get a sandbox number like: `+1 415 523 8886`

3. **Configure Webhook**
   - In Sandbox settings, set webhook URL to:
     ```
     https://your-server.com/api/whatsapp/webhook
     ```
   - Or use ngrok for local testing:
     ```
     ngrok http 3000
     ```
     Then use: `https://abc123.ngrok.io/api/whatsapp/webhook`

4. **Get Credentials**
   - Account SID: Found in Twilio Console dashboard
   - Auth Token: Found in Twilio Console dashboard
   - Phone Number: Your WhatsApp-enabled number

5. **Add to .env file**
   ```
   WHATSAPP_PROVIDER=twilio
   WHATSAPP_ACCOUNT_SID=your_account_sid
   WHATSAPP_API_TOKEN=your_auth_token
   WHATSAPP_PHONE_NUMBER=+14155238886
   WHATSAPP_VERIFY_TOKEN=random_string_you_create
   ```

### Option 2: Meta WhatsApp Business API (Production)

1. **Create Meta Business Account**
   - Go to https://business.facebook.com/
   - Create a business account

2. **Setup WhatsApp Business App**
   - Go to https://developers.facebook.com/
   - Create new app → Business → WhatsApp
   - Complete business verification (can take days)

3. **Get Phone Number ID**
   - In WhatsApp → API Setup
   - Copy Phone Number ID

4. **Get Access Token**
   - In WhatsApp → API Setup
   - Generate permanent access token

5. **Configure Webhook**
   - In WhatsApp → Configuration
   - Webhook URL: `https://your-server.com/api/whatsapp/webhook`
   - Verify Token: Random string you create
   - Subscribe to: `messages`

6. **Add to .env file**
   ```
   WHATSAPP_PROVIDER=meta
   WHATSAPP_ACCOUNT_SID=your_phone_number_id
   WHATSAPP_API_TOKEN=your_access_token
   WHATSAPP_PHONE_NUMBER=+your_business_number
   WHATSAPP_VERIFY_TOKEN=your_verify_token
   ```

## Usage Examples

### Add a Note
```
"Remember to pack tire warmers"
```
or
```
"Add: Check fuel levels before leaving"
```

### Mark as Done
```
"Done: #3"
```
or
```
"done 3"
```

### View Pending Notes
```
"list"
```
or
```
"show"
```

### Get Help
```
"help"
```

## Testing

1. **Start your server**
   ```bash
   cd server
   npm start
   ```

2. **Send test message** to your WhatsApp number
   
3. **Check server logs** - Should see:
   ```
   📱 WhatsApp webhook received
   📨 Message from +1234567890: Remember tire warmers
   ✅ Added note from +1234567890: Remember tire warmers
   ```

4. **Check database**
   ```sql
   SELECT * FROM event_packing_items 
   WHERE whatsapp_message_id IS NOT NULL 
   ORDER BY created_at DESC;
   ```

## Troubleshooting

**Messages not received?**
- Check webhook URL is correct and publicly accessible
- Verify server is running and logs show incoming requests
- Test webhook with curl:
  ```bash
  curl -X POST http://localhost:3000/api/whatsapp/webhook \
    -H "Content-Type: application/json" \
    -d '{"From":"whatsapp:+1234567890","Body":"test message"}'
  ```

**Replies not sending?**
- Check API credentials are correct
- Verify account has credits (Twilio) or is verified (Meta)
- Check server logs for send errors

**Wrong list?**
- Set `default_list_id` in WhatsApp config to target specific list
- Or create "GENERAL LIST" and it will be used by default

## Security Notes

- ⚠️ **Never commit credentials** to git
- ✅ Use environment variables for all secrets
- ✅ Webhook endpoint is public (required by WhatsApp)
- ✅ Individual routes handle authentication where needed
- ✅ Verify webhook signatures in production (TODO)

## Next Steps

1. Configure WhatsApp (Settings → WhatsApp)
2. Test with a message
3. Share number with team
4. Enjoy hands-free note taking! 🎉
