// Event Notes & Tasks - Simplified shared list for race prep
(function() {
  'use strict';
  
  console.log('📝 Event Notes module loading...');
  
  RTS.setActiveNav();
  
  // API Base URL
  const API_BASE = window.RTS_CONFIG?.api?.baseURL || 'http://localhost:3000/api';
  
  // State
  let currentEvent = null;
  let currentList = null;
  let notes = [];
  let generalNotes = [];
  let activityData = [];
  let currentFilter = 'all';
  let activityPollInterval = null;
  let isGeneralList = false;
  
  // Bootstrap modals
  let selectEventModal, noteModal, createListModal;
  
  // Initialize
  async function init() {
    console.log('🚀 Initializing Event Notes...');
    
    // Initialize modals
    selectEventModal = new bootstrap.Modal(document.getElementById('selectEventModal'));
    noteModal = new bootstrap.Modal(document.getElementById('noteModal'));
    createListModal = new bootstrap.Modal(document.getElementById('createListModal'));
    
    // Event listeners
    document.getElementById('btnSelectEvent').addEventListener('click', showEventSelector);
    document.getElementById('btnAddNote').addEventListener('click', showAddNoteModal);
    document.getElementById('btnSaveNote').addEventListener('click', saveNote);
    document.getElementById('btnRefreshActivity').addEventListener('click', loadActivity);
    document.getElementById('btnCreateCustomList').addEventListener('click', showCreateListModal);
    document.getElementById('btnSaveCustomList').addEventListener('click', saveCustomList);
    
    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentFilter = e.target.dataset.filter;
        renderNotes();
      });
    });
    
    // Load last event from localStorage
    const savedListId = localStorage.getItem('rts.notes.lastListId');
    const savedListType = localStorage.getItem('rts.notes.lastListType');
    
    if (savedListId && savedListType) {
      await window.selectList(savedListId, savedListType);
    }
    
    console.log('✅ Event Notes initialized');
  }
  
  // Show event selector
  async function showEventSelector() {
    selectEventModal.show();
    
    try {
      // Load events
      const resp = await RTS_API.getCollectionItems('events');
      if (!resp || !resp.success) throw new Error('Failed to load events');
      
      const events = resp.items || [];
      const futureEvents = events.filter(e => {
        if (!e.start_date) return true;
        return new Date(e.start_date) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // Include events from last week
      }).sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
      
      // Load all lists to find custom ones
      const listsResp = await fetch(`${API_BASE}/packing-lists`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
      }).then(r => r.json());
      
      if (!listsResp.success) throw new Error('Failed to load lists');
      
      const allLists = listsResp.lists || [];
      const generalList = allLists.find(l => l.name === 'GENERAL LIST');
      const customLists = allLists.filter(l => 
        !l.event_id && 
        l.name !== 'GENERAL LIST'
      ).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
      // Build HTML
      let html = '';
      
      // GENERAL LIST always first
      html += `
        <div style="margin-bottom: 1.5rem;">
          <h6 class="text-muted mb-2" style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px;">System Lists</h6>
          <div class="card event-card-general mb-2" style="cursor:pointer;" onclick="window.selectList('${generalList ? generalList.id : 'GENERAL'}', 'GENERAL')">
            <div class="card-body">
              <h6 class="mb-1">📌 GENERAL LIST</h6>
              <small class="text-secondary">
                Shared notes visible on all events
              </small>
            </div>
          </div>
        </div>
      `;
      
      // Custom lists
      if (customLists.length > 0) {
        html += `
          <div style="margin-bottom: 1.5rem;">
            <h6 class="text-muted mb-2" style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px;">Custom Lists</h6>
            ${customLists.map(list => `
              <div class="card bg-light border-primary mb-2" style="cursor:pointer; border-left: 3px solid #0d6efd !important;" onclick="window.selectList('${list.id}', 'CUSTOM')">
                <div class="card-body">
                  <h6 class="mb-1">📋 ${list.name}</h6>
                  ${list.description ? `<small class="text-secondary">${list.description}</small>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        `;
      }
      
      // Event lists
      if (futureEvents.length > 0) {
        html += `
          <div>
            <h6 class="text-muted mb-2" style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px;">Event Lists</h6>
            ${futureEvents.map(e => `
              <div class="card bg-light border-secondary mb-2" style="cursor:pointer;" onclick="window.selectList('${e.id}', 'EVENT')">
                <div class="card-body">
                  <h6 class="mb-1">${e.name || 'Unnamed Event'}</h6>
                  <small class="text-secondary">
                    ${e.start_date ? new Date(e.start_date).toLocaleDateString() : 'Date TBD'}
                    ${e.circuit ? ' • ' + e.circuit : ''}
                  </small>
                </div>
              </div>
            `).join('')}
          </div>
        `;
      }
      
      document.getElementById('eventsList').innerHTML = html;
    } catch (error) {
      console.error('Error loading lists:', error);
      RTS.showToast('Failed to load lists', 'error');
    }
  }
  
  // Select list (event, general, or custom)
  window.selectList = async function(id, type) {
    selectEventModal.hide();
    
    if (type === 'GENERAL') {
      isGeneralList = true;
      await loadEventNotesList('GENERAL');
    } else if (type === 'CUSTOM') {
      isGeneralList = false;
      await loadCustomList(id);
    } else if (type === 'EVENT') {
      isGeneralList = false;
      await loadEventNotesList(id);
    }
    
    localStorage.setItem('rts.notes.lastListId', id);
    localStorage.setItem('rts.notes.lastListType', type);
  };
  
  // For backwards compatibility
  window.selectEvent = function(eventId) {
    window.selectList(eventId, eventId === 'GENERAL' ? 'GENERAL' : 'EVENT');
  };
  
  // Load custom list
  async function loadCustomList(listId) {
    try {
      const resp = await fetch(`${API_BASE}/packing-lists/${listId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
      }).then(r => r.json());
      
      if (!resp.success) throw new Error('Failed to load list');
      
      currentList = resp.list;
      notes = resp.list.items || [];
      
      // Update UI
      document.getElementById('pageSubtitle').textContent = 
        resp.list.description || 'Custom shared list';
      document.getElementById('currentListInfo').style.display = 'block';
      document.getElementById('currentListName').textContent = resp.list.name;
      document.getElementById('generalBadge').style.display = 'none';
      
      // Don't load general notes for custom lists
      generalNotes = [];
      
      updateStats();
      renderNotes();
      loadActivity();
      
      // Show WhatsApp hint
      document.getElementById('whatsappHint').style.display = 'block';
      
      // Start activity polling
      if (activityPollInterval) clearInterval(activityPollInterval);
      activityPollInterval = setInterval(loadActivity, 10000);
      
      RTS.showToast(`Loaded ${resp.list.name}`, 'success');
    } catch (error) {
      console.error('Error loading custom list:', error);
      RTS.showToast('Failed to load list', 'error');
    }
  }
  
  // Load notes list for event
  async function loadEventNotesList(eventId) {
    try {
      if (eventId === 'GENERAL') {
        // Load or create GENERAL list
        const listsResp = await fetch(`${API_BASE}/packing-lists`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
        }).then(r => r.json());
        
        if (!listsResp.success) throw new Error('Failed to load notes list');
        
        const generalList = listsResp.lists?.find(l => l.name === 'GENERAL LIST') || null;
        
        if (generalList) {
          await loadNotesList(generalList.id, true);
        } else {
          // Create GENERAL list
          const createResp = await fetch(`${API_BASE}/packing-lists`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
            },
            body: JSON.stringify({
              event_id: null,
              name: 'GENERAL LIST',
              description: 'Shared notes visible on all events'
            })
          }).then(r => r.json());
          
          if (!createResp.success) throw new Error('Failed to create general list');
          
          await loadNotesList(createResp.list.id, true);
        }
      } else {
        // Get or create notes list for this event
        const listsResp = await fetch(`${API_BASE}/packing-lists?event_id=${eventId}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
        }).then(r => r.json());
        
        if (!listsResp.success) throw new Error('Failed to load notes list');
        
        const eventLists = listsResp.lists?.filter(l => l.event_id === eventId) || [];
        
        if (eventLists.length > 0) {
          await loadNotesList(eventLists[0].id, false);
        } else {
          // Create new notes list for this event
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
              name: `${event.name} - Notes & Tasks`,
              description: 'Shared notes and tasks for event preparation'
            })
          }).then(r => r.json());
          
          if (!createResp.success) throw new Error('Failed to create notes list');
          
          await loadNotesList(createResp.list.id, false);
        }
      }
    } catch (error) {
      console.error('Error loading event notes list:', error);
      RTS.showToast('Failed to load notes list', 'error');
    }
  }
  
  // Load specific notes list
  async function loadNotesList(listId, isGeneral = false) {
    try {
      const resp = await fetch(`${API_BASE}/packing-lists/${listId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
      }).then(r => r.json());
      
      if (!resp.success) throw new Error('Failed to load notes list');
      
      currentList = resp.list;
      notes = resp.list.items || [];
      
      // Update UI
      if (isGeneral) {
        document.getElementById('pageSubtitle').textContent = 'General shared notes - visible on all events';
        document.getElementById('currentListInfo').style.display = 'block';
        document.getElementById('currentListName').textContent = 'GENERAL LIST';
        document.getElementById('generalBadge').style.display = 'inline-block';
      } else {
        document.getElementById('pageSubtitle').textContent = 
          `${resp.list.event_name || 'Event'} - Shared notes and tasks`;
        document.getElementById('currentListInfo').style.display = 'none';
        document.getElementById('generalBadge').style.display = 'none';
        
        // Also load general notes if viewing a specific event
        await loadGeneralNotes();
      }
      
      updateStats();
      renderNotes();
      loadActivity();
      
      // Show WhatsApp hint
      document.getElementById('whatsappHint').style.display = 'block';
      
      // Start activity polling (every 10 seconds)
      if (activityPollInterval) clearInterval(activityPollInterval);
      activityPollInterval = setInterval(loadActivity, 10000);
      
      RTS.showToast(`Loaded notes for ${isGeneral ? 'GENERAL LIST' : resp.list.event_name}`, 'success');
    } catch (error) {
      console.error('Error loading notes list:', error);
      RTS.showToast('Failed to load notes list', 'error');
    }
  }
  
  // Load general notes (for display on specific event lists)
  async function loadGeneralNotes() {
    if (isGeneralList) {
      generalNotes = [];
      return;
    }
    
    try {
      const listsResp = await fetch(`${API_BASE}/packing-lists`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
      }).then(r => r.json());
      
      if (!listsResp.success) return;
      
      const generalList = listsResp.lists?.find(l => l.name === 'GENERAL LIST');
      
      if (generalList) {
        const resp = await fetch(`${API_BASE}/packing-lists/${generalList.id}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
        }).then(r => r.json());
        
        if (resp.success) {
          generalNotes = resp.list.items || [];
        }
      }
    } catch (error) {
      console.error('Error loading general notes:', error);
      generalNotes = [];
    }
  }
  
  // Update stats
  function updateStats() {
    const allNotes = isGeneralList ? notes : [...generalNotes, ...notes];
    const total = allNotes.length;
    const done = allNotes.filter(n => n.status === 'packed' || n.status === 'loaded').length;
    const pending = total - done;
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    
    document.getElementById('statTotal').textContent = total;
    document.getElementById('statPending').textContent = pending;
    document.getElementById('statDone').textContent = done;
    document.getElementById('statPercent').textContent = percent + '%';
    
    document.getElementById('countAll').textContent = total;
    document.getElementById('countPending').textContent = pending;
    document.getElementById('countDone').textContent = done;
  }
  
  // Render notes
  function renderNotes() {
    if (!currentList) return;
    
    // Combine general notes (if viewing specific event) with event notes
    let allNotes = isGeneralList ? notes : [...notes];
    
    // Filter notes
    let filtered = allNotes.filter(note => {
      if (currentFilter === 'pending') return note.status === 'pending';
      if (currentFilter === 'done') return note.status === 'packed' || note.status === 'loaded';
      return true;
    });
    
    // Sort by created date (newest first)
    filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    // Build HTML
    let html = '';
    
    // Show general notes first (if viewing specific event)
    if (!isGeneralList && generalNotes.length > 0) {
      const filteredGeneral = generalNotes.filter(note => {
        if (currentFilter === 'pending') return note.status === 'pending';
        if (currentFilter === 'done') return note.status === 'packed' || note.status === 'loaded';
        return true;
      });
      
      if (filteredGeneral.length > 0) {
        html += '<div class="mb-2 px-3 py-2" style="background: rgba(220,53,69,0.1); border-left: 3px solid #dc3545;"><strong class="text-danger">📌 GENERAL NOTES (on all events)</strong></div>';
        html += filteredGeneral.map(note => renderNoteItem(note, true)).join('');
        
        if (filtered.length > 0) {
          html += '<div class="mb-2 px-3 py-2" style="background: rgba(0,0,0,0.05); border-top: 2px solid #dee2e6; margin-top: 1rem;"><strong>Event-Specific Notes</strong></div>';
        }
      }
    }
    
    // Show event-specific notes
    html += filtered.length > 0
      ? filtered.map(note => renderNoteItem(note, false)).join('')
      : (!html ? '<div class="text-center text-secondary py-5"><div>No notes match current filter</div></div>' : '');
    
    document.getElementById('notesList').innerHTML = html || '<div class="text-center text-secondary py-5"><div>No notes yet</div></div>';
  }
  
  // Render single note
  function renderNoteItem(note, isFromGeneral = false) {
    const isDone = note.status === 'packed' || note.status === 'loaded';
    const checkbox = isDone ? '☑' : '☐';
    const generalClass = isFromGeneral ? 'general' : '';
    
    return `
      <div class="note-item ${isDone ? 'done' : ''} ${generalClass}" data-note-id="${note.id}">
        <div style="font-size:1.5rem; cursor:pointer;" onclick="window.toggleNote('${note.id}', ${isFromGeneral})">
          ${checkbox}
        </div>
        
        <div class="flex-grow-1">
          <div class="mb-1">
            ${isFromGeneral ? '<span class="badge bg-danger me-2">GENERAL</span>' : ''}
            ${escapeHtml(note.item_name)}
          </div>
          <div class="small text-secondary">
            ${note.packed_by_name ? `✅ Done by ${note.packed_by_name}` : ''}
            ${note.packed_at ? ` • ${formatTimeAgo(note.packed_at)}` : ''}
            ${note.source_notes ? `<br>💬 ${escapeHtml(note.source_notes)}` : ''}
          </div>
        </div>
        
        <div class="dropdown">
          <button class="btn btn-sm btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown">
            ⋮
          </button>
          <ul class="dropdown-menu dropdown-menu-light">
            ${!isDone ? `
              <li><a class="dropdown-item" href="#" onclick="window.markAsDone('${note.id}', ${isFromGeneral}); return false;">
                ✅ Mark as Done
              </a></li>
            ` : `
              <li><a class="dropdown-item" href="#" onclick="window.markAsPending('${note.id}', ${isFromGeneral}); return false;">
                ↩️ Mark as Pending
              </a></li>
            `}
            ${!isFromGeneral || isGeneralList ? `
              <li><hr class="dropdown-divider"></li>
              <li><a class="dropdown-item text-danger" href="#" onclick="window.deleteNote('${note.id}', ${isFromGeneral}); return false;">
                🗑️ Delete
              </a></li>
            ` : ''}
          </ul>
        </div>
      </div>
    `;
  }
  
  // Toggle note
  window.toggleNote = function(noteId, isFromGeneral = false) {
    const noteList = isFromGeneral ? generalNotes : notes;
    const note = noteList.find(n => n.id === noteId);
    if (!note) return;
    
    if (note.status === 'pending') {
      window.markAsDone(noteId, isFromGeneral);
    } else {
      window.markAsPending(noteId, isFromGeneral);
    }
  };
  
  // Get list ID for a note (general or current event)
  async function getListIdForNote(isFromGeneral) {
    if (isFromGeneral && !isGeneralList) {
      // Need to find the general list ID
      const listsResp = await fetch(`${API_BASE}/packing-lists`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
      }).then(r => r.json());
      
      const generalList = listsResp.lists?.find(l => l.name === 'GENERAL LIST');
      return generalList ? generalList.id : null;
    }
    return currentList.id;
  }
  
  // Mark as done
  window.markAsDone = async function(noteId, isFromGeneral = false) {
    const noteList = isFromGeneral ? generalNotes : notes;
    const note = noteList.find(n => n.id === noteId);
    if (!note) return;
    
    const name = localStorage.getItem('rts.notes.userName') || 
      prompt('Enter your name:');
    
    if (!name) return;
    
    try {
      const listId = await getListIdForNote(isFromGeneral);
      if (!listId) throw new Error('List not found');
      
      const resp = await fetch(
        `${API_BASE}/packing-lists/${listId}/items/${noteId}/mark-packed`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
          },
          body: JSON.stringify({ packed_by_name: name })
        }
      ).then(r => r.json());
      
      if (!resp.success) throw new Error('Failed to mark as done');
      
      localStorage.setItem('rts.notes.userName', name);
      
      // Update local data
      const idx = noteList.findIndex(n => n.id === noteId);
      if (idx >= 0) noteList[idx] = resp.item;
      
      renderNotes();
      loadActivity();
      updateStats();
      
      RTS.showToast(`✅ Marked as done`, 'success');
    } catch (error) {
      console.error('Error marking as done:', error);
      RTS.showToast('Failed to mark as done', 'error');
    }
  };
  
  // Mark as pending
  window.markAsPending = async function(noteId, isFromGeneral = false) {
    const noteList = isFromGeneral ? generalNotes : notes;
    const note = noteList.find(n => n.id === noteId);
    if (!note) return;
    
    try {
      const listId = await getListIdForNote(isFromGeneral);
      if (!listId) throw new Error('List not found');
      
      const userName = localStorage.getItem('rts.notes.userName') || 'Someone';
      
      const resp = await fetch(
        `${API_BASE}/packing-lists/${listId}/items/${noteId}/mark-pending`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
          },
          body: JSON.stringify({ 
            unmarked_by_name: userName
          })
        }
      ).then(r => r.json());
      
      if (!resp.success) throw new Error('Failed to mark as pending');
      
      // Update local data
      const idx = noteList.findIndex(n => n.id === noteId);
      if (idx >= 0) noteList[idx] = resp.item;
      
      renderNotes();
      loadActivity();
      updateStats();
      
      RTS.showToast('Marked as pending', 'success');
    } catch (error) {
      console.error('Error marking as pending:', error);
      RTS.showToast('Failed to mark as pending', 'error');
    }
  };
  
  // Delete note
  window.deleteNote = async function(noteId, isFromGeneral = false) {
    if (!confirm('Delete this note?')) return;
    
    try {
      const listId = await getListIdForNote(isFromGeneral);
      if (!listId) throw new Error('List not found');
      
      const resp = await fetch(
        `${API_BASE}/packing-lists/${listId}/items/${noteId}`,
        {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
        }
      ).then(r => r.json());
      
      if (!resp.success) throw new Error('Failed to delete');
      
      if (isFromGeneral) {
        generalNotes = generalNotes.filter(n => n.id !== noteId);
      } else {
        notes = notes.filter(n => n.id !== noteId);
      }
      
      renderNotes();
      updateStats();
      
      RTS.showToast('Note deleted', 'success');
    } catch (error) {
      console.error('Error deleting note:', error);
      RTS.showToast('Failed to delete note', 'error');
    }
  };
  
  // Show add note modal
  function showAddNoteModal() {
    if (!currentList) {
      RTS.showToast('Please select an event first', 'warning');
      return;
    }
    
    document.getElementById('noteText').value = '';
    const savedName = localStorage.getItem('rts.notes.userName') || '';
    document.getElementById('noteAuthor').value = savedName;
    
    noteModal.show();
  }
  
  // Save note
  async function saveNote() {
    const text = document.getElementById('noteText').value.trim();
    const author = document.getElementById('noteAuthor').value.trim();
    
    if (!text) {
      RTS.showToast('Please enter a note', 'warning');
      return;
    }
    
    try {
      const resp = await fetch(
        `${API_BASE}/packing-lists/${currentList.id}/items`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
          },
          body: JSON.stringify({
            item_name: text,
            category: 'general',
            priority: 'normal',
            source_notes: author ? `Added by ${author}` : null,
            quantity: 1,
            required: false
          })
        }
      ).then(r => r.json());
      
      if (!resp.success) throw new Error('Failed to add note');
      
      if (author) {
        localStorage.setItem('rts.notes.userName', author);
      }
      
      notes.push(resp.item);
      renderNotes();
      loadActivity();
      updateStats();
      
      noteModal.hide();
      RTS.showToast('Note added', 'success');
    } catch (error) {
      console.error('Error adding note:', error);
      RTS.showToast('Failed to add note', 'error');
    }
  }
  
  // Show create custom list modal
  function showCreateListModal() {
    selectEventModal.hide();
    document.getElementById('customListName').value = '';
    document.getElementById('customListDescription').value = '';
    createListModal.show();
  }
  
  // Save custom list
  async function saveCustomList() {
    const name = document.getElementById('customListName').value.trim();
    const description = document.getElementById('customListDescription').value.trim();
    
    if (!name) {
      RTS.showToast('Please enter a list name', 'warning');
      return;
    }
    
    try {
      const resp = await fetch(`${API_BASE}/packing-lists`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          event_id: null,
          name: name,
          description: description || null
        })
      }).then(r => r.json());
      
      if (!resp.success) throw new Error('Failed to create list');
      
      createListModal.hide();
      RTS.showToast(`Created ${name}`, 'success');
      
      // Load the new list
      await loadCustomList(resp.list.id);
    } catch (error) {
      console.error('Error creating custom list:', error);
      RTS.showToast('Failed to create list', 'error');
    }
  }
  
  // Load activity feed
  async function loadActivity() {
    if (!currentList) return;
    
    try {
      const resp = await fetch(
        `${API_BASE}/packing-lists/${currentList.id}/activity?limit=20`,
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
  
  // Helper functions
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
