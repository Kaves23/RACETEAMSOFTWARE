// WhatsApp Integration for Event Notes
// Supports both Twilio and Meta WhatsApp Business API
const express = require('express');
const router = express.Router();
const db = require('../db');
const crypto = require('crypto');

// ============================================
// CONFIGURATION
// ============================================

// GET /api/whatsapp/config - Get WhatsApp configuration
router.get('/config', async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM whatsapp_config LIMIT 1');
    const config = result.rows[0] || {
      provider: null,
      enabled: false,
      phone_number: null
    };
    
    // Don't send sensitive tokens to frontend
    delete config.api_token;
    delete config.verify_token;
    
    res.json({ success: true, config });
  } catch (error) {
    console.error('Error getting WhatsApp config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/whatsapp/config - Update WhatsApp configuration
router.post('/config', async (req, res) => {
  try {
    const {
      provider, // 'twilio' or 'meta'
      enabled,
      phone_number,
      account_sid,
      api_token,
      verify_token,
      default_list_id
    } = req.body;
    
    // Check if config exists
    const existing = await db.query('SELECT id FROM whatsapp_config LIMIT 1');
    
    if (existing.rows.length > 0) {
      // Update existing
      await db.query(`
        UPDATE whatsapp_config
        SET provider = $1,
            enabled = $2,
            phone_number = $3,
            account_sid = $4,
            api_token = $5,
            verify_token = $6,
            default_list_id = $7,
            updated_at = NOW()
        WHERE id = $8
      `, [provider, enabled, phone_number, account_sid, api_token, verify_token, default_list_id, existing.rows[0].id]);
    } else {
      // Insert new
      const id = crypto.randomUUID();
      await db.query(`
        INSERT INTO whatsapp_config (
          id, provider, enabled, phone_number,
          account_sid, api_token, verify_token, default_list_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [id, provider, enabled, phone_number, account_sid, api_token, verify_token, default_list_id]);
    }
    
    res.json({ success: true, message: 'WhatsApp configuration updated' });
  } catch (error) {
    console.error('Error updating WhatsApp config:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// WEBHOOK - RECEIVE MESSAGES
// ============================================

// GET /api/whatsapp/webhook - Verification endpoint (Meta)
router.get('/webhook', (req, res) => {
  // Meta WhatsApp webhook verification
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  // Check verification token matches
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('✅ WhatsApp webhook verified');
    res.status(200).send(challenge);
  } else {
    console.log('❌ WhatsApp webhook verification failed');
    res.sendStatus(403);
  }
});

// POST /api/whatsapp/webhook - Receive incoming messages
router.post('/webhook', async (req, res) => {
  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📱 WhatsApp webhook received!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    // Detect provider from request structure
    const isTwilio = req.body.From && req.body.Body;
    const isMeta = req.body.object === 'whatsapp_business_account';
    
    console.log(`Provider detection - Twilio: ${isTwilio}, Meta: ${isMeta}`);
    
    if (isTwilio) {
      console.log('🟢 Routing to Twilio handler');
      await handleTwilioMessage(req.body);
    } else if (isMeta) {
      console.log('🔵 Routing to Meta handler');
      await handleMetaMessage(req.body);
    } else {
      console.log('⚠️ Unknown WhatsApp provider format');
    }
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Webhook processing complete');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    // Always respond 200 to avoid retries
    res.sendStatus(200);
  } catch (error) {
    console.error('❌ Error processing WhatsApp message:', error);
    console.error('Stack:', error.stack);
    res.sendStatus(200); // Still return 200 to avoid retries
  }
});

// ============================================
// MESSAGE HANDLERS
// ============================================

// Handle Twilio WhatsApp message
async function handleTwilioMessage(body) {
  const from = body.From; // Format: whatsapp:+1234567890
  const messageBody = body.Body;
  const messageSid = body.MessageSid;
  
  console.log(`📨 Twilio message from ${from}: ${messageBody}`);
  
  await processIncomingMessage({
    phone: from.replace('whatsapp:', ''),
    message: messageBody,
    message_id: messageSid,
    provider: 'twilio'
  });
}

// Handle Meta WhatsApp message
async function handleMetaMessage(body) {
  const entry = body.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;
  const messages = value?.messages;
  
  if (!messages || messages.length === 0) {
    console.log('⚠️ No messages in Meta webhook');
    return;
  }
  
  const message = messages[0];
  const from = message.from;
  const messageBody = message.text?.body;
  const messageId = message.id;
  
  console.log(`📨 Meta message from ${from}: ${messageBody}`);
  
  await processIncomingMessage({
    phone: from,
    message: messageBody,
    message_id: messageId,
    provider: 'meta'
  });
}

// ============================================
// MESSAGE PROCESSING
// ============================================

async function processIncomingMessage({ phone, message, message_id, provider }) {
  try {
    console.log(`🔄 Processing message - Phone: ${phone}, Text: "${message}"`);
    
    // Use environment variables for config (no database dependency)
    console.log('✅ Using environment variables for WhatsApp config');
    const config = { 
      default_list_id: null,  // Will create/use GENERAL LIST
      provider: process.env.WHATSAPP_PROVIDER || 'twilio'
    };
    
    // Parse message for commands
    console.log('🔍 Parsing message for commands...');
    const parsed = parseMessage(message);
    console.log(`📝 Parsed result:`, parsed);
    
    if (parsed.command === 'add') {
      console.log('➡️ Routing to ADD command');
      await handleAddNote(phone, parsed.text, config.default_list_id, message_id);
    } else if (parsed.command === 'done') {
      console.log('➡️ Routing to DONE command');
      await handleMarkDone(phone, parsed.noteNumber, message_id);
    } else if (parsed.command === 'list' || parsed.command === 'show') {
      console.log('➡️ Routing to LIST command');
      await handleShowList(phone, config.default_list_id);
    } else if (parsed.command === 'help') {
      console.log('➡️ Routing to HELP command');
      await handleHelp(phone);
    } else {
      // Default: treat as note to add
      console.log('➡️ No command detected - treating as ADD NOTE (default)');
      await handleAddNote(phone, message, config.default_list_id, message_id);
    }
    
  } catch (error) {
    console.error('❌ Error in processIncomingMessage:', error);
    console.error('Stack:', error.stack);
  }
}

// Parse message for commands
function parseMessage(message) {
  const text = message.trim();
  const lower = text.toLowerCase();
  
  // Command patterns
  if (lower.startsWith('add:') || lower.startsWith('add ')) {
    return { command: 'add', text: text.substring(4).trim() };
  }
  
  if (lower.startsWith('done:') || lower.startsWith('done ')) {
    const match = text.match(/done[:\s]+#?(\d+)/i);
    return { command: 'done', noteNumber: match ? parseInt(match[1]) : null };
  }
  
  if (lower === 'list' || lower === 'show' || lower === 'show list') {
    return { command: 'list' };
  }
  
  if (lower === 'help' || lower === '?') {
    return { command: 'help' };
  }
  
  // Default: no command, just text
  return { command: null, text };
}

// Handle: Add note
async function handleAddNote(phone, noteText, listId, messageId) {
  try {
    console.log(`🔵 handleAddNote called - phone: ${phone}, text: ${noteText}, messageId: ${messageId}`);
    
    // Get or create default list if not specified
    let targetListId = listId;
    
    if (!targetListId) {
      console.log('🔍 Looking for GENERAL LIST...');
      // Use GENERAL LIST as default
      const generalList = await db.query(`
        SELECT id FROM event_packing_lists 
        WHERE name = 'GENERAL LIST' 
        LIMIT 1
      `);
      
      if (generalList.rows.length > 0) {
        targetListId = generalList.rows[0].id;
        console.log(`✅ Found GENERAL LIST: ${targetListId}`);
      } else {
        // Create GENERAL LIST
        console.log('⚠️ GENERAL LIST not found, creating...');
        const newId = crypto.randomUUID();
        await db.query(`
          INSERT INTO event_packing_lists (id, name, description, status)
          VALUES ($1, 'GENERAL LIST', 'Shared notes visible on all events', 'active')
        `, [newId]);
        targetListId = newId;
        console.log(`✅ Created GENERAL LIST: ${targetListId}`);
      }
    }
    
    // Create note item
    const itemId = crypto.randomUUID();
    console.log(`💾 Inserting note into database - itemId: ${itemId}, listId: ${targetListId}`);
    
    await db.query(`
      INSERT INTO event_packing_items (
        id, packing_list_id, item_name, category, priority,
        quantity, status, source_notes, whatsapp_message_id
      )
      VALUES ($1, $2, $3, 'general', 'normal', 1, 'pending', $4, $5)
    `, [itemId, targetListId, noteText, `Added via WhatsApp from ${phone}`, messageId]);
    
    console.log(`✅ Note inserted successfully!`);
    
    // Log activity
    await db.query(`
      INSERT INTO event_packing_activity (
        id, packing_list_id, item_id, action_type,
        action_by_name, message, whatsapp_phone
      )
      VALUES ($1, $2, $3, 'item_added', $4, $5, $6)
    `, [
      crypto.randomUUID(),
      targetListId,
      itemId,
      'item_added',
      phone,
      `Added via WhatsApp: ${noteText}`,
      phone
    ]);
    
    console.log(`✅ Activity logged successfully!`);
    console.log(`🎉 COMPLETE: Added note from ${phone}: ${noteText}`);
    
    // Send confirmation
    await sendWhatsAppMessage(phone, `Added ✅`);
    
  } catch (error) {
    console.error('❌ Error adding note:', error);
    console.error('Stack trace:', error.stack);
    await sendWhatsAppMessage(phone, `Error - not added`);
  }
}

// Handle: Mark note as done
async function handleMarkDone(phone, noteNumber, messageId) {
  try {
    if (!noteNumber) {
      await sendWhatsAppMessage(phone, '❌ Please specify a note number. Example: "Done: #5"');
      return;
    }
    
    // Get recent pending notes for this phone
    const notes = await db.query(`
      SELECT pi.id, pi.item_name, pi.packing_list_id
      FROM event_packing_items pi
      LEFT JOIN event_packing_activity pa ON pi.id = pa.item_id
      WHERE pi.status = 'pending'
        AND (pa.whatsapp_phone = $1 OR pi.whatsapp_message_id IS NOT NULL)
      ORDER BY pi.created_at DESC
      LIMIT 20
    `, [phone]);
    
    if (noteNumber < 1 || noteNumber > notes.rows.length) {
      await sendWhatsAppMessage(phone, `❌ Note #${noteNumber} not found. Send "list" to see all notes.`);
      return;
    }
    
    const note = notes.rows[noteNumber - 1];
    
    // Mark as done
    await db.query(`
      UPDATE event_packing_items
      SET status = 'packed',
          packed_by_name = $1,
          packed_at = NOW(),
          updated_at = NOW()
      WHERE id = $2
    `, [phone, note.id]);
    
    // Log activity
    await db.query(`
      INSERT INTO event_packing_activity (
        id, packing_list_id, item_id, action_type,
        action_by_name, message, whatsapp_phone
      )
      VALUES ($1, $2, $3, 'item_packed', $4, $5, $6)
    `, [
      crypto.randomUUID(),
      note.packing_list_id,
      note.id,
      phone,
      `Marked done via WhatsApp: ${note.item_name}`,
      phone
    ]);
    
    await sendWhatsAppMessage(phone, `✅ Marked done: "${note.item_name}"`);
    
  } catch (error) {
    console.error('Error marking done:', error);
    await sendWhatsAppMessage(phone, '❌ Failed to mark note as done.');
  }
}

// Handle: Show list
async function handleShowList(phone, listId) {
  try {
    // Get pending notes
    const notes = await db.query(`
      SELECT item_name, created_at
      FROM event_packing_items
      WHERE packing_list_id = $1 AND status = 'pending'
      ORDER BY created_at DESC
      LIMIT 10
    `, [listId]);
    
    if (notes.rows.length === 0) {
      await sendWhatsAppMessage(phone, '✅ All caught up! No pending notes.');
      return;
    }
    
    let message = '📋 *Pending Notes:*\n\n';
    notes.rows.forEach((note, i) => {
      message += `${i + 1}. ${note.item_name}\n`;
    });
    message += `\nReply "Done: #1" to mark as complete`;
    
    await sendWhatsAppMessage(phone, message);
    
  } catch (error) {
    console.error('Error showing list:', error);
  }
}

// Handle: Help
async function handleHelp(phone) {
  const helpMessage = `
📱 *WhatsApp Notes Commands:*

*Add a note:*
Just send any text, or:
"Add: Remember tire warmers"

*Mark as done:*
"Done: #3"

*View list:*
"list" or "show"

*This help:*
"help" or "?"
  `.trim();
  
  await sendWhatsAppMessage(phone, helpMessage);
}

// ============================================
// SEND MESSAGES
// ============================================

// Send WhatsApp message
async function sendWhatsAppMessage(to, message) {
  try {
    // Use environment variables for config
    const provider = process.env.WHATSAPP_PROVIDER || 'twilio';
    
    const config = {
      provider: provider,
      account_sid: process.env.WHATSAPP_ACCOUNT_SID,
      api_token: process.env.WHATSAPP_API_TOKEN,
      phone_number: process.env.WHATSAPP_PHONE_NUMBER
    };
    
    if (!config.account_sid || !config.api_token || !config.phone_number) {
      console.log('⚠️ Cannot send message: WhatsApp credentials not configured in environment');
      return;
    }
    
    if (config.provider === 'twilio') {
      await sendTwilioMessage(to, message, config);
    } else if (config.provider === 'meta') {
      await sendMetaMessage(to, message, config);
    }
    
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
  }
}

// Send via Twilio
async function sendTwilioMessage(to, message, config) {
  const accountSid = config.account_sid;
  const authToken = config.api_token;
  const from = config.phone_number;
  
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  
  const body = new URLSearchParams({
    From: `whatsapp:${from}`,
    To: `whatsapp:${to}`,
    Body: message
  });
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body
  });
  
  if (!response.ok) {
    throw new Error(`Twilio API error: ${response.statusText}`);
  }
  
  console.log(`✅ Sent WhatsApp message to ${to}`);
}

// Send via Meta
async function sendMetaMessage(to, message, config) {
  const accessToken = config.api_token;
  const phoneNumberId = config.account_sid; // In Meta, this is the phone number ID
  
  const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: to,
      text: { body: message }
    })
  });
  
  if (!response.ok) {
    throw new Error(`Meta API error: ${response.statusText}`);
  }
  
  console.log(`✅ Sent WhatsApp message to ${to}`);
}

module.exports = router;
