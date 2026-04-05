# WhatsApp Event Packing Integration

## Overview

This system integrates with WhatsApp to manage event packing lists collaboratively. Team members can check off items as they pack them, see real-time updates, and report issues - all from WhatsApp while working in the workshop or storage areas.

---

## 📱 How It Works

### **User Experience (WhatsApp)**

1. **Subscribe to Event**: Team member sends message to WhatsApp Business number
   ```
   User: "Subscribe Silverstone Race"
   Bot: "✅ You're now subscribed to Silverstone Race Weekend packing updates!"
   ```

2. **View Packing List**: 
   ```
   User: "Show list"
   Bot: 
   "📦 Silverstone Race Weekend - Packing List
   
   ⚠️ PIT SETUP (4/10 packed)
   ☐ Tire warmers x4 - Workshop
   ☑ Generator - Storage Unit A (packed by Mike, 2 hours ago)
   ☐ Awning tent - Storage Unit B
   ☐ Tables x6 - Workshop
   ...
   
   🏎️ DRIVER EQUIPMENT (2/5 packed)
   ☑ Helmet x2 - Driver home (packed by Sarah, 1 hour ago)
   ☐ Race suits x2 - Workshop
   ...
   
   Reply with item number to mark as packed"
   ```

3. **Mark Item as Packed**:
   ```
   User: "Packed #3 awning tent in main truck"
   Bot: "✅ Marked 'Awning tent' as packed into Main Truck
        Progress: 5/10 pit setup items packed"
   ```

4. **Report Issue**:
   ```
   User: "Issue #4 - only 4 tables, not 6"
   Bot: "⚠️ Issue reported for 'Tables x6'
        Team has been notified. Please add note if needed."
   ```

5. **Real-time Feed** (Broadcast to all subscribers):
   ```
   Bot: "📦 Mike just packed 'Generator' into Storage Bay A"
   Bot: "⚠️ Sarah reported issue with 'Tables x6' - only 4 available"
   Bot: "✅ John loaded 'Awning tent' onto Main Truck"
   ```

---

## 🔧 Technical Implementation

### **1. WhatsApp Business API Setup**

You'll need:
- WhatsApp Business Account (via Meta/Facebook)
- Phone number (can be your existing number)
- Webhook URL for receiving messages
- Access token for sending messages

**Setup Steps:**
1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Create App → Business → WhatsApp
3. Get Phone Number ID and Access Token
4. Configure webhook: `https://your-domain.com/api/whatsapp/webhook`
5. Save config to `whatsapp_config` table

### **2. Database Schema**

**Tables Created:**

```sql
-- Master packing list for an event
event_packing_lists (
  id, event_id, name, description, status,
  packing_deadline, loading_time, departure_time
)

-- Individual items to pack
event_packing_items (
  id, packing_list_id, item_name,
  category, priority, source_location,
  status, packed_by, packed_at,
  box_id, truck_name, truck_zone,
  notes, issue_reported
)

-- Activity feed (WhatsApp-style)
event_packing_activity (
  id, packing_list_id, action_type,
  action_by_name, message,
  whatsapp_message_id, whatsapp_phone
)

-- Vehicles/trucks being loaded
event_vehicles (
  id, event_id, name, vehicle_type,
  loading_status, departure_time
)

-- Who gets WhatsApp notifications
event_whatsapp_subscribers (
  id, event_id, phone_number, contact_name,
  receive_updates, can_update_checklist
)

-- Reusable templates
packing_templates (
  id, name, event_type
)
```

### **3. API Endpoints to Create**

**WhatsApp Webhook** (`server/routes/whatsapp.js`):
```javascript
// POST /api/whatsapp/webhook
// Receives messages from WhatsApp
router.post('/webhook', async (req, res) => {
  const { messages } = req.body.entry[0].changes[0].value;
  
  for (const message of messages) {
    const phone = message.from;
    const text = message.text.body;
    
    // Parse command
    if (text.startsWith('Subscribe')) {
      await subscribeToEvent(phone, extractEventName(text));
    } else if (text === 'Show list') {
      await sendPackingList(phone);
    } else if (text.startsWith('Packed')) {
      await markItemPacked(phone, text);
    } else if (text.startsWith('Issue')) {
      await reportIssue(phone, text);
    }
  }
  
  res.sendStatus(200);
});

// GET /api/whatsapp/webhook
// Webhook verification
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});
```

