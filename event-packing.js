// Event Packing Management JavaScript
(function() {
  'use strict';
  
  console.log('📦 Event Packing module loading...');
  
  RTS.setActiveNav();
  
  // API Base URL
  const API_BASE = (window.RTS_CONFIG?.api?.baseURL) || '/api';
  
  // State
  let currentEvent = null;
  let currentPackingList = null;
  let packingItems = [];
  let activityData = [];
  let filters = {
    status: 'all',
    category: '',
    location: '',
    search: ''
  };
  let currentItemForPacking = null;
  let activityPollInterval = null;
  
  // Bootstrap modals
  let selectEventModal, itemModal, packItemModal, issueModal;
  
  // Initialize
  async function init() {
    console.log('🚀 Initializing Event Packing...');
    
    // Initialize modals
    selectEventModal = new bootstrap.Modal(document.getElementById('selectEventModal'));
    itemModal = new bootstrap.Modal(document.getElementById('itemModal'));
    packItemModal = new bootstrap.Modal(document.getElementById('packItemModal'));
    issueModal = new bootstrap.Modal(document.getElementById('issueModal'));
    
    // Event listeners
    document.getElementById('btnSelectEvent').addEventListener('click', showEventSelector);
    document.getElementById('btnNewPackingList').addEventListener('click', createNewPackingList);
    document.getElementById('btnAddItem').addEventListener('click', showAddItemModal);
    document.getElementById('btnSaveItem').addEventListener('click', saveNewItem);
    document.getElementById('btnConfirmPacked').addEventListener('click', confirmPacked);
    document.getElementById('btnReportIssue').addEventListener('click', submitIssue);
    document.getElementById('btnRefreshActivity').addEventListener('click', loadActivity);
    
    // Filter listeners
    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');
        filters.status = e.target.dataset.filter;
        renderItems();
      });
    });
    
    document.getElementById('categoryFilter').addEventListener('change', (e) => {
      filters.category = e.target.value;
      renderItems();
    });
    
    document.getElementById('locationFilter').addEventListener('change', (e) => {
      filters.location = e.target.value;
      renderItems();
    });
    
    document.getElementById('searchFilter').addEventListener('input', (e) => {
      filters.search = e.target.value.toLowerCase();
      renderItems();
    });
    
    // Try to load from localStorage
    const savedEventId = localStorage.getItem('rts.packing.lastEventId');
    if (savedEventId) {
      await loadEventPackingList(savedEventId);
    }
    
    console.log('✅ Event Packing initialized');
  }
  
  // Show event selector
  async function showEventSelector() {
    selectEventModal.show();
    
    try {
      const resp = await RTS_API.getCollectionItems('events');
      if (!resp || !resp.success) throw new Error('Failed to load events');
      
      const events = resp.items || [];
      const futureEvents = events.filter(e => {
        if (!e.start_date) return true;
        return new Date(e.start_date) > new Date();
      }).sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
      
      const html = futureEvents.length > 0
        ? futureEvents.map(e => `
            <div class="card bg-dark border-secondary mb-2" style="cursor:pointer;" onclick="window.selectEvent('${e.id}')">
              <div class="card-body">
                <h6 class="mb-1">${e.name || 'Unnamed Event'}</h6>
                <small class="text-secondary">
                  ${e.start_date ? new Date(e.start_date).toLocaleDateString() : 'Date TBD'}
                  ${e.location ? ' • ' + e.location : ''}
                </small>
              </div>
            </div>
          `).join('')
        : '<div class="text-center text-secondary">No upcoming events</div>';
      
      document.getElementById('eventsList').innerHTML = html;
    } catch (error) {
      console.error('Error loading events:', error);
      RTS.showToast('Failed to load events', 'error');
    }
  }
  
  // Select event (called from event card click)
  window.selectEvent = async function(eventId) {
    selectEventModal.hide();
    await loadEventPackingList(eventId);
    localStorage.setItem('rts.packing.lastEventId', eventId);
  };
  
  // Load packing list for event
  async function loadEventPackingList(eventId) {
    try {
      // Get or create packing list for this event
      const listsResp = await RTS_API.getPackingLists ? 
        await RTS_API.getPackingLists() :
        await fetch(`${API_BASE}/packing-lists?event_id=${eventId}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
        }).then(r => r.json());
      
      if (!listsResp.success) throw new Error('Failed to load packing lists');
      
      const eventLists = listsResp.lists?.filter(l => l.event_id === eventId) || [];
      
      if (eventLists.length > 0) {
        // Load existing packing list
        await loadPackingList(eventLists[0].id);
      } else {
        // Create new packing list for this event
        const eventResp = await RTS_API.getCollectionItems('events');
        const event = eventResp.items?.find(e => e.id === eventId);
        
        if (!event) throw new Error('Event not found');
        
        currentEvent = event;
        
        const createResp = await fetch(`${API_BASE}/packing-lists`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
          },
          body: JSON.stringify({
            event_id: eventId,
            name: `${event.name} - Packing List`,
            description: 'Event packing checklist'
          })
        }).then(r => r.json());
        
        if (!createResp.success) throw new Error('Failed to create packing list');
        
        await loadPackingList(createResp.list.id);
      }
    } catch (error) {
      console.error('Error loading event packing list:', error);
      RTS.showToast('Failed to load packing list', 'error');
    }
  }
  
  // Load specific packing list
  async function loadPackingList(listId) {
    try {
      const resp = await fetch(`${API_BASE}/packing-lists/${listId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
      }).then(r => r.json());
      
      if (!resp.success) throw new Error('Failed to load packing list');
      
      currentPackingList = resp.list;
      packingItems = resp.list.items || [];
      
      // Update UI
      document.getElementById('pageSubtitle').textContent = 
        `${resp.list.event_name || 'Event'} - ${resp.list.name}`;
      
      updateStats(resp.list.stats);
      renderItems();
      loadActivity();
      loadBoxesForPacking();
      
      // Show sections
      document.getElementById('statsSection').style.display = 'flex';
      document.getElementById('progressSection').style.display = 'block';
      
      // Start activity polling (every 10 seconds)
      if (activityPollInterval) clearInterval(activityPollInterval);
      activityPollInterval = setInterval(loadActivity, 10000);
      
      RTS.showToast(`Loaded packing list: ${resp.list.name}`, 'success');
    } catch (error) {
      console.error('Error loading packing list:', error);
      RTS.showToast('Failed to load packing list', 'error');
    }
  }
  
  // Update stats
  function updateStats(stats) {
    if (!stats) return;
    
    const total = parseInt(stats.total) || 0;
    const packed = parseInt(stats.packed) || 0;
    const loaded = parseInt(stats.loaded) || 0;
    const issues = parseInt(stats.issues) || 0;
    
    document.getElementById('statTotal').textContent = total;
    document.getElementById('statPacked').textContent = packed;
    document.getElementById('statLoaded').textContent = loaded;
    document.getElementById('statIssues').textContent = issues;
    
    // Progress bar
    const percent = total > 0 ? Math.round((packed / total) * 100) : 0;
    document.getElementById('progressBar').style.width = percent + '%';
    document.getElementById('progressPercent').textContent = percent + '%';
    document.getElementById('progressText').textContent = `${packed}/${total}`;
  }
  
  // Render packing items
  function renderItems() {
    if (!currentPackingList) return;
    
    // Filter items
    let filtered = packingItems.filter(item => {
      // Status filter
      if (filters.status !== 'all') {
        if (filters.status === 'issues' && !item.issue_reported) return false;
        if (filters.status !== 'issues' && item.status !== filters.status) return false;
      }
      
      // Category filter
      if (filters.category && item.category !== filters.category) return false;
      
      // Location filter
      if (filters.location && item.source_location !== filters.location) return false;
      
      // Search filter
      if (filters.search && !item.item_name.toLowerCase().includes(filters.search)) return false;
      
      return true;
    });
    
    // Group by category
    const grouped = {};
    filtered.forEach(item => {
      const cat = item.category || 'general';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(item);
    });
    
    // Build locations dropdown
    const uniqueLocations = [...new Set(packingItems.map(i => i.source_location).filter(Boolean))];
    document.getElementById('locationFilter').innerHTML = 
      '<option value="">All Locations</option>' +
      uniqueLocations.map(loc => `<option value="${loc}">${loc}</option>`).join('');
    
    // Render
    const html = Object.keys(grouped).map(category => {
      const items = grouped[category];
      const packedCount = items.filter(i => i.status === 'packed' || i.status === 'loaded').length;
      const percent = Math.round((packedCount / items.length) * 100);
      
      return `
        <div class="category-card ${category} card bg-dark border-secondary mb-3">
          <div class="card-header d-flex justify-content-between align-items-center">
            <span>${getCategoryIcon(category)} ${formatCategory(category)}</span>
            <span class="badge bg-secondary">${packedCount}/${items.length} (${percent}%)</span>
          </div>
          <div class="card-body p-0">
            ${items.map(item => renderPackingItem(item)).join('')}
          </div>
        </div>
      `;
    }).join('');
    
    document.getElementById('packingItemsList').innerHTML = html || 
      '<div class="text-center text-secondary py-5">No items match current filters</div>';
  }
  
  // Render single packing item
  function renderPackingItem(item) {
    const statusClass = item.issue_reported ? 'issue' : item.status;
    const checkbox = item.status === 'packed' || item.status === 'loaded' ? '☑' : '☐';
    const priorityClass = `priority-${item.priority || 'normal'}`;
    
    return `
      <div class="packing-item ${statusClass}" data-item-id="${item.id}">
        <div class="d-flex align-items-start gap-3">
          <div style="font-size:1.5rem; cursor:pointer;" onclick="window.togglePacked('${item.id}')">
            ${checkbox}
          </div>
          
          <div class="flex-grow-1">
            <div class="d-flex align-items-center gap-2 mb-1">
              <strong>${item.item_name}</strong>
              ${item.quantity > 1 ? `<span class="badge bg-secondary">x${item.quantity}</span>` : ''}
              ${item.required ? '<span class="badge bg-danger priority-badge">REQUIRED</span>' : ''}
              ${item.priority !== 'normal' ? `<span class="badge ${priorityClass} priority-badge">${item.priority.toUpperCase()}</span>` : ''}
            </div>
            
            <div class="small text-secondary">
              ${item.source_location ? `📍 ${item.source_location}` : ''}
              ${item.status === 'packed' && item.packed_by_name ? ` • ✅ Packed by ${item.packed_by_name}` : ''}
              ${item.status === 'packed' && item.truck_name ? ` → ${item.truck_name}` : ''}
              ${item.status === 'loaded' ? ` • 🚚 Loaded` : ''}
            </div>
            
            ${item.issue_reported ? `
              <div class="alert alert-danger alert-sm mt-2 mb-0 py-1 px-2">
                <small>⚠️ <strong>Issue:</strong> ${item.issue_description || 'Problem reported'}</small>
              </div>
            ` : ''}
            
            ${item.notes ? `
              <div class="small text-secondary mt-1">💬 ${item.notes}</div>
            ` : ''}
          </div>
          
          <div class="dropdown">
            <button class="btn btn-sm btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown">
              ⋮
            </button>
            <ul class="dropdown-menu dropdown-menu-dark">
              ${item.status === 'pending' ? `
                <li><a class="dropdown-item" href="#" onclick="window.markAsPacked('${item.id}'); return false;">
                  ✅ Mark as Packed
                </a></li>
              ` : ''}
              ${item.status === 'packed' ? `
                <li><a class="dropdown-item" href="#" onclick="window.markAsLoaded('${item.id}'); return false;">
                  🚚 Mark as Loaded
                </a></li>
              ` : ''}
              ${!item.issue_reported ? `
                <li><a class="dropdown-item text-warning" href="#" onclick="window.reportIssue('${item.id}'); return false;">
                  ⚠️ Report Issue
                </a></li>
              ` : ''}
              <li><hr class="dropdown-divider"></li>
              <li><a class="dropdown-item text-danger" href="#" onclick="window.deleteItem('${item.id}'); return false;">
                🗑️ Delete
              </a></li>
            </ul>
          </div>
        </div>
      </div>
    `;
  }
  
  // Toggle packed (quick checkbox action)
  window.togglePacked = function(itemId) {
    const item = packingItems.find(i => i.id === itemId);
    if (!item) return;
    
    if (item.status === 'pending') {
      window.markAsPacked(itemId);
    }
  };
  
  // Mark as packed
  window.markAsPacked = function(itemId) {
    currentItemForPacking = packingItems.find(i => i.id === itemId);
    if (!currentItemForPacking) return;
    
    // Pre-fill name from localStorage
    const savedName = localStorage.getItem('rts.packing.userName') || '';
    document.getElementById('packedByName').value = savedName;
    
    packItemModal.show();
  };
  
  // Confirm packed
  async function confirmPacked() {
    const name = document.getElementById('packedByName').value.trim();
    const truck = document.getElementById('packedTruck').value;
    const zone = document.getElementById('packedZone').value.trim();
    const boxId = document.getElementById('packedBox').value;
    const notes = document.getElementById('packedNotes').value.trim();
    
    if (!name) {
      RTS.showToast('Please enter your name', 'warning');
      return;
    }
    
    try {
      const resp = await fetch(
        `${API_BASE}/packing-lists/${currentPackingList.id}/items/${currentItemForPacking.id}/mark-packed`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
          },
          body: JSON.stringify({
            packed_by_name: name,
            truck_name: truck || null,
            truck_zone: zone || null,
            box_id: boxId || null,
            notes: notes || null
          })
        }
      ).then(r => r.json());
      
      if (!resp.success) throw new Error(resp.error || 'Failed to mark as packed');
      
      // Save name for next time
      localStorage.setItem('rts.packing.userName', name);
      
      // Update local data
      const idx = packingItems.findIndex(i => i.id === currentItemForPacking.id);
      if (idx >= 0) packingItems[idx] = resp.item;
      
      renderItems();
      loadActivity();
      updateStatsFromItems();
      
      packItemModal.hide();
      RTS.showToast(`✅ ${resp.item.item_name} marked as packed`, 'success');
    } catch (error) {
      console.error('Error marking as packed:', error);
      RTS.showToast('Failed to mark as packed', 'error');
    }
  }
  
  // Mark as loaded
  window.markAsLoaded = async function(itemId) {
    const item = packingItems.find(i => i.id === itemId);
    if (!item) return;
    
    const name = localStorage.getItem('rts.packing.userName') || 
      prompt('Enter your name:');
    
    if (!name) return;
    
    try {
      const resp = await fetch(
        `${API_BASE}/packing-lists/${currentPackingList.id}/items/${itemId}/mark-loaded`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
          },
          body: JSON.stringify({ loaded_by_name: name })
        }
      ).then(r => r.json());
      
      if (!resp.success) throw new Error('Failed to mark as loaded');
      
      // Update local data
      const idx = packingItems.findIndex(i => i.id === itemId);
      if (idx >= 0) packingItems[idx] = resp.item;
      
      renderItems();
      loadActivity();
      updateStatsFromItems();
      
      RTS.showToast(`🚚 ${item.item_name} marked as loaded`, 'success');
    } catch (error) {
      console.error('Error marking as loaded:', error);
      RTS.showToast('Failed to mark as loaded', 'error');
    }
  };
  
  // Report issue
  window.reportIssue = function(itemId) {
    currentItemForPacking = packingItems.find(i => i.id === itemId);
    if (!currentItemForPacking) return;
    
    const savedName = localStorage.getItem('rts.packing.userName') || '';
    document.getElementById('issueReporter').value = savedName;
    
    issueModal.show();
  };
  
  // Submit issue
  async function submitIssue() {
    const reporter = document.getElementById('issueReporter').value.trim();
    const description = document.getElementById('issueDescription').value.trim();
    
    if (!description) {
      RTS.showToast('Please describe the issue', 'warning');
      return;
    }
    
    try {
      const resp = await fetch(
        `${API_BASE}/packing-lists/${currentPackingList.id}/items/${currentItemForPacking.id}/report-issue`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
          },
          body: JSON.stringify({
            issue_description: description,
            reported_by_name: reporter || 'Unknown'
          })
        }
      ).then(r => r.json());
      
      if (!resp.success) throw new Error('Failed to report issue');
      
      // Update local data
      const idx = packingItems.findIndex(i => i.id === currentItemForPacking.id);
      if (idx >= 0) packingItems[idx] = resp.item;
      
      renderItems();
      loadActivity();
      updateStatsFromItems();
      
      issueModal.hide();
      document.getElementById('issueDescription').value = '';
      
      RTS.showToast('⚠️ Issue reported', 'warning');
    } catch (error) {
      console.error('Error reporting issue:', error);
      RTS.showToast('Failed to report issue', 'error');
    }
  }
  
  // Delete item
  window.deleteItem = async function(itemId) {
    if (!confirm('Delete this item from the packing list?')) return;
    
    try {
      const resp = await fetch(
        `${API_BASE}/packing-lists/${currentPackingList.id}/items/${itemId}`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
        }
      ).then(r => r.json());
      
      if (!resp.success) throw new Error('Failed to delete');
      
      packingItems = packingItems.filter(i => i.id !== itemId);
      renderItems();
      updateStatsFromItems();
      
      RTS.showToast('Item deleted', 'success');
    } catch (error) {
      console.error('Error deleting item:', error);
      RTS.showToast('Failed to delete item', 'error');
    }
  };
  
  // Show add item modal
  function showAddItemModal() {
    if (!currentPackingList) {
      RTS.showToast('Please select an event first', 'warning');
      return;
    }
    
    // Reset form
    document.getElementById('itemName').value = '';
    document.getElementById('itemCategory').value = 'pit_setup';
    document.getElementById('itemPriority').value = 'normal';
    document.getElementById('itemLocation').value = '';
    document.getElementById('itemQuantity').value = '1';
    document.getElementById('itemRequired').checked = true;
    document.getElementById('itemNotes').value = '';
    
    itemModal.show();
  }
  
  // Save new item
  async function saveNewItem() {
    const name = document.getElementById('itemName').value.trim();
    const category = document.getElementById('itemCategory').value;
    const priority = document.getElementById('itemPriority').value;
    const location = document.getElementById('itemLocation').value.trim();
    const quantity = parseInt(document.getElementById('itemQuantity').value) || 1;
    const required = document.getElementById('itemRequired').checked;
    const notes = document.getElementById('itemNotes').value.trim();
    
    if (!name) {
      RTS.showToast('Please enter item name', 'warning');
      return;
    }
    
    try {
      const resp = await fetch(
        `${API_BASE}/packing-lists/${currentPackingList.id}/items`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
          },
          body: JSON.stringify({
            item_name: name,
            category,
            priority,
            source_location: location || null,
            quantity,
            required,
            source_notes: notes || null
          })
        }
      ).then(r => r.json());
      
      if (!resp.success) throw new Error('Failed to add item');
      
      packingItems.push(resp.item);
      renderItems();
      loadActivity();
      updateStatsFromItems();
      
      itemModal.hide();
      RTS.showToast('Item added to packing list', 'success');
    } catch (error) {
      console.error('Error adding item:', error);
      RTS.showToast('Failed to add item', 'error');
    }
  }
  
  // Load activity feed
  async function loadActivity() {
    if (!currentPackingList) return;
    
    try {
      const resp = await fetch(
        `${API_BASE}/packing-lists/${currentPackingList.id}/activity?limit=20`,
        { headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` } }
      ).then(r => r.json());
      
      if (!resp.success) return;
      
      activityData = resp.activity || [];
      renderActivity();
    } catch (error) {
      console.error('Error loading activity:', error);
    }
  }
  
  // Render activity feed
  function renderActivity() {
    const html = activityData.length > 0
      ? activityData.map(a => `
          <div class="activity-item">
            <div class="time">${formatTimeAgo(a.action_at)}</div>
            <div>${a.message || `${a.action_type} by ${a.action_by_name || 'Someone'}`}</div>
          </div>
        `).join('')
      : '<div class="text-center text-secondary py-3" style="font-size:0.85rem;">No activity yet</div>';
    
    document.getElementById('activityFeed').innerHTML = html;
  }
  
  // Load boxes for packing modal
  async function loadBoxesForPacking() {
    try {
      const resp = await RTS_API.getBoxes();
      if (!resp || !resp.success) return;
      
      const boxes = resp.boxes || [];
      const html = '<option value="">No box - loose item</option>' +
        boxes.map(b => `<option value="${b.id}">${b.name || b.barcode}</option>`).join('');
      
      document.getElementById('packedBox').innerHTML = html;
    } catch (error) {
      console.error('Error loading boxes:', error);
    }
  }
  
  // Update stats from local items
  function updateStatsFromItems() {
    const stats = {
      total: packingItems.length,
      packed: packingItems.filter(i => i.status === 'packed').length,
      loaded: packingItems.filter(i => i.status === 'loaded').length,
      issues: packingItems.filter(i => i.issue_reported).length
    };
    updateStats(stats);
  }
  
  // Create new packing list
  async function createNewPackingList() {
    RTS.showToast('Please select an event first', 'info');
    showEventSelector();
  }
  
  // Helper functions
  function getCategoryIcon(category) {
    const icons = {
      pit_setup: '🏁',
      team_equipment: '🔧',
      driver_personal: '👤',
      spares: '⚙️',
      consumables: '⛽',
      tools: '🔨'
    };
    return icons[category] || '📦';
  }
  
  function formatCategory(category) {
    return category.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }
  
  function formatTimeAgo(timestamp) {
    const now = new Date();
    const then = new Date(timestamp);
    const seconds = Math.floor((now - then) / 1000);
    
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + ' mins ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + ' hours ago';
    return Math.floor(seconds / 86400) + ' days ago';
  }
  
  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
})();
