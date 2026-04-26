// Event Notes & Tasks - Simplified shared list for race prep
(function() {
  'use strict';
  
  console.log('📝 Event Notes module loading...');
  
  RTS.setActiveNav();
  
  // API Base URL
  const API_BASE = (window.RTS_CONFIG?.api?.baseURL) || '/api';
  
  // State
  let currentEvent = null;
  let currentList = null;
  let notes = [];
  let generalNotes = [];
  let activityData = [];
  let currentFilter = 'all';
  let _chipFilter = 'all';
  let activityPollInterval = null;
  let isGeneralList = false;
  let selectedTask = null;
  let _searchQuery = '';
  let _bulkSelectMode = false;
  let _celebratedList = null;
  let _groupBy = 'none';
  
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
    window.showCalendarView = function() { window._showCalView(); };
    window.showKanbanView   = function() { window._showKanbanView(); };
    window.saveNote = saveNote;
    window.showAllLists = showAllLists;
    window.filterTasks = window.filterTasks || function(q) { _searchQuery = (q||'').toLowerCase().trim(); renderNotes(); };
    window.handleTaskCheckbox = window.handleTaskCheckbox || function(noteId, isFromGeneral, el) { window.toggleNote(noteId, isFromGeneral); };
    window.toggleBulkMode = window.toggleBulkMode || function() {};
    window.bulkComplete = window.bulkComplete || function() {};
    window.cloneList = window.cloneList || function() {};
    window.addSubtask = window.addSubtask || function() {};
    
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
    
    // Initialize drag-to-reorder
    initDragReorder();
    
    console.log('✅ Event Notes initialized');
  }
  
  // Column resize functionality
  function initColumnResize() {
    const header = document.getElementById('taskHeader');
    if (!header) return;

    // Default pixel widths for 8 columns: Task Name, Flag, Relation, Event, Complete, Due Date, Assigned, Tags
    const DEFAULTS = [260, 58, 100, 100, 88, 118, 105, 85];
    const saved = localStorage.getItem('ckl.colWidths');
    const widths = saved ? JSON.parse(saved) : [...DEFAULTS];

    function applyWidths() {
      let el = document.getElementById('_ckColStyle');
      if (!el) {
        el = document.createElement('style');
        el.id = '_ckColStyle';
        document.head.appendChild(el);
      }
      const tpl = widths.map(w => w + 'px').join(' ');
      el.textContent = `#taskHeader, .task-item { grid-template-columns: ${tpl}; gap: 0; }`;
    }

    applyWidths();

    header.querySelectorAll('.resize-handle').forEach(handle => {
      const col = parseInt(handle.dataset.col);
      handle.addEventListener('mousedown', e => {
        const startX = e.pageX;
        const startW = widths[col];
        handle.classList.add('resizing');
        e.preventDefault();

        function onMove(ev) {
          widths[col] = Math.max(50, startW + (ev.pageX - startX));
          applyWidths();
        }
        function onUp() {
          handle.classList.remove('resizing');
          localStorage.setItem('ckl.colWidths', JSON.stringify(widths));
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
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
        const isActive = currentList && currentList.id === generalList.id;
        const done = isActive ? notes.filter(n => n.status==='packed'||n.status==='completed'||n.status==='loaded').length : '';
        const total = isActive ? notes.length : '';
        const prog = isActive ? `<span class="sli-progress">${done}/${total}</span>` : '';
        html += `<div class="sidebar-list-item ${isActive ? 'active' : ''}" data-list-id="${generalList.id}" onclick="window.selectList('${generalList.id}', 'GENERAL')">
          <span class="sli-icon">📌</span>
          <span class="sli-name">General</span>
          ${prog}
        </div>`;
      }

      // Custom lists
      if (customLists.length > 0) {
        customLists.forEach(list => {
          const isActive = currentList && currentList.id === list.id;
          const done = isActive ? notes.filter(n => n.status==='packed'||n.status==='completed'||n.status==='loaded').length : '';
          const total = isActive ? notes.length : '';
          const prog = isActive ? `<span class="sli-progress">${done}/${total}</span>` : '';
          const safeName = list.name.replace(/'/g, "\\'");
          const listColor = localStorage.getItem('rts.list.color.' + list.id) || '';
          const colorDot = listColor ? `<span class="sli-color-dot" style="background:${listColor};"></span>` : '';
          html += `<div class="sidebar-list-item ${isActive ? 'active' : ''}" data-list-id="${list.id}" onclick="window.selectList('${list.id}', 'CUSTOM')">
            ${colorDot}<span class="sli-icon">📋</span>
            <span class="sli-name" title="${list.name}">${list.name}</span>
            ${prog}
            <span class="sli-actions" onclick="event.stopPropagation()">
              <button class="sli-btn sli-btn-clone" onclick="window.cloneList('${list.id}','${safeName}')" title="Clone">⎘</button>
              <button class="sli-btn sli-btn-delete" onclick="window.deleteList('${list.id}','${safeName}')" title="Delete">×</button>
            </span>
          </div>`;
        });
      }

      // Event lists
      if (eventLists.length > 0) {
        eventLists.forEach(list => {
          const isActive = currentList && currentList.id === list.id;
          const done = isActive ? notes.filter(n => n.status==='packed'||n.status==='completed'||n.status==='loaded').length : '';
          const total = isActive ? notes.length : '';
          const prog = isActive ? `<span class="sli-progress">${done}/${total}</span>` : '';
          const safeName = (list.event_name || list.name).replace(/'/g, "\\'");
          html += `<div class="sidebar-list-item ${isActive ? 'active' : ''}" data-list-id="${list.id}" onclick="window.selectList('${list.id}', 'EVENT')">
            <span class="sli-icon">📅</span>
            <span class="sli-name" title="${list.event_name || list.name}">${list.event_name || list.name}</span>
            ${prog}
            <span class="sli-actions" onclick="event.stopPropagation()">
              <button class="sli-btn sli-btn-delete" onclick="window.deleteList('${list.id}','${safeName}')" title="Delete">×</button>
            </span>
          </div>`;
        });
      }
      
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
    document.querySelectorAll('#dynamicLists .sidebar-list-item').forEach(item => {
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
      document.querySelectorAll('.sidebar-item, .sidebar-list-item').forEach(item => item.classList.remove('active'));
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
            const isDone = task.status === 'packed' || task.status === 'loaded' || task.status === 'completed';
            const fromWhatsApp = task.whatsapp_message_id || (task.source_notes && task.source_notes.includes('WhatsApp'));
            
            let tags = [];
            if (fromWhatsApp) tags.push('<span class="tag tag-whatsapp">📱</span>');
            if (task.is_milestone) tags.push('<span class="tag tag-milestone">🏁</span>');
            if (task.tags) {
              const taskTags = task.tags.split(',').map(t => t.trim()).filter(Boolean);
              taskTags.forEach(tag => tags.push(`<span class="tag">${escapeHtml(tag)}</span>`));
            }
            
            const date = task.due_date ? new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-';
            
            const progress = task.progress_percent || 0;
            const priorityIcons = {
              critical: '🔴',
              high: '🟠',
              normal: '⚪',
              low: '🟢'
            };
            const priorityIcon = priorityIcons[task.priority] || priorityIcons.normal;
            
            const relationName = task._listName || 'Unknown';
            const eventName = task.linked_event_id ? '🎯 [Event]' : '-';
            const assignedTo = task.assigned_to_name || '-';
            
            return `
              <div class="task-item ${isDone ? 'done' : ''} ${fromWhatsApp ? 'from-whatsapp' : ''}" 
                   data-note-id="${task.id}" 
                   onclick="window.selectTaskFromAllLists('${task.id}', '${task._listId}')">
                <div class="task-col task-name-col" style="display: flex; align-items: center; gap: 4px;">
                  <input type="checkbox" class="task-checkbox" ${isDone ? 'checked' : ''} 
                         onclick="event.stopPropagation();" 
                         style="margin: 0 4px;">
                  <span class="task-name-text">${escapeHtml(task.item_name)}</span>
                </div>
                <div class="task-col task-flag-col" title="${task.priority}">${priorityIcon}</div>
                <div class="task-col task-relation-col">${escapeHtml(relationName)}</div>
                <div class="task-col task-event-col">${eventName}</div>
                <div class="task-col task-progress-col">
                  <div style="display: flex; align-items: center; gap: 4px;">
                    <div style="flex: 1; height: 4px; background: #e0e0e0; border-radius: 2px; overflow: hidden;">
                      <div style="height: 100%; width: ${progress}%; background: linear-gradient(90deg, #3b82f6, #8b5cf6);"></div>
                    </div>
                    <span style="font-size: 10px; color: #666; min-width: 30px;">${progress}%</span>
                  </div>
                </div>
                <div class="task-col task-date-col">${date}</div>
                <div class="task-col task-assigned-col" style="font-size: 11px;">${escapeHtml(assignedTo)}</div>
                <div class="task-col task-tags-col">${tags.join(' ')}</div>
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

    // Sidebar stat pills
    const sStatDone = document.getElementById('sStatDone');
    const sStatTotal = document.getElementById('sStatTotal');
    const sStatPct = document.getElementById('sStatPct');
    const sidebarListName = document.getElementById('sidebarListName');
    if (sStatDone) sStatDone.textContent = done;
    if (sStatTotal) sStatTotal.textContent = total;

    // Required items gate: can't reach 100% until all required items are done
    const requiredItems = (isGeneralList ? notes : [...notes]).filter(n => n.required);
    const requiredPending = requiredItems.filter(n => n.status !== 'packed' && n.status !== 'loaded' && n.status !== 'completed');
    const gated = percent >= 100 && requiredPending.length > 0;
    const displayPercent = gated ? 99 : percent;

    if (sStatPct) sStatPct.textContent = displayPercent + '%' + (gated ? ' ★' : '');

    // Update sidebar progress bar
    const progressFill = document.getElementById('sidebarProgressFill');
    if (progressFill) {
      progressFill.style.width = displayPercent + '%';
      progressFill.style.background = displayPercent >= 100 ? '#28a745' : displayPercent >= 70 ? '#17a2b8' : displayPercent >= 40 ? '#ffc107' : '#dc3545';
    }

    // Celebration when 100% complete
    if (displayPercent >= 100 && total > 0 && currentList) {
      if (_celebratedList !== currentList.id) {
        _celebratedList = currentList.id;
        setTimeout(triggerCelebration, 300);
      }
    } else if (displayPercent < 100 && currentList) {
      _celebratedList = null; // Reset so it fires again if list goes back to 100%
    }

    // Update print meta
    const pm = document.getElementById('printListMeta');
    if (pm) pm.textContent = `Printed: ${new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})} · ${done}/${total} complete`;
    if (sidebarListName && currentList) sidebarListName.textContent = currentList.name;
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
      if (currentFilter === 'done') return note.status === 'packed' || note.status === 'loaded' || note.status === 'completed';

      // WhatsApp filter
      if (currentFilter === 'whatsapp') {
        const fromWhatsApp = note.whatsapp_message_id || (note.source_notes && note.source_notes.includes('WhatsApp'));
        return fromWhatsApp;
      }

      // Next 7 days rolling view
      if (currentFilter === '7days') {
        const now7 = new Date(); now7.setHours(0,0,0,0);
        const end7 = new Date(); end7.setDate(end7.getDate()+7); end7.setHours(23,59,59,999);
        const done7 = note.status === 'packed' || note.status === 'loaded' || note.status === 'completed';
        if (done7 || !note.due_date) return false;
        const d = new Date(note.due_date);
        return d >= now7 && d <= end7;
      }

      return true;
    });

    // Search filter
    const searchQuery = (_searchQuery || '').toLowerCase().trim();
    if (searchQuery) {
      filtered = filtered.filter(note =>
        (note.item_name || '').toLowerCase().includes(searchQuery) ||
        (note.source_notes || '').toLowerCase().includes(searchQuery) ||
        (note.assigned_to_name || '').toLowerCase().includes(searchQuery) ||
        (note.tags || '').toLowerCase().includes(searchQuery)
      );
    }

    // Chip filter (applied after view/search filters)
    if (_chipFilter === 'overdue') {
      const now = new Date();
      filtered = filtered.filter(note => {
        const done = note.status === 'packed' || note.status === 'loaded' || note.status === 'completed';
        return !done && note.due_date && new Date(note.due_date) < now;
      });
    } else if (_chipFilter === 'today') {
      const today = new Date().toDateString();
      filtered = filtered.filter(note => note.due_date && new Date(note.due_date).toDateString() === today);
    } else if (_chipFilter === 'critical') {
      filtered = filtered.filter(note => note.priority === 'critical');
    } else if (_chipFilter === 'blocked') {
      filtered = filtered.filter(note => note.status === 'blocked');
    } else if (_chipFilter === 'required') {
      filtered = filtered.filter(note => note.required);
    }

    // Sort: overdue non-done tasks first, then by sort_order
    const now = new Date();
    filtered.sort((a, b) => {
      const aOverdue = a.due_date && new Date(a.due_date) < now && a.status === 'pending';
      const bOverdue = b.due_date && new Date(b.due_date) < now && b.status === 'pending';
      if (aOverdue && !bOverdue) return -1;
      if (!aOverdue && bOverdue) return 1;
      return (a.sort_order || 0) - (b.sort_order || 0);
    });
    
    // Build HTML
    let html = '';
    
    // Show general notes first (if viewing specific event)
    if (!isGeneralList && generalNotes.length > 0) {
      const filteredGeneral = generalNotes.filter(note => {
        // Status filters
        if (currentFilter === 'pending') return note.status === 'pending';
        if (currentFilter === 'done') return note.status === 'packed' || note.status === 'loaded' || note.status === 'completed';
        
        // WhatsApp filter
        if (currentFilter === 'whatsapp') {
          const fromWhatsApp = note.whatsapp_message_id || (note.source_notes && note.source_notes.includes('WhatsApp'));
          return fromWhatsApp;
        }
        
        return true;
      });
      
      if (filteredGeneral.length > 0) {
        html += '<div class="mb-2 px-3 py-2" style="background: rgba(220,53,69,0.1); border-left: 3px solid #dc3545;"><strong class="text-danger">📌 GENERAL NOTES (on all events)</strong></div>';
        const generalTree = buildTree(filteredGeneral);
        html += renderTree(generalTree, true);
        
        if (filtered.length > 0) {
          html += '<div class="mb-2 px-3 py-2" style="background: rgba(0,0,0,0.05); border-top: 2px solid #dee2e6; margin-top: 1rem;"><strong>Event-Specific Notes</strong></div>';
        }
      }
    }
    
    // Show event-specific notes as tree (with optional group-by or 7-day view)
    if (filtered.length > 0) {
      if (currentFilter === '7days' && window._render7DaysGrouped) {
        html += window._render7DaysGrouped(filtered);
      } else if (_groupBy && _groupBy !== 'none' && window._buildGroupedHTML) {
        html += window._buildGroupedHTML(filtered, false);
      } else {
        const eventTree = buildTree(filtered);
        html += renderTree(eventTree, false);
      }
    } else if (!html) {
      html = '<div class="text-center text-secondary py-5"><div>No notes match current filter</div></div>';
    }

    document.getElementById('taskList').innerHTML = html || '<div class="text-center py-5" style="color:#999;"><div>No tasks yet</div></div>';
  }
  
  // Build hierarchical tree from flat data
  function buildTree(items) {
    const itemsById = {};
    const rootItems = [];
    
    // First pass: index all items
    items.forEach(item => {
      itemsById[item.id] = { ...item, children: [] };
    });
    
    // Second pass: build parent-child relationships
    items.forEach(item => {
      if (item.parent_item_id && itemsById[item.parent_item_id]) {
        itemsById[item.parent_item_id].children.push(itemsById[item.id]);
      } else {
        rootItems.push(itemsById[item.id]);
      }
    });
    
    return rootItems;
  }
  
  // Render tree recursively
  function renderTree(items, isFromGeneral, depth = 0) {
    return items.map(item => {
      const html = renderNoteItem(item, isFromGeneral, depth);
      const childrenHtml = item.children && item.children.length > 0 && (item.is_expanded !== false)
        ? renderTree(item.children, isFromGeneral, depth + 1)
        : '';
      return html + childrenHtml;
    }).join('');
  }
  
  // Colour a string to a consistent avatar background colour
  function stringToColor(str) {
    const palette = ['#e53935','#8e24aa','#1e88e5','#00897b','#f4511e','#6d4c41','#546e7a','#00acc1','#43a047','#fb8c00'];
    let h = 0;
    for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
    return palette[Math.abs(h) % palette.length];
  }

  // Render single note/task
  function renderNoteItem(note, isFromGeneral = false, depth = 0) {
    const isDone = note.status === 'packed' || note.status === 'loaded' || note.status === 'completed';
    const fromWhatsApp = note.whatsapp_message_id || 
      (note.source_notes && note.source_notes.includes('WhatsApp'));
    
    // Custom styling
    const bgColor   = note.color && note.color !== '#ffffff' && note.color !== '#FFFFFF' ? note.color : '';
    const textColor = note.text_color || '';
    const customFont = note.font_family || '';
    const customSize = note.font_size || '';
    const styleParts = [];
    if (bgColor)    styleParts.push(`background-color:${bgColor}`);
    if (textColor)  styleParts.push(`color:${textColor}`);
    if (customFont) styleParts.push(`font-family:${customFont}`);
    if (customSize) styleParts.push(`font-size:${customSize}`);
    const customStyle = styleParts.join(';');

    // Priority
    const priorityIcons = { critical: '🔴', high: '🟠', normal: '⚪', low: '🟢' };
    const priorityIcon  = priorityIcons[note.priority] || priorityIcons.normal;
    const priorityClass = note.priority ? `priority-${note.priority}` : 'priority-normal';

    // Required star badge
    const requiredStar = note.required
      ? `<span class="required-star" title="Required – must be done before 100%">★</span>`
      : '';

    // Sign-off badge (who completed it and when)
    const signoffBadge = isDone && note.packed_by_name
      ? `<span class="signoff-badge" title="${escapeHtml(note.packed_by_name)}${note.packed_at ? ' • ' + new Date(note.packed_at).toLocaleDateString('en-GB', {day:'2-digit',month:'short'}) : ''}">✓ ${escapeHtml(note.packed_by_name.split(' ')[0])}</span>`
      : '';

    // Overdue
    const isOverdue = note.due_date && new Date(note.due_date) < new Date() && !isDone;

    // Columns
    const relationName = isFromGeneral ? 'GENERAL' : (currentList?.name || 'Event List');
    const eventName    = note.linked_event_id ? '🎯 [Event]' : '-';
    const progress     = note.progress_percent || 0;
    const dueDate      = note.due_date ? new Date(note.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '-';

    // Multi-assignee avatar chips (comma-separated names supported)
    const assignedTo = note.assigned_to_name || '';
    const assignedPeople = assignedTo ? assignedTo.split(',').map(s => s.trim()).filter(Boolean) : [];
    const avatarHtml = assignedPeople.length > 0
      ? assignedPeople.slice(0, 3).map(name =>
          `<span class="avatar-chip" style="background:${stringToColor(name)}" title="${escapeHtml(name)}">${escapeHtml(name.slice(0,2).toUpperCase())}</span>`
        ).join('') + (assignedPeople.length > 3 ? `<span style="font-size:9px;color:#999;">+${assignedPeople.length - 3}</span>` : '')
      : '<span style="color:#ccc;font-size:11px;">—</span>';

    // Tags
    let tags = [];
    if (fromWhatsApp)    tags.push('<span class="tag tag-whatsapp">📱</span>');
    if (isFromGeneral)   tags.push('<span class="tag tag-general">📌</span>');
    if (note.is_milestone) tags.push('<span class="tag tag-milestone">🏁</span>');
    if (note.tags) {
      note.tags.split(',').map(t => t.trim()).filter(Boolean)
        .forEach(tag => tags.push(`<span class="tag">${escapeHtml(tag)}</span>`));
    }

    // Expand/collapse
    const hasChildren = note.children && note.children.length > 0;
    const expandIcon  = hasChildren ? (note.is_expanded !== false ? '▼' : '▶') : '';

    // Tree visual connector for child items
    const treePrefix = depth > 0
      ? `<span class="tree-connector">${'&nbsp;&nbsp;&nbsp;'.repeat(depth - 1)}&#x2514;&#x2500;&nbsp;</span>`
      : '';

    return `
      <div class="task-item ${isDone ? 'done' : ''} ${note.status === 'blocked' ? 'blocked' : ''} ${priorityClass} ${isOverdue ? 'overdue-row' : ''} ${fromWhatsApp ? 'from-whatsapp' : ''}"
           data-note-id="${note.id}"
           data-depth="${depth}"
           data-sort-order="${note.sort_order || 0}"
           draggable="true"
           style="${customStyle}"
           onclick="window.selectTask('${note.id}', ${isFromGeneral})">
        <div class="task-col task-name-col" style="padding-left:${depth * 16}px; display:flex; align-items:center; gap:3px; overflow:hidden;">
          <span class="drag-handle" title="Drag to reorder" onclick="event.stopPropagation()">⠿</span>
          ${treePrefix}
          ${hasChildren
            ? `<span class="expand-icon" onclick="window.toggleExpand('${note.id}', ${isFromGeneral}, event)" style="cursor:pointer;width:14px;text-align:center;user-select:none;flex-shrink:0;">${expandIcon}</span>`
            : '<span style="width:14px;flex-shrink:0;"></span>'}
          <input type="checkbox" class="task-checkbox task-bulk-cb"
                 data-note-id="${note.id}" data-from-general="${isFromGeneral}"
                 ${isDone ? 'checked' : ''}
                 onclick="event.stopPropagation(); window.handleTaskCheckbox('${note.id}', ${isFromGeneral}, this)"
                 style="margin:0 4px;flex-shrink:0;">
          ${requiredStar}<span class="task-name-text" style="${isDone ? 'text-decoration:line-through;color:#999;' : ''}">${escapeHtml(note.item_name)}</span>${signoffBadge}
        </div>
        <div class="task-col task-flag-col" title="${note.priority} — click to change" onclick="window.showInlinePriority('${note.id}',${isFromGeneral},this,event)" style="cursor:pointer;">${priorityIcon}</div>
        <div class="task-col task-relation-col">${escapeHtml(relationName)}</div>
        <div class="task-col task-event-col">${eventName}</div>
        <div class="task-col task-progress-col">
          <div style="display:flex;align-items:center;gap:4px;">
            <div style="flex:1;height:4px;background:#e0e0e0;border-radius:2px;overflow:hidden;">
              <div style="height:100%;width:${progress}%;background:linear-gradient(90deg,#3b82f6,#8b5cf6);"></div>
            </div>
            <span style="font-size:10px;color:#666;min-width:28px;">${progress}%</span>
          </div>
        </div>
        <div class="task-col task-date-col ${isOverdue ? 'overdue' : ''}">
          <span onclick="window.showInlineDueDate('${note.id}',${isFromGeneral},this,event)" style="cursor:pointer;" title="Click to set due date">${dueDate}</span>
          ${isOverdue && !isDone ? `<span class="snooze-btns"><button class="snooze-btn" onclick="window.snoozeTask('${note.id}',4,${isFromGeneral},event)" title="Snooze +4 hours">+4h</button><button class="snooze-btn" onclick="window.snoozeTask('${note.id}','tomorrow',${isFromGeneral},event)" title="Snooze to tomorrow">Tmrw</button></span>` : ''}
        </div>
        <div class="task-col task-assigned-col" onclick="window.showInlineAssignee('${note.id}',${isFromGeneral},this,event)" style="cursor:pointer;" title="Click to assign">${avatarHtml}</div>
        <div class="task-col task-tags-col">${tags.join(' ')}</div>
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
  
  // Toggle expand/collapse for hierarchical tasks
  window.toggleExpand = async function(noteId, isFromGeneral = false, event) {
    event.stopPropagation();
    const noteList = isFromGeneral ? generalNotes : notes;
    const note = noteList.find(n => n.id === noteId);
    if (!note) return;
    
    // Update local state immediately and re-render (instant UI)
    const newExpanded = !(note.is_expanded !== false);
    const idx = noteList.findIndex(n => n.id === noteId);
    if (idx >= 0) noteList[idx].is_expanded = newExpanded;
    renderNotes();
    
    // Persist to API in background
    try {
      const listId = await getListIdForNote(isFromGeneral);
      if (!listId) return;
      await fetch(`${API_BASE}/packing-lists/${listId}/items/${noteId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({ is_expanded: newExpanded })
      });
    } catch (error) {
      console.warn('Could not persist expand state:', error);
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

      // Store list color in localStorage
      const pickedColor = document.getElementById('customListColor')?.value;
      if (pickedColor && resp.list) {
        localStorage.setItem('rts.list.color.' + resp.list.id, pickedColor);
      }
      
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
    document.querySelectorAll('.sidebar-item, .sidebar-list-item').forEach(item => {
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
    const isDone = note.status === 'packed' || note.status === 'loaded' || note.status === 'completed';
    const fromWhatsApp = note.whatsapp_message_id || (note.source_notes && note.source_notes.includes('WhatsApp'));
    
    // Priority colors
    const priorityColors = {
      critical: '#dc3545',
      high: '#fd7e14',
      normal: '#6c757d',
      low: '#28a745'
    };
    const priorityColor = priorityColors[note.priority] || priorityColors.normal;
    
    document.getElementById('detailHeader').textContent = isDone ? '✓ Task (Done)' : 'Task Details';
    document.getElementById('detailContent').innerHTML = `
      <div class="detail-section ds-task">
        <div class="detail-section-hdr"><span class="dsh-icon">📋</span> Task</div>
        <div class="detail-field">
          <div class="detail-label">Name</div>
          <input type="text" class="detail-input" value="${escapeHtml(note.item_name)}" id="editTaskName">
        </div>
        <div class="detail-field">
          <div class="detail-label">Description</div>
          <textarea class="detail-textarea" id="editTaskDesc" rows="2">${escapeHtml(note.source_notes || '')}</textarea>
        </div>
        <div class="row g-1">
          <div class="col-6">
            <div class="detail-field">
              <div class="detail-label">Status</div>
              <select class="detail-input" id="editTaskStatus">
                <option value="pending" ${note.status === 'pending' ? 'selected' : ''}>Pending</option>
                <option value="in_progress" ${note.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                <option value="completed" ${note.status === 'completed' ? 'selected' : ''}>Completed</option>
                <option value="blocked" ${note.status === 'blocked' ? 'selected' : ''}>Blocked</option>
                <option value="packed" ${note.status === 'packed' ? 'selected' : ''}>Packed</option>
                <option value="loaded" ${note.status === 'loaded' ? 'selected' : ''}>Loaded</option>
              </select>
            </div>
          </div>
          <div class="col-6">
            <div class="detail-field">
              <div class="detail-label">Priority</div>
              <select class="detail-input" id="editTaskPriority" style="border-left: 3px solid ${priorityColor};">
                <option value="critical" ${note.priority === 'critical' ? 'selected' : ''}>🔴 Critical</option>
                <option value="high" ${note.priority === 'high' ? 'selected' : ''}>🟠 High</option>
                <option value="normal" ${note.priority === 'normal' ? 'selected' : ''}>⚪ Normal</option>
                <option value="low" ${note.priority === 'low' ? 'selected' : ''}>🟢 Low</option>
              </select>
            </div>
          </div>
        </div>
        ${note.status === 'blocked' ? `
          <div class="detail-field">
            <div class="detail-label">Blocked Reason</div>
            <textarea class="detail-textarea" id="editTaskBlocked" rows="2">${escapeHtml(note.blocked_reason || '')}</textarea>
          </div>
        ` : ''}
      </div>

      <div class="detail-section ds-schedule">
        <div class="detail-section-hdr"><span class="dsh-icon">📅</span> Schedule</div>
        <div class="row g-1">
          <div class="col-6">
            <div class="detail-field">
              <div class="detail-label">Start</div>
              <input type="date" class="detail-input" value="${note.start_date || ''}" id="editTaskStartDate">
            </div>
          </div>
          <div class="col-6">
            <div class="detail-field">
              <div class="detail-label">Due</div>
              <input type="date" class="detail-input" value="${note.due_date || ''}" id="editTaskDueDate">
            </div>
          </div>
        </div>
        <div class="detail-field">
          <div class="detail-label">Repeat</div>
          <select class="detail-input" id="editTaskRecurrence">
            <option value="" ${!note.recurrence ? 'selected' : ''}>No repeat</option>
            <option value="daily" ${note.recurrence === 'daily' ? 'selected' : ''}>Daily</option>
            <option value="weekly" ${note.recurrence === 'weekly' ? 'selected' : ''}>Weekly</option>
            <option value="per_event" ${note.recurrence === 'per_event' ? 'selected' : ''}>Per Event</option>
          </select>
        </div>
        <div class="detail-field">
          <div class="detail-label">Progress</div>
          <div class="d-flex align-items-center gap-2">
            <input type="range" class="form-range" min="0" max="100" step="5" value="${note.progress_percent || 0}" id="editTaskProgress" style="flex:1;">
            <span id="progressValue" style="min-width:30px;font-weight:700;font-size:11px;">${note.progress_percent || 0}%</span>
          </div>
          <div class="progress mt-1" style="height:4px;">
            <div class="progress-bar" id="progressBar" style="width:${note.progress_percent || 0}%;background:linear-gradient(90deg,#3b82f6,#8b5cf6);"></div>
          </div>
        </div>
      </div>

      <div class="detail-section ds-people">
        <div class="detail-section-hdr"><span class="dsh-icon">👤</span> People</div>
        <div class="detail-field">
          <div class="detail-label">Assigned To</div>
          <input type="text" class="detail-input" value="${escapeHtml(note.assigned_to_name || '')}" id="editTaskAssignedTo" placeholder="Person's name">
        </div>
        <div class="row g-1">
          <div class="col-6">
            <div class="detail-field">
              <div class="detail-label">Est. Hours</div>
              <input type="number" class="detail-input" value="${note.estimated_hours || ''}" id="editTaskEstimated" placeholder="0.0" step="0.5" min="0">
            </div>
          </div>
          <div class="col-6">
            <div class="detail-field">
              <div class="detail-label">Actual Hrs</div>
              <input type="number" class="detail-input" value="${note.actual_hours || ''}" id="editTaskActual" placeholder="0.0" step="0.5" min="0">
            </div>
          </div>
        </div>
        <button class="detail-button" style="width:100%;margin-top:5px;background:#25d366;color:#fff;border-color:#1da851;" onclick="window.sendWhatsAppReminder('${note.id}', ${isFromGeneral})">📱 Send WhatsApp Reminder</button>
        <button class="detail-button" style="width:100%;margin-top:5px;background:#0078d4;color:#fff;border-color:#0063b1;" onclick="window.sendEmailReminder('${note.id}', ${isFromGeneral})">📧 Email Reminder</button>
      </div>

      <div class="detail-section ds-meta">
        <div class="detail-section-hdr"><span class="dsh-icon">🏷️</span> Tags & Meta</div>
        <div class="row g-1">
          <div class="col-6">
            <div class="detail-field">
              <div class="detail-label">Category</div>
              <input type="text" class="detail-input" value="${escapeHtml(note.category || '')}" id="editTaskCategory" placeholder="e.g. Setup">
            </div>
          </div>
          <div class="col-6">
            <div class="detail-field">
              <div class="detail-label">Tags</div>
              <input type="text" class="detail-input" value="${escapeHtml(note.tags || '')}" id="editTaskTags" placeholder="comma-separated">
            </div>
          </div>
        </div>
        <div class="detail-field">
          <div class="detail-label">Parent Task</div>
          <select class="detail-input" id="editTaskParent">
            <option value="">— No parent (top-level) —</option>
            ${(isFromGeneral ? generalNotes : notes)
              .filter(n => n.id !== note.id && !n.parent_item_id)
              .map(n => `<option value="${n.id}" ${note.parent_item_id === n.id ? 'selected' : ''}>${escapeHtml(n.item_name)}</option>`)
              .join('')}
          </select>
        </div>
        <div class="detail-field">
          <div class="detail-label">Link to Event</div>
          <select class="detail-input" id="editTaskLinkedEvent">
            <option value="">No event linked</option>
          </select>
        </div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:2px;">
          <input type="checkbox" id="editTaskMilestone" ${note.is_milestone ? 'checked' : ''} style="margin:0;cursor:pointer;">
          <label for="editTaskMilestone" style="font-size:11px;color:#555;margin:0;cursor:pointer;">Milestone 🏁</label>
        </div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:4px;">
          <input type="checkbox" id="editTaskRequired" ${note.required ? 'checked' : ''} style="margin:0;cursor:pointer;">
          <label for="editTaskRequired" style="font-size:11px;color:#e67e00;margin:0;cursor:pointer;font-weight:600;">★ Required (gates 100%)</label>
        </div>
      </div>

      <div class="detail-section ds-appearance">
        <div class="detail-section-hdr"><span class="dsh-icon">🎨</span> Appearance</div>
        <div class="d-flex gap-3 mb-2">
          <div style="flex:1;">
            <div class="detail-label">Background</div>
            <div class="d-flex gap-1 align-items-center">
              <input type="color" class="detail-input" value="${note.color || '#ffffff'}" id="editTaskColor" style="width:34px;height:26px;padding:1px;cursor:pointer;border-radius:3px;">
              <button class="detail-button" style="padding:2px 6px;font-size:10px;" onclick="document.getElementById('editTaskColor').value='#ffffff'">Clear</button>
            </div>
          </div>
          <div style="flex:1;">
            <div class="detail-label">Text</div>
            <div class="d-flex gap-1 align-items-center">
              <input type="color" class="detail-input" value="${note.text_color || '#333333'}" id="editTaskTextColor" style="width:34px;height:26px;padding:1px;cursor:pointer;border-radius:3px;">
              <button class="detail-button" style="padding:2px 6px;font-size:10px;" onclick="document.getElementById('editTaskTextColor').value='#333333'">Clear</button>
            </div>
          </div>
        </div>
        <div class="row g-1">
          <div class="col-7">
            <div class="detail-field">
              <div class="detail-label">Font</div>
              <select class="detail-input" id="editTaskFontFamily">
                <option value="" ${!note.font_family ? 'selected' : ''}>Default</option>
                <option value="Arial, sans-serif" ${note.font_family === 'Arial, sans-serif' ? 'selected' : ''}>Arial</option>
                <option value="'Courier New', monospace" ${note.font_family === "'Courier New', monospace" ? 'selected' : ''}>Courier New</option>
                <option value="Georgia, serif" ${note.font_family === 'Georgia, serif' ? 'selected' : ''}>Georgia</option>
                <option value="'Times New Roman', serif" ${note.font_family === "'Times New Roman', serif" ? 'selected' : ''}>Times New Roman</option>
                <option value="Verdana, sans-serif" ${note.font_family === 'Verdana, sans-serif' ? 'selected' : ''}>Verdana</option>
                <option value="'Trebuchet MS', sans-serif" ${note.font_family === "'Trebuchet MS', sans-serif" ? 'selected' : ''}>Trebuchet MS</option>
              </select>
            </div>
          </div>
          <div class="col-5">
            <div class="detail-field">
              <div class="detail-label">Size</div>
              <select class="detail-input" id="editTaskFontSize">
                <option value="" ${!note.font_size ? 'selected' : ''}>Default</option>
                <option value="10px" ${note.font_size === '10px' ? 'selected' : ''}>10px</option>
                <option value="11px" ${note.font_size === '11px' ? 'selected' : ''}>11px</option>
                <option value="12px" ${note.font_size === '12px' ? 'selected' : ''}>12px</option>
                <option value="13px" ${note.font_size === '13px' ? 'selected' : ''}>13px</option>
                <option value="14px" ${note.font_size === '14px' ? 'selected' : ''}>14px</option>
                <option value="16px" ${note.font_size === '16px' ? 'selected' : ''}>16px</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div class="detail-section ds-subtasks">
        <div class="detail-section-hdr" style="justify-content:space-between;">
          <span style="display:flex;align-items:center;gap:5px;"><span class="dsh-icon">☑</span> Subtasks</span>
          <span style="font-size:9px;color:#28a745;font-weight:700;text-transform:none;letter-spacing:0;">${(isFromGeneral ? generalNotes : notes).filter(n => n.parent_item_id === noteId).filter(n => n.status==='packed'||n.status==='completed'||n.status==='loaded').length}/${(isFromGeneral ? generalNotes : notes).filter(n => n.parent_item_id === noteId).length} done</span>
        </div>
        <div id="subtaskList" style="margin-bottom:6px;">
          ${(() => {
            const children = (isFromGeneral ? generalNotes : notes).filter(n => n.parent_item_id === noteId);
            if (children.length === 0) return '<p style="color:#bbb;font-size:11px;margin:0;">No subtasks yet</p>';
            return children.map(st => {
              const stDone = st.status==='packed'||st.status==='completed'||st.status==='loaded';
              return `<div class="subtask-item ${stDone ? 'done' : ''}">
                <input type="checkbox" ${stDone ? 'checked' : ''} onclick="window.toggleNote('${st.id}', ${isFromGeneral}); setTimeout(()=>window.selectTask('${note.id}',${isFromGeneral}),300)" style="margin:0;flex-shrink:0;cursor:pointer;">
                <span class="subtask-name" style="flex:1;cursor:pointer;" onclick="window.selectTask('${st.id}',${isFromGeneral})">${escapeHtml(st.item_name)}</span>
                <button onclick="window.deleteNote('${st.id}',${isFromGeneral})" style="background:none;border:none;color:#dc3545;cursor:pointer;padding:0 2px;font-size:14px;line-height:1;" title="Delete">×</button>
              </div>`;
            }).join('');
          })()}
        </div>
        <div class="d-flex gap-2">
          <input type="text" id="subtaskInput" placeholder="New subtask…" class="detail-input" style="flex:1;" onkeydown="if(event.key==='Enter')window.addSubtask('${note.id}',${isFromGeneral})">
          <button class="detail-button detail-button-primary" onclick="window.addSubtask('${note.id}',${isFromGeneral})">＋</button>
        </div>
      </div>

      ${isDone && note.packed_by_name ? `
      <div class="detail-section" style="border-left-color:#28a745;">
        <div class="detail-section-hdr"><span class="dsh-icon">✅</span> Completed By</div>
        <div style="font-size:12px;color:#1a1d24;">
          <strong>${escapeHtml(note.packed_by_name)}</strong>
          ${note.packed_at ? `<span style="color:#6b7a8d;"> · ${new Date(note.packed_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</span>` : ''}
        </div>
      </div>
      ` : ''}

      <div style="font-size:10px;color:#aaa;padding:2px 2px 10px;line-height:1.9;">
        <span><strong>Source:</strong> ${fromWhatsApp ? '📱 WhatsApp' : '💻 Manual'}</span> &nbsp;
        <span><strong>Created:</strong> ${note.created_at ? new Date(note.created_at).toLocaleDateString() : '-'}</span>
        ${note.created_by_name ? `&nbsp;<span><strong>By:</strong> ${note.created_by_name}</span>` : ''}
      </div>
      <div class="detail-section" style="border-left-color:#f97316;">
        <div class="detail-section-hdr"><span class="dsh-icon">🔗</span> Dependencies</div>
        <div class="detail-field">
          <div class="detail-label">Blocked By</div>
          <select class="detail-input" id="editTaskDepSelect" onchange="window.addDependency(this,'${noteId}')">
            <option value="">— Add dependency —</option>
            ${(isFromGeneral ? generalNotes : notes)
              .filter(n => n.id !== note.id)
              .map(n => `<option value="${n.id}">${escapeHtml(n.item_name)}</option>`)
              .join('')}
          </select>
          <div class="dep-tags" id="depTagsContainer">
            ${(() => {
              if (!note.dependencies) return '';
              const depList = isFromGeneral ? generalNotes : notes;
              return note.dependencies.split(',').filter(Boolean).map(depId => {
                const dep = depList.find(n => n.id === depId);
                const label = dep ? escapeHtml(dep.item_name) : depId.slice(0,8)+'...';
                return `<span class="dep-tag" data-dep-id="${depId}">${label}<button class="dep-x" onclick="window.removeDependency('${depId}')">×</button></span>`;
              }).join('');
            })()}
          </div>
        </div>
      </div>

      <div class="detail-section" style="border-left-color:#8b5cf6;">
        <div class="detail-section-hdr"><span class="dsh-icon">💬</span> Comments</div>
        <div id="taskCommentsSection"><div style="color:#bbb;font-size:11px;">Loading…</div></div>
        <div class="d-flex gap-2 mt-1">
          <input type="text" id="newCommentInput" placeholder="Add a comment…" class="detail-input" style="flex:1;"
                 onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();window.saveComment('${noteId}',${isFromGeneral})}">
          <button class="detail-button detail-button-primary" onclick="window.saveComment('${noteId}',${isFromGeneral})">→</button>
        </div>
      </div>

      <div class="detail-section" style="border-left-color:#0ea5e9;">
        <div class="detail-section-hdr"><span class="dsh-icon">🔗</span> Links &amp; Attachments</div>
        <div id="taskLinksSection"><div style="color:#bbb;font-size:11px;">Loading…</div></div>
        <div class="d-flex gap-1 mt-1">
          <input type="text" id="newLinkLabelInput" placeholder="Label (opt)" class="detail-input" style="flex:0.7;">
          <input type="url" id="newLinkUrlInput" placeholder="https://…" class="detail-input" style="flex:1.3;"
                 onkeydown="if(event.key==='Enter')window.saveLink('${noteId}',${isFromGeneral})">
          <button class="detail-button detail-button-primary" onclick="window.saveLink('${noteId}',${isFromGeneral})">＋</button>
        </div>
      </div>

      <div class="d-flex gap-2">
        <button class="detail-button detail-button-primary" style="flex:1;" onclick="window.saveTaskDetails('${note.id}', ${isFromGeneral})">💾 Save Changes</button>
        <button class="detail-button" style="background:#dc3545;color:#fff;border-color:#c82333;" onclick="window.deleteNote('${note.id}', ${isFromGeneral})">🗑️</button>
      </div>
    `;
    
    // Add progress slider listener
    const progressSlider = document.getElementById('editTaskProgress');
    const progressValue = document.getElementById('progressValue');
    const progressBar = document.getElementById('progressBar');
    
    if (progressSlider && progressValue && progressBar) {
      progressSlider.addEventListener('input', (e) => {
        const val = e.target.value;
        progressValue.textContent = val + '%';
        progressBar.style.width = val + '%';
      });
    }
    
    // Add status change listener for blocked reason
    const statusSelect = document.getElementById('editTaskStatus');
    if (statusSelect) {
      statusSelect.addEventListener('change', (e) => {
        if (e.target.value === 'blocked') {
          // Re-render to show blocked reason field
          window.selectTask(noteId, isFromGeneral);
        }
      });
    }
    
    // Load events into dropdown
    loadEventsForDropdown(note.linked_event_id);
    // Async load comments + links
    loadTaskExtras(noteId, isFromGeneral);
  };
  async function loadEventsForDropdown(selectedEventId) {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_BASE}/collections/events?sort=date&order=desc&limit=50`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      
      if (data.success && data.data) {
        const dropdown = document.getElementById('editTaskLinkedEvent');
        if (dropdown) {
          let options = '<option value="">No event linked</option>';
          data.data.forEach(event => {
            const eventDate = event.date ? new Date(event.date).toLocaleDateString() : '';
            const label = `${event.name || 'Untitled'} ${eventDate ? '(' + eventDate + ')' : ''}`;
            const selected = event.id === selectedEventId ? 'selected' : '';
            options += `<option value="${event.id}" ${selected}>${label}</option>`;
          });
          dropdown.innerHTML = options;
        }
      }
    } catch (error) {
      console.error('Error loading events:', error);
    }
  }
  
  window.saveTaskDetails = async function(noteId, isFromGeneral = false) {
    try {
      // Get all the updated values from the form
      const itemName = document.getElementById('editTaskName')?.value.trim();
      const sourceNotes = document.getElementById('editTaskDesc')?.value.trim();
      const status = document.getElementById('editTaskStatus')?.value;
      const priority = document.getElementById('editTaskPriority')?.value;
      const startDate = document.getElementById('editTaskStartDate')?.value;
      const dueDate = document.getElementById('editTaskDueDate')?.value;
      const assignedTo = document.getElementById('editTaskAssignedTo')?.value.trim();
      const progress = document.getElementById('editTaskProgress')?.value;
      const estimated = document.getElementById('editTaskEstimated')?.value;
      const actual = document.getElementById('editTaskActual')?.value;
      const category = document.getElementById('editTaskCategory')?.value.trim();
      const tags = document.getElementById('editTaskTags')?.value.trim();
      const isMilestone = document.getElementById('editTaskMilestone')?.checked;
      const isRequired = document.getElementById('editTaskRequired')?.checked ?? null;
      const blockedReason = document.getElementById('editTaskBlocked')?.value?.trim();
      const color = document.getElementById('editTaskColor')?.value;
      const textColor = document.getElementById('editTaskTextColor')?.value;
      const fontFamily = document.getElementById('editTaskFontFamily')?.value;
      const fontSize = document.getElementById('editTaskFontSize')?.value;
      const linkedEvent = document.getElementById('editTaskLinkedEvent')?.value;
      const parentTaskId = document.getElementById('editTaskParent')?.value || null;
      
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
        source_notes: sourceNotes,
        status: status,
        priority: priority,
        progress_percent: parseInt(progress) || 0,
        is_milestone: isMilestone,
        required: isRequired !== null ? isRequired : undefined
      };
      
      // Add optional fields if provided
      if (startDate) updates.start_date = startDate;
      if (dueDate) updates.due_date = dueDate;
      if (assignedTo) updates.assigned_to_name = assignedTo;
      if (estimated) updates.estimated_hours = parseFloat(estimated);
      if (actual) updates.actual_hours = parseFloat(actual);
      if (category) updates.category = category;
      if (tags) updates.tags = tags;
      if (status === 'blocked' && blockedReason) updates.blocked_reason = blockedReason;
      if (color) updates.color = color;
      if (textColor) updates.text_color = textColor;
      if (fontFamily) updates.font_family = fontFamily;
      if (fontSize) updates.font_size = fontSize;
      if (linkedEvent) updates.linked_event_id = linkedEvent;
      // Always include parent_item_id (null clears it, a value sets it)
      updates.parent_item_id = parentTaskId || null;

      // Recurrence
      const recurrence = document.getElementById('editTaskRecurrence')?.value || null;
      updates.recurrence = recurrence;

      // Dependencies — read from rendered dep-tag data attributes
      const depTags = document.querySelectorAll('.dep-tag[data-dep-id]');
      const depIds  = Array.from(depTags).map(t => t.dataset.depId).filter(Boolean);
      updates.dependencies = depIds.length ? depIds.join(',') : null;
      
      // Set completed_at if status is completed
      if (status === 'completed' || status === 'packed' || status === 'loaded') {
        updates.completed_at = new Date().toISOString();
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
      updateStats();
      loadActivity();
      
      if (RTS.showToast) {
        RTS.showToast('✅ Task saved successfully', 'success');
      }
    } catch (error) {
      console.error('Error saving task:', error);
      alert('Failed to save task: ' + error.message);
    }
  };
  
  window.showAddTaskModal = showAddNoteModal;
  window.showListSelector = showEventSelector;

  // ─── Search / filter ────────────────────────────────────────────────────────
  window.filterTasks = function(q) {
    _searchQuery = (q || '').toLowerCase().trim();
    renderNotes();
  };

  window.setChipFilter = function(chip) {
    _chipFilter = chip;
    document.querySelectorAll('.filter-chip').forEach(el => {
      el.classList.toggle('active', el.dataset.chip === chip);
    });
    renderNotes();
  };

  // Send WhatsApp reminder for a task
  window.sendWhatsAppReminder = async function(noteId, isFromGeneral = false) {
    const noteList = isFromGeneral ? generalNotes : notes;
    const note = noteList.find(n => n.id === noteId);
    if (!note) return;

    const savedPhone = localStorage.getItem('rts.notes.reminderPhone') || '';
    const phone = prompt('Send WhatsApp reminder to (include country code, e.g. +27831234567):', savedPhone);
    if (!phone) return;

    const dueStr = note.due_date
      ? ` (due ${new Date(note.due_date).toLocaleDateString('en-GB', {day:'2-digit',month:'short'})})`
      : '';
    const message = `✅ Checklist Reminder: "${note.item_name}"${dueStr}\nList: ${currentList?.name || 'Checklist'}\nPlease ensure this task is completed.`;

    try {
      const resp = await fetch(`${API_BASE}/whatsapp/send-reminder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({ phone, message })
      }).then(r => r.json());

      if (!resp.success) throw new Error(resp.error || 'Failed to send');
      localStorage.setItem('rts.notes.reminderPhone', phone);
      RTS.showToast('📱 WhatsApp reminder sent!', 'success');
    } catch (error) {
      RTS.showToast('Failed to send reminder: ' + error.message, 'error');
    }
  };

  // Print current checklist
  window.printChecklist = function() {
    const ph = document.getElementById('printListTitle');
    const pm = document.getElementById('printListMeta');
    if (ph) ph.textContent = currentList?.name || 'Checklist';
    const allNotes = isGeneralList ? notes : [...notes];
    const done = allNotes.filter(n => n.status === 'packed' || n.status === 'loaded' || n.status === 'completed').length;
    if (pm) pm.textContent = `Printed: ${new Date().toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric'})} · ${done}/${allNotes.length} complete`;
    window.print();
  };

  // 100% complete celebration — confetti burst
  function triggerCelebration() {
    RTS.showToast('🎉 List complete! 100% done!', 'success');
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;overflow:hidden;';
    document.body.appendChild(container);
    const colors = ['#e53935','#e67e00','#28a745','#0099cc','#7c3aed','#ffd700','#ff69b4'];
    for (let i = 0; i < 60; i++) {
      const p = document.createElement('div');
      const color = colors[Math.floor(Math.random() * colors.length)];
      const x = Math.random() * 100;
      const dur = 1.5 + Math.random() * 1.5;
      const size = 6 + Math.random() * 6;
      p.style.cssText = `position:absolute;top:-12px;left:${x}%;width:${size}px;height:${size}px;background:${color};border-radius:${Math.random() > 0.5 ? '50%' : '2px'};animation:confetti-fall ${dur}s ease-in forwards;animation-delay:${Math.random() * 0.6}s;`;
      container.appendChild(p);
    }
    setTimeout(() => { if (container.parentNode) container.remove(); }, 4000);
  }

  // ─── Bulk-select mode ───────────────────────────────────────────────────────
  window.toggleBulkMode = function() {
    _bulkSelectMode = !_bulkSelectMode;
    const btn = document.getElementById('btnBulkMode');
    const completeBtn = document.getElementById('btnBulkComplete');
    if (btn) btn.textContent = _bulkSelectMode ? '✕ Cancel Select' : '☑ Select';
    if (!_bulkSelectMode) {
      // Clear any existing selections
      document.querySelectorAll('.task-item.bulk-selected').forEach(r => r.classList.remove('bulk-selected'));
      if (completeBtn) completeBtn.style.display = 'none';
    }
  };

  window.handleTaskCheckbox = function(noteId, isFromGeneral, el) {
    if (_bulkSelectMode) {
      el.preventDefault && el.preventDefault();
      const row = document.querySelector(`.task-item[data-note-id="${noteId}"]`);
      if (row) row.classList.toggle('bulk-selected');
      const count = document.querySelectorAll('.task-item.bulk-selected').length;
      const countSpan = document.getElementById('bulkCount');
      const completeBtn = document.getElementById('btnBulkComplete');
      if (countSpan) countSpan.textContent = count;
      if (completeBtn) completeBtn.style.display = count > 0 ? '' : 'none';
      // Keep checkbox in sync with selection state
      if (row) el.checked = row.classList.contains('bulk-selected');
    } else {
      window.toggleNote(noteId, isFromGeneral);
    }
  };

  window.bulkComplete = async function() {
    const selectedRows = [...document.querySelectorAll('.task-item.bulk-selected')];
    if (selectedRows.length === 0) return;

    const name = localStorage.getItem('rts.notes.userName') ||
      prompt('Enter your name to mark tasks as done:');
    if (!name) return;
    localStorage.setItem('rts.notes.userName', name);

    let completed = 0;
    for (const row of selectedRows) {
      const noteId = row.dataset.noteId;
      const fromGeneral = row.querySelector('.task-bulk-cb')?.dataset.fromGeneral === 'true';
      const noteList = fromGeneral ? generalNotes : notes;
      const note = noteList.find(n => n.id === noteId);
      if (!note || note.status === 'packed' || note.status === 'completed' || note.status === 'loaded') continue;

      try {
        const listId = await getListIdForNote(fromGeneral);
        const resp = await fetch(`${API_BASE}/packing-lists/${listId}/items/${noteId}/mark-packed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` },
          body: JSON.stringify({ packed_by_name: name })
        }).then(r => r.json());
        if (resp.success) {
          const idx = noteList.findIndex(n => n.id === noteId);
          if (idx >= 0) Object.assign(noteList[idx], resp.item || { status: 'packed' });
          completed++;
        }
      } catch (e) { console.error('Bulk complete error:', e); }
    }

    renderNotes();
    updateStats();
    window.toggleBulkMode(); // reset bulk mode
    if (RTS.showToast) RTS.showToast(`✅ Completed ${completed} task${completed !== 1 ? 's' : ''}`, 'success');
  };

  // ─── Clone List ─────────────────────────────────────────────────────────────
  window.cloneList = async function(listId, listName, targetEventId = null) {
    // If called from bulk spawn, skip the prompt and use the event as destination
    let newName;
    if (targetEventId) {
      // Find event name from _spawnEvents cache
      const ev = (_spawnEvents || []).find(e => e.id === targetEventId);
      newName = (listName || 'Checklist') + (ev ? ' – ' + ev.name : '');
    } else {
      newName = prompt(`Clone "${listName}" as:`, listName + ' (Copy)');
      if (!newName || !newName.trim()) return;
    }

    try {
      // Load source list items
      const token = localStorage.getItem('auth_token');
      const srcData = await fetch(`${API_BASE}/packing-lists/${listId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      }).then(r => r.json());
      if (!srcData.success) throw new Error('Failed to load source list');

      // Create new list
      const createData = await fetch(`${API_BASE}/packing-lists`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          name: newName.trim(),
          description: `Cloned from ${listName || listId}`,
          ...(targetEventId ? { event_id: targetEventId } : {})
        })
      }).then(r => r.json());
      if (!createData.success) throw new Error('Failed to create list');

      const newListId = createData.list.id;
      const sourceItems = srcData.list?.items || [];
      const idMap = {};

      // Copy root items first, then children
      const roots = sourceItems.filter(i => !i.parent_item_id);
      const children = sourceItems.filter(i => i.parent_item_id);

      for (const item of roots) {
        const r = await fetch(`${API_BASE}/packing-lists/${newListId}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ item_name: item.item_name, category: item.category || 'general', priority: item.priority || 'normal', quantity: item.quantity || 1, required: item.required || false, sort_order: item.sort_order || 0, color: item.color, font_family: item.font_family, font_size: item.font_size })
        }).then(r => r.json());
        if (r.success) idMap[item.id] = r.item.id;
      }
      for (const item of children) {
        const newParentId = idMap[item.parent_item_id];
        if (!newParentId) continue;
        const r = await fetch(`${API_BASE}/packing-lists/${newListId}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ item_name: item.item_name, category: item.category || 'general', priority: item.priority || 'normal', quantity: item.quantity || 1, required: item.required || false, sort_order: item.sort_order || 0, parent_item_id: newParentId })
        }).then(r => r.json());
        if (r.success) idMap[item.id] = r.item.id;
      }

      await loadListsIntoSidebar();
      await window.selectList(newListId, 'custom');
      if (RTS.showToast) RTS.showToast(`📋 Cloned as "${newName.trim()}"`, 'success');
    } catch (e) {
      console.error('Clone error:', e);
      if (RTS.showToast) RTS.showToast('Failed to clone list', 'error');
    }
  };

  // ─── Add Subtask ────────────────────────────────────────────────────────────
  window.addSubtask = async function(parentId, isFromGeneral) {
    const input = document.getElementById('subtaskInput');
    const text = (input?.value || '').trim();
    if (!text) { input?.focus(); return; }

    try {
      const token = localStorage.getItem('auth_token');
      const listId = await getListIdForNote(isFromGeneral);
      if (!listId) throw new Error('List not found');

      const resp = await fetch(`${API_BASE}/packing-lists/${listId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ item_name: text, category: 'general', priority: 'normal', quantity: 1, required: false, parent_item_id: parentId })
      }).then(r => r.json());

      if (!resp.success) throw new Error('Failed to add subtask');

      const noteList = isFromGeneral ? generalNotes : notes;
      noteList.push(resp.item);

      // Ensure the parent is expanded so the new subtask is visible
      const parentIdx = noteList.findIndex(n => n.id === parentId);
      if (parentIdx >= 0 && noteList[parentIdx].is_expanded === false) {
        noteList[parentIdx].is_expanded = true;
        // Persist in background
        getListIdForNote(isFromGeneral).then(listId => {
          if (!listId) return;
          fetch(`${API_BASE}/packing-lists/${listId}/items/${parentId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` },
            body: JSON.stringify({ is_expanded: true })
          }).catch(() => {});
        });
      }

      if (input) input.value = '';
      renderNotes();
      window.selectTask(parentId, isFromGeneral);
      if (RTS.showToast) RTS.showToast('Subtask added', 'success');
    } catch (e) {
      console.error('Add subtask error:', e);
      if (RTS.showToast) RTS.showToast('Failed to add subtask', 'error');
    }
  };

  // ─── Drag-to-reorder rows ───────────────────────────────────────────────────
  function initDragReorder() {
    const taskList = document.getElementById('taskList');
    if (!taskList) return;

    let dragSrc = null;

    taskList.addEventListener('dragstart', (e) => {
      const row = e.target.closest('.task-item');
      if (!row) return;
      dragSrc = row;
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', row.dataset.noteId);
    });

    taskList.addEventListener('dragover', (e) => {
      e.preventDefault();
      const row = e.target.closest('.task-item');
      if (row && row !== dragSrc) {
        taskList.querySelectorAll('.drag-over').forEach(r => r.classList.remove('drag-over'));
        row.classList.add('drag-over');
      }
    });

    taskList.addEventListener('dragleave', (e) => {
      const row = e.target.closest('.task-item');
      if (row) row.classList.remove('drag-over');
    });

    taskList.addEventListener('drop', async (e) => {
      e.preventDefault();
      const targetRow = e.target.closest('.task-item');
      if (!targetRow || !dragSrc || targetRow === dragSrc) return;

      // Move in DOM for instant feedback
      taskList.insertBefore(dragSrc, targetRow);

      // Save new sort_order for all visible rows
      const allRows = [...taskList.querySelectorAll('.task-item')];
      if (currentList) {
        const token = localStorage.getItem('auth_token');
        allRows.forEach((row, i) => {
          const nId = row.dataset.noteId;
          const note = notes.find(n => n.id === nId) || generalNotes.find(n => n.id === nId);
          if (note) {
            note.sort_order = i * 10;
            fetch(`${API_BASE}/packing-lists/${currentList.id}/items/${nId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ sort_order: i * 10 })
            }).catch(() => {});
          }
        });
      }

      taskList.querySelectorAll('.drag-over, .dragging').forEach(r => {
        r.classList.remove('drag-over');
        r.classList.remove('dragging');
      });
      dragSrc = null;
    });

    taskList.addEventListener('dragend', () => {
      taskList.querySelectorAll('.dragging, .drag-over').forEach(r => {
        r.classList.remove('dragging');
        r.classList.remove('drag-over');
      });
      dragSrc = null;
    });
  }

  // Color swatch selection handler (delegated — fires for list creation modal)
  document.addEventListener('click', function(e) {
    const swatch = e.target.closest('.list-color-swatch');
    if (!swatch) return;
    document.querySelectorAll('.list-color-swatch').forEach(s => s.classList.remove('selected'));
    swatch.classList.add('selected');
    const colorInput = document.getElementById('customListColor');
    if (colorInput) colorInput.value = swatch.dataset.color || '';
  });

  // ─────────────────────────────────────────────────────────────────────────
  // FEATURE #6 — Email Reminder
  // ─────────────────────────────────────────────────────────────────────────
  window.sendEmailReminder = function(noteId, isFromGeneral = false) {
    const note = (isFromGeneral ? generalNotes : notes).find(n => n.id === noteId);
    if (!note) return;
    const assignee  = note.assigned_to_name || '';
    const dueDate   = note.due_date ? new Date(note.due_date).toLocaleDateString('en-GB') : 'no due date';
    const subject   = encodeURIComponent(`Task Reminder: ${note.item_name}`);
    const body      = encodeURIComponent(
      `Hi ${assignee || 'Team'},\n\n` +
      `This is a reminder about the following task:\n\n` +
      `Task: ${note.item_name}\n` +
      `Due: ${dueDate}\n` +
      `Priority: ${note.priority || 'normal'}\n` +
      `Status: ${note.status || 'pending'}\n\n` +
      (note.source_notes ? `Notes: ${note.source_notes}\n\n` : '') +
      `Please ensure this is completed on time.\n\nRace Team OS`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
  };

  // ─────────────────────────────────────────────────────────────────────────
  // FEATURE #7 — Email Digest
  // ─────────────────────────────────────────────────────────────────────────
  window.sendEmailDigest = function() {
    const today = new Date(); today.setHours(0,0,0,0);
    const allTasks = [...(generalNotes || []), ...(notes || [])];
    const overdue  = allTasks.filter(n => n.due_date && new Date(n.due_date) < today &&
                                          n.status !== 'packed' && n.status !== 'completed' && n.status !== 'loaded');
    const dueToday = allTasks.filter(n => {
      if (!n.due_date) return false;
      const d = new Date(n.due_date); d.setHours(0,0,0,0);
      return d.getTime() === today.getTime() && n.status !== 'packed' && n.status !== 'completed' && n.status !== 'loaded';
    });
    if (!overdue.length && !dueToday.length) {
      if (RTS.showToast) RTS.showToast('No overdue or due-today tasks 🎉', 'success');
      return;
    }
    const fmt = n => `  • ${n.item_name}${n.assigned_to_name ? ' → ' + n.assigned_to_name : ''}${n.due_date ? ' (due ' + new Date(n.due_date).toLocaleDateString('en-GB') + ')' : ''}`;
    let body = 'TASK DIGEST\n' + new Date().toLocaleDateString('en-GB') + '\n\n';
    if (overdue.length) body += `OVERDUE (${overdue.length}):\n${overdue.map(fmt).join('\n')}\n\n`;
    if (dueToday.length) body += `DUE TODAY (${dueToday.length}):\n${dueToday.map(fmt).join('\n')}\n\n`;
    body += 'Race Team OS';
    const subject = encodeURIComponent(`Task Digest – ${overdue.length} Overdue, ${dueToday.length} Due Today`);
    window.open(`mailto:?subject=${subject}&body=${encodeURIComponent(body)}`, '_blank');
  };

  // ─────────────────────────────────────────────────────────────────────────
  // FEATURE #9 — Comments
  // ─────────────────────────────────────────────────────────────────────────
  async function loadTaskExtras(noteId, isFromGeneral) {
    // Load comments
    try {
      const r = await fetch(`${API_BASE}/task-comments?item_id=${noteId}`);
      const d = await r.json();
      const el = document.getElementById('taskCommentsSection');
      if (el) {
        if (d.success && d.data.length > 0) {
          el.innerHTML = d.data.map(c => `
            <div class="comment-item" data-comment-id="${c.id}">
              <button class="comment-del" onclick="window.deleteComment('${c.id}')">×</button>
              <span class="comment-author">${escapeHtml(c.author || 'Unknown')}</span>
              <span class="comment-time">${formatTimeAgo(c.created_at)}</span>
              <div class="comment-text">${escapeHtml(c.content)}</div>
            </div>`).join('');
        } else {
          el.innerHTML = '<div style="color:#bbb;font-size:11px;">No comments yet</div>';
        }
      }
    } catch(e) { console.error('loadComments:', e); }
    // Load links
    try {
      const r = await fetch(`${API_BASE}/task-links?item_id=${noteId}`);
      const d = await r.json();
      const el = document.getElementById('taskLinksSection');
      if (el) {
        if (d.success && d.data.length > 0) {
          el.innerHTML = d.data.map(lk => `
            <div class="link-item" data-link-id="${lk.id}">
              <a href="${escapeHtml(lk.url)}" target="_blank" title="${escapeHtml(lk.url)}">${escapeHtml(lk.label || lk.url)}</a>
              <button class="link-del" onclick="window.deleteLink('${lk.id}')">×</button>
            </div>`).join('');
        } else {
          el.innerHTML = '<div style="color:#bbb;font-size:11px;">No links yet</div>';
        }
      }
    } catch(e) { console.error('loadLinks:', e); }
  }

  window.saveComment = async function(noteId, isFromGeneral) {
    const input = document.getElementById('newCommentInput');
    const content = input?.value?.trim();
    if (!content) return;
    const note = (isFromGeneral ? generalNotes : notes).find(n => n.id === noteId);
    const listId = note?.packing_list_id;
    try {
      await fetch(`${API_BASE}/task-comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: noteId, list_id: listId, content })
      });
      if (input) input.value = '';
      await loadTaskExtras(noteId, isFromGeneral);
    } catch(e) { console.error('saveComment:', e); }
  };

  window.deleteComment = async function(commentId) {
    try {
      await fetch(`${API_BASE}/task-comments/${commentId}`, { method: 'DELETE' });
      const el = document.querySelector(`[data-comment-id="${commentId}"]`);
      if (el) el.remove();
    } catch(e) { console.error('deleteComment:', e); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // FEATURE #10 — Links / Attachments
  // ─────────────────────────────────────────────────────────────────────────
  window.saveLink = async function(noteId, isFromGeneral) {
    const labelInput = document.getElementById('newLinkLabelInput');
    const urlInput   = document.getElementById('newLinkUrlInput');
    const url   = urlInput?.value?.trim();
    const label = labelInput?.value?.trim();
    if (!url) return;
    const note   = (isFromGeneral ? generalNotes : notes).find(n => n.id === noteId);
    const listId = note?.packing_list_id;
    try {
      await fetch(`${API_BASE}/task-links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: noteId, list_id: listId, label: label || null, url })
      });
      if (labelInput) labelInput.value = '';
      if (urlInput)   urlInput.value   = '';
      await loadTaskExtras(noteId, isFromGeneral);
    } catch(e) {
      if (RTS.showToast) RTS.showToast('URL must start with http:// or https://', 'error');
    }
  };

  window.deleteLink = async function(linkId) {
    try {
      await fetch(`${API_BASE}/task-links/${linkId}`, { method: 'DELETE' });
      const el = document.querySelector(`[data-link-id="${linkId}"]`);
      if (el) el.remove();
    } catch(e) { console.error('deleteLink:', e); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // FEATURE #12 — Kanban Board View
  // ─────────────────────────────────────────────────────────────────────────
  let _activeView = 'list'; // 'list' | 'kanban' | 'calendar'

  function setMainView(mode) {
    _activeView = mode;
    const taskList  = document.getElementById('taskList');
    const taskHdr   = document.getElementById('taskHeader');
    const chipBar   = document.querySelector('.filter-chip-bar');
    const kanban    = document.getElementById('kanbanView');
    const calendar  = document.getElementById('calendarView');
    const btnK = document.getElementById('btnKanban');
    const btnC = document.getElementById('btnCalendar');
    const show = id => { const el=document.getElementById(id); if(el) el.style.display=''; };
    const hide = id => { const el=document.getElementById(id); if(el) el.style.display='none'; };

    if (mode === 'kanban') {
      hide('taskList'); hide('taskHeader'); if(chipBar) chipBar.style.display='none';
      if(kanban) kanban.style.display='flex'; hide('calendarView');
      if(btnK) btnK.style.background='#1a73e8'; if(btnK) btnK.style.color='#fff';
      if(btnC) { btnC.style.background=''; btnC.style.color=''; }
      renderKanban();
    } else if (mode === 'calendar') {
      hide('taskList'); hide('taskHeader'); if(chipBar) chipBar.style.display='none';
      hide('kanbanView'); if(calendar) calendar.style.display='flex';
      if(btnC) btnC.style.background='#1a73e8'; if(btnC) btnC.style.color='#fff';
      if(btnK) { btnK.style.background=''; btnK.style.color=''; }
      renderCalendar(window._calYear || new Date().getFullYear(), window._calMonth || new Date().getMonth());
    } else {
      show('taskList'); show('taskHeader'); if(chipBar) chipBar.style.display='';
      hide('kanbanView'); hide('calendarView');
      if(btnK) { btnK.style.background=''; btnK.style.color=''; }
      if(btnC) { btnC.style.background=''; btnC.style.color=''; }
    }
  }

  window._showKanbanView = function() {
    setMainView(_activeView === 'kanban' ? 'list' : 'kanban');
  };

  function renderKanban() {
    const container = document.getElementById('kanbanContainer');
    if (!container) return;
    const allTasks  = [...(generalNotes || []), ...(notes || [])];
    const today     = new Date(); today.setHours(0,0,0,0);
    const columns   = [
      { key: 'pending',     label: '⏳ Pending',     statuses: ['pending'],                cls: 'kanban-col-pending'  },
      { key: 'in_progress', label: '🔵 In Progress', statuses: ['in_progress'],            cls: 'kanban-col-progress' },
      { key: 'blocked',     label: '⛔ Blocked',     statuses: ['blocked'],                cls: 'kanban-col-blocked'  },
      { key: 'done',        label: '✅ Done',         statuses: ['packed','completed','loaded'], cls: 'kanban-col-done' },
    ];
    container.innerHTML = columns.map(col => {
      const tasks = allTasks.filter(n => col.statuses.includes(n.status || 'pending'));
      const cards = tasks.map(n => {
        const isOverdue = n.due_date && new Date(n.due_date) < today && !col.statuses.some(s=>s==='packed'||s==='completed'||s==='loaded');
        const extraCls  = n.priority === 'critical' ? 'critical' : isOverdue ? 'overdue' : '';
        const due       = n.due_date ? new Date(n.due_date).toLocaleDateString('en-GB',{day:'2-digit',month:'short'}) : '';
        return `<div class="kanban-card ${extraCls}" onclick="window.selectTask('${n.id}',${!!n._isGeneral})">
          <div class="kc-name">${escapeHtml(n.item_name)}</div>
          <div class="kc-meta">
            ${n.priority && n.priority !== 'normal' ? `<span>${n.priority}</span>` : ''}
            ${due ? `<span>📅 ${due}</span>` : ''}
            ${n.assigned_to_name ? `<span>👤 ${escapeHtml(n.assigned_to_name)}</span>` : ''}
          </div>
        </div>`;
      }).join('');
      return `<div class="kanban-column ${col.cls}">
        <div class="kanban-col-header">${col.label} <span style="font-weight:400;opacity:.7;">(${tasks.length})</span></div>
        <div class="kanban-col-body">${cards || '<div style="color:#bbb;font-size:11px;padding:6px;">No tasks</div>'}</div>
      </div>`;
    }).join('');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FEATURE #13 — Calendar View
  // ─────────────────────────────────────────────────────────────────────────
  window._calYear  = new Date().getFullYear();
  window._calMonth = new Date().getMonth();

  window._showCalView = function() {
    setMainView(_activeView === 'calendar' ? 'list' : 'calendar');
  };

  function renderCalendar(year, month) {
    window._calYear  = year;
    window._calMonth = month;
    const container = document.getElementById('calendarContainer');
    if (!container) return;
    const today   = new Date(); today.setHours(0,0,0,0);
    const allTasks = [...(generalNotes||[]), ...(notes||[])].filter(n => n.due_date);
    const tasksByDate = {};
    allTasks.forEach(n => {
      const key = n.due_date.slice(0,10);
      if (!tasksByDate[key]) tasksByDate[key] = [];
      tasksByDate[key].push(n);
    });
    const monthName = new Date(year, month, 1).toLocaleDateString('en-GB',{month:'long',year:'numeric'});
    const firstDay  = new Date(year, month, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(year, month+1, 0).getDate();
    const prevDays    = (firstDay + 6) % 7; // Mon-start offset
    const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    let html  = `<div class="cal-wrap">
      <div class="cal-nav">
        <button class="cal-nav-btn" onclick="renderCalendar(${month===0?year-1:year},${month===0?11:month-1})">◀</button>
        <h3>${monthName}</h3>
        <button class="cal-nav-btn" onclick="renderCalendar(${month===11?year+1:year},${month===11?0:month+1})">▶</button>
      </div>
      <div class="cal-grid">`;
    html += DAYS.map(d => `<div class="cal-day-hdr">${d}</div>`).join('');
    // Prev month padding
    const prevMonth  = month === 0 ? 11 : month - 1;
    const prevYear   = month === 0 ? year - 1 : year;
    const daysInPrev = new Date(prevYear, prevMonth+1, 0).getDate();
    for (let i = prevDays - 1; i >= 0; i--) {
      html += `<div class="cal-day other-month"><div class="cal-day-num">${daysInPrev - i}</div></div>`;
    }
    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      const key    = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const dayDate = new Date(year, month, d);
      const isToday = dayDate.getTime() === today.getTime();
      const tasks   = tasksByDate[key] || [];
      const chips   = tasks.slice(0,3).map(n => {
        const isDone = ['packed','completed','loaded'].includes(n.status);
        const isOver = dayDate < today && !isDone;
        const cls    = isDone ? 'done' : (n.priority==='critical' ? 'critical' : isOver ? 'overdue' : '');
        return `<span class="cal-chip ${cls}" onclick="window.selectTask('${n.id}',${!!n._isGeneral})" title="${escapeHtml(n.item_name)}">${escapeHtml(n.item_name.slice(0,18))}</span>`;
      }).join('');
      const more = tasks.length > 3 ? `<span style="font-size:9px;color:#888;">+${tasks.length-3} more</span>` : '';
      html += `<div class="cal-day${isToday?' today':''}"><div class="cal-day-num">${d}</div>${chips}${more}</div>`;
    }
    // Next month padding
    const totalCells = prevDays + daysInMonth;
    const nextPad    = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let i = 1; i <= nextPad; i++) {
      html += `<div class="cal-day other-month"><div class="cal-day-num">${i}</div></div>`;
    }
    html += '</div></div>';
    container.innerHTML = html;
    // Expose renderCalendar globally for inline button handlers
    window.renderCalendar = renderCalendar;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FEATURE #16 — Task Dependencies
  // ─────────────────────────────────────────────────────────────────────────
  window.addDependency = function(select, noteId) {
    const depId = select.value;
    if (!depId) return;
    select.value = '';
    const container = document.getElementById('depTagsContainer');
    if (!container) return;
    if (container.querySelector(`[data-dep-id="${depId}"]`)) return; // already added
    const allTasks = [...(generalNotes||[]), ...(notes||[])];
    const dep      = allTasks.find(n => n.id === depId);
    const label    = dep ? dep.item_name : depId.slice(0,8)+'...';
    const tag      = document.createElement('span');
    tag.className  = 'dep-tag';
    tag.dataset.depId = depId;
    tag.innerHTML  = `${escapeHtml(label)}<button class="dep-x" onclick="window.removeDependency('${depId}')">×</button>`;
    container.appendChild(tag);
  };

  window.removeDependency = function(depId) {
    document.querySelector(`.dep-tag[data-dep-id="${depId}"]`)?.remove();
  };

  // ─────────────────────────────────────────────────────────────────────────
  // FEATURE #17 — Recurring Tasks (handled server-side on complete; UI in detail)
  // Auto-create next occurrence when a recurring task is marked done
  // This hooks into markAsDone — the recurrence column is saved by saveTaskDetails
  // ─────────────────────────────────────────────────────────────────────────
  const _origMarkAsDone = window.markAsDone;
  window.markAsDone = async function(noteId, isFromGeneral = false) {
    await _origMarkAsDone(noteId, isFromGeneral);
    // Check if this task has recurrence
    const note = (isFromGeneral ? generalNotes : notes).find(n => n.id === noteId);
    if (!note || !note.recurrence) return;
    // Calculate next due date
    let nextDue = null;
    if (note.due_date) {
      const d = new Date(note.due_date);
      if (note.recurrence === 'daily')    d.setDate(d.getDate() + 1);
      if (note.recurrence === 'weekly')   d.setDate(d.getDate() + 7);
      if (note.recurrence === 'per_event') return; // per-event recurrence cloned at event time
      nextDue = d.toISOString().slice(0,10);
    }
    // Clone task
    const listId = note.packing_list_id;
    try {
      const r = await fetch(`${API_BASE}/packing-lists/${listId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_name:       note.item_name,
          source_notes:    note.source_notes,
          priority:        note.priority,
          category:        note.category,
          assigned_to_name: note.assigned_to_name,
          due_date:        nextDue,
          recurrence:      note.recurrence,
          status:          'pending'
        })
      });
      if (r.ok && RTS.showToast) RTS.showToast(`🔁 Recurring task scheduled for ${nextDue || 'next occurrence'}`, 'success');
    } catch(e) { console.error('recurrence spawn:', e); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // FEATURE #19 — Bulk Spawn to Multiple Events
  // ─────────────────────────────────────────────────────────────────────────
  let _spawnEvents = [];

  window.showBulkSpawnModal = async function() {
    const listId = window._activeListId;
    if (!listId || listId === 'GENERAL') {
      if (RTS.showToast) RTS.showToast('Select a custom or event list first', 'error');
      return;
    }
    const listEl = document.getElementById('spawnEventList');
    const modal  = new bootstrap.Modal(document.getElementById('bulkSpawnModal'));
    modal.show();
    if (listEl) listEl.innerHTML = '<div style="text-align:center;padding:20px;color:#999;">Loading events…</div>';
    try {
      const r = await fetch(`${API_BASE}/collections/events?sort=date&order=desc&limit=100`);
      const d = await r.json();
      _spawnEvents = (d.success || d.ok) ? (d.data || d.items || []) : [];
      window._renderSpawnList(_spawnEvents);
    } catch(e) { if(listEl) listEl.innerHTML = '<div style="color:#dc3545;padding:8px;">Failed to load events</div>'; }
  };

  window._renderSpawnList = function(events) {
    const el = document.getElementById('spawnEventList');
    if (!el) return;
    if (!events.length) { el.innerHTML = '<div style="color:#999;padding:8px;font-size:13px;">No events found</div>'; return; }
    el.innerHTML = events.map(ev => {
      const date = ev.date ? new Date(ev.date).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '';
      return `<label style="display:flex;align-items:center;gap:8px;padding:6px 8px;cursor:pointer;border-radius:4px;font-size:13px;border:1px solid #eee;margin-bottom:4px;">
        <input type="checkbox" class="spawn-event-chk" value="${ev.id}" onchange="window._updateSpawnCount()">
        <span style="flex:1;">${escapeHtml(ev.name||'Untitled')}</span>
        ${date ? `<span style="color:#888;font-size:11px;">${date}</span>` : ''}
      </label>`;
    }).join('');
  };

  window._updateSpawnCount = function() {
    const count = document.querySelectorAll('.spawn-event-chk:checked').length;
    const el    = document.getElementById('spawnSelectedCount');
    if (el) el.textContent = `${count} event${count !== 1 ? 's' : ''} selected`;
  };

  window.filterSpawnList = function(q) {
    q = q.toLowerCase().trim();
    window._renderSpawnList(q ? _spawnEvents.filter(ev => (ev.name||'').toLowerCase().includes(q)) : _spawnEvents);
  };

  window.executeBulkSpawn = async function() {
    const listId = window._activeListId;
    if (!listId) return;
    const selected = Array.from(document.querySelectorAll('.spawn-event-chk:checked')).map(c => c.value);
    if (!selected.length) { if (RTS.showToast) RTS.showToast('Select at least one event', 'error'); return; }
    let ok = 0, fail = 0;
    for (const eventId of selected) {
      try {
        await window.cloneList(listId, null, eventId);
        ok++;
      } catch(e) { fail++; }
    }
    bootstrap.Modal.getInstance(document.getElementById('bulkSpawnModal'))?.hide();
    if (RTS.showToast) RTS.showToast(`✅ Spawned to ${ok} event${ok!==1?'s':''}${fail?' ('+fail+' failed)':''}`, ok ? 'success' : 'error');
  };

  // ─────────────────────────────────────────────────────────────────────────
  // FEATURE #18 — Multi-Assignee (stored as comma-sep in assigned_to_name)
  // Handled transparently: assignee field accepts "Alice, Bob, Carol"
  // Kanban + calendar display first name; detail shows all
  // ─────────────────────────────────────────────────────────────────────────
  // (No extra JS needed — the existing text input already accepts comma-separated
  //  names and saveTaskDetails persists them via assigned_to_name; the
  //  assignees_json column is populated automatically by the server PATCH.)

  // ─────────────────────────────────────────────────────────────────────────
  // Track active list ID for Bulk Spawn
  // ─────────────────────────────────────────────────────────────────────────
  const _origSelectList = window.selectList;
  window.selectList = async function(id, type) {
    window._activeListId = id;
    return _origSelectList(id, type);
  };

  // Also tag general notes with _isGeneral flag so kanban/calendar can use it
  const _origLoadNotesList = loadNotesList;
  // (notes array is already in scope; flag them for kanban/calendar display)


  // ═══════════════════════════════════════════════════════════════════════════
  // POWER FEATURES — Phase 1
  // ═══════════════════════════════════════════════════════════════════════════

  // ── 1. UNDO STACK ──────────────────────────────────────────────────────────
  const _undoStack = [];
  const _UNDO_MAX  = 20;

  function _pushUndo(action) {
    _undoStack.push(action);
    if (_undoStack.length > _UNDO_MAX) _undoStack.shift();
    const btn = document.getElementById('btnUndo');
    if (btn) { btn.disabled = false; btn.title = `Undo: ${action.desc}  (⌘Z / Ctrl+Z)`; }
  }

  window.undoLast = async function() {
    if (!_undoStack.length) return;
    const action = _undoStack.pop();
    const btn = document.getElementById('btnUndo');
    if (btn) {
      btn.disabled = _undoStack.length === 0;
      btn.title = _undoStack.length > 0 ? `Undo: ${_undoStack[_undoStack.length-1].desc} (⌘Z)` : 'Nothing to undo (⌘Z)';
    }
    try {
      if (action.type === 'mark_done') {
        const listId = await getListIdForNote(action.isFromGeneral);
        const resp = await fetch(`${API_BASE}/packing-lists/${listId}/items/${action.noteId}/mark-pending`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` },
          body: JSON.stringify({ unmarked_by_name: 'Undo' })
        }).then(r => r.json());
        if (resp.success) {
          const nl = action.isFromGeneral ? generalNotes : notes;
          const i  = nl.findIndex(n => n.id === action.noteId);
          if (i >= 0) Object.assign(nl[i], resp.item);
          renderNotes(); updateStats();
        }
        RTS.showToast(`↩ Undone: ${action.desc}`, 'success');
      } else if (action.type === 'field_change') {
        const nl   = action.isFromGeneral ? generalNotes : notes;
        const note = nl.find(n => n.id === action.noteId);
        if (!note) return;
        const r = await fetch(`${API_BASE}/packing-lists/${note.packing_list_id}/items/${action.noteId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` },
          body: JSON.stringify(action.prevState)
        }).then(r => r.json());
        if (r.success) {
          const i = nl.findIndex(n => n.id === action.noteId);
          if (i >= 0) Object.assign(nl[i], r.item);
          renderNotes(); updateStats();
          const sel = document.querySelector('.task-item.selected');
          if (sel?.dataset.noteId === action.noteId) window.selectTask(action.noteId, action.isFromGeneral);
        }
        RTS.showToast(`↩ Undone: ${action.desc}`, 'success');
      }
    } catch(e) { console.error('Undo error:', e); RTS.showToast('Undo failed', 'error'); }
  };

  // Wrap markAsDone to record undo state
  (function() {
    const _orig = window.markAsDone;
    window.markAsDone = async function(noteId, isFromGeneral = false) {
      const nl   = isFromGeneral ? generalNotes : notes;
      const prev = nl.find(n => n.id === noteId);
      const wasDone = prev && ['packed','completed','loaded'].includes(prev.status);
      await _orig(noteId, isFromGeneral);
      if (prev && !wasDone) _pushUndo({ type: 'mark_done', noteId, isFromGeneral, desc: `"${prev.item_name}"` });
    };
  })();

  // Wrap saveTaskDetails to record undo state
  (function() {
    const _origSave = window.saveTaskDetails;
    window.saveTaskDetails = async function(noteId, isFromGeneral = false) {
      const nl   = isFromGeneral ? generalNotes : notes;
      const prev = nl.find(n => n.id === noteId);
      const prevState = prev ? { ...prev } : null;
      await _origSave(noteId, isFromGeneral);
      if (prevState) _pushUndo({ type: 'field_change', noteId, isFromGeneral, prevState, desc: `edit "${prevState.item_name}"` });
    };
  })();

  // ── 2. KEYBOARD SHORTCUTS ───────────────────────────────────────────────────
  document.addEventListener('keydown', function(e) {
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (document.querySelector('.modal.show')) return;
    const cmd = e.metaKey || e.ctrlKey;
    if (cmd && e.key === 'z')   { e.preventDefault(); window.undoLast(); return; }
    if (e.key === '?')           { e.preventDefault(); window.showKeyboardHelp(); return; }
    if (e.key === 'n' && !cmd)   { e.preventDefault(); window.showAddTaskModal(); return; }
    if (e.key === '/' && !cmd)   { e.preventDefault(); document.getElementById('taskSearch')?.focus(); return; }
    if (e.key === 'Escape')      { document.querySelectorAll('.task-item.selected').forEach(r => r.classList.remove('selected')); _closeInlinePopup(); return; }
    const selRow   = document.querySelector('.task-item.selected');
    const selId    = selRow?.dataset.noteId;
    const selFromG = selRow?.querySelector('.task-bulk-cb')?.dataset.fromGeneral === 'true';
    if (!selId) return;
    if (e.key === ' ')                            { e.preventDefault(); window.toggleNote(selId, selFromG); return; }
    if (e.key === 'e')                            { e.preventDefault(); window.selectTask(selId, selFromG); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && !cmd) { e.preventDefault(); window.deleteNote(selId, selFromG); return; }
    const pmap = {'1':'critical','2':'high','3':'normal','4':'low'};
    if (pmap[e.key]) { e.preventDefault(); _inlineUpdateField(selId, selFromG, { priority: pmap[e.key] }, `priority → ${pmap[e.key]}`); }
  });

  window.showKeyboardHelp = function() {
    const modal = document.getElementById('keyboardHelpModal');
    if (modal) new bootstrap.Modal(modal).show();
  };

  // ── 3. INLINE EDITING ───────────────────────────────────────────────────────
  const _iePopup = document.createElement('div');
  _iePopup.id = 'inlineEditPopup';
  _iePopup.style.cssText = 'display:none;position:fixed;background:#fff;border:1px solid #d0d6df;border-radius:6px;padding:8px 10px;box-shadow:0 4px 16px rgba(0,0,0,0.18);z-index:9000;min-width:160px;font-size:12px;';
  document.body.appendChild(_iePopup);

  function _closeInlinePopup() { _iePopup.style.display = 'none'; }
  window._closeInlinePopup = _closeInlinePopup;

  document.addEventListener('click', function(e) {
    if (_iePopup.style.display !== 'none' && !_iePopup.contains(e.target)) _closeInlinePopup();
  });

  function _openInlinePopup(el, html) {
    const rect = el.getBoundingClientRect();
    _iePopup.innerHTML = html;
    _iePopup.style.display = 'block';
    let top = rect.bottom + 4, left = rect.left;
    if (left + 230 > window.innerWidth)  left = window.innerWidth - 240;
    if (top  + 220 > window.innerHeight) top  = rect.top - 215;
    _iePopup.style.top = top + 'px'; _iePopup.style.left = left + 'px';
  }

  window.showInlinePriority = function(noteId, isFromGeneral, el, evt) {
    evt.stopPropagation();
    const note = (isFromGeneral ? generalNotes : notes).find(n => n.id === noteId);
    const cur  = note?.priority || 'normal';
    const opts = [['critical','🔴','Critical'],['high','🟠','High'],['normal','⚪','Normal'],['low','🟢','Low']];
    _openInlinePopup(el,
      `<div style="font-size:9px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px;font-weight:700;">Priority</div>` +
      opts.map(([v,i,l]) =>
        `<div onclick="window._applyIP('${noteId}',${isFromGeneral},'${v}',event)" style="padding:4px 8px;cursor:pointer;border-radius:3px;display:flex;align-items:center;gap:6px;${v===cur?'background:rgba(0,153,204,.1);font-weight:600;':''}">${i} ${l}${v===cur?' ✓':''}</div>`
      ).join('')
    );
  };
  window._applyIP = function(noteId, fg, priority, evt) { evt.stopPropagation(); _closeInlinePopup(); _inlineUpdateField(noteId, fg, { priority }, `priority → ${priority}`); };

  window.showInlineAssignee = function(noteId, isFromGeneral, el, evt) {
    evt.stopPropagation();
    const note = (isFromGeneral ? generalNotes : notes).find(n => n.id === noteId);
    const cur  = escapeHtml(note?.assigned_to_name || '');
    _openInlinePopup(el,
      `<div style="font-size:9px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px;font-weight:700;">Assign To</div>
       <input type="text" id="_ie_a" value="${cur}" placeholder="Name(s), comma-sep" style="width:210px;padding:4px 7px;border:1px solid #c8d0da;border-radius:3px;font-size:12px;outline:none;display:block;margin-bottom:5px;" onkeydown="if(event.key==='Enter'){event.stopPropagation();window._applyIA('${noteId}',${isFromGeneral});}">
       <div style="display:flex;gap:5px;justify-content:flex-end;">
         <button onclick="window._closeInlinePopup();event.stopPropagation();" style="padding:2px 8px;border:1px solid #ddd;background:#fff;border-radius:3px;cursor:pointer;font-size:11px;">✕</button>
         <button onclick="window._applyIA('${noteId}',${isFromGeneral});event.stopPropagation();" style="padding:2px 8px;background:#0099cc;color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:11px;">✓ Save</button>
       </div>`
    );
    setTimeout(() => document.getElementById('_ie_a')?.focus(), 50);
  };
  window._applyIA = function(noteId, fg) { const v = document.getElementById('_ie_a')?.value ?? ''; _closeInlinePopup(); _inlineUpdateField(noteId, fg, { assigned_to_name: v }, `assignee → "${v||'none'}"`); };

  window.showInlineDueDate = function(noteId, isFromGeneral, el, evt) {
    evt.stopPropagation();
    const note = (isFromGeneral ? generalNotes : notes).find(n => n.id === noteId);
    const cur  = note?.due_date || '';
    _openInlinePopup(el,
      `<div style="font-size:9px;color:#888;text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px;font-weight:700;">Due Date</div>
       <input type="date" id="_ie_d" value="${cur}" style="width:180px;padding:4px 7px;border:1px solid #c8d0da;border-radius:3px;font-size:12px;outline:none;display:block;margin-bottom:5px;" onkeydown="if(event.key==='Enter'){event.stopPropagation();window._applyID('${noteId}',${isFromGeneral});}">
       <div style="display:flex;gap:5px;justify-content:flex-end;">
         <button onclick="window._applyID('${noteId}',${isFromGeneral},true);event.stopPropagation();" style="padding:2px 8px;border:1px solid #ddd;background:#fff;border-radius:3px;cursor:pointer;font-size:11px;">Clear</button>
         <button onclick="window._applyID('${noteId}',${isFromGeneral});event.stopPropagation();" style="padding:2px 8px;background:#0099cc;color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:11px;">✓ Set</button>
       </div>`
    );
    setTimeout(() => document.getElementById('_ie_d')?.focus(), 50);
  };
  window._applyID = function(noteId, fg, clear = false) { const v = clear ? null : (document.getElementById('_ie_d')?.value || null); _closeInlinePopup(); _inlineUpdateField(noteId, fg, { due_date: v }, `due date → ${v||'cleared'}`); };

  async function _inlineUpdateField(noteId, isFromGeneral, fields, desc) {
    const nl   = isFromGeneral ? generalNotes : notes;
    const note = nl.find(n => n.id === noteId);
    if (!note) return;
    const prevState = {};
    Object.keys(fields).forEach(k => { prevState[k] = note[k]; });
    try {
      const r = await fetch(`${API_BASE}/packing-lists/${note.packing_list_id}/items/${noteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` },
        body: JSON.stringify(fields)
      }).then(r => r.json());
      if (r.success) {
        const i = nl.findIndex(n => n.id === noteId);
        if (i >= 0) Object.assign(nl[i], r.item);
        renderNotes(); updateStats();
        _pushUndo({ type: 'field_change', noteId, isFromGeneral, prevState, desc });
        const sel = document.querySelector('.task-item.selected');
        if (sel?.dataset.noteId === noteId) window.selectTask(noteId, isFromGeneral);
      }
    } catch(e) { console.error('Inline edit error:', e); RTS.showToast('Failed to update', 'error'); }
  }

  // ── 4. BULK EDIT ────────────────────────────────────────────────────────────
  (function() {
    const _origToggle = window.toggleBulkMode;
    window.toggleBulkMode = function() {
      _origToggle();
      if (!_bulkSelectMode) {
        const bar = document.getElementById('bulkEditBar');
        if (bar) bar.style.display = 'none';
      }
    };
    const _origHandle = window.handleTaskCheckbox;
    window.handleTaskCheckbox = function(noteId, isFromGeneral, el) {
      _origHandle(noteId, isFromGeneral, el);
      const count   = document.querySelectorAll('.task-item.bulk-selected').length;
      const bar     = document.getElementById('bulkEditBar');
      const countEl = document.getElementById('bulkEditCount');
      if (bar)     bar.style.display     = (_bulkSelectMode && count > 0) ? 'flex' : 'none';
      if (countEl) countEl.textContent   = count;
    };
  })();

  window.applyBulkEdit = async function() {
    const rows = [...document.querySelectorAll('.task-item.bulk-selected')];
    if (!rows.length) return;
    const updates  = {};
    const assignee = document.getElementById('bulkAssignee')?.value.trim();
    const priority = document.getElementById('bulkPriority')?.value;
    const status   = document.getElementById('bulkStatus')?.value;
    const dueDate  = document.getElementById('bulkDueDate')?.value;
    const tags     = document.getElementById('bulkTags')?.value.trim();
    if (assignee) updates.assigned_to_name = assignee;
    if (priority) updates.priority  = priority;
    if (status)   updates.status    = status;
    if (dueDate)  updates.due_date  = dueDate;
    if (tags)     updates.tags      = tags;
    if (!Object.keys(updates).length) { RTS.showToast('Set at least one field to update', 'warning'); return; }
    const token = localStorage.getItem('auth_token');
    let ok = 0, fail = 0;
    for (const row of rows) {
      const nId = row.dataset.noteId;
      const fg  = row.querySelector('.task-bulk-cb')?.dataset.fromGeneral === 'true';
      const nl  = fg ? generalNotes : notes;
      const n   = nl.find(x => x.id === nId);
      if (!n) continue;
      try {
        const r = await fetch(`${API_BASE}/packing-lists/${n.packing_list_id}/items/${nId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify(updates)
        }).then(r => r.json());
        if (r.success) { const i = nl.findIndex(x => x.id === nId); if (i >= 0) Object.assign(nl[i], r.item); ok++; } else fail++;
      } catch(e) { fail++; }
    }
    renderNotes(); updateStats();
    window.toggleBulkMode();
    ['bulkAssignee','bulkDueDate','bulkTags'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    ['bulkPriority','bulkStatus'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    RTS.showToast(`✅ Updated ${ok} task${ok!==1?'s':''}${fail?' ('+fail+' failed)':''}`, ok ? 'success' : 'error');
  };

  // ── 5. PASTE-TO-TASKS ───────────────────────────────────────────────────────
  window.showPasteModal = function() {
    if (!currentList) { RTS.showToast('Select a list first', 'warning'); return; }
    const modal = document.getElementById('pasteTasksModal');
    if (modal) {
      document.getElementById('pasteText').value   = '';
      document.getElementById('pastePreview').innerHTML = '';
      new bootstrap.Modal(modal).show();
    }
  };
  window.previewPaste = function() {
    const lines = (document.getElementById('pasteText')?.value || '').split('\n')
      .map(l => l.replace(/^[-•*>\s]+/, '').trim()).filter(Boolean);
    const el = document.getElementById('pastePreview');
    if (!el) return;
    el.innerHTML = lines.length
      ? `<div style="font-size:11px;color:#666;margin-bottom:4px;">${lines.length} task${lines.length!==1?'s':''} to import:</div>`
        + lines.map((l,i) => `<div style="padding:3px 6px;background:#f8f9fa;border-radius:3px;margin-bottom:2px;font-size:11px;display:flex;gap:6px;"><span style="color:#28a745;font-weight:700;min-width:16px;">${i+1}</span><span>${escapeHtml(l)}</span></div>`).join('')
      : '';
  };
  window.importPastedTasks = async function() {
    const text     = document.getElementById('pasteText')?.value   || '';
    const priority = document.getElementById('pastePriority')?.value || 'normal';
    const category = document.getElementById('pasteCategory')?.value?.trim() || 'general';
    const lines    = text.split('\n').map(l => l.replace(/^[-•*>\s]+/, '').trim()).filter(Boolean);
    if (!lines.length) { RTS.showToast('Nothing to import', 'warning'); return; }
    if (!currentList)  { RTS.showToast('Select a list first', 'warning'); return; }
    const token = localStorage.getItem('auth_token');
    let ok = 0, fail = 0;
    for (let i = 0; i < lines.length; i++) {
      try {
        const r = await fetch(`${API_BASE}/packing-lists/${currentList.id}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ item_name: lines[i], priority, category, quantity: 1, required: false, sort_order: (notes.length + i) * 10 })
        }).then(r => r.json());
        if (r.success) { notes.push(r.item); ok++; } else fail++;
      } catch(e) { fail++; }
    }
    bootstrap.Modal.getInstance(document.getElementById('pasteTasksModal'))?.hide();
    renderNotes(); updateStats();
    RTS.showToast(`✅ Imported ${ok} task${ok!==1?'s':''}${fail?' ('+fail+' failed)':''}`, ok ? 'success' : 'error');
  };

  // ── 6. PUSH NOTIFICATIONS ───────────────────────────────────────────────────
  window.setupNotifications = async function() {
    if (!('Notification' in window)) { RTS.showToast('Notifications not supported in this browser', 'error'); return; }
    const perm = await Notification.requestPermission();
    const btn  = document.getElementById('btnNotify');
    if (perm === 'granted') {
      if (btn) { btn.style.background = '#28a745'; btn.style.color = '#fff'; btn.title = 'Notifications on — click to check overdue'; }
      RTS.showToast('🔔 Notifications enabled!', 'success');
      window._checkOverdue();
    } else {
      RTS.showToast('Notifications permission denied', 'error');
    }
  };
  window._checkOverdue = function() {
    if (!('Notification' in window) || Notification.permission !== 'granted') { RTS.showToast('Enable notifications first', 'warning'); return; }
    const now = new Date();
    const all = [...(generalNotes||[]), ...(notes||[])];
    const ov  = all.filter(n => !['packed','loaded','completed'].includes(n.status) && n.due_date && new Date(n.due_date) < now);
    if (!ov.length) { RTS.showToast('✅ No overdue tasks!', 'success'); return; }
    const body = ov.slice(0,4).map(n => `• ${n.item_name}`).join('\n') + (ov.length > 4 ? `\n… +${ov.length-4} more` : '');
    try { new Notification(`⚠️ ${ov.length} overdue task${ov.length!==1?'s':''}`, { body, tag: 'rts-overdue', requireInteraction: true }); } catch(e) { console.warn('Notification:', e); }
    RTS.showToast(`⚠️ ${ov.length} overdue task${ov.length!==1?'s':''}`, 'warning');
  };
  // Init notification button state on load
  setTimeout(() => {
    const btn = document.getElementById('btnNotify');
    if (btn && 'Notification' in window && Notification.permission === 'granted') {
      btn.style.background = '#28a745'; btn.style.color = '#fff';
    }
  }, 800);

  // ── 7. SNOOZE TASKS ─────────────────────────────────────────────────────────
  window.snoozeTask = async function(noteId, amount, isFromGeneral, evt) {
    evt.stopPropagation();
    const noteList = isFromGeneral ? generalNotes : notes;
    const note     = noteList.find(n => n.id === noteId);
    if (!note) return;
    let newDate;
    if (amount === 'tomorrow') {
      const d = new Date(); d.setDate(d.getDate() + 1);
      newDate = d.toISOString().slice(0, 10);
    } else {
      const d = new Date(); d.setHours(d.getHours() + amount);
      newDate = d.toISOString().slice(0, 10);
    }
    await _inlineUpdateField(noteId, isFromGeneral, { due_date: newDate }, `snoozed → ${newDate}`);
    RTS.showToast(`⏰ Snoozed to ${newDate}`, 'success');
  };

  // ── 8. SAVED SMART VIEWS ────────────────────────────────────────────────────
  const _SV_KEY = 'rts.savedViews';
  function _svLoad() { try { return JSON.parse(localStorage.getItem(_SV_KEY) || '[]'); } catch { return []; } }
  function _svSave(v) { localStorage.setItem(_SV_KEY, JSON.stringify(v)); }

  function _renderSavedViews() {
    const el = document.getElementById('savedViewsList');
    if (!el) return;
    const views = _svLoad();
    if (!views.length) { el.innerHTML = '<div style="padding:4px 10px;font-size:11px;color:#aaa;font-style:italic;">No saved views yet</div>'; return; }
    el.innerHTML = views.map((v, i) =>
      `<div class="sidebar-item" onclick="window.loadSavedView(${i})" style="padding-right:4px;">
         <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(v.name)}">🔖 ${escapeHtml(v.name)}</span>
         <button onclick="event.stopPropagation();window.deleteSavedView(${i})" style="background:none;border:none;color:#bbb;cursor:pointer;font-size:14px;padding:0 2px;line-height:1;" title="Delete">×</button>
       </div>`
    ).join('');
  }

  window.saveCurrentView = function() {
    const name = prompt('Name for this smart view:', '');
    if (!name?.trim()) return;
    const views = _svLoad();
    views.push({ name: name.trim(), filter: currentFilter, chip: _chipFilter, search: _searchQuery, groupBy: _groupBy });
    _svSave(views); _renderSavedViews();
    RTS.showToast(`🔖 Saved "${name.trim()}"`, 'success');
  };
  window.loadSavedView = function(idx) {
    const v = _svLoad()[idx];
    if (!v) return;
    currentFilter = v.filter  || 'all';
    _chipFilter   = v.chip    || 'all';
    _searchQuery  = v.search  || '';
    _groupBy      = v.groupBy || 'none';
    document.querySelectorAll('.sidebar-item[data-view]').forEach(el => el.classList.toggle('active', el.dataset.view === currentFilter));
    document.querySelectorAll('.filter-chip').forEach(el => el.classList.toggle('active', el.dataset.chip === _chipFilter));
    const s = document.getElementById('taskSearch');    if (s) s.value = _searchQuery;
    const g = document.getElementById('groupBySelect'); if (g) g.value = _groupBy;
    renderNotes();
    RTS.showToast(`🔖 Loaded "${v.name}"`, 'success');
  };
  window.deleteSavedView = function(idx) { const views = _svLoad(); views.splice(idx, 1); _svSave(views); _renderSavedViews(); };
  setTimeout(_renderSavedViews, 600);

  // ── 9. GROUP BY ─────────────────────────────────────────────────────────────
  window.setGroupBy = function(val) { _groupBy = val || 'none'; renderNotes(); };

  window._buildGroupedHTML = function(filtered, isFromGeneral) {
    const grouped = {}, order = [];
    const PRIO_ORDER  = ['critical','high','normal','low'];
    const PRIO_LABELS = { critical:'🔴 Critical', high:'🟠 High', normal:'⚪ Normal', low:'🟢 Low' };
    filtered.forEach(n => {
      let key;
      if      (_groupBy === 'priority') key = n.priority || 'normal';
      else if (_groupBy === 'category') key = n.category?.trim() || 'Uncategorised';
      else if (_groupBy === 'assignee') key = n.assigned_to_name ? n.assigned_to_name.split(',')[0].trim() : 'Unassigned';
      else key = 'All';
      if (!grouped[key]) { grouped[key] = []; order.push(key); }
      grouped[key].push(n);
    });
    const sortedKeys = _groupBy === 'priority' ? PRIO_ORDER.filter(k => grouped[k]) : order;
    let html = '';
    sortedKeys.forEach(key => {
      const tasks = grouped[key];
      const label = _groupBy === 'priority' ? (PRIO_LABELS[key] || key) : key;
      const done  = tasks.filter(n => ['packed','completed','loaded'].includes(n.status)).length;
      html += `<div class="group-section-header"><span class="gsh-label">${escapeHtml(label)}</span><span class="gsh-count">${done}/${tasks.length}</span></div>`;
      html += renderTree(buildTree(tasks), isFromGeneral);
    });
    return html;
  };

  // ── 10. NEXT 7 DAYS VIEW ────────────────────────────────────────────────────
  window._render7DaysGrouped = function(filtered) {
    const today = new Date(); today.setHours(0,0,0,0);
    const byDay = {}, dayOrder = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today); d.setDate(today.getDate() + i);
      const key   = d.toISOString().slice(0, 10);
      const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'short' });
      byDay[key]  = { label, tasks: [] };
      dayOrder.push(key);
    }
    filtered.forEach(n => { const k = n.due_date?.slice(0, 10); if (byDay[k]) byDay[k].tasks.push(n); });
    let html = '';
    dayOrder.forEach(key => {
      const { label, tasks } = byDay[key];
      const done = tasks.filter(n => ['packed','completed','loaded'].includes(n.status)).length;
      html += `<div class="group-section-header group-day-header"><span class="gsh-label">📅 ${label}</span><span class="gsh-count">${tasks.length ? done+'/'+tasks.length : 'no tasks'}</span></div>`;
      if (tasks.length) html += renderTree(buildTree(tasks), false);
    });
    if (!html.includes('task-item')) {
      html = '<div style="text-align:center;padding:32px 20px;color:#aaa;font-size:13px;">No tasks due in the next 7&nbsp;days 🎉</div>';
    }
    return html;
  };

  // Extend switchView to handle '7days'
  (function() {
    const _origSwitch = window.switchView;
    window.switchView = function(view) {
      currentFilter = view;
      document.querySelectorAll('.sidebar-item, .sidebar-list-item').forEach(item => item.classList.remove('active'));
      document.querySelector(`.sidebar-item[data-view="${view}"]`)?.classList.add('active');
      renderNotes();
    };
  })();

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
