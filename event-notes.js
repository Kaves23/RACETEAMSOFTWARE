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
  let selectedTask = null;
  
  // Bootstrap modals
  let selectEventModal, noteModal, createListModal;
  
  // Initialize
  async function init() {
    console.log('🚀 Initializing Event Notes...');
    
    // Initialize modals (check if elements exist first)
    const selectModalEl = document.getElementById('selectEventModal');
    const noteModalEl = document.getElementById('noteModal');
    const createListModalEl = document.getElementById('createListModal');
    
    if (selectModalEl) selectEventModal = new bootstrap.Modal(selectModalEl);
    if (noteModalEl) noteModal = new bootstrap.Modal(noteModalEl);
    if (createListModalEl) createListModal = new bootstrap.Modal(createListModalEl);
    
    // Global functions for onclick handlers
    window.switchView = switchView;
    window.showAddTaskModal = showAddNoteModal;
    window.showListSelector = showEventSelector;
    window.toggleTask = toggleNote;
    window.selectTask = selectTask;
    window.showCalendarView = () => alert('Calendar view coming soon!');
    window.saveNote = saveNote;
    
    // Load available lists into sidebar
    await loadListsIntoSidebar();
    
    // Load last event from localStorage
    const savedListId = localStorage.getItem('rts.notes.lastListId');
    const savedListType = localStorage.getItem('rts.notes.lastListType');
    
    if (savedListId && savedListType) {
      await window.selectList(savedListId, savedListType);
    } else {
      // Default to GENERAL LIST
      await window.selectList('GENERAL', 'GENERAL');
    }
    
    console.log('✅ Event Notes initialized');
  }
  
  // Load lists into left sidebar
  async function loadListsIntoSidebar() {
    try {
      // Load all lists
      const listsResp = await fetch(`${API_BASE}/packing-lists`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
      }).then(r => r.json());
      
      if (!listsResp.success) return;
      
      const allLists = listsResp.lists || [];
      const generalList = allLists.find(l => l.name === 'GENERAL LIST');
      const customLists = allLists.filter(l => !l.event_id && l.name !== 'GENERAL LIST');
      
      let html = '';
      
      // GENERAL LIST
      if (generalList) {
        html += `<div class="sidebar-item" data-list-id="${generalList.id}" onclick="window.selectList('${generalList.id}', 'GENERAL')">
          <span>📌 General</span>
        </div>`;
      }
      
      // Custom lists
      customLists.forEach(list => {
        html += `<div class="sidebar-item" data-list-id="${list.id}" onclick="window.selectList('${list.id}', 'CUSTOM')">
          <span>📋 ${list.name}</span>
        </div>`;
      });
      
      const dynamicListsEl = document.getElementById('dynamicLists');
      if (dynamicListsEl) {
        dynamicListsEl.innerHTML = html;
      }
    } catch (error) {
      console.error('Error loading sidebar lists:', error);
    }
  }
  
  // Update which list is active in sidebar
  function updateSidebarActiveState(listId) {
    document.querySelectorAll('#dynamicLists .sidebar-item').forEach(item => {
      item.classList.remove('active');
      if (item.dataset.listId === listId) {
        item.classList.add('active');
      }
    });
  }
  
  // Show event selector
  async function showEventSelector() {
    if (!selectEventModal) {
      alert('Modal not initialized. Please refresh the page.');
      return;
    }
    
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
      
      const eventsListEl = document.getElementById('eventsList');
      if (eventsListEl) {
        eventsListEl.innerHTML = html;
      }
    } catch (error) {
      console.error('Error loading lists:', error);
      RTS.showToast('Failed to load lists', 'error');
    }
  }
  
  // Select list (event, general, or custom)
  window.selectList = async function(id, type) {
    if (selectEventModal) selectEventModal.hide();
    
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
      const listNameEl = document.querySelector('#pageSubtitle #currentListName');
      if (listNameEl) {
        listNameEl.textContent = resp.list.name + (resp.list.description ? ' - ' + resp.list.description : '');
      }
      
      // Don't load general notes for custom lists
      generalNotes = [];
      
      updateStats();
      renderNotes();
      loadActivity();
      
      // Update sidebar active state
      await loadListsIntoSidebar();
      updateSidebarActiveState(listId);
      
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
      const listNameEl = document.querySelector('#pageSubtitle #currentListName');
      if (listNameEl) {
        if (isGeneral) {
          listNameEl.textContent = 'GENERAL LIST - Shared notes visible on all events';
        } else {
          listNameEl.textContent = `${resp.list.event_name || resp.list.name} - Shared notes and tasks`;
        }
      }
      
      // Load general notes if viewing a specific event
      if (!isGeneral) {
        await loadGeneralNotes();
      }
      
      updateStats();
      renderNotes();
      loadActivity();
      
      // Update sidebar active state
      await loadListsIntoSidebar();
      updateSidebarActiveState(listId);
      
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
    const whatsapp = allNotes.filter(n => n.whatsapp_message_id || (n.source_notes && n.source_notes.includes('WhatsApp'))).length;
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    
    // Safe updates - elements may not exist in MLO layout
    const statTotal = document.getElementById('statTotal');
    const statPending = document.getElementById('statPending');
    const statDone = document.getElementById('statDone');
    const statPercent = document.getElementById('statPercent');
    const countAll = document.getElementById('countAll');
    const countPending = document.getElementById('countPending');
    const countDone = document.getElementById('countDone');
    const countWhatsApp = document.getElementById('countWhatsApp');
    
    if (statTotal) statTotal.textContent = total;
    if (statPending) statPending.textContent = pending;
    if (statDone) statDone.textContent = done;
    if (statPercent) statPercent.textContent = percent + '%';
    if (countAll) countAll.textContent = total;
    if (countPending) countPending.textContent = pending;
    if (countDone) countDone.textContent = done;
    if (countWhatsApp) countWhatsApp.textContent = whatsapp;
  }
  
  // Render notes
  function renderNotes() {
    if (!currentList) return;
    
    // Combine general notes (if viewing specific event) with event notes
    let allNotes = isGeneralList ? notes : [...notes];
    
    // Filter notes
    let filtered = allNotes.filter(note => {
      // Status filters
      if (currentFilter === 'pending') return note.status === 'pending';
      if (currentFilter === 'done') return note.status === 'packed' || note.status === 'loaded';
      
      // WhatsApp filter
      if (currentFilter === 'whatsapp') {
        const fromWhatsApp = note.whatsapp_message_id || (note.source_notes && note.source_notes.includes('WhatsApp'));
        return fromWhatsApp;
      }
      
      return true;
    });
    
    // Sort by created date (newest first)
    filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    // Build HTML
    let html = '';
    
    // Show general notes first (if viewing specific event)
    if (!isGeneralList && generalNotes.length > 0) {
      const filteredGeneral = generalNotes.filter(note => {
        // Status filters
        if (currentFilter === 'pending') return note.status === 'pending';
        if (currentFilter === 'done') return note.status === 'packed' || note.status === 'loaded';
        
        // WhatsApp filter
        if (currentFilter === 'whatsapp') {
          const fromWhatsApp = note.whatsapp_message_id || (note.source_notes && note.source_notes.includes('WhatsApp'));
          return fromWhatsApp;
        }
        
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
    
    document.getElementById('taskList').innerHTML = html || '<div class="text-center py-5" style="color:#999;"><div>No tasks yet</div></div>';
  }
  
  // Render single note/task
  function renderNoteItem(note, isFromGeneral = false) {
    const isDone = note.status === 'packed' || note.status === 'loaded';
    const fromWhatsApp = note.whatsapp_message_id || 
      (note.source_notes && note.source_notes.includes('WhatsApp'));
    
    // Author: WhatsApp phone or created_by
    let author = 'Unknown';
    if (fromWhatsApp && note.source_notes) {
      const phoneMatch = note.source_notes.match(/\+\d+/);
      author = phoneMatch ? phoneMatch[0] : 'WhatsApp';
    } else if (note.created_by_name) {
      author = note.created_by_name;
    }
    
    // Tags
    let tags = [];
    if (fromWhatsApp) tags.push('<span class="tag tag-whatsapp">WhatsApp</span>');
    if (isFromGeneral) tags.push('<span class="tag tag-manual">General</span>');
    
    // Status
    const status = isDone ? 'Done' : 'Active';
    
    // Due date
    const date = note.due_date ? new Date(note.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-';
    
    return `
      <div class="task-item ${isDone ? 'done' : ''} ${fromWhatsApp ? 'from-whatsapp' : ''}" 
           data-note-id="${note.id}" 
           onclick="window.selectTask('${note.id}', ${isFromGeneral})">
        <div>
          <input type="checkbox" class="task-checkbox" ${isDone ? 'checked' : ''} 
                 onclick="event.stopPropagation(); window.toggleNote('${note.id}', ${isFromGeneral})">
        </div>
        <div class="task-name">${escapeHtml(note.item_name)}</div>
        <div class="task-author">${author}</div>
        <div class="task-tags">${tags.join('')}</div>
        <div class="task-status">${status}</div>
        <div class="task-date">${date}</div>
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
    
    if (!noteModal) {
      alert('Modal not initialized. Please refresh the page.');
      return;
    }
    
    const noteTextEl = document.getElementById('noteText');
    const noteAuthorEl = document.getElementById('noteAuthor');
    
    if (noteTextEl) noteTextEl.value = '';
    if (noteAuthorEl) {
      const savedName = localStorage.getItem('rts.notes.userName') || '';
      noteAuthorEl.value = savedName;
    }
    
    noteModal.show();
  }
  
  // Save note
  async function saveNote() {
    const noteTextEl = document.getElementById('noteText');
    const noteAuthorEl = document.getElementById('noteAuthor');
    
    if (!noteTextEl) {
      alert('Form not initialized. Please refresh the page.');
      return;
    }
    
    const text = noteTextEl.value.trim();
    const author = noteAuthorEl ? noteAuthorEl.value.trim() : '';
    
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
      
      if (noteModal) noteModal.hide();
      RTS.showToast('Note added', 'success');
    } catch (error) {
      console.error('Error adding note:', error);
      RTS.showToast('Failed to add note', 'error');
    }
  }
  
  // Show create custom list modal
  function showCreateListModal() {
    if (!createListModal) {
      alert('Modal not initialized. Please refresh the page.');
      return;
    }
    
    if (selectEventModal) selectEventModal.hide();
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
      
      if (createListModal) createListModal.hide();
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
      ? activityData.map(a => {
          const fromWhatsApp = a.whatsapp_phone || (a.message && a.message.includes('WhatsApp'));
          return `
            <div class="activity-item ${fromWhatsApp ? 'from-whatsapp' : ''}">
              <div class="time">${formatTimeAgo(a.action_at)}</div>
              <div style="font-size:13px;color:#333;">
                ${fromWhatsApp ? '<span style="color:#25d366;">📱</span> ' : ''}
                ${a.message || `${a.action_type} by ${a.action_by_name || 'Someone'}`}
              </div>
            </div>
          `;
        }).join('')
      : '<div class="text-center py-3" style="font-size:12px;color:#999;">No activity yet</div>';
    
    const activityFeedEl = document.getElementById('activityFeed');
    if (activityFeedEl) {
      activityFeedEl.innerHTML = html;
    }
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
  
  // Export functions for onclick handlers in HTML
  window.switchView = function(view) {
    currentFilter = view;
    document.querySelectorAll('.sidebar-item').forEach(item => {
      item.classList.remove('active');
      if (item.dataset.view === view) item.classList.add('active');
    });
    renderNotes();
  };
  
  window.selectTask = function(noteId, isFromGeneral = false) {
    const noteList = isFromGeneral ? generalNotes : notes;
    const note = noteList.find(n => n.id === noteId);
    if (!note) return;
    
    // Update selected state
    document.querySelectorAll('.task-item').forEach(item => item.classList.remove('selected'));
    document.querySelector(`[data-note-id="${noteId}"]`)?.classList.add('selected');
    
    // Show task details in right panel
    const isDone = note.status === 'packed' || note.status === 'loaded';
    const fromWhatsApp = note.whatsapp_message_id || (note.source_notes && note.source_notes.includes('WhatsApp'));
    
    document.getElementById('detailHeader').textContent = isDone ? 'Task (Done)' : 'Task';
    document.getElementById('detailContent').innerHTML = `
      <div class="detail-field">
        <div class="detail-label">Task Name</div>
        <input type="text" class="detail-input" value="${escapeHtml(note.item_name)}" id="editTaskName">
      </div>
      <div class="detail-field">
        <div class="detail-label">Description</div>
        <textarea class="detail-textarea" id="editTaskDesc">${escapeHtml(note.source_notes || '')}</textarea>
      </div>
      <div class="detail-field">
        <div class="detail-label">Status</div>
        <div class="detail-value">${isDone ? '✅ Done' : '⭕ Active'}</div>
      </div>
      <div class="detail-field">
        <div class="detail-label">Source</div>
        <div class="detail-value">${fromWhatsApp ? '📱 WhatsApp' : '💻 Manual'}</div>
      </div>
      <div class="detail-field">
        <div class="detail-label">Created</div>
        <div class="detail-value">${note.created_at ? new Date(note.created_at).toLocaleString() : '-'}</div>
      </div>
      <div class="detail-field">
        <div class="detail-label">Due Date</div>
        <input type="date" class="detail-input" value="${note.due_date || ''}" id="editTaskDue">
      </div>
      <div class="d-flex gap-2">
        <button class="detail-button detail-button-primary" onclick="window.saveTaskDetails('${note.id}', ${isFromGeneral})">Save</button>
        <button class="detail-button" onclick="window.deleteNote('${note.id}', ${isFromGeneral})">Delete</button>
      </div>
    `;
  };
  
  window.saveTaskDetails = async function(noteId, isFromGeneral = false) {
    // TODO: Implement save
    alert('Save functionality coming soon!');
  };
  
  window.showAddTaskModal = showAddNoteModal;
  window.showListSelector = showEventSelector;
  window.showCalendarView = () => alert('Calendar view coming soon!');
  
  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  
})();