**Packing List API** (`server/routes/packing.js`):
```javascript
// GET /api/events/:eventId/packing-list
router.get('/:eventId/packing-list', async (req, res) => {
  const list = await db.query(`
    SELECT pl.*, 
           COUNT(pi.id) as total_items,
           COUNT(CASE WHEN pi.status = 'packed' THEN 1 END) as packed_items
    FROM event_packing_lists pl
    LEFT JOIN event_packing_items pi ON pl.id = pi.packing_list_id
    WHERE pl.event_id = $1
    GROUP BY pl.id
  `, [req.params.eventId]);
  
  res.json({ success: true, list: list.rows[0] });
});

// GET /api/packing-lists/:listId/items
router.get('/:listId/items', async (req, res) => {
  const items = await db.query(`
    SELECT * FROM event_packing_items
    WHERE packing_list_id = $1
    ORDER BY category, sort_order
  `, [req.params.listId]);
  
  res.json({ success: true, items: items.rows });
});

// POST /api/packing-lists/:listId/items/:itemId/mark-packed
router.post('/:listId/items/:itemId/mark-packed', async (req, res) => {
  const { packed_by_name, truck_name, box_id, notes } = req.body;
  
  await db.query(`
    UPDATE event_packing_items
    SET status = 'packed',
        packed_by_name = $1,
        packed_at = NOW(),
        truck_name = $2,
        box_id = $3,
        notes = $4
    WHERE id = $5
  `, [packed_by_name, truck_name, box_id, notes, req.params.itemId]);
  
  // Log activity
  await logPackingActivity(listId, itemId, 'item_packed', packed_by_name);
  
  // Broadcast to WhatsApp subscribers
  await broadcastUpdate(listId, `${packed_by_name} packed item into ${truck_name}`);
  
  res.json({ success: true });
});

// POST /api/packing-lists/:listId/create-from-template
router.post('/:listId/create-from-template', async (req, res) => {
  const { template_id } = req.body;
  
  // Copy template items to packing list
  await db.query(`
    INSERT INTO event_packing_items (
      packing_list_id, item_name, item_id, category,
      quantity, priority, source_location
    )
    SELECT $1, item_name, item_id, category,
           quantity, priority, typical_location
    FROM packing_template_items
    WHERE template_id = $2
  `, [req.params.listId, template_id]);
  
  res.json({ success: true });
});
```

### **4. WhatsApp Message Templates**

