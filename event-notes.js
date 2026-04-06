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
    window.showAllLists = showAllLists;
    
    // Load available lists into sidebar
    await loadListsIntoSidebar();
    
    // Load last event from localStorage
    const savedListId = localStorage.getItem('rts.notes.lastListId');
    const savedListType = localStorage.getItem('rts.notes.lastListType');
    
    if (savedListId && savedListType) {
      try {
        await window.selectList(savedListId, savedListType);
      } catch (error) {
        console.warn('Failed to load saved list, falling back to GENERAL:', error);
        // Clear invalid saved list
        localStorage.removeItem('rts.notes.lastListId');
        localStorage.removeItem('rts.notes.lastListType');
        // Fall back to GENERAL LIST
        await window.selectList('GENERAL', 'GENERAL');
      }
    } else {
      // Default to GENERAL LIST
      await window.selectList('GENERAL', 'GENERAL');
    }
    
    // Initialize column resizing
    initColumnResize();
    
    console.log('✅ Event Notes initialized');
  }
  
  // Column resize functionality
  function initColumnResize() {
    const header = document.getElementById('taskHeader');
    if (!header) return;
    
    // Load saved column widths or use defaults
    const savedWidths = localStorage.getItem('taskColumnWidths');
    const columnWidths = savedWidths ? JSON.parse(savedWidths) : [30, 'auto', 150, 100, 100, 120];
    
    function applyColumnWidths() {
      const widthStr = columnWidths.map(w => w === 'auto' ? '1fr' : w + 'px').join(' ');
      document.documentElement.style.setProperty('--col-widths', widthStr);
    }
    
    applyColumnWidths();
    
    // Add resize event handlers
    const resizeHandles = header.querySelectorAll('.resize-handle');
    let isResizing = false;
    let currentCol = null;
    let startX = 0;
    let startWidth = 0;
    
    resizeHandles.forEach(handle => {
      handle.addEventListener('mousedown', (e) => {
        isResizing = true;
        currentCol = parseInt(handle.dataset.col);
        startX = e.pageX;
        startWidth = columnWidths[currentCol];
        handle.classList.add('resizing');
        e.preventDefault();
      });
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      
      const diff = e.pageX - startX;
      const newWidth = Math.max(50, startWidth + diff); // Min 50px
      columnWidths[currentCol] = newWidth;
      applyColumnWidths();
    });
    
    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        document.querySelector('.resize-handle.resizing')?.classList.remove('resizing');
        // Save column widths
        localStorage.setItem('taskColumnWidths', JSON.stringify(columnWidths));
      }
    });
  }
  
  // Global variable to store all lists for dropdown
  let allAvailableLists = [];

  // Load lists into left sidebar
  async function loadListsIntoSidebar() {
    try {
      // Load all lists
      const listsResp = await fetch(`${API_BASE}/packing-lists`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
      }).then(r => r.json());
      
      if (!listsResp.success) return;
      
      const allLists = listsResp.lists || [];
      allAvailableLists = allLists; // Store for dropdown
      
      const generalList = allLists.find(l => l.name === 'GENERAL LIST');
      const customLists = allLists.filter(l => !l.event_id && l.name !== 'GENERAL LIST');
      const eventLists = allLists.filter(l => l.event_id);
      
      let html = '';
      
      // GENERAL LIST
      if (generalList) {
        html += `<div class="sidebar-item" data-list-id="${generalList.id}" onclick="window.selectList('${generalList.id}', 'GENERAL')">
          <span>📌 General</span>
        </div>`;
      }
      
      // Custom lists
      customLists.forEach(list => {
        html += `<div class="sidebar-item" data-list-id="${list.id}" onclick="window.selectList('${list.id}', 'CUSTOM')" style="position: relative;">
          <span>📋 ${list.name}</span>
          <button class="sidebar-delete-btn" onclick="window.deleteList('${list.id}', '${list.name}'); event.stopPropagation();" title="Delete list">×</button>
        </div>`;
      });
      
      // Event lists
      eventLists.forEach(list => {
        html += `<div class="sidebar-item" data-list-id="${list.id}" onclick="window.selectList('${list.id}', 'EVENT')" style="position: relative;">
          <span>📅 ${list.event_name || list.name}</span>
          <button class="sidebar-delete-btn" onclick="window.deleteList('${list.id}', '${list.name}'); event.stopPropagation();" title="Delete list">×</button>
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
    // Clear view filters
    document.querySelectorAll('.sidebar-item[data-view]').forEach(item => {
      item.classList.remove('active');
    });
  }

  // Show all lists view - displays tasks from all lists
  window.showAllLists = async function() {
    try {
      // Clear active states
      document.querySelectorAll('.sidebar-item').forEach(item => item.classList.remove('active'));
      document.querySelector('.sidebar-item[data-view="all-lists"]')?.classList.add('active');
      
      const listsResp = await fetch(`${API_BASE}/packing-lists`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
      }).then(r => r.json());
      
      if (!listsResp.success) throw new Error('Failed to load lists');
      
      const allLists = listsResp.lists || [];
      
      // Load all items from all lists
      let allTasks = [];
      for (const list of allLists) {
        const resp = await fetch(`${API_BASE}/packing-lists/${list.id}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
        }).then(r => r.json());
        
        if (resp.success && resp.list.items) {
          resp.list.items.forEach(item => {
            allTasks.push({
              ...item,
              _listName: list.name,
              _listId: list.id
            });
          });
        }
      }
      
      // Sort by created date
      allTasks.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
      // Render all tasks with list name
      let html = allTasks.length > 0
        ? allTasks.map(task => {
            const isDone = task.status === 'packed' || task.status === 'loaded';
            const fromWhatsApp = task.whatsapp_message_id || (task.source_notes && task.source_notes.includes('WhatsApp'));
            
            let author = 'Unknown';
            if (fromWhatsApp && task.source_notes) {
              const phoneMatch = task.source_notes.match(/\+\d+/);
              author = phoneMatch ? phoneMatch[0] : 'WhatsApp';
            } else if (task.created_by_name) {
              author = task.created_by_name;
            }
            
            let tags = [];
            if (fromWhatsApp) tags.push('<span class="tag tag-whatsapp">WhatsApp</span>');
            tags.push(`<span class="tag tag-manual">${task._listName}</span>`);
            
            const status = isDone ? 'Done' : 'Active';
            const date = task.due_date ? new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-';
            
            return `
              <div class="task-item ${isDone ? 'done' : ''} ${fromWhatsApp ? 'from-whatsapp' : ''}" 
                   data-note-id="${task.id}" 
                   onclick="window.selectTaskFromAllLists('${task.id}', '${task._listId}')">
                <div>
                  <input type="checkbox" class="task-checkbox" ${isDone ? 'checked' : ''} 
                         onclick="event.stopPropagation();">
                </div>
                <div class="task-name">${escapeHtml(task.item_name)}</div>
                <div class="task-author">${author}</div>
                <div class="task-tags">${tags.join('')}</div>
                <div class="task-status">${status}</div>
                <div class="task-date">${date}</div>
              </div>
            `;
          }).join('')
        : '<div class="text-center py-5" style="color:#999;"><div>No tasks found</div></div>';
      
      const taskListEl = document.getElementById('taskList');
      if (taskListEl) {
        taskListEl.innerHTML = html;
      }
      
      RTS.showToast(`Showing ${allTasks.length} tasks from all lists`, 'success');
    } catch (error) {
      console.error('Error loading all lists:', error);
      RTS.showToast('Failed to load all lists', 'error');
    }
  };

  // Select task from all lists view
  window.selectTaskFromAllLists = function(taskId, listId) {
    // Just highlight for now - could implement detail panel
    document.querySelectorAll('.task-item').forEach(item => item.classList.remove('selected'));
    document.querySelector(`[data-note-id="${taskId}"]`)?.classList.add('selected');
  };
  
  // Show event selector
  async function showEventSelector() {
    if (!selectEventModal) {
      alert('Modal not initialized. Please refresh the page.');
      return;
    }
    
    selectEventModal.show();
    
    try {
      // Load all packing lists (matches sidebar)
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
      const eventLists = allLists.filter(l => l.event_id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      
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
      
      // Custom lists with delete button
      if (customLists.length > 0) {
        html += `
          <div style="margin-bottom: 1.5rem;">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <h6 class="text-muted mb-0" style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px;">Custom Lists</h6>
              <button class="btn btn-sm btn-outline-primary" onclick="window.showCreateListModal(); event.stopPropagation();" style="font-size: 0.7rem; padding: 2px 8px;">+ New</button>
            </div>
            ${customLists.map(list => `
              <div class="card bg-light border-primary mb-2" style="cursor:pointer; border-left: 3px solid #0d6efd !important; position: relative;">
                <div class="card-body" onclick="window.selectList('${list.id}', 'CUSTOM')">
                  <h6 class="mb-1">📋 ${list.name}</h6>
                  ${list.description ? `<small class="text-secondary">${list.description}</small>` : ''}
                </div>
                <button class="btn btn-sm btn-danger" onclick="window.deleteList('${list.id}', '${list.name}'); event.stopPropagation();" style="position: absolute; top: 8px; right: 8px; font-size: 0.7rem; padding: 2px 8px;">Delete</button>
              </div>
            `).join('')}
          </div>
        `;
      } else {
        html += `
          <div style="margin-bottom: 1.5rem;">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <h6 class="text-muted mb-0" style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px;">Custom Lists</h6>
              <button class="btn btn-sm btn-outline-primary" onclick="window.showCreateListModal(); event.stopPropagation();" style="font-size: 0.7rem; padding: 2px 8px;">+ New</button>
            </div>
            <p class="text-muted" style="font-size: 0.85rem; margin-left: 8px;">No custom lists yet</p>
          </div>
        `;
      }
      
      // Event lists with delete button
      if (eventLists.length > 0) {
        html += `
          <div>
            <h6 class="text-muted mb-2" style="font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.5px;">Event Lists</h6>
            ${eventLists.map(list => `
              <div class="card bg-light border-secondary mb-2" style="cursor:pointer; position: relative;">
                <div class="card-body" onclick="window.selectList('${list.id}', 'EVENT')">
                  <h6 class="mb-1">📅 ${list.event_name || list.name}</h6>
                  <small class="text-secondary">
                    ${list.description || 'Event packing list'}
                  </small>
                </div>
                <button class="btn btn-sm btn-danger" onclick="window.deleteList('${list.id}', '${list.name}'); event.stopPropagation();" style="position: absolute; top: 8px; right: 8px; font-size: 0.7rem; padding: 2px 8px;">Delete</button>
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
    
    try {
      if (type === 'GENERAL') {
        isGeneralList = true;
        await loadEventNotesList('GENERAL');
      } else if (type === 'CUSTOM') {
        isGeneralList = false;
        await loadNotesList(id, false, false); // Custom lists don't show general notes
      } else if (type === 'EVENT') {
        isGeneralList = false;
        await loadNotesList(id, false, true); // Event lists show general notes
      }
      
      localStorage.setItem('rts.notes.lastListId', id);
      localStorage.setItem('rts.notes.lastListType', type);
    } catch (error) {
      console.error('Error in selectList:', error);
      // If loading failed, throw error so init() can handle it
      throw error;
    }
  };
  
  // For backwards compatibility
  window.selectEvent = function(eventId) {
    window.selectList(eventId, eventId === 'GENERAL' ? 'GENERAL' : 'EVENT');
  };
  
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
          await loadNotesList(eventLists[0].id, false, true); // Event list - include general notes
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
          
          await loadNotesList(createResp.list.id, false, true); // Event list - include general notes
        }
      }
    } catch (error) {
      console.error('Error loading event notes list:', error);
      RTS.showToast('Failed to load notes list', 'error');
    }
  }
  
  // Load specific notes list
  async function loadNotesList(listId, isGeneral = false, includeGeneralNotes = false) {
    try {
      const resp = await fetch(`${API_BASE}/packing-lists/${listId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
      }).then(r => r.json());
      
      if (!resp.success) {
        // If list not found (404), throw specific error
        throw new Error(resp.error || 'Failed to load notes list');
      }
      
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
      
      // Load general notes only if requested (for event lists)
      if (!isGeneral && includeGeneralNotes) {
        await loadGeneralNotes();
      } else {
        generalNotes = [];
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
      
      RTS.showToast(`Loaded notes for ${isGeneral ? 'GENERAL LIST' : resp.list.event_name || resp.list.name}`, 'success');
    } catch (error) {
      console.error('Error loading notes list:', error);
      RTS.showToast('Failed to load notes list', 'error');
      throw error; // Re-throw so init() can catch it
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
    if (!noteModal) {
      alert('Modal not initialized. Please refresh the page.');
      return;
    }
    
    const noteTextEl = document.getElementById('noteText');
    const noteAuthorEl = document.getElementById('noteAuthor');
    const noteListSelectEl = document.getElementById('noteListSelect');
    
    if (noteTextEl) noteTextEl.value = '';
    if (noteAuthorEl) {
      const savedName = localStorage.getItem('rts.notes.userName') || '';
      noteAuthorEl.value = savedName;
    }
    
    // Populate list dropdown
    if (noteListSelectEl && allAvailableLists.length > 0) {
      let options = '<option value="">Select list...</option>';
      
      // Group by type
      const generalList = allAvailableLists.find(l => l.name === 'GENERAL LIST');
      const customLists = allAvailableLists.filter(l => !l.event_id && l.name !== 'GENERAL LIST');
      const eventLists = allAvailableLists.filter(l => l.event_id);
      
      if (generalList) {
        options += `<option value="${generalList.id}">📌 ${generalList.name}</option>`;
      }
      
      if (customLists.length > 0) {
        options += '<option disabled>──────────</option>';
        customLists.forEach(list => {
          options += `<option value="${list.id}">📋 ${list.name}</option>`;
        });
      }
      
      if (eventLists.length > 0) {
        options += '<option disabled>──────────</option>';
        eventLists.forEach(list => {
          options += `<option value="${list.id}">📅 ${list.event_name || list.name}</option>`;
        });
      }
      
      noteListSelectEl.innerHTML = options;
      
      // Pre-select current list if available
      if (currentList) {
        noteListSelectEl.value = currentList.id;
      }
    }
    
    noteModal.show();
  }
  
  // Save note
  async function saveNote() {
    const noteTextEl = document.getElementById('noteText');
    const noteAuthorEl = document.getElementById('noteAuthor');
    const noteListSelectEl = document.getElementById('noteListSelect');
    
    if (!noteTextEl) {
      alert('Form not initialized. Please refresh the page.');
      return;
    }
    
    const text = noteTextEl.value.trim();
    const author = noteAuthorEl ? noteAuthorEl.value.trim() : '';
    const selectedListId = noteListSelectEl ? noteListSelectEl.value : (currentList ? currentList.id : null);
    
    if (!text) {
      RTS.showToast('Please enter a note', 'warning');
      return;
    }
    
    if (!selectedListId) {
      RTS.showToast('Please select a list', 'warning');
      return;
    }
    
    try {
      const resp = await fetch(
        `${API_BASE}/packing-lists/${selectedListId}/items`,
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
      
      // Refresh current view
      if (currentList && currentList.id === selectedListId) {
        notes.push(resp.item);
        renderNotes();
        loadActivity();
        updateStats();
      } else {
        // Added to different list, just show success
        RTS.showToast('Task added to selected list', 'success');
      }
      
      if (noteModal) noteModal.hide();
      RTS.showToast('Task added', 'success');
    } catch (error) {
      console.error('Error adding note:', error);
      RTS.showToast('Failed to add note', 'error');
    }
  }
  
  // Show create custom list modal
  window.showCreateListModal = function() {
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
  window.saveCustomList = async function() {
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
      
      // Reload sidebar to show new list
      await loadListsIntoSidebar();
      
      // Load the new list
      await loadNotesList(resp.list.id, false, false); // Custom list - don't include general notes
    } catch (error) {
      console.error('Error creating custom list:', error);
      RTS.showToast('Failed to create list', 'error');
    }
  }
  
  // Delete list
  window.deleteList = async function(listId, listName) {
    if (listName === 'GENERAL LIST') {
      RTS.showToast('Cannot delete GENERAL LIST', 'error');
      return;
    }
    
    if (!confirm(`Delete "${listName}"?\n\nThis will permanently delete the list and all its tasks.`)) {
      return;
    }
    
    try {
      const resp = await fetch(`${API_BASE}/packing-lists/${listId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        }
      }).then(r => r.json());
      
      if (!resp.success) throw new Error('Failed to delete list');
      
      RTS.showToast(`Deleted ${listName}`, 'success');
      
      // Reload sidebar
      await loadListsIntoSidebar();
      
      // If we just deleted the current list, switch to GENERAL
      if (currentList && currentList.id === listId) {
        await window.selectList('GENERAL', 'GENERAL');
      }
      
      // Refresh the modal view
      await showEventSelector();
    } catch (error) {
      console.error('Error deleting list:', error);
      RTS.showToast('Failed to delete list', 'error');
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
    try {
      // Get the updated values from the form
      const itemName = document.getElementById('editTaskName')?.value.trim();
      const sourceNotes = document.getElementById('editTaskDesc')?.value.trim();
      const dueDate = document.getElementById('editTaskDue')?.value;
      
      if (!itemName) {
        alert('Task name is required');
        return;
      }
      
      // Find the note to get the list ID
      const noteList = isFromGeneral ? generalNotes : notes;
      const note = noteList.find(n => n.id === noteId);
      if (!note) {
        alert('Task not found');
        return;
      }
      
      const listId = note.packing_list_id;
      
      // Prepare update payload
      const updates = {
        item_name: itemName,
        source_notes: sourceNotes
      };
      
      if (dueDate) {
        updates.due_date = dueDate;
      }
      
      // Call API to update
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_BASE}/packing-lists/${listId}/items/${noteId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(updates)
      });
      
      const data = await response.json();
      
      if (!data.success) {
        alert('Error saving task: ' + (data.error || 'Unknown error'));
        return;
      }
      
      // Update local cache
      const index = noteList.findIndex(n => n.id === noteId);
      if (index >= 0) {
        Object.assign(noteList[index], data.item);
      }
      
      // Refresh the view
      renderNotes();
      selectTask(noteId, isFromGeneral);
      
      if (RTS.showToast) {
        RTS.showToast('✅ Task saved', 'success');
      }
    } catch (error) {
      console.error('Error saving task:', error);
      alert('Failed to save task: ' + error.message);
    }
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