**Send Packing List:**
```javascript
async function sendPackingList(phone, packingListId) {
  const items = await getPackingItems(packingListId);
  
  const grouped = groupBy(items, 'category');
  let message = '📦 Packing List\n\n';
  
  for (const [category, items] of grouped) {
    const packed = items.filter(i => i.status === 'packed').length;
    message += `\n${getCategoryEmoji(category)} ${category.toUpperCase()} (${packed}/${items.length})\n`;
    
    items.forEach((item, idx) => {
      const checkbox = item.status === 'packed' ? '☑' : '☐';
      message += `${checkbox} #${idx + 1} ${item.item_name} x${item.quantity}`;
      if (item.source_location) message += ` - ${item.source_location}`;
      if (item.status === 'packed') message += ` ✅ ${item.packed_by_name}`;
      message += '\n';
    });
  }
  
  message += '\n💬 Reply "Packed #X" to mark item packed';
  message += '\n⚠️ Reply "Issue #X message" to report problem';
  
  await sendWhatsAppMessage(phone, message);
}
```

**Broadcast Update:**
```javascript
async function broadcastUpdate(packingListId, message) {
  const subscribers = await db.query(`
    SELECT phone_number FROM event_whatsapp_subscribers
    WHERE event_id = (
      SELECT event_id FROM event_packing_lists WHERE id = $1
    )
    AND receive_updates = true
  `, [packingListId]);
  
  for (const sub of subscribers.rows) {
    await sendWhatsAppMessage(sub.phone_number, `📢 ${message}`);
  }
}
```

---

## 📊 Web UI Features

**Packing Dashboard** (`event-packing.html`):

1. **Progress Overview**:
   ```
   ┌─────────────────────────────────────┐
   │ Silverstone Race Weekend            │
   │ ════════════════════════════════════│
   │ Overall Progress: ████████░░  76%   │
   │                                     │
   │ Pit Setup:        ████████░░  80%   │
   │ Team Equipment:   ██████████  100%  │
   │ Driver Personal:  ████░░░░░░  40%   │
   │ Spares:           ████████░░  75%   │
   └─────────────────────────────────────┘
   ```

2. **Live Activity Feed** (like WhatsApp):
   ```
   ┌─────────────────────────────────────┐
   │ 📱 LIVE FEED                        │
   ├─────────────────────────────────────┤
   │ 2 mins ago                          │
   │ Mike: Packed Generator into Truck 1 │
   │                                     │
   │ 5 mins ago                          │
   │ Sarah: ⚠️ Only 4 tables, not 6      │
   │                                     │
   │ 10 mins ago                         │
   │ John: Loaded awning onto truck      │
   └─────────────────────────────────────┘
   ```

3. **Checklist with Filters**:
   - Filter by: All / Pending / Packed / Issues
   - Filter by category: Pit Setup / Team / Drivers
   - Filter by location: Workshop / Storage A / etc.
   - Filter by truck: Not assigned / Main Truck / Van 1

4. **Truck Loading View**:
   ```
   ┌──────────────┬──────────────┐
   │ MAIN TRUCK   │ VAN 1        │
   │ 95% loaded   │ 60% loaded   │
   ├──────────────┼──────────────┤
   │ ✅ Generator │ ✅ Tools     │
   │ ✅ Awning    │ ☐ Spares    │
   │ ✅ Tables x4 │ ☐ Fuel cans │
   └──────────────┴──────────────┘
   ```

---

## 🚀 Implementation Priority

### **Phase 1: Basic Packing List** (No WhatsApp)
1. Create packing list UI in web app
2. Add items manually or from template
3. Mark items as packed with location/truck
4. Show progress per category
5. Activity feed in web UI

### **Phase 2: WhatsApp Integration**
1. Set up WhatsApp Business API
2. Create webhook endpoint
3. Implement basic commands (show list, mark packed)
4. Test with small team

### **Phase 3: Advanced Features**
1. Photo uploads (packed items)
2. Voice messages for notes
3. Location sharing (for distributed packing)
4. QR code scanning for items
5. Barcode scanning for boxes

---

## 🔐 Security

- Verify WhatsApp webhook signature
- Rate limiting on API endpoints
- Whitelist phone numbers in `event_whatsapp_subscribers`
- Encrypt access tokens in database
- Audit log all packing actions

---

## 📝 Environment Variables

Add to `.env`:
```
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_ACCESS_TOKEN=your_access_token
WHATSAPP_VERIFY_TOKEN=random_secure_string
WHATSAPP_BUSINESS_ACCOUNT_ID=your_account_id
```

---

## 💡 Usage Examples

### **Create Packing List from Template**:
```javascript
// 1. Create template (one time)
await RTS_API.createPackingTemplate({
  name: 'Standard Race Weekend',
  event_type: 'race',
  items: [
    { name: 'Tire warmers', category: 'pit_setup', quantity: 4, location: 'Workshop' },
    { name: 'Generator', category: 'pit_setup', quantity: 1, location: 'Storage A' },
    // ... more items
  ]
});

// 2. Create packing list for event
const list = await RTS_API.createPackingList({
  event_id: 'event-123',
  template_id: 'template-456',
  name: 'Silverstone Race Weekend',
  packing_deadline: '2026-04-10T18:00:00Z'
});

// 3. Subscribe WhatsApp numbers
await RTS_API.subscribeToPackingList({
  packing_list_id: list.id,
  phone: '+447123456789',
  name: 'Mike (Mechanic)',
  can_update: true
});
```

### **Mark Item Packed** (from web or WhatsApp):
```javascript
await RTS_API.markItemPacked({
  item_id: 'item-789',
  packed_by_name: 'Mike',
  truck_name: 'Main Truck',
  truck_zone: 'Front',
  box_id: 'box-123',  // optional
  notes: 'Placed near generator for easy access'
});
```

---

## 🎯 Benefits

✅ **No more scattered WhatsApp messages** - Everything in one system
✅ **Real-time progress tracking** - Know exactly what's packed
✅ **Multi-location coordination** - Workshop + storage + driver homes
✅ **Truck loading planning** - Know what goes where
✅ **Accountability** - See who packed what and when
✅ **Issue tracking** - Report and resolve problems quickly
✅ **Reusable templates** - Save time for recurring events
✅ **Mobile-first** - Works via WhatsApp, no app needed

---

## 📱 Next Steps

1. ✅ Database schema created (migration 016)
2. ⏳ Create web UI for packing lists
3. ⏳ Build WhatsApp webhook endpoint
4. ⏳ Test with your team's next event
5. ⏳ Iterate based on feedback

This replicates your current WhatsApp workflow but makes it structured, trackable, and integrated with your inventory system! 🚀
