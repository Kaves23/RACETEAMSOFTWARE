/* Load Planning Engine
 * Modular JavaScript for 3D truck packing system
 * Ready for future SQL server integration
 */

console.log('📦 load-engine.js loading...');

(function() {
  'use strict';

  console.log('📦 load-engine.js IIFE started');

  // ========== CONFIGURATION ==========

  // ========== STATE ==========
  let boxes = [];
  let assets = [];
  let inventory = [];
  let locations = [];
  let trucks = [];
  let currentLoad = null;
  let events = [];
  let eventsLoadError = false;
  let selectedBoxId = null;
  let currentView = '2D';
  let activeTab = 'boxes';
  // active filters per tab
  let filterBoxCat = 'all';
  let filterBoxLoc = 'all';
  let filterAssetType = 'all';
  let filterAssetStatus = 'all';
  let filterAssetLoc = 'all';
  let filterInvCat = 'all';
  let filterInvLoc = 'all';
  let scene, camera, renderer, controls;
  let boxModal;

  // Unload mode state
  let unloadMode = false;
  let unloadLocationId = null;
  let unloadLocationName = '';
  let unloadTicked = new Set();
  let unloadFinished = false;

  // ========== INITIALIZATION ==========
  async function init() {
    RTS.setActiveNav();
    await loadEvents();
    await loadData();
    initUI();
    renderAll();
  }

  async function loadEvents() {
    eventsLoadError = false;
    try {
      const resp = await window.RTS_API.getCollectionItems('events');
      const rows = resp.items || resp.data || resp || [];
      events = Array.isArray(rows) ? rows : [];
    } catch (err) {
      console.error('loadEvents: DB unavailable', err.message);
      events = [];
      eventsLoadError = true;
    }
  }

  async function loadData() {
    try {
      // Load boxes from database via API
      const boxesResp = await window.RTS_API.getBoxes();
      const boxContentsResp = await window.RTS_API.getBoxContents();
      const itemsResp = await window.RTS_API.getItems();
      
      const apiBoxes = boxesResp.boxes || [];
      const apiBoxContents = boxContentsResp.boxContents || [];
      const apiItems = itemsResp.items || [];
      // assets = tracked physical items (barcodes, serials) from /api/items
      assets = apiItems;
      // inventory loaded separately below
      
      // Map boxes with their contents
      boxes = apiBoxes.map(b => {
        const contents = apiBoxContents.filter(c => c.box_id === b.id);
        let contentsText = '';
        let contentsItems = [];
        
        if (contents.length > 0) {
          const itemsList = contents.map(c => {
            const item = apiItems.find(i => i.id === c.item_id);
            // item may be undefined for inventory-type rows — fall back to the
            // item_name / item_barcode / item_type columns returned by the
            // box-contents JOIN query (which already covers both tables)
            const baseName = item ? item.name     : c.item_name;
            const barcode  = item ? item.barcode  : c.item_barcode;
            const type     = item ? item.item_type : c.item_type;
            const serial   = item ? item.serial_number : (c.serial_number || null);
            const name     = c.variant_label ? `${baseName} \u2013 ${c.variant_label}` : baseName;
            if (!name) return null;
            contentsItems.push({
              id:       item ? item.id : c.item_id,
              barcode:  barcode,
              name:     name,
              type:     type,
              serial:   serial,
              quantity: c.quantity_packed || 1
            });
            return `${barcode}: ${name}`;
          }).filter(Boolean);
          
          contentsText = itemsList.length > 0 
            ? itemsList.join('\n') 
            : `Empty - Location: ${b.location || 'Warehouse'}`;
        } else {
          contentsText = `Empty - Location: ${b.location || 'Warehouse'}`;
        }
        
        return {
          id: b.id,
          barcode: b.barcode,
          name: b.name,
          length: b.dimensions_length_cm || b.length || 100,
          width:  b.dimensions_width_cm  || b.width  || 60,
          height: b.dimensions_height_cm || b.height || 50,
          weight: b.max_weight_kg || b.weight_capacity || 25,
          contents: contentsText,
          contentsItems: contentsItems,
          category: 'container',
          status: b.status || 'warehouse',
          boxType: b.box_type || 'regular',
          currentTruckId: b.current_truck_id || null,
          location: b.location_name || null
        };
      });
      
      if (boxes.length === 0) {
        showError('No boxes found in database. Create boxes in Logistics → Box Packing first.');
      }
    } catch (e) {
      showError('Could not load boxes from database: ' + e.message);
      return;
    }

    // Load trucks from database
    try {
      const trucksResp = await window.RTS_API.getTrucks();
      const apiTrucks = trucksResp.trucks || [];
      if (apiTrucks.length > 0) {
        trucks = apiTrucks.map(t => {
          // DB dimensions are in metres; engine expects centimetres
          const length = t.dimensions_length_m ? Math.round(t.dimensions_length_m * 100) : 408;
          const width  = t.dimensions_width_m  ? Math.round(t.dimensions_width_m  * 100) : 210;
          const height = t.dimensions_height_m ? Math.round(t.dimensions_height_m * 100) : 210;
          // Compute 1-metre grid zones from dimensions
          const gridSize  = 100;
          const numGridsX = Math.max(1, Math.floor(length / gridSize));
          const numGridsZ = Math.max(1, Math.floor(width  / gridSize));
          const zones     = {};
          for (let x = 0; x < numGridsX; x++) {
            for (let z = 0; z < numGridsZ; z++) {
              const gridNum = (x * 2) + (z === 0 ? 2 : 1);
              zones[`grid-${gridNum}`] = {
                maxWeight: t.max_weight_kg ? Math.round(t.max_weight_kg / (numGridsX * numGridsZ)) : 400,
                maxVolume: parseFloat(((gridSize / 100) * (gridSize / 100) * (height / 100)).toFixed(3)),
                gridX: x, gridZ: z,
                posX: -length / 2 + (x * gridSize) + (gridSize / 2),
                posZ: -width  / 2 + (z * gridSize) + (gridSize / 2)
              };
            }
          }
          return {
            id:         t.id,
            name:       t.name || t.registration,
            type:       t.truck_type || 'Trailer',
            registration: t.registration,
            length, width, height,
            maxWeight:  t.max_weight_kg  || 3500,
            color:      0x4a90e2,
            gridSize, numGridsX, numGridsZ, zones
          };
        });
        console.log(`✅ Loaded ${trucks.length} vehicle(s) from database`);
      } else {
        showError('No vehicles found in database. Add a vehicle at Logistics → Vehicles first.');
        return;
      }
    } catch (e) {
      showError('Could not load vehicles from database: ' + e.message);
      return;
    }

    // Load inventory items (consumables/stock) from collections
    try {
      const invResp = await window.RTS_API.getCollectionItems('inventory');
      inventory = Array.isArray(invResp) ? invResp : (invResp.items || invResp.data || []);
    } catch (e) {
      console.warn('Could not load inventory items:', e.message);
      inventory = [];
    }

    // Load locations for asset display
    try {
      const locResp = await window.RTS_API.getLocations();
      locations = locResp.items || [];
    } catch (e) {
      locations = [];
    }

    // Load current load plan from DB — use the first truck's plan by default
    const defaultTruckId = trucks[0]?.id || null;
    try {
      const draftResp = await window.RTS_API.getLoadPlanDraft(defaultTruckId);
      if (draftResp && draftResp.success && draftResp.plan) {
        const plan = draftResp.plan;
        const placements = purgeOrphanPlacements(draftResp.placements || []);
        currentLoad = {
          id: plan.id,
          eventId: plan.event_id || null,
          truckId: plan.truck_id || defaultTruckId,
          placements: placements,
          status: plan.status || 'Draft',
          createdAt: plan.created_at,
          updatedAt: plan.updated_at
        };
        console.log(`✅ Loaded draft plan from DB: ${placements.length} placements (truck: ${plan.truck_id})`);
      } else {
        // No saved plan yet — start fresh
        currentLoad = createEmptyLoad();
        console.log('📦 No saved plan found, starting fresh');
      }
    } catch (e) {
      showError('Could not load load plan from database: ' + e.message);
      return;
    }
  }

  function saveData() {
    // DB is the single source of truth — no localStorage
    if (window.RTS_API && currentLoad) {
      window.RTS_API.saveLoadPlanDraft({
        truck_id: currentLoad.truckId || null,
        event_id: currentLoad.eventId || null,
        placements: currentLoad.placements || []
      }).catch(e => console.error('Could not save load plan to DB:', e.message));
    }
  }

  function showError(message) {
    console.error(message);
    const spinner = document.getElementById('loadSpinner');
    if (spinner) spinner.remove();
    const view = document.getElementById('view2D');
    if (view) {
      view.innerHTML = `<div style="padding:40px;text-align:center;color:#dc3545;font-size:1rem;">
        <div style="font-size:2rem;margin-bottom:12px;">⚠️</div>
        <strong>Error loading data</strong><br><span style="color:#6c757d;font-size:.9rem">${message}</span></div>`;
    }
  }

  function purgeOrphanPlacements(placements) {
    // Remove any box placements whose box ID doesn't exist in the loaded boxes array.
    // This prevents FK constraint failures when a box was deleted after being added to a plan.
    const knownBoxIds = new Set(boxes.map(b => String(b.id)));
    const before = placements.length;
    const clean = placements.filter(p => {
      if (p.type === 'asset' || p.type === 'inventory') return true; // keep non-box placements
      if (!p.boxId) return true;
      return knownBoxIds.has(String(p.boxId));
    });
    if (clean.length < before) {
      console.warn(`Purged ${before - clean.length} orphan placement(s) — box(es) no longer in DB`);
    }
    return clean;
  }

  function createEmptyLoad() {
    return {
      id: RTS.uid('load'),
      eventId: null,
      truckId: trucks.length > 0 ? trucks[0].id : null, // Auto-select first truck
      placements: [],
      status: 'Draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  function seedBoxes() {
    return [
      { id: RTS.uid('box'), barcode: 'BOX-001', name: 'Tools Box A', length: 100, width: 60, height: 50, weight: 25, contents: 'Hand tools, wrenches, screwdrivers', category: 'tools', status: 'warehouse' },
      { id: RTS.uid('box'), barcode: 'BOX-002', name: 'Spare Parts Crate', length: 120, width: 80, height: 60, weight: 45, contents: 'Engine parts, belts, filters', category: 'spares', status: 'warehouse' },
      { id: RTS.uid('box'), barcode: 'BOX-003', name: 'Tyres Set 1', length: 150, width: 100, height: 80, weight: 80, contents: '4x Racing tyres (slicks)', category: 'tyres', status: 'warehouse' },
      { id: RTS.uid('box'), barcode: 'BOX-004', name: 'Fuel Containers', length: 80, width: 60, height: 70, weight: 65, contents: 'Racing fuel canisters', category: 'fuel', status: 'warehouse' },
      { id: RTS.uid('box'), barcode: 'BOX-005', name: 'Electronics Box', length: 90, width: 50, height: 40, weight: 15, contents: 'Radios, laptops, telemetry', category: 'equipment', status: 'warehouse' }
    ];
  }

  function seedTrucks() {
    // Generate 1m x 1m grid zones
    const gridSize = 100; // cm (1 meter)
    const length = 408; // cm
    const width = 210; // cm
    const numGridsX = Math.floor(length / gridSize); // 4
    const numGridsZ = Math.floor(width / gridSize); // 2
    const zones = {};
    
    // Create 8 individual grid zones (4 x 2)
    // Layout from rear view: Row 1 (rear/top): 1,3,5,7  Row 2 (front/bottom): 2,4,6,8
    for (let x = 0; x < numGridsX; x++) {
      for (let z = 0; z < numGridsZ; z++) {
        // Numbering: odd numbers on top row (z=1), even numbers on bottom row (z=0)
        // From rear door: 1,3,5,7 (top) and 2,4,6,8 (bottom)
        const gridNum = (x * 2) + (z === 0 ? 2 : 1);
        zones[`grid-${gridNum}`] = {
          maxWeight: 400, // 400kg per 1m x 1m cell
          maxVolume: 2.1, // 1.0 x 1.0 x 2.1 = 2.1 m³
          gridX: x,
          gridZ: z,
          posX: -length / 2 + (x * gridSize) + (gridSize / 2),
          posZ: -width / 2 + (z * gridSize) + (gridSize / 2)
        };
      }
    }
    
    return [
      {
        id: RTS.uid('truck'),
        name: 'Race Trailer A',
        type: 'Trailer',
        length: 408,
        width: 210,
        height: 210,
        maxWeight: 3500,
        color: 0x4a90e2,
        gridSize: 100,
        numGridsX: numGridsX,
        numGridsZ: numGridsZ,
        zones: zones
      }
    ];
  }

  // ========== UI INITIALIZATION ==========
  function initUI() {
    boxModal = new bootstrap.Modal(document.getElementById('boxModal'));
    
    // ── Event picker ─────────────────────────────────────────────────────
    const selectEvent  = document.getElementById('selectEvent');   // hidden input
    const eventMenu    = document.getElementById('eventPickerMenu');
    const eventLabel   = document.getElementById('eventPickerLabel');
    const eventBtn     = document.getElementById('eventPickerBtn');

    function setEventValue(val, labelText) {
      selectEvent.value = val;
      eventLabel.textContent = labelText;
      eventMenu.querySelectorAll('[data-ep-val]').forEach(b =>
        b.classList.toggle('active', b.dataset.epVal === val));
    }

    if (eventsLoadError) {
      eventBtn.disabled = true;
      eventLabel.textContent = '⚠ DB unavailable';
      eventBtn.style.color = '#dc3545';
      eventBtn.style.borderColor = '#dc3545';
    } else {
      const eventItems = [
        { value: '', label: '— Current (Live / No Event) —' },
        ...events.map(e => ({ value: String(e.id), label: e.title || e.name || 'Event' }))
      ];
      eventMenu.innerHTML = eventItems.map(item =>
        `<li><button class="dropdown-item" data-ep-val="${esc(item.value)}">${esc(item.label)}</button></li>`
      ).join('');
      const savedEvId = currentLoad.eventId ? String(currentLoad.eventId) : '';
      const savedEvItem = eventItems.find(i => i.value === savedEvId);
      setEventValue(savedEvId, savedEvItem ? savedEvItem.label : '— Current (Live / No Event) —');
      eventMenu.querySelectorAll('[data-ep-val]').forEach(btn => {
        btn.addEventListener('click', () => {
          setEventValue(btn.dataset.epVal, btn.textContent.trim());
          selectEvent.dispatchEvent(new Event('change'));
        });
      });
    }

    // ── Truck picker ─────────────────────────────────────────────────────
    const selectTruck  = document.getElementById('selectTruck');   // hidden input
    const truckMenu    = document.getElementById('truckPickerMenu');
    const truckLabel   = document.getElementById('truckPickerLabel');

    function setTruckValue(val, labelText) {
      selectTruck.value = val;
      truckLabel.textContent = labelText;
      truckMenu.querySelectorAll('[data-tp-val]').forEach(b =>
        b.classList.toggle('active', b.dataset.tpVal === val));
    }

    const truckItems = [
      { value: '', label: 'Select Truck/Trailer' },
      ...trucks.map(t => ({ value: String(t.id), label: `${t.name} (${t.type})` }))
    ];
    truckMenu.innerHTML = truckItems.map(item =>
      `<li><button class="dropdown-item" data-tp-val="${esc(item.value)}">${esc(item.label)}</button></li>`
    ).join('');
    const savedTrId = currentLoad.truckId ? String(currentLoad.truckId) : '';
    const savedTrItem = truckItems.find(i => i.value === savedTrId);
    setTruckValue(savedTrId, savedTrItem ? savedTrItem.label : 'Select Truck/Trailer');
    truckMenu.querySelectorAll('[data-tp-val]').forEach(btn => {
      btn.addEventListener('click', () => {
        setTruckValue(btn.dataset.tpVal, btn.textContent.trim());
        selectTruck.dispatchEvent(new Event('change'));
      });
    });

    // Event listeners
    selectEvent.addEventListener('change', e => { currentLoad.eventId = e.target.value || null; saveData(); updateStats(); });
    selectTruck.addEventListener('change', async e => {
      const newTruckId = e.target.value || null;
      currentLoad.truckId = newTruckId;
      // Load the draft plan for this specific truck (empty zones if none saved)
      if (newTruckId) {
        try {
          const resp = await window.RTS_API.getLoadPlanDraft(newTruckId);
          if (resp && resp.success && resp.plan) {
            currentLoad = {
              id: resp.plan.id,
              eventId: resp.plan.event_id || null,
              truckId: resp.plan.truck_id,
              placements: purgeOrphanPlacements(resp.placements || []),
              status: resp.plan.status || 'Draft',
              createdAt: resp.plan.created_at,
              updatedAt: resp.plan.updated_at
            };
          } else {
            // No plan saved for this truck yet — show empty zones
            currentLoad = { ...createEmptyLoad(), truckId: newTruckId };
          }
        } catch (err) {
          console.error('Could not load plan for truck:', err.message);
          currentLoad = { ...createEmptyLoad(), truckId: newTruckId };
        }
      }
      // Refresh box current_truck_id so cross-truck "In Truck X" badges are up to date
      try {
        const boxesResp = await window.RTS_API.getBoxes();
        const fresh = boxesResp.boxes || [];
        boxes.forEach(b => {
          const fb = fresh.find(x => x.id === b.id);
          if (fb) {
            b.currentTruckId = fb.current_truck_id || null;
            b.status = fb.status || b.status;
          }
        });
      } catch (_) { /* non-fatal — stale data is fine for display */ }
      renderAll();
    });
    
    document.getElementById('btnAddBox').addEventListener('click', () => showBoxModal());
    document.getElementById('btnSaveBox').addEventListener('click', saveBox);
    document.getElementById('btnSaveLoad').addEventListener('click', saveLoadPlan);
    document.getElementById('btnFinaliseLoad').addEventListener('click', finaliseLoadPlan);
    document.getElementById('btnViewHistory').addEventListener('click', showHistory);
    document.getElementById('btnClearLoad').addEventListener('click', clearLoad);
    document.getElementById('btnPrintBarcodes').addEventListener('click', printBarcodes);
    document.getElementById('btnExportPackingList').addEventListener('click', () => {
      new bootstrap.Modal(document.getElementById('exportModal')).show();
    });
    document.getElementById('btnExportCSV').addEventListener('click', () => {
      bootstrap.Modal.getInstance(document.getElementById('exportModal')).hide();
      exportPackingListCSV();
    });
    document.getElementById('btnExportPDF').addEventListener('click', () => {
      bootstrap.Modal.getInstance(document.getElementById('exportModal')).hide();
      exportPackingListPDF();
    });
    document.getElementById('btn2DView').addEventListener('click', () => switchView('2D'));
    document.getElementById('btn3DView').addEventListener('click', () => switchView('3D'));
    document.getElementById('btnOptimize').addEventListener('click', autoOptimize);
    document.getElementById('searchBoxes').addEventListener('input', handleSearch);

    setupDragAndDrop();

    // Restore minimap visibility from previous session
    try {
      if (localStorage.getItem('lp_showmap') === '1') {
        const strip = document.getElementById('zoneMinimap');
        const btn   = document.getElementById('btnToggleMinimap');
        if (strip) { strip.classList.add('visible'); if (btn) btn.classList.add('active'); }
        updateMinimap();
      }
    } catch(e) {}
  }

  // ========== BOX EXPANSION & INTERACTION ==========
  function toggleBoxExpand(boxId) {
    const boxElement = document.querySelector(`.placed-box[data-box-id="${boxId}"]`);
    if (!boxElement) return;
    
    // Stop flashing when clicked
    boxElement.classList.remove('flash-highlight');
    
    // Toggle expanded state
    const isExpanding = !boxElement.classList.contains('expanded');
    boxElement.classList.toggle('expanded');
    
    // Generate barcode when expanding
    if (isExpanding) {
      setTimeout(() => {
        const box = boxes.find(b => b.id === boxId);
        if (box) {
          const barcodeId = `#box-barcode-${boxId}`;
          if (document.querySelector(barcodeId)) {
            try {
              JsBarcode(barcodeId, box.barcode, {
                format: "CODE128",
                width: 1,
                height: 24,
                displayValue: false,
                margin: 0,
                background: "transparent",
                lineColor: "#1a73e8"
              });
            } catch (e) {
              console.error('Barcode generation error:', e);
            }
          }
        }
      }, 50);
    }
  }

  // ========== SEARCH WITH HIGHLIGHTING ==========
  let searchHighlightTimeout = null;
  let currentSearchTerm = '';
  
  function handleSearch() {
    renderBoxes();
    
    const searchTerm = document.getElementById('searchBoxes').value.toLowerCase().trim();
    currentSearchTerm = searchTerm;
    
    // Clear previous highlights
    document.querySelectorAll('.truck-section').forEach(section => {
      section.classList.remove('search-highlight');
    });
    document.querySelectorAll('.placed-box').forEach(box => {
      box.classList.remove('flash-highlight');
    });
    
    if (searchHighlightTimeout) clearTimeout(searchHighlightTimeout);
    
    if (!searchTerm) {
      // Clear search mode - re-render 3D with normal colors
      if (currentView === '3D') {
        render3DWithSearch('');
      }
      return;
    }
    
    // Find boxes matching search
    const matchingPlacements = currentLoad.placements.filter(p => {
      const box = boxes.find(b => b.id === p.boxId);
      if (!box) return false;
      
      // Search in barcode, name, contents text, and individual items
      const searchableText = [
        box.barcode || '',
        box.name || '',
        box.contents || '',
        ...(box.contentsItems || []).map(item => `${item.barcode} ${item.name}`)
      ].join(' ').toLowerCase();
      
      return searchableText.includes(searchTerm);
    });
    
    console.log(`🔍 Search "${searchTerm}": ${matchingPlacements.length} boxes found`);
    
    if (matchingPlacements.length > 0) {
      // Highlight zones containing matching boxes in 2D view
      const highlightedZones = new Set();
      matchingPlacements.forEach(p => {
        highlightedZones.add(p.zoneId);
        
        // Flash the specific box
        const boxElement = document.querySelector(`.placed-box[data-box-id="${p.boxId}"]`);
        if (boxElement) {
          boxElement.classList.add('flash-highlight');
        }
      });
      
      // Highlight zones with purple border and pulse in 2D view
      highlightedZones.forEach(zoneId => {
        const zoneElement = document.querySelector(`.truck-section[data-zone="${zoneId}"]`);
        if (zoneElement) {
          zoneElement.classList.add('search-highlight');
        }
      });
      
      // Update 3D view with color coding: spring green for matches, gray for others
      if (currentView === '3D') {
        render3DWithSearch(searchTerm);
      }
      
      // Remove highlights after 30 seconds
      searchHighlightTimeout = setTimeout(() => {
        document.querySelectorAll('.truck-section').forEach(section => {
          section.classList.remove('search-highlight');
        });
        document.querySelectorAll('.placed-box').forEach(box => {
          box.classList.remove('flash-highlight');
        });
        currentSearchTerm = '';
        if (currentView === '3D') {
          render3DWithSearch('');
        }
      }, 30000);
    }
  }

  // ========== RENDERING ==========
  function renderAll() {
    // Hide loading spinner on first render
    const spinner = document.getElementById('loadSpinner');
    if (spinner) spinner.remove();
    populateFilterDropdowns();
    renderBoxes();
    renderAssets();
    renderInventory();
    renderTruckZones();
    updateStats();
    if (currentView === '3D') render3D();
  }

  function renderBoxes() {
    const search = document.getElementById('searchBoxes').value.toLowerCase();
    const filtered = boxes.filter(b => {
      const matchCat = filterBoxCat === 'all' || (b.boxType || 'regular').toLowerCase() === filterBoxCat;
      const matchLoc = filterBoxLoc === 'all' || (b.location || '') === filterBoxLoc;
      const matchSearch = !search ||
        (b.barcode || '').toLowerCase().includes(search) ||
        (b.name || '').toLowerCase().includes(search) ||
        (b.contents || '').toLowerCase().includes(search);
      return matchCat && matchLoc && matchSearch;
    });

    // Separate kart stands and garage boxes to bottom
    const normalBoxes  = filtered.filter(b => b.boxType !== 'garage' && b.boxType !== 'kart_stand');
    const kartBoxes    = filtered.filter(b => b.boxType === 'kart_stand');
    const garageBoxes  = filtered.filter(b => b.boxType === 'garage');

    const renderBoxItem = (box) => {
      const placement = currentLoad.placements.find(p => p.boxId === box.id);
      const isLoaded = !!placement;
      const isScanned = !!(placement?.scannedAt);
      const isGarage   = box.boxType === 'garage';
      const isKartStand = box.boxType === 'kart_stand';

      // Check if this box is in a DIFFERENT truck's plan
      const otherTruckId = !isLoaded && box.currentTruckId && box.currentTruckId !== currentLoad.truckId
        ? box.currentTruckId
        : null;
      const otherTruck = otherTruckId ? trucks.find(t => t.id === otherTruckId) : null;
      const inOtherTruck = !!otherTruck;

      const bl = parseFloat(box.length) || 0;
      const bwid = parseFloat(box.width) || 0;
      const bh = parseFloat(box.height) || 0;
      const bw = parseFloat(box.weight) || 0;
      const volume = (bl * bwid * bh) / 1000000;
      const selected = selectedBoxId === box.id ? ' selected' : '';
      const draggable = !isLoaded && !inOtherTruck;

      let statusBadge;
      if (isLoaded) {
        statusBadge = `<div class="box-status loaded">✓ In This Truck</div>`;
      } else if (inOtherTruck) {
        statusBadge = `<div class="box-status in-other-truck">🚛 In ${esc(otherTruck.name)}</div>`;
      } else if (isGarage) {
        statusBadge = `<div class="box-status garage-stay">🏚️ Garage (stays at base)</div>`;
      } else if (isKartStand) {
        statusBadge = `<div class="box-status kart-stand-status">🏎️ Kart Stand — no stacking</div>`;
      } else {
        statusBadge = `<div class="box-status warehouse">📦 Available</div>`;
      }

      const garageBadge = isGarage
        ? `<span style="float:right;font-size:.6rem;font-weight:700;color:#8d6e63;background:#efebe9;border:1px solid #bcaaa4;padding:1px 5px;border-radius:3px;line-height:1.4">🏚️ GARAGE</span>`
        : isKartStand
        ? `<span style="float:right;font-size:.6rem;font-weight:700;color:#1565c0;background:#e3f2fd;border:1px solid #90caf9;padding:1px 5px;border-radius:3px;line-height:1.4">🏎️ KART STAND</span>`
        : '';

      return `
        <div class="box-item${isLoaded ? ' loaded' : ''}${inOtherTruck ? ' in-other-truck' : ''}${isGarage ? ' garage-box-item' : ''}${isKartStand ? ' kart-stand-item' : ''}${selected}"
             draggable="${draggable}"
             data-box-id="${box.id}"
             style="cursor:${draggable ? 'grab' : 'not-allowed'};">
          ${isScanned ? '<div class="scan-confirmed-dot" title="Physically scanned onto truck"></div>' : ''}
          <div class="box-barcode">${esc(box.barcode)}${garageBadge}</div>
          <div class="box-name">${esc(box.name)}</div>
          <div class="box-dims">${bl} × ${bwid} × ${bh} cm | ${volume.toFixed(2)} m³</div>
          <div class="box-weight">${bw} kg max</div>
          ${statusBadge}
        </div>
      `;
    };

    let html = normalBoxes.map(renderBoxItem).join('');

    if (kartBoxes.length > 0) {
      html += `<div style="margin:8px 0 4px;padding:3px 8px;font-size:.65rem;font-weight:700;color:#1565c0;background:#e3f2fd;border-radius:10px;text-align:center;letter-spacing:.04em;">🏎️ KART STANDS</div>`;
      html += kartBoxes.map(renderBoxItem).join('');
    }

    if (garageBoxes.length > 0) {
      html += `<div style="margin:8px 0 4px;padding:3px 8px;font-size:.65rem;font-weight:700;color:#8d6e63;background:#efebe9;border-radius:10px;text-align:center;letter-spacing:.04em;">🏚️ GARAGE STORAGE</div>`;
      html += garageBoxes.map(renderBoxItem).join('');
    }

    const boxesListEl = document.getElementById('boxesList');
    if (boxesListEl) {
      boxesListEl.innerHTML = html || '<div style="text-align:center;color:rgba(255,255,255,0.5);padding:20px;">No boxes found</div>';
    }
  }

  // ========== FILTER CHIPS ==========
  function setFilter(tab, key, value) {
    if      (tab === 'boxes'     && key === 'cat')    { filterBoxCat      = value; renderBoxes();     }
    else if (tab === 'boxes'     && key === 'loc')    { filterBoxLoc      = value; renderBoxes();     }
    else if (tab === 'assets'    && key === 'type')   { filterAssetType   = value; renderAssets();    }
    else if (tab === 'assets'    && key === 'status') { filterAssetStatus = value; renderAssets();    }
    else if (tab === 'assets'    && key === 'loc')    { filterAssetLoc    = value; renderAssets();    }
    else if (tab === 'inventory' && key === 'cat')    { filterInvCat      = value; renderInventory(); }
    else if (tab === 'inventory' && key === 'loc')    { filterInvLoc      = value; renderInventory(); }

    // Sync dropdown selects
    if      (tab === 'boxes'     && key === 'cat')    { const sel = document.getElementById('filterBoxSelect');        if (sel) sel.value = value; }
    else if (tab === 'boxes'     && key === 'loc')    { const sel = document.getElementById('filterBoxLocSelect');     if (sel) sel.value = value; }
    else if (tab === 'assets'    && key === 'type')   { const sel = document.getElementById('filterAssetTypeSelect'); if (sel) sel.value = value; }
    else if (tab === 'assets'    && key === 'status') { const sel = document.getElementById('filterAssetStatusSelect');if (sel) sel.value = value; }
    else if (tab === 'assets'    && key === 'loc')    { const sel = document.getElementById('filterAssetLocSelect');  if (sel) sel.value = value; }
    else if (tab === 'inventory' && key === 'cat')    { const sel = document.getElementById('filterInvSelect');       if (sel) sel.value = value; }
    else if (tab === 'inventory' && key === 'loc')    { const sel = document.getElementById('filterInvLocSelect');    if (sel) sel.value = value; }
  }

  // ========== POPULATE FILTER DROPDOWNS ==========
  function populateFilterDropdowns() {
    // Box types (from actual boxType values in data)
    const boxTypeSel = document.getElementById('filterBoxSelect');
    if (boxTypeSel) {
      const types = [...new Set(boxes.map(b => b.boxType || 'regular'))].sort();
      boxTypeSel.innerHTML = '<option value="all">All types</option>' +
        types.map(t => {
          const label = t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
          return `<option value="${esc(t)}">${esc(label)}</option>`;
        }).join('');
      boxTypeSel.value = filterBoxCat;
    }
    // Box locations (from location_name on boxes)
    const boxLocSel = document.getElementById('filterBoxLocSelect');
    if (boxLocSel) {
      const locs = [...new Set(boxes.map(b => b.location).filter(Boolean))].sort();
      boxLocSel.innerHTML = '<option value="all">All locations</option>' +
        locs.map(l => `<option value="${esc(l)}">${esc(l)}</option>`).join('');
      boxLocSel.value = filterBoxLoc;
    }
    // Asset types (from actual item_type values in data)
    const assetTypeSel = document.getElementById('filterAssetTypeSelect');
    if (assetTypeSel) {
      const types = [...new Set(assets.map(a => a.item_type).filter(Boolean))].sort();
      assetTypeSel.innerHTML = '<option value="all">All types</option>' +
        types.map(t => {
          const label = t.charAt(0).toUpperCase() + t.slice(1);
          return `<option value="${esc(t.toLowerCase())}">${esc(label)}</option>`;
        }).join('');
      assetTypeSel.value = filterAssetType;
    }
    // Asset locations (from locations matching assets' current_location_id)
    const assetLocSel = document.getElementById('filterAssetLocSelect');
    if (assetLocSel) {
      const locIds = [...new Set(assets.map(a => a.current_location_id).filter(Boolean))];
      const assetLocs = locIds.map(id => locations.find(l => l.id === id)).filter(Boolean);
      assetLocs.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      assetLocSel.innerHTML = '<option value="all">All locations</option>' +
        assetLocs.map(l => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('');
      assetLocSel.value = filterAssetLoc;
    }
  }

  // ========== TAB SWITCHING ==========
  function switchTab(tab) {
    activeTab = tab;
    const boxesList     = document.getElementById('boxesList');
    const assetsList    = document.getElementById('assetsList');
    const inventoryList = document.getElementById('inventoryList');
    const searchBoxes   = document.getElementById('searchBoxes');
    const searchAssets  = document.getElementById('searchAssets');
    const searchInv     = document.getElementById('searchInventory');
    const boxesHint     = document.getElementById('boxesHint');
    const assetsHint    = document.getElementById('assetsHint');
    const inventoryHint = document.getElementById('inventoryHint');
    const filterBoxes   = document.getElementById('filterBoxes');
    const filterAssets  = document.getElementById('filterAssets');
    const filterInv     = document.getElementById('filterInventory');
    const tabBoxes      = document.getElementById('tabBoxes');
    const tabAssets     = document.getElementById('tabAssets');
    const tabInventory  = document.getElementById('tabInventory');

    // hide all
    [boxesList, assetsList, inventoryList].forEach(el => { if (el) el.style.display = 'none'; });
    [searchBoxes, searchAssets, searchInv].forEach(el => { if (el) el.style.display = 'none'; });
    [boxesHint, assetsHint, inventoryHint].forEach(el => { if (el) el.style.display = 'none'; });
    [filterBoxes, filterAssets, filterInv].forEach(el => { if (el) el.style.display = 'none'; });
    [tabBoxes, tabAssets, tabInventory].forEach(el => { if (el) el.classList.remove('active'); });

    if (tab === 'boxes') {
      if (boxesList)   boxesList.style.display   = '';
      if (searchBoxes) searchBoxes.style.display  = '';
      if (boxesHint)   boxesHint.style.display    = '';
      if (filterBoxes) filterBoxes.style.display  = '';
      if (tabBoxes)    tabBoxes.classList.add('active');
    } else if (tab === 'assets') {
      if (assetsList)  assetsList.style.display   = '';
      if (searchAssets)searchAssets.style.display  = '';
      if (assetsHint)  assetsHint.style.display    = '';
      if (filterAssets)filterAssets.style.display  = '';
      if (tabAssets)   tabAssets.classList.add('active');
      renderAssets();
    } else if (tab === 'inventory') {
      if (inventoryList) inventoryList.style.display = '';
      if (searchInv)     searchInv.style.display      = '';
      if (inventoryHint) inventoryHint.style.display  = '';
      if (filterInv)     filterInv.style.display      = '';
      if (tabInventory)  tabInventory.classList.add('active');
      renderInventory();
    }
  }

  // ========== ASSETS PANEL ==========
  function renderAssets() {
    const listEl = document.getElementById('assetsList');
    if (!listEl) return;
    const search = (document.getElementById('searchAssets')?.value || '').toLowerCase();
    const placedAssetIds = new Set(
      currentLoad.placements.filter(p => p.type === 'asset').map(p => p.assetId)
    );

    // Race fleet items first, then rest
    let sorted = [...assets].sort((a, b) => {
      if (a.is_race_fleet && !b.is_race_fleet) return -1;
      if (!a.is_race_fleet && b.is_race_fleet) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });
    sorted = sorted.filter(a => {
      const matchType   = filterAssetType   === 'all' || (a.item_type || '').toLowerCase() === filterAssetType;
      const matchStatus = filterAssetStatus === 'all' || (a.status    || '').toLowerCase() === filterAssetStatus;
      const matchLoc    = filterAssetLoc    === 'all' || (a.current_location_id || '') === filterAssetLoc;
      const matchSearch = !search ||
        (a.name          || '').toLowerCase().includes(search) ||
        (a.barcode       || '').toLowerCase().includes(search) ||
        (a.category      || '').toLowerCase().includes(search) ||
        (a.serial_number || '').toLowerCase().includes(search);
      return matchType && matchStatus && matchLoc && matchSearch;
    });

    if (sorted.length === 0) {
      listEl.innerHTML = '<div style="text-align:center;color:#9e9e9e;padding:20px;font-size:.8rem;">No assets found</div>';
      return;
    }

    listEl.innerHTML = sorted.map(a => {
      const placed = placedAssetIds.has(a.id);
      const isFleet = a.is_race_fleet;
      const catBadge = a.category
        ? `<span style="background:#e8f0fe;color:#1a73e8;border-radius:3px;padding:1px 5px;font-size:.62rem;font-weight:700;">${esc(a.category)}</span>`
        : '';
      const fleetBadge = isFleet
        ? `<span style="background:#e6f4ea;color:#137333;border-radius:3px;padding:1px 5px;font-size:.62rem;font-weight:700;">🏁 Fleet</span>`
        : '';
      const loc = locations.find(l => l.id === a.current_location_id);
      const locName = loc
        ? loc.name
        : (a.assigned_staff_name || a.assigned_driver_name)
          ? `Assigned: ${a.assigned_staff_name || a.assigned_driver_name}`
          : null;
      const loadedBadge = placed
        ? `<span style="background:#e6f4ea;color:#137333;border-radius:3px;padding:1px 5px;font-size:.62rem;font-weight:700;">✓ In Truck</span>`
        : '';
      const snBadge = a.serial_number
        ? `<span style="background:#ede7f6;color:#4527a0;border-radius:3px;padding:1px 5px;font-size:.62rem;font-weight:700;">SN: ${esc(a.serial_number)}</span>`
        : '';
      const ttData = esc(JSON.stringify({
        _name: a.name || '—', Barcode: a.barcode || '—',
        Serial: a.serial_number || '—', Category: a.category || '—',
        Type: a.item_type || '—', Status: a.status || '—',
        Location: locName || '—',
        Value: a.value_usd ? `$${a.value_usd}` : '—',
        Weight: a.weight_kg ? `${a.weight_kg} kg` : '—',
        Notes: a.description || '—'
      }));
      return `
        <div class="box-item asset-item${placed ? ' placed loaded' : ''}"
             draggable="${!placed}"
             data-asset-id="${a.id}"
             data-tooltip="${ttData}"
             style="cursor:${placed ? 'not-allowed' : 'grab'};border-left:3px solid #34a853;">
          <div style="display:flex;align-items:baseline;gap:6px;">
            ${catBadge}
            <span class="box-barcode" style="color:#34a853;white-space:nowrap;">${esc(a.barcode || a.id.slice(0,8))}</span>
            <span class="box-name" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(a.name)}</span>
            ${locName ? `<span style="font-size:.72rem;color:#5f6368;white-space:nowrap;margin-left:auto;padding-left:6px;">${esc(locName)}</span>` : ''}
          </div>
          <div style="margin-top:2px;display:flex;gap:4px;flex-wrap:wrap;align-items:center;">${fleetBadge}${snBadge}${loadedBadge}</div>
        </div>`;
    }).join('');
  }

  // ========== INVENTORY PANEL ==========
  function renderInventory() {
    const listEl = document.getElementById('inventoryList');
    if (!listEl) return;
    const search = (document.getElementById('searchInventory')?.value || '').toLowerCase();
    const placedInvIds = new Set(
      currentLoad.placements.filter(p => p.type === 'inventory').map(p => p.inventoryId)
    );

    // Build dynamic category options in the inventory select
    const selEl = document.getElementById('filterInvSelect');
    if (selEl) {
      const cats = [...new Set(inventory.map(i => i.category).filter(Boolean))].sort();
      selEl.innerHTML = '<option value="all">All categories</option>' +
        cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
      selEl.value = filterInvCat;
    }

    // Build dynamic location options for inventory
    const invLocEl = document.getElementById('filterInvLocSelect');
    if (invLocEl) {
      const locIds = [...new Set(inventory.map(i => i.location_id).filter(Boolean))];
      const invLocs = locIds.map(id => locations.find(l => l.id === id)).filter(Boolean);
      invLocs.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      invLocEl.innerHTML = '<option value="all">All locations</option>' +
        invLocs.map(l => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('');
      invLocEl.value = filterInvLoc;
    }

    let sorted = [...inventory];
    sorted = sorted.filter(i => {
      const matchCat = filterInvCat === 'all' || (i.category || '') === filterInvCat;
      const matchLoc = filterInvLoc === 'all' || (i.location_id || '') === filterInvLoc;
      const matchSearch = !search ||
        (i.name     || '').toLowerCase().includes(search) ||
        (i.sku      || '').toLowerCase().includes(search) ||
        (i.category || '').toLowerCase().includes(search);
      return matchCat && matchLoc && matchSearch;
    });
    sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    if (sorted.length === 0) {
      listEl.innerHTML = '<div style="text-align:center;color:#9e9e9e;padding:20px;font-size:.8rem;">No inventory items found</div>';
      return;
    }

    listEl.innerHTML = sorted.map(i => {
      const placed = placedInvIds.has(i.id);
      const qtyBadge = i.quantity !== undefined
        ? `<span style="background:#fff3e0;color:#e65100;border-radius:3px;padding:1px 5px;font-size:.62rem;font-weight:700;">Qty: ${i.quantity}</span>`
        : '';
      const catBadge = i.category
        ? `<span style="background:#f3e5f5;color:#6a1b9a;border-radius:3px;padding:1px 5px;font-size:.62rem;font-weight:700;">${esc(i.category)}</span>`
        : '';
      const loadedBadge = placed
        ? `<span style="background:#e6f4ea;color:#137333;border-radius:3px;padding:1px 5px;font-size:.62rem;font-weight:700;">✓ In Truck</span>`
        : '';
      const ttData = esc(JSON.stringify({
        _name: i.name || '—', SKU: i.sku || '—',
        Category: i.category || '—',
        Quantity: i.quantity !== undefined ? String(i.quantity) : '—',
        Unit: i.unit || '—', Notes: i.notes || '—'
      }));
      return `
        <div class="box-item asset-item${placed ? ' placed loaded' : ''}"
             draggable="${!placed}"
             data-inventory-id="${i.id}"
             data-tooltip="${ttData}"
             style="cursor:${placed ? 'not-allowed' : 'grab'};border-left:3px solid #9c27b0;">
          <div style="display:flex;align-items:baseline;gap:6px;">
            <span class="box-barcode" style="color:#9c27b0;white-space:nowrap;">${esc(i.sku || i.id?.slice(0,8) || '—')}</span>
            <span class="box-name">${esc(i.name)}</span>
          </div>
          <div style="margin-top:2px;display:flex;gap:4px;flex-wrap:wrap;">${catBadge}${qtyBadge}${loadedBadge}</div>
        </div>`;
    }).join('');
  }

  function renderTruckZones() {
    const truck = getTruck();
    
    if (!truck) {
      document.getElementById('view2D').innerHTML = '<div style="padding:20px;color:rgba(255,255,255,0.6);text-align:center;">Please select a truck</div>';
      return;
    }
    
    const view2D = document.getElementById('view2D');
    const zoneKeys = Object.keys(truck.zones || {});
    
    // Sort zones to display in correct order: 1,3,5,7 (top row) then 2,4,6,8 (bottom row)
    const sortedZoneKeys = zoneKeys.sort((a, b) => {
      const numA = parseInt(a.replace('grid-', ''));
      const numB = parseInt(b.replace('grid-', ''));
      return numA - numB;
    });
    
    // Color palette matching 3D view
    const gridColors = [
      '#ff6b6b', '#4ecdc4', '#45b7d1', '#f7b731', 
      '#95e1d3', '#f38181', '#aa96da', '#fcbad3',
      '#a8e6cf', '#ffd3b6', '#ffaaa5', '#ff8b94'
    ];
    
    // Create grid layout: 4 columns x 2 rows displaying as 1,3,5,7 / 2,4,6,8
    let html = '<div style="display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:repeat(2,1fr);gap:10px;padding:10px;height:100%;width:100%;box-sizing:border-box;">';
    
    sortedZoneKeys.forEach((zoneKey) => {
      const zone = truck.zones[zoneKey];
      // Items with an unrecognised zone (e.g. 'A') fall into grid-1
      const isFirstZone = zoneKey === sortedZoneKeys[0];
      const placements = currentLoad.placements.filter(p => {
        if (p.type === 'asset' || p.type === 'inventory') return false;
        return p.zone === zoneKey || (isFirstZone && !sortedZoneKeys.includes(p.zone));
      });
      const assetPlacements = currentLoad.placements.filter(p => {
        if (p.type !== 'asset') return false;
        return p.zone === zoneKey || (isFirstZone && !sortedZoneKeys.includes(p.zone));
      });
      const inventoryPlacements = currentLoad.placements.filter(p => {
        if (p.type !== 'inventory') return false;
        return p.zone === zoneKey || (isFirstZone && !sortedZoneKeys.includes(p.zone));
      });
      const gridNum = parseInt(zoneKey.replace('grid-', ''));
      const zoneColor = gridColors[(gridNum - 1) % gridColors.length];
      
      let totalWeight = 0;
      let totalVolume = 0;
      
      const boxesHtml = placements.map((p, stackIndex) => {
        const box = getBox(p.boxId);
        if (!box) {
          // Box is in the plan but not in the loaded box list — show a stub card
          return `
            <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:6px 8px;margin-bottom:4px;">
              <div style="font-size:.7rem;font-weight:700;color:#856404;">⚠ Box not found</div>
              <div style="font-size:.65rem;color:#856404;">ID: ${esc(p.boxId)}</div>
              <button style="font-size:.65rem;margin-top:4px;padding:1px 6px;background:#dc3545;color:#fff;border:none;border-radius:3px;cursor:pointer;" onclick="rflShow('box','${p.boxId}','Box ${esc(p.boxId)}')">Remove from plan</button>
            </div>
          `;
        }
        if (box) {
          const sc = getStackLevelColors(stackIndex);
          const bw = parseFloat(box.weight) || 0;
          const bl = parseFloat(box.length) || 0;
          const bwid = parseFloat(box.width) || 0;
          const bh = parseFloat(box.height) || 0;
          totalWeight += bw;
          totalVolume += (bl * bwid * bh) / 1000000;
          const boxVolume = ((bl * bwid * bh) / 1000000).toFixed(2);
          
          // Use contentsItems already loaded from DB during loadData()
          const contentsItems = box.contentsItems || [];
          
          // Build contents list
          let contentsList = '';
          if (contentsItems.length > 0) {
            contentsList = contentsItems.map((item, index) => {
              const serialBadge = item.barcode 
                ? `<span style="background:#9334e6;color:#fff;padding:2px 6px;border-radius:3px;font-size:.65rem;font-family:monospace;font-weight:700;white-space:nowrap">${esc(item.barcode)}</span>`
                : `<span style="background:#9334e6;color:#fff;padding:2px 6px;border-radius:3px;font-size:.65rem;white-space:nowrap">—</span>`;
              return `
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:3px 0;border-bottom:1px solid rgba(0,0,0,.05)">
                  <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:0">
                    <span style="color:#5f6368;font-weight:600;font-size:.7rem;flex:0 0 auto">${index + 1}.</span>
                    <span style="color:#202124;font-size:.75rem;font-weight:500;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(item.name)}</span>
                  </div>
                  ${serialBadge}
                </div>
              `;
            }).join('');
          } else {
            contentsList = '<div style="text-align:center;padding:10px;color:#5f6368;font-size:.75rem">Empty container</div>';
          }
          
          return `
            <div class="placed-box" data-box-id="${box.id}" onclick="LoadEngine.toggleBoxExpand('${box.id}')" style="--box-color:${sc.solid};--box-bg:${sc.bg};--box-hover-bg:${sc.hover};--box-light-bg:${sc.light}">
              <div class="placed-box-header">
                ${p.scannedAt ? '<div class="scan-confirmed-dot" title="Physically scanned onto truck"></div>' : ''}
                <span class="placed-box-level">${sc.label}</span>
                <div class="placed-box-info">
                  <div class="placed-box-barcode">${esc(box.barcode)}</div>
                  <div class="placed-box-name">${esc(box.name)}</div>
                  <div style="font-size:.68rem;color:#5f6368;width:100%;margin-top:1px;">${bl}×${bwid}×${bh}cm | ${boxVolume}m³ | ${bw}kg</div>
                </div>
                <div style="display:flex;align-items:center;gap:4px;">
                  <span class="placed-box-expand-icon">▼</span>
                  <button class="btn-remove-box" onclick="event.stopPropagation();rflShow('box','${box.id}')" title="Remove from load">×</button>
                </div>
              </div>
              <div class="placed-box-contents">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                  <div class="placed-box-contents-label" style="margin:0">📦 Contents (${contentsItems.length})</div>
                  <svg id="box-barcode-${box.id}" style="height:24px;max-width:100px"></svg>
                </div>
                <div style="max-height:150px;overflow-y:auto">${contentsList}</div>
              </div>
            </div>
          `;
        }
        return '';
      }).join('');
      
      const assetsHtml = assetPlacements.map(p => {
        const asset = assets.find(a => a.id === p.assetId);
        if (!asset) return `
          <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:4px;padding:5px 8px;margin-bottom:4px;">
            <div style="font-size:.7rem;font-weight:700;color:#856404;">⚠ Asset not found</div>
            <button style="font-size:.65rem;margin-top:2px;padding:1px 6px;background:#dc3545;color:#fff;border:none;border-radius:3px;cursor:pointer;" onclick="rflShow('asset','${p.assetId}','Asset ${esc(p.assetId)}')">Remove</button>
          </div>`;
        return `
          <div class="placed-asset">
            <div>
              <div class="placed-asset-name">🔧 ${esc(asset.name)}</div>
              <div class="placed-asset-meta">${esc(asset.barcode || '')}${asset.category ? ' · ' + esc(asset.category) : ''}</div>
            </div>
            <button class="btn-remove-box" onclick="rflShow('asset','${asset.id}')" title="Remove from load">×</button>
          </div>`;
      }).join('');

      const inventoryHtml = inventoryPlacements.map(p => {
        const item = inventory.find(i => i.id === p.inventoryId);
        if (!item) return `
          <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:4px;padding:5px 8px;margin-bottom:4px;">
            <div style="font-size:.7rem;font-weight:700;color:#856404;">⚠ Item not found</div>
            <button style="font-size:.65rem;margin-top:2px;padding:1px 6px;background:#dc3545;color:#fff;border:none;border-radius:3px;cursor:pointer;" onclick="rflShow('inventory','${p.inventoryId}','Item ${esc(p.inventoryId)}')">Remove</button>
          </div>`;
        return `
          <div class="placed-asset" style="border-color:#9c27b0;background:#f3e5f5;">
            <div>
              <div class="placed-asset-name" style="color:#6a1b9a;">🗃️ ${esc(item.name)}</div>
              <div class="placed-asset-meta">${esc(item.sku || '')}${item.category ? ' · ' + esc(item.category) : ''}${item.quantity !== undefined ? ' · Qty: ' + item.quantity : ''}</div>
            </div>
            <button class="btn-remove-box" onclick="rflShow('inventory','${item.id}')" title="Remove from load">×</button>
          </div>`;
      }).join('');

      const totalItems = placements.length + assetPlacements.length + inventoryPlacements.length;
      const weightPercent = (totalWeight / zone.maxWeight) * 100;
      const capacityClass = weightPercent > 95 ? 'danger' : weightPercent > 80 ? 'warning' : '';
      const hasBoxes = placements.length > 0;
      
      // Convert hex color to rgba with low opacity for background
      const rgbaColor = zoneColor.replace('#', '');
      const r = parseInt(rgbaColor.substr(0, 2), 16);
      const g = parseInt(rgbaColor.substr(2, 2), 16);
      const b = parseInt(rgbaColor.substr(4, 2), 16);
      const bgColor = `rgba(${r}, ${g}, ${b}, 0.08)`;
      const borderColor = `rgba(${r}, ${g}, ${b}, 0.5)`;
      
      // Calculate grid position: odd numbers (1,3,5,7) on row 1, even (2,4,6,8) on row 2
      // Grid 1 -> col 1 row 1, Grid 2 -> col 1 row 2, Grid 3 -> col 2 row 1, etc.
      const isOdd = gridNum % 2 === 1;
      const gridRow = isOdd ? 1 : 2;
      const gridCol = Math.ceil(gridNum / 2);
      
      html += `
        <div class="truck-section" data-zone="${zoneKey}" style="grid-row:${gridRow};grid-column:${gridCol};min-height:180px;padding:12px;border:3px solid ${borderColor};background:${bgColor};position:relative;">
          <div style="position:absolute;top:8px;right:8px;width:20px;height:20px;border-radius:50%;background:${zoneColor};border:2px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,.2);"></div>
          <div style="font-size:1rem;font-weight:700;color:#202124;margin-bottom:6px;">Grid ${gridNum}</div>
          <div style="font-size:.75rem;color:#5f6368;margin-bottom:6px;font-weight:500;">
            ${totalWeight.toFixed(0)}/${zone.maxWeight}kg | ${placements.length} box${placements.length !== 1 ? 'es' : ''}${assetPlacements.length ? ` · ${assetPlacements.length} asset${assetPlacements.length !== 1 ? 's' : ''}` : ''}${inventoryPlacements.length ? ` · ${inventoryPlacements.length} inv` : ''}
          </div>
          <div class="capacity-bar" style="margin-bottom:8px;">
            <div class="capacity-fill ${capacityClass}" style="width:${Math.min(weightPercent, 100)}%;background:${zoneColor}"></div>
          </div>
          <div style="max-height:180px;overflow-y:auto;transition:max-height .3s ease;">
            ${boxesHtml}${assetsHtml}${inventoryHtml}${(!boxesHtml && !assetsHtml && !inventoryHtml) ? `
            <div class="empty-zone-placeholder">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8L12 3 3 8v8l9 5 9-5V8z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/></svg>
              <span>Drop boxes here</span>
            </div>` : ''}
          </div>
        </div>
      `;
    });
    
    html += '</div>';
    view2D.innerHTML = html;
    
    // Re-attach drag and drop listeners to new elements
    attachZoneDragListeners();
    // Keep minimap in sync
    updateMinimap();
  }

  function updateZoneCapacity(zone) {
    // This function is now handled inline in renderTruckZones
    // Kept for backward compatibility
  }

  function updateStats() {
    const truck = getTruck();
    const boxPlacements   = currentLoad.placements.filter(p => p.type !== 'asset');
    const assetPlacements = currentLoad.placements.filter(p => p.type === 'asset');
    const invPlacements   = currentLoad.placements.filter(p => p.type === 'inventory');
    const loadedCount = boxPlacements.length;
    const totalBoxes  = boxes.length;

    let totalWeight = 0;
    let totalVolume = 0;

    boxPlacements.forEach(p => {
      const box = getBox(p.boxId);
      if (box) {
        totalWeight += parseFloat(box.weight) || 0;
        totalVolume += ((parseFloat(box.length)||0) * (parseFloat(box.width)||0) * (parseFloat(box.height)||0)) / 1000000;
      }
    });

    const extraLabel = [
      assetPlacements.length ? `+${assetPlacements.length}a` : '',
      invPlacements.length   ? `+${invPlacements.length}i`   : ''
    ].filter(Boolean).join(' ');
    document.getElementById('statBoxesLoaded').textContent = `${loadedCount} / ${totalBoxes}${extraLabel ? ' ' + extraLabel : ''}`;
    document.getElementById('statWeight').textContent = `${totalWeight.toFixed(0)} kg`;
    
    if (truck) {
      document.getElementById('statWeightLimit').textContent = `of ${truck.maxWeight} kg max`;
      const truckVolume = (truck.length * truck.width * truck.height) / 1000000;
      const volumePercent = (totalVolume / truckVolume) * 100;
      document.getElementById('statVolume').textContent = `${volumePercent.toFixed(1)}%`;
      document.getElementById('statVolumeValue').textContent = `${totalVolume.toFixed(2)} / ${truckVolume.toFixed(2)} m³`;
      // Color weight stat based on % of truck max
      const weightPct = (totalWeight / truck.maxWeight) * 100;
      const wtEl = document.getElementById('statWeight');
      wtEl.style.color = weightPct > 80 ? '#f9ab00' : totalWeight > 0 ? '#1e8e3e' : '#1a73e8';
      const volEl = document.getElementById('statVolume');
      volEl.style.color = volumePercent > 80 ? '#f9ab00' : totalVolume > 0 ? '#1e8e3e' : '#1a73e8';
    } else {
      document.getElementById('statWeightLimit').textContent = 'Select a truck';
      document.getElementById('statVolume').textContent = 'N/A';
      document.getElementById('statVolumeValue').textContent = 'Select a truck';
      document.getElementById('statWeight').style.color = '#1a73e8';
      document.getElementById('statVolume').style.color = '#1a73e8';
    }

    document.getElementById('statStatus').textContent = currentLoad.status || 'Draft';
    const updated = currentLoad.updatedAt ? new Date(currentLoad.updatedAt).toLocaleString() : 'Never';
    const updatedEl = document.getElementById('statUpdated');
    updatedEl.textContent = updated;
    updatedEl.style.color = updated === 'Never' ? '#e37400' : '#888';
    updateWeightBalanceBar();
  }

  // ========== DRAG AND DROP ==========
  let draggedBoxId = null;
  let draggedAssetId = null;
  let draggedInventoryId = null;
  let dragHandlersSetup = false;

  function setupDragAndDrop() {
    if (dragHandlersSetup) return;
    
    // Setup box item drag events (only once)
    document.addEventListener('dragstart', e => {
      console.log('DRAGSTART event fired on:', e.target.className);
      if (e.target.dataset.inventoryId && !e.target.classList.contains('placed')) {
        draggedInventoryId = e.target.dataset.inventoryId;
        draggedAssetId = null; draggedBoxId = null;
        e.target.style.opacity = '0.5';
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', 'inventory:' + draggedInventoryId);
      } else if (e.target.classList.contains('asset-item') && !e.target.classList.contains('placed')) {
        draggedAssetId = e.target.dataset.assetId;
        draggedBoxId = null; draggedInventoryId = null;
        e.target.style.opacity = '0.5';
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', 'asset:' + draggedAssetId);
        console.log('✅ Started dragging asset:', draggedAssetId);
      } else if (e.target.classList.contains('box-item') && !e.target.classList.contains('loaded') && !e.target.classList.contains('in-other-truck')) {
        draggedBoxId = e.target.dataset.boxId;
        draggedAssetId = null; draggedInventoryId = null;
        e.target.style.opacity = '0.5';
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', draggedBoxId);
        console.log('✅ Started dragging box:', draggedBoxId);
      }
    });

    document.addEventListener('dragend', e => {
      if (e.target.classList.contains('box-item') || e.target.classList.contains('asset-item')) {
        e.target.style.opacity = '1';
      }
    });
    
    dragHandlersSetup = true;
  }

  function attachZoneDragListeners() {
    const zones = document.querySelectorAll('.truck-section');
    console.log('✅ Attached drop listeners to', zones.length, 'zones');
    
    zones.forEach(section => {
      section.addEventListener('dragenter', e => {
        e.preventDefault();
        console.log('DRAGENTER on zone:', section.dataset.zone);
      });
      
      section.addEventListener('dragover', e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        section.classList.add('drop-target');
      });

      section.addEventListener('dragleave', e => {
        section.classList.remove('drop-target');
      });

      section.addEventListener('drop', e => {
        e.preventDefault();
        e.stopPropagation();
        section.classList.remove('drop-target');
        const zone = section.dataset.zone;
        console.log('✅ DROP event on zone:', zone, 'boxId:', draggedBoxId, 'assetId:', draggedAssetId, 'invId:', draggedInventoryId);
        if (draggedInventoryId) {
          placeInventory(draggedInventoryId, zone);
          draggedInventoryId = null;
        } else if (draggedAssetId) {
          placeAsset(draggedAssetId, zone);
          draggedAssetId = null;
        } else if (draggedBoxId) {
          placeBox(draggedBoxId, zone);
          draggedBoxId = null;
        }
      });
    });
  }

  // ========== BOX OPERATIONS ==========
  function placeBox(boxId, zone) {
    if (currentLoad.placements.some(p => p.boxId === boxId)) {
      alert('Box is already loaded!');
      return;
    }

    const box = getBox(boxId);
    if (!box) return;

    // Warn if adding a garage storage box to a truck load plan
    if ((box.box_type || box.boxType) === 'garage') {
      const proceed = confirm(
        `⚠️ "${box.name}" is a Garage Storage box\n\n` +
        `Garage boxes are meant to stay at base and are not normally packed into trucks.\n\n` +
        `Are you sure you want to add this to the load plan?`
      );
      if (!proceed) return;
    }

    // Kart stand zone conflict checks
    const _boxType = box.box_type || box.boxType;
    if (_boxType === 'kart_stand') {
      const existing = currentLoad.placements.filter(p => p.zone === zone);
      if (existing.length > 0) {
        const ok = confirm(
          `⚠️ "${box.name}" is a Kart Stand and needs the full zone floor space.\n\n` +
          `Zone ${zone.replace('grid-', 'Zone ')} already has ${existing.length} item(s).\n\n` +
          `Continue anyway?`
        );
        if (!ok) return;
      }
    } else {
      const ks = currentLoad.placements.find(p => {
        if (p.zone !== zone) return false;
        const b = getBox(p.boxId);
        return b && (b.box_type || b.boxType) === 'kart_stand';
      });
      if (ks) {
        const ok = confirm(
          `⚠️ Zone ${zone.replace('grid-', 'Zone ')} contains a Kart Stand.\n\n` +
          `Kart stands occupy the full zone floor space — stacking items alongside them is unsafe.\n\n` +
          `Add "${box.name}" anyway?`
        );
        if (!ok) return;
      }
    }

    currentLoad.placements.push({
      boxId: boxId,
      zone: zone,
      position: calculatePosition(boxId, zone),
      timestamp: new Date().toISOString()
    });

    currentLoad.updatedAt = new Date().toISOString();
    saveData();
    renderAll();
    // Record load plan event in box history (fire-and-forget)
    try {
      const _t  = trucks.find(t => String(t.id) === String(currentLoad.truckId));
      const _cu = JSON.parse(localStorage.getItem('user') || '{}');
      fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}` },
        body: JSON.stringify({ kind: 'boxes', id: boxId, action: 'loaded_to_truck',
          note: `Added to load plan for ${_t ? _t.name : 'truck'} — Zone ${zone}`,
          by: _cu.id || null, to_truck_id: currentLoad.truckId || null, new_status: 'in_transit' })
      }).catch(() => {});
    } catch (_) {}
  }

  function removeBox(boxId) {
    const index = currentLoad.placements.findIndex(p => p.boxId === boxId);
    if (index !== -1) {
      currentLoad.placements.splice(index, 1);
      currentLoad.updatedAt = new Date().toISOString();
      saveData();
      renderAll();
      // Record removal event in box history (fire-and-forget)
      try {
        const _t  = trucks.find(t => String(t.id) === String(currentLoad.truckId));
        const _cu = JSON.parse(localStorage.getItem('user') || '{}');
        fetch('/api/history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}` },
          body: JSON.stringify({ kind: 'boxes', id: boxId, action: 'removed_from_truck',
            note: `Removed from ${_t ? _t.name : 'truck'} load plan`,
            by: _cu.id || null, from_truck_id: currentLoad.truckId || null, previous_status: 'in_transit' })
        }).catch(() => {});
      } catch (_) {}
    }
  }

  // Called by the modal after the user has chosen a destination
  function doRemove(type, id, opts) {
    // opts = { action: 'unpack', location } OR { action: 'move_truck', truckId }
    const _t  = trucks.find(t => String(t.id) === String(currentLoad.truckId));
    const _cu = JSON.parse(localStorage.getItem('user') || '{}');
    const note = opts.action === 'move_truck'
      ? `Moved to ${trucks.find(t => String(t.id) === String(opts.truckId))?.name || opts.truckId} from ${_t?.name || 'truck'}`
      : `Unpacked to ${opts.locationName || opts.location} from ${_t?.name || 'truck'}`;

    if (type === 'box') {
      const index = currentLoad.placements.findIndex(p => p.boxId === id);
      if (index !== -1) currentLoad.placements.splice(index, 1);
      try {
        fetch('/api/history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}` },
          body: JSON.stringify({ kind: 'boxes', id, action: opts.action === 'move_truck' ? 'moved_to_truck' : 'removed_from_truck',
            note, by: _cu.id || null, from_truck_id: currentLoad.truckId || null,
            to_truck_id: opts.truckId || null, to_location: opts.location || null, previous_status: 'in_transit' })
        }).catch(() => {});
      } catch (_) {}
    } else if (type === 'asset') {
      const index = currentLoad.placements.findIndex(p => p.type === 'asset' && p.assetId === id);
      if (index !== -1) currentLoad.placements.splice(index, 1);
    } else if (type === 'inventory') {
      const index = currentLoad.placements.findIndex(p => p.type === 'inventory' && p.inventoryId === id);
      if (index !== -1) currentLoad.placements.splice(index, 1);
    }

    // If moving to another truck, add to that truck's DB draft
    if (opts.action === 'move_truck' && opts.truckId) {
      const newPlacement = type === 'box'
        ? { boxId: id, zone: 'grid-1', timestamp: new Date().toISOString() }
        : type === 'asset'
          ? { type: 'asset', assetId: id, zone: 'grid-1', timestamp: new Date().toISOString() }
          : { type: 'inventory', inventoryId: id, zone: 'grid-1', timestamp: new Date().toISOString() };

      // Load destination truck's current draft, merge, and save
      (async () => {
        try {
          let destPlacements = [];
          let destEventId = currentLoad.eventId || null;
          if (window.RTS_API) {
            const draft = await window.RTS_API.getLoadPlanDraft(opts.truckId);
            console.log('Dest truck draft:', JSON.stringify(draft));
            if (draft && Array.isArray(draft.placements)) {
              destPlacements = draft.placements;
            }
            if (draft && draft.plan && draft.plan.event_id) {
              destEventId = draft.plan.event_id;
            }
          }
          // Avoid duplicate
          const alreadyThere = destPlacements.some(p =>
            (type === 'box' && p.boxId === id) ||
            (type === 'asset' && p.assetId === id) ||
            (type === 'inventory' && p.inventoryId === id)
          );
          if (!alreadyThere) destPlacements.push(newPlacement);
          if (window.RTS_API) {
            const result = await window.RTS_API.saveLoadPlanDraft({
              truck_id: opts.truckId,
              event_id: destEventId,
              placements: destPlacements
            });
            console.log('Saved to dest truck:', JSON.stringify(result));
          }
        } catch (e) {
          console.error('Failed to add item to destination truck load:', e);
        }
      })();
    }

    currentLoad.updatedAt = new Date().toISOString();
    saveData();
    renderAll();
  }

  function placeAsset(assetId, zone) {
    if (currentLoad.placements.some(p => p.type === 'asset' && p.assetId === assetId)) {
      alert('Asset is already loaded!');
      return;
    }
    currentLoad.placements.push({
      type: 'asset',
      assetId,
      zone,
      timestamp: new Date().toISOString()
    });
    currentLoad.updatedAt = new Date().toISOString();
    saveData();
    renderAll();
  }

  function removeAsset(assetId) {
    const index = currentLoad.placements.findIndex(p => p.type === 'asset' && p.assetId === assetId);
    if (index !== -1) {
      currentLoad.placements.splice(index, 1);
      currentLoad.updatedAt = new Date().toISOString();
      saveData();
      renderAll();
    }
  }

  function placeInventory(inventoryId, zone) {
    if (currentLoad.placements.some(p => p.type === 'inventory' && p.inventoryId === inventoryId)) {
      alert('Item is already loaded!');
      return;
    }
    currentLoad.placements.push({
      type: 'inventory',
      inventoryId,
      zone,
      timestamp: new Date().toISOString()
    });
    currentLoad.updatedAt = new Date().toISOString();
    saveData();
    renderAll();
  }

  function removeInventory(inventoryId) {
    const index = currentLoad.placements.findIndex(p => p.type === 'inventory' && p.inventoryId === inventoryId);
    if (index !== -1) {
      currentLoad.placements.splice(index, 1);
      currentLoad.updatedAt = new Date().toISOString();
      saveData();
      renderAll();
    }
  }

  function calculatePosition(boxId, zone) {
    // Simple stacking algorithm - can be enhanced
    const truck = getTruck();
    if (!truck) return { x: 0, y: 0, z: 0 };

    const zonesInSameRow = currentLoad.placements.filter(p => p.zone === zone);
    const xOffset = zonesInSameRow.length * 10; // Simple offset

    return { x: xOffset, y: 0, z: 0 };
  }

  // ========== BOX MODAL ==========
  function showBoxModal(boxId = null) {
    const isEdit = !!boxId;
    const box = isEdit ? getBox(boxId) : null;

    document.getElementById('boxModalTitle').textContent = isEdit ? 'Edit Box' : 'Add Box to Load';
    document.getElementById('editBoxId').value = boxId || '';
    document.getElementById('boxBarcode').value = box ? box.barcode : generateBarcode();
    document.getElementById('boxName').value = box ? box.name : '';
    document.getElementById('boxLength').value = box ? box.length : '';
    document.getElementById('boxWidth').value = box ? box.width : '';
    document.getElementById('boxHeight').value = box ? box.height : '';
    document.getElementById('boxWeight').value = box ? box.weight : '';
    document.getElementById('boxContents').value = box ? box.contents : '';
    document.getElementById('boxCategory').value = box ? box.category : 'container';

    // Show message about creating boxes
    const helpText = document.getElementById('boxModalHelp');
    if (helpText) {
      helpText.textContent = isEdit ? '' : 'Tip: Create boxes in Logistics → Box Packing first, they will appear here automatically.';
    }

    boxModal.show();
  }

  function saveBox() {
    const editId = document.getElementById('editBoxId').value;
    const isEdit = !!editId;

    const boxData = {
      id: editId || RTS.uid('box'),
      barcode: document.getElementById('boxBarcode').value.trim() || generateBarcode(),
      name: document.getElementById('boxName').value.trim(),
      length: parseFloat(document.getElementById('boxLength').value) || 0,
      width: parseFloat(document.getElementById('boxWidth').value) || 0,
      height: parseFloat(document.getElementById('boxHeight').value) || 0,
      weight: parseFloat(document.getElementById('boxWeight').value) || 0,
      contents: document.getElementById('boxContents').value.trim(),
      category: document.getElementById('boxCategory').value,
      status: 'warehouse'
    };

    if (!boxData.name || boxData.length <= 0 || boxData.width <= 0 || boxData.height <= 0 || boxData.weight <= 0) {
      alert('Please fill in all required fields correctly.');
      return;
    }

    if (isEdit) {
      const index = boxes.findIndex(b => b.id === editId);
      if (index !== -1) boxes[index] = boxData;
    } else {
      boxes.push(boxData);
    }

    saveData();
    renderAll();
    boxModal.hide();
    document.getElementById('boxForm').reset();
  }

  function generateBarcode() {
    const existing = boxes.map(b => b.barcode).filter(b => b && b.startsWith('BOX-'));
    const numbers = existing.map(b => parseInt(b.split('-')[1])).filter(n => !isNaN(n));
    const maxNum = numbers.length > 0 ? Math.max(...numbers) : 0;
    return `BOX-${String(maxNum + 1).padStart(3, '0')}`;
  }

  // ========== LOAD PLAN OPERATIONS ==========
  function saveLoadPlan() {
    if (!currentLoad.eventId) { alert('Please select an event first.'); return; }
    if (!currentLoad.truckId) { alert('Please select a truck first.'); return; }
    if (currentLoad.placements.length === 0) { alert('Please add boxes to the truck first.'); return; }
    saveData();
    alert('Load plan saved successfully!');
  }

  async function finaliseLoadPlan() {
    if (!currentLoad.truckId) { alert('Please select a truck first.'); return; }
    if (currentLoad.placements.length === 0) { alert('No boxes loaded — nothing to finalise.'); return; }
    if (!confirm(`Finalise this load plan? It will be saved to history as Completed and boxes will be marked as unloaded from the truck.`)) return;
    try {
      // Save the current state first so history has the latest placements
      await window.RTS_API.saveLoadPlanDraft({
        truck_id: currentLoad.truckId,
        event_id: currentLoad.eventId || null,
        placements: currentLoad.placements
      });
      const resp = await window.RTS_API.finaliseLoadPlan(currentLoad.truckId);
      if (resp.success) {
        alert('✅ Load plan finalised and saved to history!');
        // Reset to empty state for this truck
        currentLoad = { ...createEmptyLoad(), truckId: currentLoad.truckId, eventId: currentLoad.eventId };
        renderAll();
      } else {
        alert('Error finalising: ' + (resp.error || 'Unknown error'));
      }
    } catch (e) {
      alert('Error: ' + e.message);
    }
  }

  async function showHistory() {
    try {
      const resp = await window.RTS_API.getLoadPlanHistory();
      const plans = resp.plans || [];
      let html = plans.length === 0
        ? '<p class="text-muted">No completed load plans yet.</p>'
        : `<table class="table table-sm table-bordered" style="font-size:.82rem">
            <thead class="table-light"><tr><th>Date</th><th>Truck</th><th>Event</th><th>Boxes</th></tr></thead>
            <tbody>` +
          plans.map(p => `<tr>
            <td>${new Date(p.updated_at).toLocaleDateString('en-ZA', {day:'2-digit',month:'short',year:'numeric'})}</td>
            <td>${esc(p.truck_name || p.truck_id || '—')}</td>
            <td>${esc(p.event_name || p.event_id || '—')}</td>
            <td>${p.box_count}</td>
          </tr>`).join('') +
          `</tbody></table>`;

      // Reuse or create a simple modal
      let modalEl = document.getElementById('loadHistoryModal');
      if (!modalEl) {
        const div = document.createElement('div');
        div.innerHTML = `
          <div class="modal fade" id="loadHistoryModal" tabindex="-1">
            <div class="modal-dialog modal-lg modal-dialog-scrollable">
              <div class="modal-content">
                <div class="modal-header"><h5 class="modal-title">📋 Load Plan History</h5>
                  <button type="button" class="btn-close" data-bs-dismiss="modal"></button></div>
                <div class="modal-body" id="loadHistoryBody"></div>
              </div>
            </div>
          </div>`;
        document.body.appendChild(div.firstElementChild);
        modalEl = document.getElementById('loadHistoryModal');
      }
      document.getElementById('loadHistoryBody').innerHTML = html;
      new bootstrap.Modal(modalEl).show();
    } catch(e) {
      alert('Could not load history: ' + e.message);
    }
  }

  function clearLoad() {
    if (!confirm('Clear all boxes from the truck? This cannot be undone.')) return;
    
    currentLoad.placements = [];
    currentLoad.updatedAt = new Date().toISOString();
    saveData();
    renderAll();
  }

  function autoOptimize() {
    if (!currentLoad.truckId) {
      alert('Please select a truck first.');
      return;
    }

    // Simple optimization: distribute weight evenly across zones
    const unloadedBoxes = boxes.filter(b => !currentLoad.placements.some(p => p.boxId === b.id));
    if (unloadedBoxes.length === 0) {
      alert('All boxes are already loaded.');
      return;
    }

    const zones = ['front', 'middle-left', 'middle-right', 'rear'];
    const sortedBoxes = [...unloadedBoxes].sort((a, b) => b.weight - a.weight); // Heavy first

    sortedBoxes.forEach((box, idx) => {
      const zone = zones[idx % zones.length];
      placeBox(box.id, zone);
    });

    alert(`Auto-optimized: ${sortedBoxes.length} boxes distributed across zones.`);
  }

  // ========== BARCODE PRINTING ==========
  function printBarcodes() {
    const printWindow = window.open('', '_blank');
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Box Barcodes</title>
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
        <style>
          body { font-family: Arial; padding: 20px; }
          .barcode-item { page-break-inside: avoid; margin-bottom: 30px; border: 1px solid #ccc; padding: 15px; }
          .barcode-item h3 { margin: 0 0 10px 0; }
          svg { width: 100%; height: auto; }
        </style>
      </head>
      <body>
        <h1>Box Barcodes - Load Plan</h1>
        ${boxes.map(box => `
          <div class="barcode-item">
            <h3>${esc(box.name)}</h3>
            <svg class="barcode" data-barcode="${esc(box.barcode)}"></svg>
            <p><strong>Dimensions:</strong> ${box.length} × ${box.width} × ${box.height} cm</p>
            <p><strong>Weight:</strong> ${box.weight} kg</p>
            <p><strong>Contents:</strong> ${esc(box.contents)}</p>
          </div>
        `).join('')}
        <script>
          document.querySelectorAll('.barcode').forEach(svg => {
            JsBarcode(svg, svg.dataset.barcode, { format: 'CODE128', displayValue: true });
          });
          setTimeout(() => window.print(), 1000);
        </script>
      </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  }

  function updateWeightBalanceBar() {
    const bar = document.getElementById('weightBalanceBar');
    if (!bar || !currentLoad?.placements?.length) {
      if (bar) bar.classList.remove('show');
      return;
    }
    const truck = getTruck();
    const zones = truck?.zones || {};

    // Split zones into front half (grid 1,2,3,4 or odd cols) vs rear (5,6,7,8 or even cols)
    // Convention: lower grid numbers = front of truck
    const sortedKeys = Object.keys(zones).sort((a, b) =>
      parseInt(a.replace('grid-','')) - parseInt(b.replace('grid-',''))
    );
    const half = Math.ceil(sortedKeys.length / 2);
    const frontZones = new Set(sortedKeys.slice(0, half));

    let frontKg = 0, rearKg = 0;
    currentLoad.placements.forEach(p => {
      const box = getBox(p.boxId);
      if (!box) return;
      const w = parseFloat(box.weight) || 0;
      if (frontZones.has(p.zone)) frontKg += w;
      else rearKg += w;
    });

    const total = frontKg + rearKg;
    if (total === 0) { bar.classList.remove('show'); return; }

    const frontPct = Math.round((frontKg / total) * 100);
    const rearPct  = 100 - frontPct;

    const elFront = document.getElementById('wbbFront');
    const elRear  = document.getElementById('wbbRear');
    const elFL    = document.getElementById('wbbFrontLabel');
    const elRL    = document.getElementById('wbbRearLabel');
    if (!elFront || !elRear || !elFL || !elRL) return;
    elFront.style.width = frontPct + '%';
    elRear.style.width  = rearPct  + '%';
    elFL.textContent = `Front — ${frontKg.toFixed(0)} kg (${frontPct}%)`;
    elRL.textContent = `Rear — ${rearKg.toFixed(0)} kg (${rearPct}%)`;

    // Warning colour if >60/40 imbalance
    const imbalanced = frontPct > 65 || rearPct > 65;
    elFront.style.background = imbalanced ? '#f29900' : '#1a73e8';
    elRear.style.background  = imbalanced ? '#ea4335' : '#34a853';
    bar.classList.add('show');
  }

  // ========== BOX CONTENTS TOOLTIP (2D view) ==========
  (function setupBoxTooltip() {
    const tip = document.createElement('div');
    tip.className = 'box-tooltip-popup';
    tip.style.display = 'none';
    document.body.appendChild(tip);

    let hideTimer = null;

    document.addEventListener('mouseover', e => {
      const el = e.target.closest('.box-item');
      if (!el) return;
      const boxId = el.dataset.boxId;
      if (!boxId) return;
      const box = boxes.find(b => b.id === boxId);
      if (!box) return;
      clearTimeout(hideTimer);
      const items = box.contentsItems || [];
      if (items.length === 0) return; // no tooltip for empty boxes
      const rows = items.slice(0, 12).map(it =>
        `<div style="padding:2px 0;border-bottom:1px solid #f0f0f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(it.name)}</div>`
      ).join('');
      const more = items.length > 12 ? `<div style="color:#1a73e8;font-size:.7rem;margin-top:4px">+${items.length - 12} more…</div>` : '';
      tip.innerHTML = `<div style="font-weight:700;margin-bottom:5px;color:#1a73e8">${esc(box.barcode)} — ${esc(box.name)}</div>${rows}${more}`;
      const rect = el.getBoundingClientRect();
      tip.style.display = 'block';
      tip.style.left = (rect.right + window.scrollX + 8) + 'px';
      tip.style.top  = Math.max(8, rect.top + window.scrollY) + 'px';
    });

    document.addEventListener('mouseout', e => {
      const el = e.target.closest('.box-item');
      if (!el) return;
      hideTimer = setTimeout(() => { tip.style.display = 'none'; }, 120);
    });
  })();

  // ========== ASSET / INVENTORY HOVER TOOLTIP ==========
  (function setupItemTooltip() {
    const tip = document.getElementById('loadTooltip');
    if (!tip) return;
    const ttTitle = document.getElementById('ttTitle');
    const ttBody  = document.getElementById('ttBody');
    let hideTimer = null;

    document.addEventListener('mouseover', e => {
      const el = e.target.closest('[data-tooltip]');
      if (!el) return;
      let data;
      try { data = JSON.parse(el.dataset.tooltip); } catch(ex) { return; }
      clearTimeout(hideTimer);
      if (ttTitle) ttTitle.textContent = data._name || '—';
      if (ttBody) {
        ttBody.innerHTML = Object.entries(data)
          .filter(([k]) => !k.startsWith('_') && data[k] && data[k] !== '—')
          .map(([k, v]) => `<div class="tt-row"><span class="tt-key">${esc(k)}</span><span class="tt-val">${esc(String(v))}</span></div>`)
          .join('');
      }
      tip.style.display = 'block';
    });

    document.addEventListener('mousemove', e => {
      if (tip.style.display === 'none') return;
      const tw = tip.offsetWidth  || 240;
      const th = tip.offsetHeight || 100;
      tip.style.left = Math.min(e.clientX + 14, window.innerWidth  - tw - 8) + 'px';
      tip.style.top  = Math.min(e.clientY + 10, window.innerHeight - th - 8) + 'px';
    });

    document.addEventListener('mouseout', e => {
      const el = e.target.closest('[data-tooltip]');
      if (!el) return;
      hideTimer = setTimeout(() => { tip.style.display = 'none'; }, 100);
    });
  })();

  // ========== 3D VIEW ==========
  function switchView(view) {
    currentView = view;
    // Clear category filter when leaving 3D
    if (view !== '3D') {
      catFilterActive = null;
      const ci = document.getElementById('catInspector');
      if (ci) ci.style.display = 'none';
    }
    document.getElementById('btn2DView').classList.toggle('active', view === '2D');
    document.getElementById('btn3DView').classList.toggle('active', view === '3D');
    document.getElementById('view2D').style.display = view === '2D' ? 'grid' : 'none';
    document.getElementById('view3D').style.display = view === '3D' ? 'block' : 'none';
    const wbb = document.getElementById('weightBalanceBar');
    if (wbb && view !== '3D') wbb.classList.remove('show');

    if (view === '3D') {
      setTimeout(() => {
        init3D();
        // Apply search if active
        if (currentSearchTerm) {
          render3DWithSearch(currentSearchTerm);
        }
      }, 100);
    }
  }

  function init3D() {
    const container = document.getElementById('view3D');
    const canvas = document.getElementById('truckCanvas');
    
    if (!scene) {
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0xf5f5f5);

      camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 10000);
      camera.position.set(500, 400, 800);
      camera.lookAt(0, 0, 0);

      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, preserveDrawingBuffer: true });
      renderer.setSize(container.clientWidth, container.clientHeight);

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
      scene.add(ambientLight);

      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
      directionalLight.position.set(100, 200, 100);
      scene.add(directionalLight);

      // Add mouse controls for panning and rotation
      setupMouseControls();
      
      // Setup drag and drop for 3D
      setup3DDragDrop();
      
      // Setup box selection and keyboard movement
      setup3DBoxSelection();
      setup3DKeyboardControls();
      setup3DHoverTooltip();
    }

    // Auto-select first box so the pile inspector panel is visible immediately
    // without requiring the user to click a box first.
    if (!selected3DBoxId && currentLoad.placements && currentLoad.placements.length > 0) {
      selected3DBoxId = String(currentLoad.placements[0].boxId);
    }

    render3D();
    animate3D();
  }

  function render3D() {
    if (!scene) return;

    // Clear existing meshes (keep lights and grid)
    while (scene.children.length > 2) {
      scene.remove(scene.children[2]);
    }

    const truck = getTruck();
    if (!truck) return;

    // Draw 1m x 1m grid system on floor
    const gridSize = 100; // 100cm (1 meter) grid cells
    const numGridsX = Math.floor(truck.length / gridSize); // 4
    const numGridsZ = Math.floor(truck.width / gridSize); // 2
    
    // Create color palette for grid zones (MUST MATCH 2D VIEW)
    const gridColors = [
      0xff6b6b, 0x4ecdc4, 0x45b7d1, 0xf7b731, 
      0x95e1d3, 0xf38181, 0xaa96da, 0xfcbad3,
      0xa8e6cf, 0xffd3b6, 0xffaaa5, 0xff8b94
    ];
    
    for (let x = 0; x < numGridsX; x++) {
      for (let z = 0; z < numGridsZ; z++) {
        const posX = -truck.length / 2 + (x * gridSize) + (gridSize / 2);
        const posZ = -truck.width / 2 + (z * gridSize) + (gridSize / 2);
        
        // Match zone numbering: odd on top (z=1), even on bottom (z=0)
        const gridNum = (x * 2) + (z === 0 ? 2 : 1);
        
        // Determine zone color based on grid number
        const colorIndex = (gridNum - 1) % gridColors.length;
        const cellColor = gridColors[colorIndex];
        
        // Grid cell floor
        const cellGeometry = new THREE.PlaneGeometry(gridSize, gridSize);
        const cellMaterial = new THREE.MeshBasicMaterial({ 
          color: cellColor, 
          transparent: true, 
          opacity: 0.25,
          side: THREE.DoubleSide
        });
        const cellMesh = new THREE.Mesh(cellGeometry, cellMaterial);
        cellMesh.rotation.x = -Math.PI / 2;
        cellMesh.position.set(posX, 0.5, posZ);
        cellMesh.userData = { 
          gridNumber: gridNum,
          gridX: x,
          gridZ: z,
          isDropZone: true 
        };
        scene.add(cellMesh);
        
        // Grid cell border
        const borderGeometry = new THREE.EdgesGeometry(cellGeometry);
        const borderMaterial = new THREE.LineBasicMaterial({ 
          color: 0x333333, 
          linewidth: 1 
        });
        const borderLine = new THREE.LineSegments(borderGeometry, borderMaterial);
        borderLine.rotation.x = -Math.PI / 2;
        borderLine.position.copy(cellMesh.position);
        scene.add(borderLine);
        
        // Grid number label (larger for 1m grids)
        const labelCanvas = document.createElement('canvas');
        labelCanvas.width = 128;
        labelCanvas.height = 128;
        const labelCtx = labelCanvas.getContext('2d');
        labelCtx.fillStyle = '#000000';
        labelCtx.font = 'bold 72px Arial';
        labelCtx.textAlign = 'center';
        labelCtx.textBaseline = 'middle';
        labelCtx.fillText(gridNum.toString(), 64, 64);
        
        const labelTexture = new THREE.CanvasTexture(labelCanvas);
        const labelMaterial = new THREE.MeshBasicMaterial({ 
          map: labelTexture, 
          transparent: true 
        });
        const labelGeometry = new THREE.PlaneGeometry(60, 60);
        const labelMesh = new THREE.Mesh(labelGeometry, labelMaterial);
        labelMesh.rotation.x = -Math.PI / 2;
        labelMesh.position.set(posX, 1, posZ);
        scene.add(labelMesh);
      }
    }
    
    // Draw zone markers (larger labels for reference)
    const zones = [
      { name: 'FRONT', x: truck.length / 2 - truck.length / 8, z: 0, color: 0xff6b6b },
      { name: 'MIDDLE-L', x: 0, z: truck.width / 4, color: 0x4ecdc4 },
      { name: 'MIDDLE-R', x: 0, z: -truck.width / 4, color: 0x45b7d1 },
      { name: 'REAR', x: -truck.length / 2 + truck.length / 8, z: 0, color: 0xf7b731 }
    ];

    zones.forEach(zoneData => {
      // Zone label using canvas texture
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 48px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(zoneData.name, 128, 64);
      
      const texture = new THREE.CanvasTexture(canvas);
      const labelMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
      const labelGeometry = new THREE.PlaneGeometry(80, 40);
      const labelMesh = new THREE.Mesh(labelGeometry, labelMaterial);
      labelMesh.rotation.x = -Math.PI / 2;
      labelMesh.position.set(zoneData.x, 2, zoneData.z);
      scene.add(labelMesh);

      // Height limit indicator line at truck height
      const zoneWidth = truck.length / 4;
      const zoneDepth = truck.width / 2;
      const heightLineGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(zoneData.x - zoneWidth/2, truck.height, zoneData.z - zoneDepth/2),
        new THREE.Vector3(zoneData.x + zoneWidth/2, truck.height, zoneData.z - zoneDepth/2),
        new THREE.Vector3(zoneData.x + zoneWidth/2, truck.height, zoneData.z + zoneDepth/2),
        new THREE.Vector3(zoneData.x - zoneWidth/2, truck.height, zoneData.z + zoneDepth/2),
        new THREE.Vector3(zoneData.x - zoneWidth/2, truck.height, zoneData.z - zoneDepth/2)
      ]);
      const heightLineMaterial = new THREE.LineDashedMaterial({ 
        color: zoneData.color, 
        dashSize: 10, 
        gapSize: 5,
        linewidth: 2
      });
      const heightLine = new THREE.Line(heightLineGeometry, heightLineMaterial);
      heightLine.computeLineDistances();
      scene.add(heightLine);
    });

    buildTruckModel(truck);

    // Draw boxes
    currentLoad.placements.forEach((placement, idx) => {
      const box = getBox(placement.boxId);
      if (!box) return;

      // Kart stand: render as wireframe instead of solid mesh
      if ((box.box_type || box.boxType) === 'kart_stand') {
        const isSelected = String(box.id) === String(selected3DBoxId);
        const pos = calculatePositionIn3D(placement, box, truck);
        const kartCount = Math.min(2, (box.contentsItems || []).length);
        _drawKartStandWireframe(pos, box, kartCount, isSelected, false);
        addBoxFaceLabels(pos, box, false, isSelected, idx + 1);
        return;
      }

      const boxGeometry = new THREE.BoxGeometry(box.length, box.height, box.width);
      const boxMaterial = new THREE.MeshPhongMaterial({
        color: getBoxStackColor(placement),
        shininess: 30
      });
      const boxMesh = new THREE.Mesh(boxGeometry, boxMaterial);
      boxMesh.userData.isBox = true;
      boxMesh.userData.boxId = box.id;

      const pos = calculatePositionIn3D(placement, box, truck);
      boxMesh.position.set(pos.x, pos.y, pos.z);

      const boxEdges = new THREE.EdgesGeometry(boxGeometry);
      const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
      const edgesLine = new THREE.LineSegments(boxEdges, edgesMaterial);
      edgesLine.position.copy(boxMesh.position);
      edgesLine.userData.isBox = true;

      scene.add(boxMesh);
      scene.add(edgesLine);
      addBoxFaceLabels(pos, box, false, false, idx + 1);
    });

    update3DOverlays();
    if (renderer) renderer.render(scene, camera);
  }

  // Enhanced 3D rendering with search highlighting
  function render3DWithSearch(searchTerm) {
    if (!scene) return;

    // Clear existing box meshes only (keep lights, grid, truck walls)
    const meshesToRemove = [];
    scene.children.forEach(child => {
      if (child.userData && child.userData.isBox) {
        meshesToRemove.push(child);
      }
    });
    meshesToRemove.forEach(mesh => scene.remove(mesh));

    const truck = getTruck();
    if (!truck) return;
    
    const searchLower = searchTerm.toLowerCase().trim();

    // Draw boxes with search-based coloring
    currentLoad.placements.forEach(placement => {
      const box = getBox(placement.boxId);
      if (!box) return;

      // Determine if this box matches the search
      let isMatch = false;
      if (searchLower) {
        const searchableText = [
          box.barcode || '',
          box.name || '',
          box.contents || '',
          ...(box.contentsItems || []).map(item => `${item.barcode} ${item.name}`)
        ].join(' ').toLowerCase();
        
        isMatch = searchableText.includes(searchLower);
      }

      // Kart stand: render as wireframe instead of solid mesh
      if ((box.box_type || box.boxType) === 'kart_stand') {
        const isSelected = String(box.id) === String(selected3DBoxId);
        const pos = calculatePositionIn3D(placement, box, truck);
        const kartCount = Math.min(2, (box.contentsItems || []).length);
        const _ksBoxCat = box.category || 'other';
        const _ksCatDimmed = catFilterActive && _ksBoxCat !== catFilterActive;
        const isDimmed = _ksCatDimmed || (!!searchLower && !isMatch);
        _drawKartStandWireframe(pos, box, kartCount, isSelected, isDimmed);
        return;
      }

      const boxGeometry = new THREE.BoxGeometry(box.length, box.height, box.width);

      // Category filter: dim boxes not in the active category
      const boxCat = box.category || 'other';
      const isCatDimmed = catFilterActive && boxCat !== catFilterActive;

      // SPRING GREEN (#00FF7F / 0x00FF7F) for matches, GRAY (0x808080) for non-matches
      const boxColor = searchLower
        ? (isMatch ? 0x00FF7F : 0x808080)
        : (isCatDimmed ? 0x333333 : getBoxStackColor(placement));

      const boxMaterial = new THREE.MeshPhongMaterial({
        color: boxColor,
        transparent: isCatDimmed || false,
        opacity: isCatDimmed ? 0.10 : 1.0,
        shininess: isMatch ? 100 : 30, // Extra shine for matching boxes
        emissive: isMatch ? 0x00FF7F : 0x000000,
        emissiveIntensity: isMatch ? 0.3 : 0
      });
      const boxMesh = new THREE.Mesh(boxGeometry, boxMaterial);
      boxMesh.userData.isBox = true;
      boxMesh.userData.boxId = box.id;
      boxMesh.userData.isMatch = isMatch;

      const pos = calculatePositionIn3D(placement, box, truck);
      boxMesh.position.set(pos.x, pos.y, pos.z);

      const boxEdges = new THREE.EdgesGeometry(boxGeometry);
      
      // Check if this box is selected
      const isSelected = (box.id === selected3DBoxId);

      const edgesMaterial = new THREE.LineBasicMaterial({
        color: isSelected ? 0xFFFF00 : (isMatch ? 0x00FF00 : (isCatDimmed ? 0x222222 : 0x000000)),
        linewidth: isSelected ? 4 : (isMatch ? 3 : 2),
        transparent: isCatDimmed,
        opacity: isCatDimmed ? 0.08 : 1.0
      });
      const edgesLine = new THREE.LineSegments(boxEdges, edgesMaterial);
      edgesLine.position.copy(boxMesh.position);
      edgesLine.userData.isBox = true;
      edgesLine.userData.boxId = box.id;

      scene.add(boxMesh);
      scene.add(edgesLine);
      
      // Add selection highlight glow for selected box
      if (isSelected) {
        const glowGeometry = new THREE.BoxGeometry(box.length + 5, box.height + 5, box.width + 5);
        const glowMaterial = new THREE.MeshBasicMaterial({
          color: 0xFFFF00,
          transparent: true,
          opacity: 0.3,
          wireframe: true
        });
        const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
        glowMesh.position.copy(boxMesh.position);
        glowMesh.userData.isBox = true;
        scene.add(glowMesh);
      }

      addBoxFaceLabels(pos, box, isMatch, isSelected, null);

      // Add pulsing animation for matching boxes
      if (isMatch) {
        const pulseScale = 1 + Math.sin(Date.now() * 0.003) * 0.05;
        boxMesh.scale.set(pulseScale, pulseScale, pulseScale);
      }
    });

    update3DOverlays();
    if (renderer) renderer.render(scene, camera);
  }

  function calculatePositionIn3D(placement, box, truck) {
    // Only trust stored _x/_y/_z if this placement was created by the auto-pack
    // algorithm (autoPackedAt flag). Auto-pack uses complex 3D bin-packing that can
    // place boxes side-by-side, so those exact positions must be preserved.
    // For manually placed or pile-reordered boxes, always recalculate from zone
    // position + array-index-based stacking height so stale saved values (e.g.
    // from the old buggy movePileBox) never cause invisible or misplaced boxes.
    if (placement._x !== undefined && placement.autoPackedAt) {
      return { x: placement._x, y: placement._y, z: placement._z };
    }
    // Get zone data from truck
    const zone = truck.zones[placement.zone];
    if (!zone) {
      return { x: 0, y: box.height / 2, z: 0 };
    }
    
    // Use the pre-calculated position from the zone
    const zonePos = { x: zone.posX, z: zone.posZ };
    
    // Calculate stacking height — only count boxes that come BEFORE this one
    // in the placements array (lower index = placed earlier = lower in the stack).
    // Counting ALL other boxes was causing every box to land at the same Y.
    const placementIndex = currentLoad.placements.indexOf(placement);
    let stackHeight = 0;
    for (let i = 0; i < placementIndex; i++) {
      const p = currentLoad.placements[i];
      if (p.zone === placement.zone) {
        const otherBox = getBox(p.boxId);
        if (otherBox) stackHeight += (otherBox.height || 0);
      }
    }

    const y = stackHeight + (box.height || 0) / 2;

    return { 
      x: zonePos.x + (placement.offsetX || 0), 
      y: y + (placement.offsetY || 0), 
      z: zonePos.z + (placement.offsetZ || 0)
    };
  }

  function animate3D() {
    if (currentView !== '3D') return;
    requestAnimationFrame(animate3D);

    // Smooth camera lerp to preset targets
    if (cameraTarget) {
      const s = 0.09;
      cameraDistance += (cameraTarget.dist - cameraDistance) * s;
      cameraRotation.theta += (cameraTarget.theta - cameraRotation.theta) * s;
      cameraRotation.phi += (cameraTarget.phi - cameraRotation.phi) * s;
      if (Math.abs(cameraTarget.dist - cameraDistance) < 1 &&
          Math.abs(cameraTarget.theta - cameraRotation.theta) < 0.001 &&
          Math.abs(cameraTarget.phi - cameraRotation.phi) < 0.001) {
        cameraTarget = null;
      }
      updateCameraPosition();
    }

    // Animate pulsing for matching boxes during search
    if (currentSearchTerm && scene) {
      scene.children.forEach(child => {
        if (child.userData && child.userData.isBox && child.userData.isMatch) {
          const pulseScale = 1 + Math.sin(Date.now() * 0.003) * 0.05;
          child.scale.set(pulseScale, pulseScale, pulseScale);
        }
      });
    }

    if (camera && renderer && scene) {
      renderer.render(scene, camera);
    }
  }

  // Mouse controls for 3D view
  let isDragging = false;
  let previousMousePosition = { x: 0, y: 0 };
  let cameraDistance = 1000;
  let cameraRotation = { theta: 0.5, phi: 0.5 };
  let cameraLookTarget = { x: 0, y: 100, z: 0 };
  let cameraTarget = null; // { dist, theta, phi } for smooth lerp transitions

  function setupMouseControls() {
    const canvas = document.getElementById('truckCanvas');
    
    canvas.addEventListener('mousedown', e => {
      isDragging = true;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    canvas.addEventListener('mousemove', e => {
      if (!isDragging) return;

      const deltaX = e.clientX - previousMousePosition.x;
      const deltaY = e.clientY - previousMousePosition.y;

      if (e.buttons === 1) { // Left drag - orbit rotate
        cameraTarget = null; // cancel any lerp
        cameraRotation.theta += deltaX * 0.005;
        cameraRotation.phi += deltaY * 0.005;
        cameraRotation.phi = Math.max(0.1, Math.min(Math.PI - 0.1, cameraRotation.phi));
        updateCameraPosition();
      } else if (e.buttons === 2 && camera) { // Right drag - pan
        const panSpeed = cameraDistance * 0.0008;
        const right = new THREE.Vector3();
        camera.getWorldDirection(right);
        right.cross(camera.up).normalize();
        cameraLookTarget.x -= right.x * deltaX * panSpeed;
        cameraLookTarget.z -= right.z * deltaX * panSpeed;
        cameraLookTarget.y += deltaY * panSpeed * 0.5;
        updateCameraPosition();
      }

      previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    canvas.addEventListener('mouseup', () => {
      isDragging = false;
    });

    canvas.addEventListener('contextmenu', e => e.preventDefault());

    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      cameraTarget = null;
      cameraDistance += e.deltaY * 0.5;
      cameraDistance = Math.max(200, Math.min(2500, cameraDistance));
      updateCameraPosition();
    });
  }

  function updateCameraPosition() {
    if (!camera) return;
    camera.position.x = cameraLookTarget.x + cameraDistance * Math.sin(cameraRotation.phi) * Math.cos(cameraRotation.theta);
    camera.position.y = cameraLookTarget.y + cameraDistance * Math.cos(cameraRotation.phi);
    camera.position.z = cameraLookTarget.z + cameraDistance * Math.sin(cameraRotation.phi) * Math.sin(cameraRotation.theta);
    camera.lookAt(cameraLookTarget.x, cameraLookTarget.y, cameraLookTarget.z);
  }

  // 3D Box Selection and Movement
  let selected3DBoxId = null;
  const MOVE_STEP = 10; // cm per keypress

  function setup3DBoxSelection() {
    const canvas = document.getElementById('truckCanvas');
    
    // Click to select box in 3D view
    canvas.addEventListener('click', e => {
      if (isDragging) return; // Don't select if we were dragging camera
      
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);

      // Find if we clicked on a box
      for (let intersect of intersects) {
        if (intersect.object.userData && intersect.object.userData.isBox && intersect.object.userData.boxId) {
          selected3DBoxId = intersect.object.userData.boxId;
          render3DWithSearch(currentSearchTerm);
          show3DSelectedPanel(selected3DBoxId);
          return;
        }
      }

      // Clicked empty space - deselect
      selected3DBoxId = null;
      hide3DSelectedPanel();
      render3DWithSearch(currentSearchTerm);
    });
  }

  function setup3DKeyboardControls() {
    document.addEventListener('keydown', e => {
      if (!selected3DBoxId || currentView !== '3D') return;
      
      const placement = currentLoad.placements.find(p => p.boxId === selected3DBoxId);
      if (!placement) return;
      
      const truck = getTruck();
      if (!truck) return;
      
      let moved = false;
      
      switch(e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          placement.offsetX = (placement.offsetX || 0) - MOVE_STEP;
          moved = true;
          console.log('⬅️ Moved left');
          break;
          
        case 'ArrowRight':
          e.preventDefault();
          placement.offsetX = (placement.offsetX || 0) + MOVE_STEP;
          moved = true;
          console.log('➡️ Moved right');
          break;
          
        case 'ArrowUp':
          e.preventDefault();
          placement.offsetZ = (placement.offsetZ || 0) - MOVE_STEP;
          moved = true;
          console.log('⬆️ Moved forward');
          break;
          
        case 'ArrowDown':
          e.preventDefault();
          placement.offsetZ = (placement.offsetZ || 0) + MOVE_STEP;
          moved = true;
          console.log('⬇️ Moved backward');
          break;
          
        case 'PageUp':
          e.preventDefault();
          placement.offsetY = (placement.offsetY || 0) + MOVE_STEP;
          moved = true;
          console.log('🔼 Moved up');
          break;
          
        case 'PageDown':
          e.preventDefault();
          placement.offsetY = (placement.offsetY || 0) - MOVE_STEP;
          // Don't go below ground
          if (placement.offsetY < 0) placement.offsetY = 0;
          moved = true;
          console.log('🔽 Moved down');
          break;
          
        case 'Delete':
        case 'Backspace':
          e.preventDefault();
          if (selected3DBoxId) {
            const _b3 = boxes.find(b => b.id === selected3DBoxId);
            rflShow('box', selected3DBoxId, _b3 ? (_b3.name || _b3.barcode || selected3DBoxId) : selected3DBoxId);
            selected3DBoxId = null;
          }
          moved = true;
          break;
      }
      
      if (moved) {
        currentLoad.updatedAt = new Date().toISOString();
        saveData();
        render3DWithSearch(currentSearchTerm);
      }
    });
  }

  // 3D Drag and Drop
  let draggedBox3D = null;
  let raycaster = new THREE.Raycaster();
  let mouse = new THREE.Vector2();

  function setup3DDragDrop() {
    const canvas = document.getElementById('truckCanvas');
    console.log('🎮 Setting up 3D drag-and-drop on canvas');
    
    // Allow dragging from box list onto 3D view
    canvas.addEventListener('dragenter', e => {
      e.preventDefault();
      console.log('🎮 DRAGENTER on 3D canvas');
    });
    
    canvas.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      
      // Calculate mouse position in normalized device coordinates
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      
      // Highlight zone under cursor
      highlightZoneUnderMouse();
    });

    canvas.addEventListener('drop', e => {
      e.preventDefault();
      e.stopPropagation();
      
      // Use draggedBoxId from our global variable (more reliable)
      const boxId = draggedBoxId || e.dataTransfer.getData('text/plain');
      console.log('🎮 DROP on 3D canvas, boxId:', boxId);
      
      if (!boxId) {
        console.error('❌ No boxId found on drop');
        return;
      }

      // Raycast to find which zone was dropped on
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);

      console.log('🎮 Raycasting found', intersects.length, 'intersections');

      for (let intersect of intersects) {
        if (intersect.object.userData && intersect.object.userData.isDropZone) {
          const gridNum = intersect.object.userData.gridNumber;
          const zone = `grid-${gridNum}`;
          console.log('🎮 Placing box in zone:', zone);
          placeBox(boxId, zone);
          draggedBoxId = null;
          break;
        }
      }
    });
  }

  function highlightZoneUnderMouse() {
    if (!scene || !camera) return;
    
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);

    // Reset all zones
    scene.children.forEach(child => {
      if (child.userData && child.userData.isDropZone) {
        child.material.opacity = 0.3;
      }
    });

    // Highlight intersected zone
    for (let intersect of intersects) {
      if (intersect.object.userData && intersect.object.userData.isDropZone) {
        intersect.object.material.opacity = 0.6;
        break;
      }
    }
  }

  // ===== 3D: TEAM COLOUR =====
  function getTeamColor() {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue('--rts-primary').trim();
      if (v) return parseInt(v.replace('#', ''), 16) || 0x1a73e8;
    } catch(e) {}
    return 0x1a73e8;
  }

  // ===== 3D: RACE TRUCK MODEL =====
  function buildTruckModel(truck) {
    const L = truck.length || 600, H = truck.height || 250, W = truck.width || 240;
    const tc = getTeamColor();
    // Floor
    const fl = new THREE.Mesh(new THREE.BoxGeometry(L, 8, W), new THREE.MeshPhongMaterial({ color: 0x111111 }));
    fl.position.set(0, 4, 0); fl.userData.isTruck = true; scene.add(fl);
    // Trailer body (semi-transparent)
    const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(L, H, W), new THREE.MeshPhongMaterial({ color: tc, transparent: true, opacity: 0.18, side: THREE.DoubleSide }));
    bodyMesh.position.set(0, H / 2, 0); bodyMesh.userData.isTruck = true; scene.add(bodyMesh);
    // Trailer wireframe
    const edgeLines = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(L, H, W)), new THREE.LineBasicMaterial({ color: tc }));
    edgeLines.position.set(0, H / 2, 0); edgeLines.userData.isTruck = true; scene.add(edgeLines);
    // Livery stripe on both sides
    const stMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2 });
    [-W/2 + 2, W/2 - 2].forEach(sz => {
      const s = new THREE.Mesh(new THREE.BoxGeometry(L * 0.95, H * 0.1, 4), stMat);
      s.position.set(0, H * 0.42, sz); s.userData.isTruck = true; scene.add(s);
    });
    // Team name on near side
    const tName = (document.title || 'RACE TEAM').replace(/[^a-zA-Z0-9 ]/g, ' ').trim().split('  ')[0].trim().toUpperCase().substring(0, 22);
    const nCvs = document.createElement('canvas'); nCvs.width = 512; nCvs.height = 128;
    const nCtx = nCvs.getContext('2d');
    nCtx.font = 'bold 58px Arial Black, Arial, sans-serif';
    nCtx.fillStyle = 'rgba(255,255,255,0.88)'; nCtx.textAlign = 'center'; nCtx.textBaseline = 'middle';
    nCtx.fillText(tName, 256, 64);
    const nPlane = new THREE.Mesh(new THREE.PlaneGeometry(L * 0.52, H * 0.15), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(nCvs), transparent: true, side: THREE.DoubleSide }));
    nPlane.rotation.y = Math.PI / 2; nPlane.position.set(0, H * 0.62, -W / 2 - 1); nPlane.userData.isTruck = true; scene.add(nPlane);
    // Rear door frame (loading entrance, +X face)
    const dMat = new THREE.MeshBasicMaterial({ color: 0xffd700 });
    [-W/2, W/2].forEach(dz => {
      const v = new THREE.Mesh(new THREE.BoxGeometry(8, H, 8), dMat);
      v.position.set(L/2, H/2, dz); v.userData.isTruck = true; scene.add(v);
    });
    const dTop = new THREE.Mesh(new THREE.BoxGeometry(8, 8, W), dMat);
    dTop.position.set(L/2, H, 0); dTop.userData.isTruck = true; scene.add(dTop);
    // ===== CAB =====
    const cLen = Math.min(L * 0.26, 200), cH = H * 0.82;
    const cX   = -L/2 - cLen/2;  // cab centre X
    const cFrX = -L/2 - cLen;    // cab front face X

    // Main cab body (high-gloss team colour)
    const cabMat = new THREE.MeshPhongMaterial({ color: tc, shininess: 95, specular: 0x444444 });
    const cabMesh = new THREE.Mesh(new THREE.BoxGeometry(cLen, cH, W), cabMat);
    cabMesh.position.set(cX, cH/2, 0); cabMesh.userData.isTruck = true; scene.add(cabMesh);
    // Cab edge highlight
    const cabEdge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(cLen, cH, W)), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 }));
    cabEdge.position.set(cX, cH/2, 0); cabEdge.userData.isTruck = true; scene.add(cabEdge);

    // Roof air deflector — fills the height gap between cab top and trailer top
    const dfH = H - cH, dfLen = cLen * 0.44;
    const defMesh = new THREE.Mesh(new THREE.BoxGeometry(dfLen, dfH, W), new THREE.MeshPhongMaterial({ color: tc, shininess: 95, specular: 0x444444 }));
    defMesh.position.set(-L/2 - dfLen/2, cH + dfH/2, 0); defMesh.userData.isTruck = true; scene.add(defMesh);

    // Chrome front bumper
    const bH = Math.max(cH * 0.12, 22);
    const bump = new THREE.Mesh(new THREE.BoxGeometry(12, bH, W * 1.04), new THREE.MeshPhongMaterial({ color: 0xd8d8d8, shininess: 140, specular: 0xaaaaaa }));
    bump.position.set(cFrX - 6, bH / 2, 0); bump.userData.isTruck = true; scene.add(bump);

    // Dark grille
    const grill = new THREE.Mesh(new THREE.BoxGeometry(8, cH * 0.28, W * 0.68), new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 15 }));
    grill.position.set(cFrX - 4, cH * 0.22, 0); grill.userData.isTruck = true; scene.add(grill);

    // Windshield (recessed from front face, clear blue tint)
    const ws = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.76, cH * 0.36), new THREE.MeshBasicMaterial({ color: 0x9ad4f5, transparent: true, opacity: 0.60, side: THREE.DoubleSide }));
    ws.rotation.y = Math.PI / 2;
    ws.position.set(cFrX + 4, cH * 0.70, 0); ws.userData.isTruck = true; scene.add(ws);

    // Side windows (door glass, both sides)
    [-W/2 - 1, W/2 + 1].forEach((sz, i) => {
      const sw = new THREE.Mesh(new THREE.PlaneGeometry(cLen * 0.44, cH * 0.28), new THREE.MeshBasicMaterial({ color: 0x9ad4f5, transparent: true, opacity: 0.40, side: THREE.DoubleSide }));
      sw.rotation.y = i === 0 ? 0 : Math.PI;
      sw.position.set(cX + cLen * 0.06, cH * 0.67, sz); sw.userData.isTruck = true; scene.add(sw);
    });

    // Headlights (pair)
    const hlMat = new THREE.MeshBasicMaterial({ color: 0xfffde0 });
    [-W * 0.28, W * 0.28].forEach(hz => {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(6, cH * 0.066, cH * 0.050), hlMat);
      hl.position.set(cFrX - 3, cH * 0.54, hz); hl.userData.isTruck = true; scene.add(hl);
    });

    // Side mirrors (arm + head, both sides)
    [-1, 1].forEach(side => {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 18), new THREE.MeshPhongMaterial({ color: 0x333333, shininess: 40 }));
      arm.position.set(cX + cLen * 0.24, cH * 0.83, side * (W/2 + 12)); arm.userData.isTruck = true; scene.add(arm);
      const head = new THREE.Mesh(new THREE.BoxGeometry(14, 20, 7), new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 90 }));
      head.position.set(cX + cLen * 0.24, cH * 0.83, side * (W/2 + 22)); head.userData.isTruck = true; scene.add(head);
    });

    // Entry steps (both sides, below door)
    [-1, 1].forEach(side => {
      const step = new THREE.Mesh(new THREE.BoxGeometry(cLen * 0.24, 10, 26), new THREE.MeshPhongMaterial({ color: 0x555555, shininess: 25 }));
      step.position.set(cX + cLen * 0.1, 16, side * (W/2 + 13)); step.userData.isTruck = true; scene.add(step);
    });
    // Wheels (front steer x2, drive x2, trailer x2)
    const wR = Math.min(H * 0.135, 52), wW = 22;
    const wMat = new THREE.MeshPhongMaterial({ color: 0x111111, shininess: 20 });
    const rMat = new THREE.MeshPhongMaterial({ color: 0x666666, shininess: 60 });
    const wGeo = new THREE.CylinderGeometry(wR, wR, wW, 16);
    const rGeo = new THREE.CylinderGeometry(wR * 0.5, wR * 0.5, wW + 2, 10);
    [[-L/2 - cLen * 0.7, W/2 + wW/2], [-L/2 - cLen * 0.7, -(W/2 + wW/2)],
     [-L/2 - cLen * 0.12, W/2 + wW/2], [-L/2 - cLen * 0.12, -(W/2 + wW/2)],
     [L * 0.34, W/2 + wW/2], [L * 0.34, -(W/2 + wW/2)]].forEach(([wx, wz]) => {
      const wh = new THREE.Mesh(wGeo, wMat); wh.rotation.x = Math.PI / 2;
      wh.position.set(wx, wR, wz); wh.userData.isTruck = true; scene.add(wh);
      const rm = new THREE.Mesh(rGeo, rMat); rm.rotation.x = Math.PI / 2;
      rm.position.set(wx, wR, wz); rm.userData.isTruck = true; scene.add(rm);
    });
    // Chassis beam
    const ch = new THREE.Mesh(new THREE.BoxGeometry(L + cLen, 10, W * 0.14), new THREE.MeshPhongMaterial({ color: 0x222222 }));
    ch.position.set(-cLen/2, wR * 0.45, 0); ch.userData.isTruck = true; scene.add(ch);
  }

  // ===== 3D: BOX FACE LABELS =====
  function addBoxFaceLabels(pos, box, isMatch, isSelected, stepNum) {
    const catHex = '#' + getCategoryColor(box.category).toString(16).padStart(6, '0');
    const bgColor = isMatch ? '#00FF7F' : (isSelected ? '#FFD700' : catHex);
    // Top-face label plane
    const tCvs = document.createElement('canvas'); tCvs.width = 256; tCvs.height = 128;
    const tCtx = tCvs.getContext('2d');
    tCtx.fillStyle = bgColor; tCtx.fillRect(0, 0, 256, 26);
    tCtx.fillStyle = '#111420'; tCtx.fillRect(0, 26, 256, 102);
    if (stepNum != null) {
      tCtx.fillStyle = '#ffffff'; tCtx.beginPath(); tCtx.arc(237, 13, 13, 0, Math.PI * 2); tCtx.fill();
      tCtx.fillStyle = '#000'; tCtx.font = 'bold 14px Arial'; tCtx.textAlign = 'center'; tCtx.textBaseline = 'middle';
      tCtx.fillText(String(stepNum), 237, 13);
    }
    tCtx.fillStyle = '#fff'; tCtx.font = 'bold 25px Arial'; tCtx.textAlign = 'center'; tCtx.textBaseline = 'middle';
    tCtx.fillText((box.name || box.barcode || '').substring(0, 18), 128, 65);
    tCtx.fillStyle = '#888'; tCtx.font = '16px monospace';
    tCtx.fillText(box.barcode || '', 128, 100);
    const topPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.max(box.length * 0.88, 40), Math.max(box.width * 0.88, 25)),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(tCvs), transparent: true, side: THREE.DoubleSide })
    );
    topPlane.rotation.x = -Math.PI / 2;
    topPlane.position.set(pos.x, pos.y + box.height / 2 + 1, pos.z);
    topPlane.userData.isBox = true; topPlane.userData.boxId = box.id;
    scene.add(topPlane);
    // Floating sprite (always faces camera)
    const sCvs = document.createElement('canvas'); sCvs.width = 220; sCvs.height = 78;
    const sCtx = sCvs.getContext('2d');
    sCtx.fillStyle = isMatch ? 'rgba(0,255,127,0.93)' : (isSelected ? 'rgba(255,215,0,0.93)' : 'rgba(20,24,33,0.88)');
    sCtx.beginPath();
    sCtx.moveTo(10,0); sCtx.lineTo(210,0); sCtx.arcTo(220,0,220,10,10);
    sCtx.lineTo(220,68); sCtx.arcTo(220,78,210,78,10);
    sCtx.lineTo(10,78); sCtx.arcTo(0,78,0,68,10);
    sCtx.lineTo(0,10); sCtx.arcTo(0,0,10,0,10);
    sCtx.closePath(); sCtx.fill();
    sCtx.strokeStyle = isMatch ? '#00cc60' : (isSelected ? '#ccaa00' : 'rgba(255,255,255,0.18)');
    sCtx.lineWidth = 2; sCtx.stroke();
    sCtx.fillStyle = (isMatch || isSelected) ? '#000' : '#fff';
    sCtx.font = 'bold 21px Arial'; sCtx.textAlign = 'center'; sCtx.textBaseline = 'middle';
    sCtx.fillText((box.name || box.barcode || '').substring(0, 16), 110, 29);
    sCtx.fillStyle = (isMatch || isSelected) ? '#333' : '#aaa'; sCtx.font = '14px monospace';
    sCtx.fillText((box.barcode || '') + (box.max_weight_kg ? '  ' + box.max_weight_kg + 'kg' : ''), 110, 57);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(sCvs), transparent: true }));
    const scW = Math.max(box.length * 0.72, 55);
    sprite.scale.set(scW, scW * 0.37, 1);
    sprite.position.set(pos.x, pos.y + box.height / 2 + 18, pos.z);
    sprite.userData.isBox = true; sprite.userData.boxId = box.id;
    scene.add(sprite);
  }

  // ===== 3D: CAMERA PRESETS =====
  const CAMERA_PRESETS = {
    iso:    { dist: 1000, theta: 0.8,          phi: 0.9 },
    top:    { dist: 1000, theta: Math.PI / 2,  phi: 0.05 },
    front:  { dist: 900,  theta: -Math.PI / 2, phi: Math.PI / 2 },
    side:   { dist: 900,  theta: Math.PI,      phi: Math.PI / 2 },
    inside: { special: 'inside' }
  };

  function setCameraPreset(name) {
    const preset = CAMERA_PRESETS[name]; if (!preset) return;
    document.querySelectorAll('.cam-preset-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById('camBtn' + name.charAt(0).toUpperCase() + name.slice(1));
    if (btn) btn.classList.add('active');
    if (preset.special === 'inside') {
      const truck = getTruck();
      const tL = truck ? truck.length : 600, tH = truck ? truck.height : 250;
      if (camera) {
        camera.position.set(tL * 0.36, tH * 0.45, 0);
        camera.lookAt(-tL * 0.38, tH * 0.38, 0);
        cameraTarget = null;
      }
      return;
    }
    cameraTarget = { dist: preset.dist, theta: preset.theta, phi: preset.phi };
  }

  // ===== 3D: OVERLAYS =====
  function update3DOverlays() {
    const truck = getTruck();
    const pl = currentLoad.placements || [];
    // Category inspector (left rail)
    buildCatInspector();
    // Utilisation chip
    const utilEl = document.getElementById('utilisation3D');
    if (utilEl) {
      if (pl.length > 0 && truck) {
        const tVol = (truck.length||1) * (truck.height||1) * (truck.width||1);
        const uVol = pl.reduce((s,p)=>{ const b=getBox(p.boxId); return b?s+(b.length||0)*(b.height||0)*(b.width||0):s; },0);
        const uWt  = pl.reduce((s,p)=>{ const b=getBox(p.boxId); return b?s+(b.max_weight_kg||0):s; },0);
        const pct  = Math.min(100, Math.round((uVol/tVol)*100));
        const freeM = (((tVol-uVol)/((truck.height||1)*(truck.width||1)))/100).toFixed(1);
        utilEl.innerHTML = '<span class="util-sub">Space Used</span><span class="util-val">'+pct+'%</span><span class="util-sub">'+(uWt/1000).toFixed(1)+'t &nbsp;&middot;&nbsp; '+freeM+'m free</span>';
        utilEl.style.display = 'block';
      } else { utilEl.style.display = 'none'; }
    }
    // Category legend
    const legEl = document.getElementById('legend3D');
    if (legEl) {
      const cats = [...new Set(pl.map(p=>{ const b=getBox(p.boxId); return b?(b.category||'other'):null; }).filter(Boolean))];
      if (cats.length > 0) {
        const nm = { tools:'Tools',spares:'Spares',tyres:'Tyres',fuel:'Fuel',equipment:'Equipment',personal:'Personal',other:'Other',container:'Container' };
        legEl.innerHTML = '<div class="leg-title">Categories</div>' + cats.map(c=>'<div class="leg-item"><span class="leg-swatch" style="background:#'+getCategoryColor(c).toString(16).padStart(6,'0')+'"></span><span>'+(nm[c]||c)+'</span></div>').join('');
        legEl.style.display = 'block';
      } else { legEl.style.display = 'none'; }
    }
    // Weight balance bar
    if (truck && pl.length > 0) {
      const bar = document.getElementById('weightBalanceBar');
      if (bar) {
        const fW = pl.filter(p=>parseInt((p.zone||'').replace('grid-',''))<=4).reduce((s,p)=>{ const b=getBox(p.boxId); return b?s+(b.max_weight_kg||0):s; },0);
        const rW = pl.filter(p=>parseInt((p.zone||'').replace('grid-',''))>4).reduce((s,p)=>{ const b=getBox(p.boxId); return b?s+(b.max_weight_kg||0):s; },0);
        const tot = fW + rW || 1;
        const ff = bar.querySelector('.wbb-front'), rf = bar.querySelector('.wbb-rear');
        if (ff) ff.style.width = Math.round((fW/tot)*100)+'%';
        if (rf) rf.style.width = Math.round((rW/tot)*100)+'%';
        const legs = bar.querySelectorAll('.wbb-legend span');
        if (legs[0]) legs[0].innerHTML = '<span class="dot" style="background:#1a73e8"></span>Front: '+fW+'kg';
        if (legs[1]) legs[1].innerHTML = '<span class="dot" style="background:#ea4335"></span>Rear: '+rW+'kg';
        if (currentView === '3D') bar.classList.add('show');
      }
    }
  }

  // ===== 3D: SELECTED BOX PANEL =====
  function show3DSelectedPanel(boxId) {
    const panel = document.getElementById('selected3DPanel'); if (!panel) return;
    const box = getBox(boxId); if (!box) { hide3DSelectedPanel(); return; }
    const nEl = document.getElementById('sel3DName'); if (nEl) nEl.textContent = box.name || box.barcode || 'Box';
    const iEl = document.getElementById('sel3DInfo');
    if (iEl) {
      const p = currentLoad.placements.find(p => p.boxId === boxId);
      iEl.textContent = [box.barcode, box.length?box.length+'x'+box.width+'x'+box.height+'cm':'', box.max_weight_kg?box.max_weight_kg+'kg':'', p?p.zone.replace('grid-','Zone '):'' ].filter(Boolean).join(' · ');
    }
    const rBtn = document.getElementById('sel3DRemoveBtn');
    if (rBtn) rBtn.onclick = () => {
      const b = boxes.find(bx => String(bx.id) === String(boxId));
      rflShow('box', boxId, b ? (b.name || b.barcode || boxId) : boxId);
      selected3DBoxId = null; hide3DSelectedPanel();
    };
    panel.style.display = 'block';
  }

  function hide3DSelectedPanel() {
    const p = document.getElementById('selected3DPanel'); if (p) p.style.display = 'none';
  }

  // ===== 3D: HOVER TOOLTIP =====
  function setup3DHoverTooltip() {
    const canvas = document.getElementById('truckCanvas');
    const tip = document.getElementById('tooltip3D');
    if (!canvas || !tip) return;
    let hTimer = null;
    canvas.addEventListener('mousemove', e => {
      if (isDragging || !scene || !camera) { tip.style.display = 'none'; return; }
      clearTimeout(hTimer);
      hTimer = setTimeout(() => {
        const rect = canvas.getBoundingClientRect();
        const rc = new THREE.Raycaster();
        rc.setFromCamera(new THREE.Vector2(((e.clientX-rect.left)/rect.width)*2-1, -((e.clientY-rect.top)/rect.height)*2+1), camera);
        const hits = rc.intersectObjects(scene.children, false).filter(h => h.object.userData && h.object.userData.isBox && h.object.userData.boxId);
        if (hits.length > 0) {
          const box = getBox(hits[0].object.userData.boxId);
          if (box) {
            const pl = currentLoad.placements.find(p => p.boxId === hits[0].object.userData.boxId);
            const items = (box.contentsItems || []).length;
            tip.innerHTML = '<div class="tt-name">'+(box.name||box.barcode||'Box')+'</div>'+
              (box.barcode?'<div class="tt-detail">'+box.barcode+'</div>':'')+
              (box.length?'<div class="tt-detail">'+box.length+' x '+box.width+' x '+box.height+' cm</div>':'')+
              (box.max_weight_kg?'<div class="tt-detail">'+box.max_weight_kg+' kg</div>':'')+
              (pl?'<div class="tt-detail">'+pl.zone.replace('grid-','Zone ')+'</div>':'')+
              (items>0?'<div class="tt-detail">'+items+' item'+(items!==1?'s':'')+' inside</div>':'');
            const cont = canvas.parentElement.getBoundingClientRect();
            let lx = e.clientX - cont.left + 14, ly = e.clientY - cont.top - 10;
            if (lx + 215 > cont.width) lx = e.clientX - cont.left - 220;
            tip.style.left = lx+'px'; tip.style.top = ly+'px'; tip.style.display = 'block';
            return;
          }
        }
        tip.style.display = 'none';
      }, 80);
    });
    canvas.addEventListener('mouseleave', () => { clearTimeout(hTimer); tip.style.display = 'none'; });
  }

  // ===== 3D: STEP-BY-STEP MODE =====
  let stepMode3D = false, currentStep3D = 0, stepPlayback3D = null;

  function enterStepMode() {
    if (!currentLoad.placements || !currentLoad.placements.length) { alert('No boxes placed yet.'); return; }
    if (currentView !== '3D') { switchView('3D'); setTimeout(enterStepMode, 300); return; }
    stepMode3D = true; currentStep3D = 0;
    const bar = document.getElementById('stepBar3D'); if (bar) bar.style.display = 'flex';
    const btn = document.getElementById('btnStepMode'); if (btn) btn.classList.add('active');
    updateStepBar3D(); renderStep3D(0);
  }

  function exitStepMode() {
    stepMode3D = false; clearInterval(stepPlayback3D); stepPlayback3D = null;
    const bar = document.getElementById('stepBar3D'); if (bar) bar.style.display = 'none';
    const btn = document.getElementById('btnStepMode'); if (btn) btn.classList.remove('active');
    const ic = document.getElementById('stepPlayIcon'); if (ic) ic.innerHTML = '<path d="M6 4l12 6-12 6z"/>';
    render3DWithSearch(currentSearchTerm);
  }

  function updateStepBar3D() {
    const n = currentLoad.placements.length, pl = currentLoad.placements[currentStep3D];
    const box = pl ? getBox(pl.boxId) : null;
    const cEl = document.getElementById('stepCounter3D'); if (cEl) cEl.textContent = 'Step '+(currentStep3D+1)+' / '+n;
    const nEl = document.getElementById('stepBoxName3D'); if (nEl) nEl.textContent = box ? (box.name||box.barcode||'Box') : '';
    const zEl = document.getElementById('stepBoxZone3D'); if (zEl) zEl.textContent = pl ? pl.zone.replace('grid-','Zone ') : '';
  }

  function renderStep3D(n) {
    if (!scene) return;
    scene.children.filter(c => c.userData && c.userData.isBox).forEach(c => scene.remove(c));
    const truck = getTruck(); if (!truck) return;
    currentLoad.placements.forEach((pl, idx) => {
      const box = getBox(pl.boxId); if (!box) return;
      const isCur = idx === n, isFut = idx > n;
      const bMesh = new THREE.Mesh(
        new THREE.BoxGeometry(box.length, box.height, box.width),
        new THREE.MeshPhongMaterial({ color: isFut?0x444444:(isCur?0xFFD700:getBoxStackColor(pl)), transparent:isFut, opacity:isFut?0.12:1, shininess:isCur?120:30 })
      );
      bMesh.userData.isBox = true; bMesh.userData.boxId = box.id;
      const pos = calculatePositionIn3D(pl, box, truck);
      bMesh.position.set(pos.x, pos.y, pos.z); scene.add(bMesh);
      if (!isFut) {
        const eMesh = new THREE.LineSegments(
          new THREE.EdgesGeometry(new THREE.BoxGeometry(box.length, box.height, box.width)),
          new THREE.LineBasicMaterial({ color: isCur?0xffffff:0x000000, linewidth: isCur?3:1 })
        );
        eMesh.position.copy(bMesh.position); eMesh.userData.isBox = true; scene.add(eMesh);
        addBoxFaceLabels(pos, box, false, isCur, idx + 1);
      }
      if (isCur) {
        const gMesh = new THREE.Mesh(
          new THREE.BoxGeometry(box.length+10, box.height+10, box.width+10),
          new THREE.MeshBasicMaterial({ color: 0xFFD700, transparent:true, opacity:0.22, wireframe:true })
        );
        gMesh.position.copy(bMesh.position); gMesh.userData.isBox = true; scene.add(gMesh);
      }
    });
    if (renderer) renderer.render(scene, camera);
  }

  function stepNext() { if (!stepMode3D||currentStep3D>=currentLoad.placements.length-1) return; currentStep3D++; updateStepBar3D(); renderStep3D(currentStep3D); }
  function stepPrev() { if (!stepMode3D||currentStep3D<=0) return; currentStep3D--; updateStepBar3D(); renderStep3D(currentStep3D); }

  function togglePlayback() {
    if (stepPlayback3D) {
      clearInterval(stepPlayback3D); stepPlayback3D = null;
      const ic = document.getElementById('stepPlayIcon'); if (ic) ic.innerHTML = '<path d="M6 4l12 6-12 6z"/>';
    } else {
      const ic = document.getElementById('stepPlayIcon'); if (ic) ic.innerHTML = '<rect x="4" y="4" width="4" height="12"/><rect x="12" y="4" width="4" height="12"/>';
      stepPlayback3D = setInterval(() => {
        if (currentStep3D < currentLoad.placements.length - 1) { currentStep3D++; updateStepBar3D(); renderStep3D(currentStep3D); }
        else { clearInterval(stepPlayback3D); stepPlayback3D = null; const ic2 = document.getElementById('stepPlayIcon'); if (ic2) ic2.innerHTML = '<path d="M6 4l12 6-12 6z"/>'; }
      }, 2000);
    }
  }

  // ===== 3D: SCREENSHOT =====
  function screenshot3D() {
    if (!renderer || !scene || !camera) return;
    renderer.render(scene, camera);
    const a = document.createElement('a');
    const truck = getTruck();
    a.download = 'load-plan-' + (truck ? truck.name.replace(/[^a-z0-9]/gi,'-').toLowerCase() : 'truck') + '-' + new Date().toISOString().slice(0,10) + '.png';
    a.href = renderer.domElement.toDataURL('image/png'); a.click();
  }

  // ===== 3D: PRINT 4-VIEW =====
  function print4View() {
    if (!renderer || !scene || !camera) return;
    const sD = cameraDistance, sT = cameraRotation.theta, sP = cameraRotation.phi;
    const imgs = [];
    ['iso','top','front','side'].forEach(name => {
      const p = CAMERA_PRESETS[name]; if (!p || p.special) return;
      cameraDistance = p.dist; cameraRotation.theta = p.theta; cameraRotation.phi = p.phi;
      updateCameraPosition(); renderer.render(scene, camera);
      imgs.push({ name: name.charAt(0).toUpperCase()+name.slice(1), src: renderer.domElement.toDataURL('image/png') });
    });
    cameraDistance = sD; cameraRotation.theta = sT; cameraRotation.phi = sP; updateCameraPosition();
    const truck = getTruck(), pl = currentLoad.placements || [];
    const rows = pl.map((p,i)=>{ const b=getBox(p.boxId); if (!b) return ''; return '<tr><td>'+(i+1)+'</td><td>'+(b.barcode||'')+'</td><td>'+(b.name||'')+'</td><td>'+p.zone.replace('grid-','Zone ')+'</td><td>'+(b.max_weight_kg||'&mdash;')+' kg</td></tr>'; }).join('');
    const win = window.open('','_blank'); if (!win) return;
    win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Load Plan</title><style>'+
      'body{font-family:Arial,sans-serif;margin:0;padding:16px;color:#000}'+
      '.g{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}'+
      '.vc{border:1px solid #ddd;border-radius:4px;overflow:hidden;position:relative}'+
      '.vc img{width:100%;display:block}.vl{position:absolute;top:5px;left:7px;background:rgba(0,0,0,.55);color:#fff;font-size:8pt;font-weight:700;padding:2px 6px;border-radius:3px}'+
      'h1{font-size:14pt;margin:0 0 3px}p.s{color:#666;font-size:8.5pt;margin:0 0 12px}'+
      'table{width:100%;border-collapse:collapse;font-size:8.5pt}th{background:#1a1d24;color:#fff;padding:4px 7px;text-align:left}'+
      'td{padding:3px 7px;border-bottom:1px solid #eee}tr:nth-child(even)td{background:#f9f9f9}'+
      '@media print{@page{margin:10mm;size:A4}}</style></head><body>');
    win.document.write('<h1>Load Plan &mdash; '+(truck?truck.name:'Truck')+'</h1><p class="s">'+(new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}))+' &nbsp;|&nbsp; '+pl.length+' boxes loaded</p>');
    win.document.write('<div class="g">'+imgs.map(img=>'<div class="vc"><img src="'+img.src+'"/><span class="vl">'+img.name+'</span></div>').join('')+'</div>');
    win.document.write('<table><thead><tr><th>#</th><th>Barcode</th><th>Name</th><th>Zone</th><th>Weight</th></tr></thead><tbody>'+rows+'</tbody></table>');
    win.document.write('</body></html>'); win.document.close(); setTimeout(()=>win.print(),500);
  }

  // ===================================================================
  // ===== CATEGORY INSPECTOR (EasyCargo-style left-rail panel) ========
  // ===================================================================
  let catFilterActive = null; // null = all, string = category name

  const CAT_NAMES = { tools:'Tools', spares:'Spares', tyres:'Tyres', fuel:'Fuel', equipment:'Equipment', personal:'Personal', other:'Other', container:'Container' };

  function buildCatInspector() {
    const inspector = document.getElementById('catInspector');
    if (!inspector) return;
    if (currentView !== '3D') { inspector.style.display = 'none'; return; }
    const pl = currentLoad.placements || [];
    if (pl.length === 0) { inspector.style.display = 'none'; return; }
    if (selected3DBoxId) { _buildPileInspector(inspector); return; }

    // Collect stats per category
    const catMap = {};
    pl.forEach(p => {
      const b = getBox(p.boxId); if (!b) return;
      const cat = b.category || 'other';
      if (!catMap[cat]) catMap[cat] = { count: 0, weight: 0, vol: 0, boxes: [] };
      catMap[cat].count++;
      catMap[cat].weight += parseFloat(b.max_weight_kg) || 0;
      catMap[cat].vol += (b.length||0) * (b.height||0) * (b.width||0);
      catMap[cat].boxes.push({
        id: b.id,
        name: esc(b.name || b.barcode || 'Box'),
        dims: b.length ? b.length+'×'+b.width+'×'+b.height+'cm' : '',
        wt: b.max_weight_kg ? b.max_weight_kg+'kg' : '',
        zone: p.zone ? p.zone.replace('grid-','Zone ') : ''
      });
    });

    const cats = Object.keys(catMap);
    if (cats.length === 0) { inspector.style.display = 'none'; return; }

    // Build tabs column
    let tabsHtml = '<div class="ci-tabs">';
    // "All" tab
    tabsHtml += `<div class="ci-tab all-tab${!catFilterActive?' active':''}" onclick="LoadEngine.selectCatFilter(null)" title="All (${pl.length})"><div class="ci-tab-swatch"></div><div class="ci-tab-count">${pl.length}</div></div>`;
    tabsHtml += '<div class="ci-sep"></div>';
    cats.forEach(cat => {
      const hex = '#' + getCategoryColor(cat).toString(16).padStart(6, '0');
      tabsHtml += `<div class="ci-tab${catFilterActive===cat?' active':''}" onclick="LoadEngine.selectCatFilter('${cat}')" title="${CAT_NAMES[cat]||cat} (${catMap[cat].count})" style=""><div class="ci-tab-swatch" style="background:${hex}"></div><div class="ci-tab-count">${catMap[cat].count}</div></div>`;
    });
    tabsHtml += '</div>';

    // Build detail panel (only when filter active)
    let detailHtml = '';
    if (catFilterActive && catMap[catFilterActive]) {
      const d = catMap[catFilterActive];
      const hex = '#' + getCategoryColor(catFilterActive).toString(16).padStart(6, '0');
      const nm = CAT_NAMES[catFilterActive] || catFilterActive;
      detailHtml =
        `<div class="ci-detail">` +
        `<div class="ci-det-title"><div class="ci-det-swatch" style="background:${hex}"></div>${nm}</div>` +
        `<div class="ci-det-stat"><span>Boxes</span><strong>${d.count}</strong></div>` +
        `<div class="ci-det-stat"><span>Total weight</span><strong>${Math.round(d.weight)} kg</strong></div>` +
        `<div class="ci-det-stat"><span>Volume</span><strong>${(d.vol/1000000).toFixed(2)} m³</strong></div>` +
        `<hr class="ci-det-sep">` +
        (d.boxes.length
          ? d.boxes.map(bx =>
              `<div class="ci-det-box" onclick="LoadEngine.jumpTo3DBox('${bx.id}')">` +
              `<div class="ci-det-box-name">${bx.name}</div>` +
              `<div class="ci-det-box-sub">${[bx.dims,bx.wt,bx.zone].filter(Boolean).join(' · ')}</div>` +
              `</div>`
            ).join('')
          : `<div class="ci-det-empty">No boxes</div>`
        ) +
        `</div>`;
    }

    inspector.innerHTML = tabsHtml + detailHtml;
    inspector.style.display = 'flex';
  }

  function selectCatFilter(cat) {
    // Toggle: clicking the active category clears filter
    catFilterActive = (catFilterActive === cat) ? null : cat;
    buildCatInspector();
    render3DWithSearch(currentSearchTerm);
  }

  function jumpTo3DBox(boxId) {
    selected3DBoxId = String(boxId);
    show3DSelectedPanel(String(boxId));
    render3DWithSearch(currentSearchTerm);
  }

  // ===== PILE INSPECTOR helpers =====

  function _getPileBoxes(boxId) {
    const truck = getTruck(); if (!truck) return [];
    const selPl  = currentLoad.placements.find(p => String(p.boxId) === String(boxId));
    const selBox = getBox(boxId);
    if (!selPl || !selBox) return [];
    const selPos = calculatePositionIn3D(selPl, selBox, truck);
    const sL2 = (selBox.length || 10) / 2;
    const sW2 = (selBox.width  || 10) / 2;
    const pile = [];
    currentLoad.placements.forEach(pl => {
      const b = getBox(pl.boxId); if (!b) return;
      const pos = calculatePositionIn3D(pl, b, truck);
      const bL2 = (b.length || 10) / 2;
      const bW2 = (b.width  || 10) / 2;
      if (Math.abs(selPos.x - pos.x) < sL2 + bL2 - 1 &&
          Math.abs(selPos.z - pos.z) < sW2 + bW2 - 1) {
        pile.push({ pl, box: b, pos });
      }
    });
    pile.sort((a, b) => b.pos.y - a.pos.y); // top-first (highest Y = index 0)
    return pile;
  }

  // Position-based palette: index 0 = bottom of stack, ascending upwards
  var PILE_LEVEL_COLORS = ['#e8453c','#ff9800','#fdd663','#81c995','#4ecdc4','#78d9ec','#aecbfa','#d7aefb'];

  function _buildPileInspector(inspector) {
    const pile = _getPileBoxes(selected3DBoxId);
    if (pile.length === 0) {
      // Isolated box — fall through to category rail (strip dispatcher then re-call)
      if (selected3DBoxId) {
        inspector.innerHTML = '';
        inspector.style.display = 'none';
      }
      return;
    }
    let html = '<div class="ci-pile-panel">';
    html += '<div class="ci-pile-header"><span>Stack &mdash; ' + pile.length + ' box' + (pile.length !== 1 ? 'es' : '') + '</span>' +
      '<button class="ci-pile-back" onclick="LoadEngine.clearBoxSelection()" title="Back to categories">&#10005;</button></div>';
    pile.forEach(function(item, idx) {
      var b   = item.box;
      var bid = String(b.id);
      var isSelected = bid === String(selected3DBoxId);
      // Use same array-index ordering as getBoxStackColor so panel colours match 3D boxes
      var zoneId = item.pl.zone;
      var zonePl = currentLoad.placements.filter(function(p) { return p.zone === zoneId && p.type !== 'asset' && p.type !== 'inventory'; });
      var arrIdx = zonePl.indexOf(item.pl);
      var sc  = getStackLevelColors(arrIdx >= 0 ? arrIdx : 0);
      var hex = sc.solid;
      var nm  = esc(b.name || b.barcode || 'Box');
      var wt  = b.max_weight_kg ? b.max_weight_kg + ' kg' : '';
      var kartCount = (b.boxType === 'kart_stand') ? Math.min(2, (b.contentsItems || []).length) : -1;
      var kartBadge = kartCount >= 0
        ? ' <span style="font-size:.6rem;font-weight:700;color:#1565c0;background:#e3f2fd;border:1px solid #90caf9;padding:1px 4px;border-radius:3px;">🏎️' + (kartCount > 0 ? ' ' + kartCount + 'k' : ' empty') + '</span>'
        : '';
      var canUp   = idx > 0;
      var canDown = idx < pile.length - 1;
      // Inline colour styles: row border = stack colour, header bg = solid tint, detail bg = lighter tint
      var rowStyle  = 'border-left:3px solid ' + hex + ';';
      var headStyle = 'background:' + hex + '33;';
      var detStyle  = 'background:' + hex + '18;border-top:1px solid ' + hex + '44;';
      html += '<div class="ci-pile-row' + (isSelected ? ' selected' : '') + '" style="' + rowStyle + '">';
      html += '<div class="ci-pile-row-main" style="' + headStyle + '" onclick="LoadEngine.jumpTo3DBox(\'' + bid + '\')">'
        + '<div class="ci-pile-swatch" style="background:' + hex + '"></div>'
        + '<div class="ci-pile-name">' + nm + kartBadge + '</div>'
        + (wt ? '<div class="ci-pile-wt">' + wt + '</div>' : '')
        + '<div class="ci-pile-arrows">'
        + '<button class="ci-pile-arr"' + (canUp   ? '' : ' disabled') + ' title="Move up in stack"   onclick="event.stopPropagation();LoadEngine.movePileBox(\'' + bid + '\',\'up\')">&#9650;</button>'
        + '<button class="ci-pile-arr"' + (canDown ? '' : ' disabled') + ' title="Move down in stack" onclick="event.stopPropagation();LoadEngine.movePileBox(\'' + bid + '\',\'down\')">&#9660;</button>'
        + '</div>'
        + '<button class="ci-pile-tab" style="background:' + hex + '22;border-left:3px solid ' + hex + '" data-box="' + bid + '" onclick="event.stopPropagation();LoadEngine.togglePileBoxDetail(\'' + bid + '\')" title="Properties">'
        + '<svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 2l4 3-4 3"/></svg>'
        + '</button>';
      html += '</div>'; // row-main
      html += '<div class="ci-pile-detail" data-box="' + bid + '" style="' + detStyle + '">';
      if (b.length)        html += '<div class="ci-pile-det-row"><span>Dimensions</span><strong>' + b.length + '&times;' + b.width + '&times;' + b.height + '&thinsp;cm</strong></div>';
      if (b.max_weight_kg) html += '<div class="ci-pile-det-row"><span>Weight</span><strong>' + b.max_weight_kg + '&thinsp;kg</strong></div>';
      if (b.category)      html += '<div class="ci-pile-det-row"><span>Category</span><strong>' + esc(CAT_NAMES[b.category] || b.category) + '</strong></div>';
      if (item.pl.zone)    html += '<div class="ci-pile-det-row"><span>Zone</span><strong>' + esc(item.pl.zone.replace('grid-', 'Zone ')) + '</strong></div>';
      var contentsItems = b.contentsItems || [];
      var contentsStr   = b.contents || '';
      if (contentsItems.length > 0) {
        html += '<div class="ci-pile-det-contents"><div class="ci-pile-det-contents-title">Contents (' + contentsItems.length + ')</div>';
        contentsItems.forEach(function(ci) { html += '<div class="ci-pile-det-item">' + esc(ci.barcode || '') + (ci.name ? ' &mdash; ' + esc(ci.name) : '') + '</div>'; });
        html += '</div>';
      } else if (contentsStr) {
        html += '<div class="ci-pile-det-contents"><div class="ci-pile-det-contents-title">Contents</div><div class="ci-pile-det-item">' + esc(contentsStr) + '</div></div>';
      }
      html += '</div>'; // detail
      html += '</div>'; // row
    });
    html += '</div>'; // pile-panel
    inspector.innerHTML = html;
    inspector.style.display = 'flex';
  }

  function togglePileBoxDetail(boxId) {
    var bid = String(boxId);
    document.querySelectorAll('.ci-pile-detail.open').forEach(function(el)  { if (el.dataset.box  !== bid) el.classList.remove('open'); });
    document.querySelectorAll('.ci-pile-tab.open').forEach(function(btn)    { if (btn.dataset.box !== bid) btn.classList.remove('open'); });
    var det = document.querySelector('.ci-pile-detail[data-box="' + bid + '"]');
    if (det) det.classList.toggle('open');
    var tab = document.querySelector('.ci-pile-tab[data-box="' + bid + '"]');
    if (tab) tab.classList.toggle('open');
  }

  function movePileBox(boxId, dir) {
    var truck = getTruck(); if (!truck) return;
    var pile = _getPileBoxes(boxId); // top-first: index 0 = highest box
    var pileIdx = pile.findIndex(function(item) { return String(item.box.id) === String(boxId); });
    if (pileIdx < 0) return;
    var swapPileIdx = dir === 'up' ? pileIdx - 1 : pileIdx + 1;
    if (swapPileIdx < 0 || swapPileIdx >= pile.length) return;

    // Find the actual placement objects in the main array
    var plA = pile[pileIdx].pl;
    var plB = pile[swapPileIdx].pl;
    var idxA = currentLoad.placements.indexOf(plA);
    var idxB = currentLoad.placements.indexOf(plB);
    if (idxA < 0 || idxB < 0) return;

    // Swap their positions in the main array so array-order = visual stack order
    currentLoad.placements[idxA] = plB;
    currentLoad.placements[idxB] = plA;

    // calculatePositionIn3D now recalculates Y from array order for all non-auto-packed
    // boxes, so no explicit _y update is needed for those. For auto-packed boxes
    // (_y is used directly via early return), recompute _y in new array order.
    var zoneId = plA.zone;
    var floor = 0;
    currentLoad.placements.forEach(function(pl) {
      if (pl.zone !== zoneId) return;
      var b = getBox(pl.boxId); if (!b) return;
      var bh = b.height || 10;
      if (pl.autoPackedAt) { pl._y = floor + bh / 2; }
      floor += bh;
    });

    currentLoad.updatedAt = new Date().toISOString();
    saveData();
    render3DWithSearch(currentSearchTerm);
  }

  function clearBoxSelection() {
    selected3DBoxId = null;
    hide3DSelectedPanel();
    render3DWithSearch(currentSearchTerm);
  }

  // ===================================================================
  // ===== AUTO-PACK ENGINE (3D Bin-Packing / Height-Map Algorithm) ====
  // ===================================================================
  let apRules = { heavyLow: true, balanced: true, rotate: true, byCategory: false };
  let apPreviewResult = null; // packed items from last run, pending apply

  function showAutoPackPanel() {
    if (currentView !== '3D') { switchView('3D'); setTimeout(showAutoPackPanel, 300); return; }
    const panel = document.getElementById('autoPackPanel'); if (!panel) return;
    // Recalculate stats for panel
    const truck = getTruck();
    const unplacedBoxes = boxes.filter(b => b.length && b.width && b.height &&
      !currentLoad.placements.some(p => p.boxId === b.id));
    const placedCount = currentLoad.placements.length;
    const tVol = truck ? (truck.length||600)*(truck.height||250)*(truck.width||240) : 1;
    const usedVol = currentLoad.placements.reduce((s,p) => {
      const b = getBox(p.boxId); return b ? s + (b.length||0)*(b.height||0)*(b.width||0) : s;
    }, 0);
    const newVol = unplacedBoxes.reduce((s,b) => s + (b.length||0)*(b.height||0)*(b.width||0), 0);
    const projPct = Math.min(100, Math.round(((usedVol + newVol) / tVol) * 100));
    const statsEl = document.getElementById('autoPackStats');
    if (statsEl) {
      statsEl.innerHTML =
        '<div class="ap-stat"><span class="ap-stat-label">Already placed</span><span class="ap-stat-val">' + placedCount + ' boxes</span></div>' +
        '<div class="ap-stat"><span class="ap-stat-label">Boxes to pack</span><span class="ap-stat-val ' + (unplacedBoxes.length ? 'good' : 'warn') + '">' + unplacedBoxes.length + ' boxes</span></div>' +
        '<div class="ap-stat"><span class="ap-stat-label">Projected utilisation</span><span class="ap-stat-val ' + (projPct > 85 ? 'good' : projPct > 60 ? 'warn' : 'bad') + '">' + projPct + '%</span></div>';
    }
    // Sync rule buttons
    ['heavyLow','balanced','rotate','byCategory'].forEach(r => {
      const btn = document.getElementById('apRule' + r.charAt(0).toUpperCase() + r.slice(1));
      if (btn) btn.classList.toggle('active', !!apRules[r]);
    });
    apPreviewResult = null;
    panel.style.display = 'block';
  }

  function hideAutoPackPanel() {
    const panel = document.getElementById('autoPackPanel'); if (panel) panel.style.display = 'none';
    // If we were showing a preview, restore normal render
    if (apPreviewResult) { apPreviewResult = null; render3DWithSearch(currentSearchTerm); }
  }

  function togglePackRule(rule) {
    apRules[rule] = !apRules[rule];
    const btn = document.getElementById('apRule' + rule.charAt(0).toUpperCase() + rule.slice(1));
    if (btn) btn.classList.toggle('active', apRules[rule]);
  }

  async function runAutoPack() {
    const truck = getTruck();
    if (!truck) { alert('No truck selected.'); return; }

    const btn = document.querySelector('#autoPackPanel .ap-btn-apply');
    const prog = document.getElementById('autoPackProgress');
    const progBar = document.getElementById('autoPackProgressBar');
    if (btn) { btn.textContent = 'Calculating...'; btn.disabled = true; }
    if (prog) prog.style.display = 'block';
    if (progBar) progBar.style.width = '10%';

    // Small delay to let UI update
    await new Promise(r => setTimeout(r, 30));

    const L = truck.length || 600;
    const H = truck.height || 250;
    const W = truck.width || 240;
    const GRID = 10; // 10cm grid resolution
    const nx = Math.ceil(L / GRID);
    const nz = Math.ceil(W / GRID);

    // Height map: for each (xi, zi) cell, current fill height
    const heightMap = [];
    for (let i = 0; i < nx; i++) { heightMap.push(new Float32Array(nz)); }

    // Get boxes to pack (unplaced with dimensions)
    let toPack = boxes.filter(b =>
      b.length && b.width && b.height &&
      !currentLoad.placements.some(p => p.boxId === b.id)
    );

    if (!toPack.length) {
      if (btn) { btn.textContent = '▶ Calculate & Preview'; btn.disabled = false; }
      if (prog) prog.style.display = 'none';
      const statsEl = document.getElementById('autoPackStats');
      if (statsEl) statsEl.innerHTML = '<div class="ap-stat"><span class="ap-stat-label" style="color:#fdd663">No unplaced boxes to pack</span></div>';
      return;
    }

    // Sort: by category group if rule on, then heaviest first (for stability), then largest volume
    if (apRules.byCategory) {
      const catOrder = ['tyres','equipment','spares','tools','personal','fuel','container','other'];
      toPack.sort((a, b) => {
        const ca = catOrder.indexOf(a.category||'other'), cb = catOrder.indexOf(b.category||'other');
        if (ca !== cb) return ca - cb;
        if (apRules.heavyLow) return (parseFloat(b.max_weight_kg)||0) - (parseFloat(a.max_weight_kg)||0);
        return ((b.length||0)*(b.width||0)*(b.height||0)) - ((a.length||0)*(a.width||0)*(a.height||0));
      });
    } else {
      toPack.sort((a, b) => {
        // Heaviest first if rule on (heavy items go at bottom = find lower placements first)
        if (apRules.heavyLow) {
          const wDiff = (parseFloat(b.max_weight_kg)||0) - (parseFloat(a.max_weight_kg)||0);
          if (Math.abs(wDiff) > 5) return wDiff;
        }
        // Then by volume descending (large boxes are harder to fit, place first)
        return ((b.length||0)*(b.width||0)*(b.height||0)) - ((a.length||0)*(a.width||0)*(a.height||0));
      });
    }

    // For front/rear balance: split truck into two halves
    // If balanced rule is on, alternate placing heavy items front vs rear
    let frontWeight = 0, rearWeight = 0;

    const packed = [];
    const failed = [];
    const total = toPack.length;

    for (let bi = 0; bi < toPack.length; bi++) {
      const box = toPack[bi];
      if (progBar) progBar.style.width = Math.round(10 + (bi / total) * 80) + '%';
      if (bi % 5 === 0) await new Promise(r => setTimeout(r, 0)); // yield to UI

      const bh = Math.max(1, box.height);
      const w = parseFloat(box.max_weight_kg) || 0;

      // Orientations to try
      const orientations = [
        { bl: Math.max(1, Math.ceil(box.length / GRID)), bw: Math.max(1, Math.ceil(box.width / GRID)), rotated: false }
      ];
      if (apRules.rotate && box.length !== box.width) {
        orientations.push({ bl: Math.max(1, Math.ceil(box.width / GRID)), bw: Math.max(1, Math.ceil(box.length / GRID)), rotated: true });
      }

      let placed = false;
      let bestXi = -1, bestZi = -1, bestFloor = Infinity, bestOri = orientations[0];

      // If balanced rule, prefer front or rear half based on current imbalance
      const preferFront = apRules.balanced ? (frontWeight <= rearWeight) : null;

      for (const ori of orientations) {
        const { bl, bw } = ori;
        if (bl > nx || bw > nz) continue;

        // X scan order: if balanced, prefer the half with less weight
        for (let pass = 0; pass < (preferFront !== null ? 2 : 1); pass++) {
          let xiStart = 0, xiEnd = nx - bl;
          if (preferFront !== null) {
            if (pass === 0) { // preferred half
              if (preferFront) { xiEnd = Math.floor(nx / 2) - bl; }
              else { xiStart = Math.floor(nx / 2); }
            } else { // fallback: other half
              if (preferFront) { xiStart = Math.floor(nx / 2); xiEnd = nx - bl; }
              else { xiEnd = Math.floor(nx / 2) - bl; }
            }
          }

          for (let xi = Math.max(0, xiStart); xi <= Math.min(xiEnd, nx - bl); xi++) {
            for (let zi = 0; zi <= nz - bw; zi++) {
              // Find max height in footprint
              let maxH = 0;
              outer: for (let dx = 0; dx < bl; dx++) {
                for (let dz = 0; dz < bw; dz++) {
                  const h = heightMap[xi + dx][zi + dz];
                  if (h > maxH) {
                    maxH = h;
                    if (maxH + bh > H) { maxH = Infinity; break outer; }
                  }
                }
              }
              if (maxH === Infinity) continue;
              if (maxH < bestFloor) {
                bestFloor = maxH; bestXi = xi; bestZi = zi; bestOri = ori;
                if (maxH === 0) break; // can't do better
              }
            }
            if (bestFloor === 0 && !apRules.balanced) break;
          }
          if (bestXi !== -1) break; // found in preferred half, stop
        }
        if (bestXi !== -1) break;
      }

      if (bestXi === -1) { failed.push(box); continue; }

      const { bl, bw, rotated } = bestOri;
      // Update height map
      for (let dx = 0; dx < bl; dx++) {
        for (let dz = 0; dz < bw; dz++) {
          heightMap[bestXi + dx][bestZi + dz] = bestFloor + bh;
        }
      }

      // World coordinates (centre of box)
      const worldX = -L/2 + bestXi * GRID + (bl * GRID) / 2;
      const worldY = bestFloor + bh / 2;
      const worldZ = -W/2 + bestZi * GRID + (bw * GRID) / 2;

      // Determine zone from X position (front half = zones 1-4, rear half = 5-8)
      // Further subdivide into left/right (Z) for the numbered zones
      const halfL = nx / 2;
      const quarterZ = nz / 4;
      const xHalf   = bestXi < halfL ? 0 : 1; // 0=front, 1=rear
      const zQuart  = Math.min(3, Math.floor(bestZi / quarterZ)); // 0-3
      const zoneNum = xHalf === 0 ? (1 + zQuart) : (5 + zQuart);

      if (xHalf === 0) frontWeight += w; else rearWeight += w;

      packed.push({ boxId: box.id, _x: worldX, _y: worldY, _z: worldZ, zone: 'grid-' + zoneNum, rotated });
    }

    if (progBar) progBar.style.width = '100%';
    await new Promise(r => setTimeout(r, 100));

    apPreviewResult = { packed, failed, frontWeight, rearWeight };
    _renderAutoPackPreview(packed);

    // Update panel to show results + apply button
    const statsEl = document.getElementById('autoPackStats');
    const truck2 = getTruck();
    const tVol = truck2 ? (truck2.length||600)*(truck2.height||250)*(truck2.width||240) : 1;
    const existVol = currentLoad.placements.reduce((s,p)=>{const b=getBox(p.boxId);return b?s+(b.length||0)*(b.height||0)*(b.width||0):s;},0);
    const newVol = packed.reduce((s,pl)=>{const b=getBox(pl.boxId);return b?s+(b.length||0)*(b.height||0)*(b.width||0):s;},0);
    const pct = Math.min(100,Math.round(((existVol+newVol)/tVol)*100));
    const tot = frontWeight + rearWeight || 1;
    if (statsEl) {
      statsEl.innerHTML =
        '<div class="ap-stat"><span class="ap-stat-label">Boxes packed</span><span class="ap-stat-val good">' + packed.length + ' / ' + toPack.length + '</span></div>' +
        (failed.length ? '<div class="ap-stat"><span class="ap-stat-label">Couldn\'t fit</span><span class="ap-stat-val bad">' + failed.length + ' boxes</span></div>' : '') +
        '<div class="ap-stat"><span class="ap-stat-label">Space utilisation</span><span class="ap-stat-val ' + (pct > 80 ? 'good' : 'warn') + '">' + pct + '%</span></div>' +
        '<div class="ap-stat"><span class="ap-stat-label">Front / Rear weight</span><span class="ap-stat-val">' + Math.round(frontWeight) + ' kg / ' + Math.round(rearWeight) + ' kg <span style="color:#aaa;font-weight:400">(' + Math.round(frontWeight/tot*100) + '/' + Math.round(rearWeight/tot*100) + '%)</span></span></div>';
    }
    if (btn) { btn.textContent = '✓ Apply to Load Plan'; btn.disabled = false; btn.onclick = () => applyAutoPack(); }
    if (prog) prog.style.display = 'none';
  }

  function _renderAutoPackPreview(packed) {
    if (!scene || !renderer || !camera) return;
    const truck = getTruck(); if (!truck) return;
    // Clear box meshes
    scene.children.filter(c => c.userData && c.userData.isBox).forEach(c => scene.remove(c));
    // Render existing placements
    currentLoad.placements.forEach((pl, idx) => {
      const box = getBox(pl.boxId); if (!box) return;
      const pos = calculatePositionIn3D(pl, box, truck);
      _addBoxMesh(pos, box, getBoxStackColor(pl), 1, idx + 1);
    });
    // Render preview placements (gold outline, slightly transparent)
    packed.forEach((pl, idx) => {
      const box = getBox(pl.boxId); if (!box) return;
      const pos = { x: pl._x, y: pl._y, z: pl._z };
      _addBoxMesh(pos, box, getBoxStackColor(pl), 0.88, currentLoad.placements.length + idx + 1, true);
    });
    update3DOverlays();
    renderer.render(scene, camera);
  }

  function _addBoxMesh(pos, box, colorHex, opacity, stepNum, isPreview) {
    const mat = new THREE.MeshPhongMaterial({
      color: colorHex,
      transparent: opacity < 1,
      opacity: opacity,
      shininess: isPreview ? 80 : 35
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(box.length, box.height, box.width), mat);
    mesh.position.set(pos.x, pos.y, pos.z);
    mesh.userData.isBox = true; mesh.userData.boxId = box.id;
    scene.add(mesh);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(box.length, box.height, box.width)),
      new THREE.LineBasicMaterial({ color: isPreview ? 0xFFD700 : 0x000000, transparent: isPreview, opacity: isPreview ? 0.7 : 1 })
    );
    edges.position.set(pos.x, pos.y, pos.z);
    edges.userData.isBox = true;
    scene.add(edges);
    addBoxFaceLabels(pos, box, false, isPreview, stepNum);
  }

  function applyAutoPack() {
    if (!apPreviewResult || !apPreviewResult.packed.length) return;
    const { packed } = apPreviewResult;
    packed.forEach(pl => {
      if (currentLoad.placements.some(p => p.boxId === pl.boxId)) return;
      currentLoad.placements.push({
        boxId:  pl.boxId,
        zone:   pl.zone,
        _x:     pl._x,
        _y:     pl._y,
        _z:     pl._z,
        position: { x: pl._x, y: pl._y, z: pl._z },
        timestamp: new Date().toISOString(),
        autoPackedAt: new Date().toISOString()
      });
    });
    currentLoad.updatedAt = new Date().toISOString();
    saveData();
    apPreviewResult = null;
    hideAutoPackPanel();
    render3DWithSearch(currentSearchTerm);
    if (typeof renderAll === 'function') renderAll();
    showToast && showToast('Auto-pack applied — ' + packed.length + ' boxes placed', 'success');
  }

  // ===== KART STAND 3D WIREFRAME =====
  // Draws a THREE.js wireframe representation of a kart stand into the scene.
  // pos: {x,y,z} centre point. box: box object (width/length/height in cm).
  // kartCount: 0=empty stand, 1=single kart, 2=two karts nose-to-nose.
  // isSelected: yellow highlight. isDimmed: translucent grey.
  function _drawKartStandWireframe(pos, box, kartCount, isSelected, isDimmed) {
    const W = parseFloat(box.width)  || 100;   // truck Z axis
    const D = parseFloat(box.length) || 150;   // truck X axis
    const H = parseFloat(box.height) || 180;   // vertical Y

    const verts = [];

    // Helper: push one line segment (6 floats)
    function seg(ax, ay, az, bx, by, bz) {
      verts.push(ax, ay, az, bx, by, bz);
    }

    // Helper: 8-segment circle. axis 'x' = upright wheel (YZ plane), 'y' = flat caster (XZ plane)
    function ring(cx, cy, cz, r, axis) {
      const N = 8;
      for (let i = 0; i < N; i++) {
        const a0 = (i / N) * Math.PI * 2;
        const a1 = ((i + 1) / N) * Math.PI * 2;
        let x0, y0, z0, x1, y1, z1;
        if (axis === 'x') {
          // upright wheel in YZ plane
          x0 = cx; y0 = cy + r * Math.sin(a0); z0 = cz + r * Math.cos(a0);
          x1 = cx; y1 = cy + r * Math.sin(a1); z1 = cz + r * Math.cos(a1);
        } else {
          // flat caster in XZ plane
          x0 = cx + r * Math.cos(a0); y0 = cy; z0 = cz + r * Math.sin(a0);
          x1 = cx + r * Math.cos(a1); y1 = cy; z1 = cz + r * Math.sin(a1);
        }
        seg(x0, y0, z0, x1, y1, z1);
      }
    }

    const bY = -H / 2;  // floor Y

    // Draw the base dolly stand
    function drawDolly() {
      const bfW = W * 0.40;
      const bfD = D * 0.35;
      const bfH = H * 0.07;
      const y0 = bY, y1 = bY + bfH;
      // Floor rect
      seg(-bfW, y0, -bfD, +bfW, y0, -bfD);
      seg(+bfW, y0, -bfD, +bfW, y0, +bfD);
      seg(+bfW, y0, +bfD, -bfW, y0, +bfD);
      seg(-bfW, y0, +bfD, -bfW, y0, -bfD);
      // Top rect
      seg(-bfW, y1, -bfD, +bfW, y1, -bfD);
      seg(+bfW, y1, -bfD, +bfW, y1, +bfD);
      seg(+bfW, y1, +bfD, -bfW, y1, +bfD);
      seg(-bfW, y1, +bfD, -bfW, y1, -bfD);
      // 4 vertical posts
      seg(-bfW, y0, -bfD, -bfW, y1, -bfD);
      seg(+bfW, y0, -bfD, +bfW, y1, -bfD);
      seg(+bfW, y0, +bfD, +bfW, y1, +bfD);
      seg(-bfW, y0, +bfD, -bfW, y1, +bfD);
      // Centre cross-brace on floor
      seg(-bfW, y0, 0,   +bfW, y0, 0);
      seg(0,   y0, -bfD, 0,   y0, +bfD);
      // 4 corner casters
      const cr = H * 0.022;
      ring(-bfW * 0.7, y0, -bfD * 0.7, cr, 'y');
      ring(+bfW * 0.7, y0, -bfD * 0.7, cr, 'y');
      ring(+bfW * 0.7, y0, +bfD * 0.7, cr, 'y');
      ring(-bfW * 0.7, y0, +bfD * 0.7, cr, 'y');
      return y1; // return top of dolly
    }

    // Draw one kart at lateral centre zc, with a lean offset for double-kart mode
    function drawKart(zc, leanZ) {
      const rY  = drawDolly(); // reuse dolly per kart (second call stacks on same floor)
      const kH  = H * 0.83;   // chassis height above dolly top
      const kHW = W * 0.26;   // half-width of rear bumper
      const kHD = D * 0.15;   // half-depth of rear cross-section
      const nHW = W * 0.10;   // half-width at nose
      const nHD = D * 0.07;   // half-depth at nose
      const nY  = rY + kH;    // top of chassis (nose tip Y)
      const nZc = zc + leanZ;

      // ---- Rear bumper ----
      seg(-kHW, rY, zc - kHD, +kHW, rY, zc - kHD);
      seg(-kHW, rY, zc + kHD, +kHW, rY, zc + kHD);
      seg(-kHW, rY, zc - kHD, -kHW, rY, zc + kHD);
      seg(+kHW, rY, zc - kHD, +kHW, rY, zc + kHD);
      // Rear bumper top rail
      const rBY = rY + H * 0.04;
      seg(-kHW, rBY, zc - kHD, +kHW, rBY, zc - kHD);
      seg(-kHW, rBY, zc + kHD, +kHW, rBY, zc + kHD);
      // Rear axle tube
      seg(-kHW - H * 0.04, rY + H * 0.05, zc, +kHW + H * 0.04, rY + H * 0.05, zc);
      // Rear wheels
      const rwr = H * 0.085;
      ring(-kHW - H * 0.03, rY + H * 0.05, zc, rwr, 'x');
      ring(+kHW + H * 0.03, rY + H * 0.05, zc, rwr, 'x');

      // ---- 4 longerons (rear corners → nose corners) ----
      seg(-kHW, rY, zc - kHD, -nHW, nY, nZc - nHD);
      seg(+kHW, rY, zc - kHD, +nHW, nY, nZc - nHD);
      seg(+kHW, rY, zc + kHD, +nHW, nY, nZc + nHD);
      seg(-kHW, rY, zc + kHD, -nHW, nY, nZc + nHD);

      // ---- Nose cross-section ----
      seg(-nHW, nY, nZc - nHD, +nHW, nY, nZc - nHD);
      seg(+nHW, nY, nZc - nHD, +nHW, nY, nZc + nHD);
      seg(+nHW, nY, nZc + nHD, -nHW, nY, nZc + nHD);
      seg(-nHW, nY, nZc + nHD, -nHW, nY, nZc - nHD);
      // Nose tip (4 lines to point)
      const tipY = nY + H * 0.025;
      seg(-nHW, nY, nZc - nHD, 0, tipY, nZc);
      seg(+nHW, nY, nZc - nHD, 0, tipY, nZc);
      seg(+nHW, nY, nZc + nHD, 0, tipY, nZc);
      seg(-nHW, nY, nZc + nHD, 0, tipY, nZc);

      // ---- Sidepod cross-section at t=0.40 ----
      const t40 = 0.40;
      const spY  = rY + kH * t40;
      const spHW = kHW + (nHW - kHW) * t40;
      const spHD = kHD + (nHD - kHD) * t40;
      const spZ  = zc + leanZ * t40;
      seg(-spHW, spY, spZ - spHD, +spHW, spY, spZ - spHD);
      seg(+spHW, spY, spZ - spHD, +spHW, spY, spZ + spHD);
      seg(+spHW, spY, spZ + spHD, -spHW, spY, spZ + spHD);
      seg(-spHW, spY, spZ + spHD, -spHW, spY, spZ - spHD);

      // ---- Rollhoop arch at t=0.62 ----
      const t62 = 0.62;
      const rhY0 = rY + kH * t62;
      const rhZ  = zc + leanZ * t62;
      const rhHW = kHW + (nHW - kHW) * t62;
      const rhR  = W * 0.13;
      const rhSep = rhHW * 0.55; // hoop half-separation in X
      const rhN  = 7;
      // Two parallel semicircular arches
      for (let side = -1; side <= 1; side += 2) {
        const hx = side * rhSep;
        for (let i = 0; i < rhN; i++) {
          const a0 = (i / rhN) * Math.PI;
          const a1 = ((i + 1) / rhN) * Math.PI;
          seg(hx, rhY0 + rhR * Math.sin(a0), rhZ + rhR * Math.cos(a0),
              hx, rhY0 + rhR * Math.sin(a1), rhZ + rhR * Math.cos(a1));
        }
      }
      // Top bar + base bars
      const topY = rhY0 + rhR;
      seg(-rhSep, topY, rhZ, +rhSep, topY, rhZ);
      seg(-rhSep, rhY0, rhZ - rhR, -rhSep, rhY0, rhZ + rhR);
      seg(+rhSep, rhY0, rhZ - rhR, +rhSep, rhY0, rhZ + rhR);

      // ---- Front axle + wheels at t=0.87 ----
      const t87 = 0.87;
      const faY = rY + kH * t87;
      const faZ = zc + leanZ * t87;
      const faHW = kHW * 0.60;
      seg(-faHW - H * 0.03, faY, faZ, +faHW + H * 0.03, faY, faZ);
      const fwr = H * 0.055;
      ring(-faHW - H * 0.025, faY, faZ, fwr, 'x');
      ring(+faHW + H * 0.025, faY, faZ, fwr, 'x');

      // ---- 4 diagonal braces: dolly top corners → kart rear bumper corners ----
      const bfW2 = W * 0.40, bfD2 = D * 0.35;
      const dy = bY + H * 0.07;
      seg(-bfW2, dy, -bfD2, -kHW, rY, zc - kHD);
      seg(+bfW2, dy, -bfD2, +kHW, rY, zc - kHD);
      seg(+bfW2, dy, +bfD2, +kHW, rY, zc + kHD);
      seg(-bfW2, dy, +bfD2, -kHW, rY, zc + kHD);
    }

    if (kartCount === 0) {
      // Empty stand: just the dolly + a vertical mast up to H/2
      drawDolly();
      seg(0, bY, 0, 0, bY + H * 0.5, 0);
      // Crossbar at top of mast
      seg(-W * 0.15, bY + H * 0.5, 0, +W * 0.15, bY + H * 0.5, 0);
      seg(0, bY + H * 0.5, -D * 0.10, 0, bY + H * 0.5, +D * 0.10);
    } else if (kartCount === 1) {
      drawKart(0, 0);
    } else {
      // Two karts nose-to-nose: each offset ±W*0.25 in Z, lean leanZ toward centre
      drawKart(-W * 0.25, +W * 0.12);
      drawKart(+W * 0.25, -W * 0.12);
      // Horizontal dividing bar at mid-height
      const midY = bY + H * 0.45;
      seg(-W * 0.45, midY, 0, +W * 0.45, midY, 0);
      // Vertical centre post from floor to bar
      seg(0, bY, 0, 0, midY, 0);
    }

    // Create geometry & line segments
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));

    let color, opacity;
    if (isDimmed) {
      color = 0x333333; opacity = 0.12;
    } else if (isSelected) {
      color = 0xFFFF00; opacity = 1.0;
    } else {
      color = 0x1e88e5; opacity = 1.0;
    }

    const mat = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity });
    const wf = new THREE.LineSegments(geom, mat);
    wf.position.set(pos.x, pos.y, pos.z);
    wf.userData.isBox = true;
    wf.userData.boxId = box.id;
    scene.add(wf);

    // Selection glow: bounding wireframe box in yellow
    if (isSelected) {
      const glow = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(D, H, W)),
        new THREE.LineBasicMaterial({ color: 0xFFFF00, transparent: true, opacity: 0.55 })
      );
      glow.position.set(pos.x, pos.y, pos.z);
      glow.userData.isBox = true;
      scene.add(glow);
    }
  }

  // Returns a THREE.js integer colour based on how high up a placement is in its zone stack
  function getBoxStackColor(placement) {
    const zoneId = placement.zone;
    const zonePlacements = currentLoad.placements.filter(p =>
      p.zone === zoneId && p.type !== 'asset' && p.type !== 'inventory'
    );
    const idx = zonePlacements.indexOf(placement);
    const sc = getStackLevelColors(idx >= 0 ? idx : 0);
    return parseInt(sc.solid.replace('#', ''), 16);
  }

  // Stack-height colour palette — bottom of pile = level 0 (red/hot), ascending through cooler colours
  function getStackLevelColors(level) {
    const palette = [
      { solid: '#e53935', bg: '#ffebee', hover: '#ffcdd2', light: '#fff5f5', label: 'L1' },  // red    — bottom
      { solid: '#ff9800', bg: '#fff3e0', hover: '#ffe0b2', light: '#fffdf5', label: 'L2' },  // orange
      { solid: '#fdd835', bg: '#fffde7', hover: '#fff9c4', light: '#fffff5', label: 'L3' },  // yellow
      { solid: '#43a047', bg: '#e8f5e9', hover: '#c8e6c9', light: '#f4fbf4', label: 'L4' },  // green
      { solid: '#00acc1', bg: '#e0f7fa', hover: '#b2ebf2', light: '#f0fffe', label: 'L5' },  // cyan
      { solid: '#1e88e5', bg: '#e3f2fd', hover: '#bbdefb', light: '#f0f8ff', label: 'L6' },  // blue
      { solid: '#8e24aa', bg: '#f3e5f5', hover: '#e1bee7', light: '#faf5fb', label: 'L7' },  // purple
      { solid: '#d81b60', bg: '#fce4ec', hover: '#f8bbd0', light: '#fff5f9', label: 'L8' },  // pink
    ];
    return palette[level % palette.length];
  }

  function getCategoryColor(category) {
    const colors = {
      tools: 0xff6b6b,
      spares: 0x4ecdc4,
      tyres: 0x45b7d1,
      fuel: 0xf7b731,
      equipment: 0x5f27cd,
      personal: 0xee5a6f,
      other: 0x95afc0
    };
    return colors[category] || 0x95afc0;
  }

  // ========== HELPER FUNCTIONS ==========
  function getBox(id) {
    return boxes.find(b => b.id === id);
  }

  function getTruck() {
    return trucks.find(t => t.id === currentLoad.truckId);
  }

  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function selectBox(boxId) {
    selectedBoxId = boxId;
    renderBoxes();
    showBoxModal(boxId);
  }

  // ========== EXPORT PACKING LIST ==========
  function buildPackingListData() {
    // Returns { boxes: [{ box, zoneLabel, items[] }], standaloneItems: [{ name, barcode, category, zoneLabel, itemType }] }
    const truck = getTruck();
    const boxes = currentLoad.placements.filter(p => p.boxId).map(p => {
      const box = getBox(p.boxId);
      if (!box) return null;
      const zoneLabel = truck ? `Zone ${p.zone.replace('grid-', '')}` : p.zone;
      const items = box.contentsItems && box.contentsItems.length > 0
        ? box.contentsItems
        : [];
      return { box, zoneLabel, items };
    }).filter(Boolean);

    const standaloneItems = currentLoad.placements.filter(p => p.type === 'asset' || p.type === 'inventory').map(p => {
      const zoneLabel = truck ? `Zone ${p.zone.replace('grid-', '')}` : p.zone;
      if (p.type === 'asset') {
        const asset = assets.find(a => a.id === p.assetId);
        if (!asset) return null;
        return { name: asset.name, barcode: asset.barcode || '', category: asset.category || '', zoneLabel, itemType: 'Asset' };
      } else {
        const item = inventory.find(i => i.id === p.inventoryId);
        if (!item) return null;
        return { name: item.name, barcode: item.sku || '', category: item.category || '', quantity: item.quantity, zoneLabel, itemType: 'Inventory' };
      }
    }).filter(Boolean);

    return { boxes, standaloneItems };
  }

  function exportPackingListCSV() {
    const { boxes, standaloneItems } = buildPackingListData();
    if (!boxes.length && !standaloneItems.length) { alert('No boxes or standalone items are loaded on the trailer yet.'); return; }

    const truck = getTruck();
    const event = events.find(e => e.id === currentLoad.eventId);
    const lines = [];

    // Header rows
    lines.push(`Packing List Export`);
    lines.push(`Trailer,${truck ? truck.name : 'Unknown'}`);
    lines.push(`Event,${event ? (event.title || event.name) : 'None selected'}`);
    lines.push(`Exported,${new Date().toLocaleString()}`);
    lines.push('');

    // Column headers
    lines.push('Box Name,Box Barcode,Zone,#,Qty,Item Name,Item Barcode,Serial Number,Item Type');

    boxes.forEach(({ box, zoneLabel, items }) => {
      if (items.length === 0) {
        // Box is loaded but empty
        lines.push(`"${box.name}","${box.barcode}","${zoneLabel}","","","(empty box)","","",""`);
      } else {
        items.forEach((item, idx) => {
          lines.push(`"${idx === 0 ? box.name : ''}","${idx === 0 ? box.barcode : ''}","${idx === 0 ? zoneLabel : ''}","${idx + 1}","${item.quantity || 1}","${item.name || ''}","${item.barcode || ''}","${item.serial || ''}","${item.type || ''}"`);
        });
      }
    });

    if (standaloneItems.length > 0) {
      lines.push('');
      lines.push('Standalone Assets & Inventory');
      lines.push('Zone,#,Qty,Item Name,Barcode / SKU,Category,Type');
      standaloneItems.forEach((item, idx) => {
        lines.push(`"${item.zoneLabel}","${idx + 1}","${item.quantity || 1}","${item.name}","${item.barcode}","${item.category}","${item.itemType}"`);
      });
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const truckName = truck ? truck.name.replace(/[^a-z0-9]/gi, '-') : 'trailer';
    const dateStr = new Date().toISOString().slice(0,10);
    a.href = url;
    a.download = `packing-list-${truckName}-${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPackingListPDF() {
    const { boxes, standaloneItems } = buildPackingListData();
    if (!boxes.length && !standaloneItems.length) { alert('No boxes or standalone items are loaded on the trailer yet.'); return; }

    const truck = getTruck();
    const event = events.find(e => e.id === currentLoad.eventId);
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const docRef = `PL-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`;
    const totalItems = boxes.reduce((sum, d) => sum + d.items.length, 0);

    let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Trailer Packing List — ${docRef}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 9.5pt; color: #000; background: #fff; }
    .page { padding: 14mm 18mm 10mm; }

    /* Document header */
    .doc-header { display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 8px; border-bottom: 2.5px solid #000; margin-bottom: 10px; }
    .doc-title-block .doc-title { font-size: 18pt; font-weight: 700; text-transform: uppercase; letter-spacing: -0.3px; line-height: 1; }
    .doc-title-block .doc-subtitle { font-size: 7.5pt; text-transform: uppercase; letter-spacing: 1.5px; color: #555; margin-top: 3px; }
    .doc-ref-block { text-align: right; font-size: 8pt; color: #333; line-height: 1.7; }
    .doc-ref-block .ref-num { font-family: 'Courier New', monospace; font-size: 9.5pt; font-weight: 700; color: #000; }

    /* Meta strip */
    .meta-strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; border: 1px solid #999; margin-bottom: 14px; }
    .meta-cell { padding: 5px 8px; border-right: 1px solid #ccc; }
    .meta-cell:last-child { border-right: none; }
    .meta-cell .label { font-size: 6.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #666; display: block; margin-bottom: 2px; }
    .meta-cell .value { font-size: 9pt; font-weight: 600; color: #000; }

    /* Box section */
    .box-section { margin-bottom: 12px; page-break-inside: avoid; border: 1px solid #666; }
    .box-header { background: #1a1a1a; color: #fff; padding: 5px 8px; display: grid; grid-template-columns: 1fr auto; gap: 16px; align-items: center; }
    .box-header-left .box-seq { font-size: 6.5pt; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; color: #999; }
    .box-header-left .box-name { font-size: 10pt; font-weight: 700; margin-top: 1px; }
    .box-header-right { text-align: right; }
    .box-header-right .box-barcode { font-family: 'Courier New', monospace; font-size: 8.5pt; color: #ccc; display: block; }
    .box-header-right .box-zone { font-size: 7.5pt; color: #999; margin-top: 1px; }

    /* Items table */
    table { width: 100%; border-collapse: collapse; }
    thead tr { border-bottom: 1.5px solid #333; }
    th { background: #f2f2f2; font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; padding: 4px 7px; text-align: left; color: #333; border-right: 1px solid #ddd; }
    th:last-child { border-right: none; }
    td { padding: 4px 7px; border-bottom: 1px solid #ebebeb; border-right: 1px solid #ebebeb; vertical-align: top; }
    td:last-child { border-right: none; }
    tr:last-child td { border-bottom: none; }
    tbody tr:nth-child(even) td { background: #fafafa; }
    .col-num { width: 24px; text-align: center; font-size: 7.5pt; color: #888; }
    .col-qty { width: 28px; text-align: center; font-size: 8.5pt; }
    .col-barcode, .col-serial { font-family: 'Courier New', monospace; font-size: 8pt; }
    .col-type { font-size: 8pt; color: #555; }
    .no-val { color: #bbb; }
    .empty-row { color: #888; font-style: italic; font-size: 8.5pt; padding: 7px; border-top: 1px solid #eee; }

    /* Signature block */
    .sig-section { margin-top: 20px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
    .sig-box { border-top: 1px solid #555; padding-top: 4px; }
    .sig-box .sig-label { font-size: 6.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #555; }
    .sig-box .sig-line { margin-top: 18px; border-bottom: 1px solid #888; }
    .sig-box .sig-name { font-size: 7.5pt; color: #666; margin-top: 3px; }

    /* Footer */
    .doc-footer { margin-top: 14px; border-top: 1px solid #ccc; padding-top: 5px; display: flex; justify-content: space-between; font-size: 7pt; color: #888; }

    @media print {
      .page { padding: 0; }
      @page { margin: 12mm 15mm; size: A4; }
    }
  </style>
</head>
<body>
<div class="page">
  <div class="doc-header">
    <div class="doc-title-block">
      <div class="doc-title">Trailer Packing List</div>
      <div class="doc-subtitle">Load Plan — Verified Cargo Manifest</div>
    </div>
    <div class="doc-ref-block">
      <div class="ref-num">${docRef}</div>
      <div>Generated: ${dateStr} at ${timeStr}</div>
      <div>Status: ${esc(currentLoad.status || 'Draft')}</div>
    </div>
  </div>

  <div class="meta-strip">
    <div class="meta-cell"><span class="label">Vehicle / Trailer</span><span class="value">${esc(truck ? truck.name : 'Not selected')}</span></div>
    <div class="meta-cell"><span class="label">Event</span><span class="value">${esc(event ? (event.title || event.name) : 'No event selected')}</span></div>
    <div class="meta-cell"><span class="label">Boxes Loaded</span><span class="value">${boxes.length}</span></div>
    <div class="meta-cell"><span class="label">Total Items</span><span class="value">${totalItems + standaloneItems.length}</span></div>
  </div>`;

    boxes.forEach(({ box, zoneLabel, items }, boxIdx) => {
      html += `
  <div class="box-section">
    <div class="box-header">
      <div class="box-header-left">
        <div class="box-seq">Container ${String(boxIdx + 1).padStart(2, '0')} of ${String(boxes.length).padStart(2, '0')}</div>
        <div class="box-name">${esc(box.name)}</div>
      </div>
      <div class="box-header-right">
        <span class="box-barcode">${esc(box.barcode)}</span>
        <div class="box-zone">${esc(zoneLabel)} &nbsp;|&nbsp; ${items.length} item${items.length !== 1 ? 's' : ''}</div>
      </div>
    </div>`;

      if (items.length === 0) {
        html += `<div class="empty-row">No items recorded in this container</div>`;
      } else {
        html += `<table><thead><tr>
          <th class="col-num">#</th>
          <th class="col-qty">Qty</th>
          <th>Item Name</th>
          <th class="col-barcode">Barcode / SKU</th>
          <th class="col-serial">Serial Number</th>
          <th class="col-type">Type / Category</th>
        </tr></thead><tbody>`;
        items.forEach((item, idx) => {
          const serial = item.serial ? esc(item.serial) : '<span class="no-val">—</span>';
          const qty = item.quantity && item.quantity > 1 ? `<strong>${item.quantity}</strong>` : (item.quantity || 1);
          html += `<tr>
            <td class="col-num">${idx + 1}</td>
            <td class="col-qty" style="text-align:center;font-weight:600;">${qty}</td>
            <td>${esc(item.name || '—')}</td>
            <td class="col-barcode">${esc(item.barcode || '—')}</td>
            <td class="col-serial">${serial}</td>
            <td class="col-type">${esc(item.type || '—')}</td>
          </tr>`;
        });
        html += `</tbody></table>`;
      }
      html += `</div>`;
    });

    if (standaloneItems.length > 0) {
      html += `
  <div class="box-section" style="margin-top:16px;border-color:#6a1b9a;">
    <div class="box-header" style="background:#4a148c;">
      <div class="box-header-left">
        <div class="box-seq" style="color:#ce93d8;">Standalone Items</div>
        <div class="box-name">Assets &amp; Inventory (not in a box)</div>
      </div>
      <div class="box-header-right">
        <div class="box-zone">${standaloneItems.length} item${standaloneItems.length !== 1 ? 's' : ''}</div>
      </div>
    </div>
    <table><thead><tr>
      <th class="col-num">#</th>
      <th>Item Name</th>
      <th class="col-barcode">Barcode / SKU</th>
      <th>Category</th>
      <th class="col-qty">Qty</th>
      <th class="col-type">Type</th>
      <th>Zone</th>
    </tr></thead><tbody>`;
      standaloneItems.forEach((item, idx) => {
        html += `<tr>
          <td class="col-num">${idx + 1}</td>
          <td>${esc(item.name)}</td>
          <td class="col-barcode">${esc(item.barcode || '—')}</td>
          <td>${esc(item.category || '—')}</td>
          <td class="col-qty" style="text-align:center;">${item.quantity || '—'}</td>
          <td class="col-type">${esc(item.itemType)}</td>
          <td>${esc(item.zoneLabel)}</td>
        </tr>`;
      });
      html += `</tbody></table></div>`;
    }

    html += `
  <div class="sig-section">
    <div class="sig-box"><div class="sig-label">Packed By</div><div class="sig-line"></div><div class="sig-name">Name / Date</div></div>
    <div class="sig-box"><div class="sig-label">Checked By</div><div class="sig-line"></div><div class="sig-name">Name / Date</div></div>
    <div class="sig-box"><div class="sig-label">Authorised By</div><div class="sig-line"></div><div class="sig-name">Name / Date</div></div>
  </div>
  <div class="doc-footer">
    <span>Document Ref: ${docRef}</span>
    <span>This document is a controlled record. Verify contents against physical load before departure.</span>
    <span>Page 1</span>
  </div>
</div>
</body></html>`;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  }

  // ========== UNLOAD MODE ==========

  function getBoxesForUnloading() {
    if (!currentLoad || !currentLoad.truckId) return [];
    const truckId = String(currentLoad.truckId);
    const inPlan = new Set(
      currentLoad.placements.filter(p => !p.type).map(p => String(p.boxId))
    );
    const seen = new Set();
    return boxes.filter(b => {
      const id = String(b.id);
      if (seen.has(id)) return false;
      if ((b.currentTruckId && String(b.currentTruckId) === truckId) || inPlan.has(id)) {
        seen.add(id);
        return true;
      }
      return false;
    });
  }

  function startUnloadMode() {
    if (!currentLoad || !currentLoad.truckId) {
      alert('Please select a truck first.');
      return;
    }
    const truckBoxes = getBoxesForUnloading();
    if (truckBoxes.length === 0) {
      alert('No boxes are currently loaded on this truck.');
      return;
    }
    // Populate location select
    const sel = document.getElementById('unloadLocSelect');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Select destination --</option>';
    if (locations.length > 0) {
      locations.forEach(l => {
        const o = document.createElement('option');
        o.value = l.id;
        o.textContent = l.name;
        sel.appendChild(o);
      });
    } else {
      [['warehouse','Warehouse'],['workshop','Workshop'],['garage','Garage'],['paddock','Paddock'],['hospitality','Hospitality']].forEach(([v, n]) => {
        const o = document.createElement('option');
        o.value = v;
        o.textContent = n;
        sel.appendChild(o);
      });
    }
    bootstrap.Modal.getOrCreateInstance(document.getElementById('unloadDestModal')).show();
  }

  function confirmUnloadDestination() {
    const sel = document.getElementById('unloadLocSelect');
    if (!sel || !sel.value) { alert('Please select a destination location.'); return; }
    unloadLocationId = sel.value;
    unloadLocationName = sel.options[sel.selectedIndex]?.textContent || sel.value;
    unloadTicked = new Set();
    unloadFinished = false;
    bootstrap.Modal.getInstance(document.getElementById('unloadDestModal')).hide();
    showUnloadChecklist();
  }

  function showUnloadChecklist() {
    unloadMode = true;
    const overlay = document.getElementById('unloadOverlay');
    if (!overlay) return;
    const truck = getTruck();
    document.getElementById('unloadTruckName').textContent = `Unloading: ${truck ? truck.name : 'Truck'}`;
    document.getElementById('unloadDestLabel').textContent = `Destination: ${unloadLocationName}`;
    const summary = document.getElementById('unloadSummary');
    if (summary) { summary.style.display = 'none'; summary.innerHTML = ''; }
    const btnFinish = document.getElementById('btnFinishUnload');
    if (btnFinish) { btnFinish.style.display = ''; }
    renderUnloadChecklist();
    overlay.style.display = 'flex';
  }

  function renderUnloadChecklist() {
    const list = document.getElementById('unloadList');
    if (!list) return;
    const truckBoxes = getBoxesForUnloading();
    updateUnloadProgress(truckBoxes.length);
    list.innerHTML = truckBoxes.map(box => {
      const id = String(box.id);
      const isTicked = unloadTicked.has(id);
      const isMissing = unloadFinished && !isTicked;
      const placement = currentLoad.placements.find(p => String(p.boxId) === id);
      const zone = placement ? placement.zone.replace('grid-', 'Zone ') : '';
      const itemCount = Array.isArray(box.contentsItems) ? box.contentsItems.length : 0;
      let rowClass = 'unload-item';
      if (isTicked) rowClass += ' received';
      if (isMissing) rowClass += ' missing';
      const checkInner = isTicked
        ? `<div class="unload-check-inner checked"><svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10l5 5L17 5"/></svg></div>`
        : `<div class="unload-check-inner"></div>`;
      const statusBadge = isTicked
        ? `<span class="unload-badge received">Received</span>`
        : isMissing ? `<span class="unload-badge missing">Not Returned</span>` : '';
      return `<div class="${rowClass}" id="unload-row-${id}" data-box-id="${id}" onclick="LoadEngine.tickUnloadBox('${id}')">
        <div class="unload-checkbox">${checkInner}</div>
        <div class="unload-item-info">
          <div class="unload-item-barcode">${esc(box.barcode || '')}</div>
          <div class="unload-item-name">${esc(box.name || 'Unnamed Box')}</div>
          <div class="unload-item-meta">
            ${zone ? `<span class="unload-zone-badge">${esc(zone)}</span>` : ''}
            ${itemCount > 0 ? `<span class="unload-item-count">${itemCount} item${itemCount !== 1 ? 's' : ''}</span>` : ''}
          </div>
        </div>
        <div class="unload-item-status">${statusBadge}</div>
      </div>`;
    }).join('') || '<div style="padding:32px;text-align:center;color:#9e9e9e;font-size:.9rem">No boxes found on this truck.</div>';

    // Update finish button label
    const btnFinish = document.getElementById('btnFinishUnload');
    if (btnFinish) {
      const remaining = truckBoxes.length - unloadTicked.size;
      const allDone = remaining === 0 && truckBoxes.length > 0;
      btnFinish.textContent = allDone ? 'Complete Unload' : `Finish${remaining > 0 ? ` (${remaining} remaining)` : ''}`;
      btnFinish.style.background = allDone ? '#1e8e3e' : '#f9ab00';
      btnFinish.style.borderColor = allDone ? '#1e8e3e' : '#f9ab00';
    }
  }

  async function tickUnloadBox(boxId) {
    const id = String(boxId);
    if (unloadFinished || unloadTicked.has(id)) return;

    // Optimistic UI update
    unloadTicked.add(id);
    const row = document.getElementById('unload-row-' + id);
    if (row) {
      row.classList.add('received');
      const inner = row.querySelector('.unload-check-inner');
      if (inner) {
        inner.classList.add('checked');
        inner.innerHTML = '<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10l5 5L17 5"/></svg>';
      }
      const statusDiv = row.querySelector('.unload-item-status');
      if (statusDiv) statusDiv.innerHTML = '<span class="unload-badge received">Received</span>';
    }

    const truckBoxes = getBoxesForUnloading();
    updateUnloadProgress(truckBoxes.length);
    const remaining = truckBoxes.length - unloadTicked.size;
    const allDone = remaining === 0 && truckBoxes.length > 0;
    const btnFinish = document.getElementById('btnFinishUnload');
    if (btnFinish) {
      btnFinish.textContent = allDone ? 'Complete Unload' : `Finish${remaining > 0 ? ` (${remaining} remaining)` : ''}`;
      btnFinish.style.background = allDone ? '#1e8e3e' : '#f9ab00';
      btnFinish.style.borderColor = allDone ? '#1e8e3e' : '#f9ab00';
    }

    // Persist to DB
    try {
      await window.RTS_API.unloadBox(id, unloadLocationId);
      // Update local box state
      const box = boxes.find(b => String(b.id) === id);
      if (box) { box.currentTruckId = null; box.status = 'warehouse'; }
      // Remove from current load plan placements and persist
      const planIdx = currentLoad.placements.findIndex(p => String(p.boxId) === id);
      if (planIdx !== -1) {
        currentLoad.placements.splice(planIdx, 1);
        saveData();
      }
    } catch (e) {
      console.error('Failed to unload box:', e.message);
      // Revert
      unloadTicked.delete(id);
      if (row) {
        row.classList.remove('received');
        const inner = row.querySelector('.unload-check-inner');
        if (inner) { inner.classList.remove('checked'); inner.innerHTML = ''; }
        const statusDiv = row.querySelector('.unload-item-status');
        if (statusDiv) statusDiv.innerHTML = '';
      }
      updateUnloadProgress(truckBoxes.length);
    }
  }

  function updateUnloadProgress(total) {
    const done = unloadTicked.size;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const bar = document.getElementById('unloadProgressFill');
    const label = document.getElementById('unloadProgressLabel');
    if (bar) { bar.style.width = pct + '%'; bar.style.background = pct === 100 ? '#1e8e3e' : '#1a73e8'; }
    if (label) label.textContent = `${done} / ${total} received`;
  }

  function finishUnloading() {
    unloadFinished = true;
    const truckBoxes = getBoxesForUnloading();
    const missing = truckBoxes.filter(b => !unloadTicked.has(String(b.id)));

    // Re-render list to show missing in red
    renderUnloadChecklist();

    // Show summary
    const summary = document.getElementById('unloadSummary');
    const btnFinish = document.getElementById('btnFinishUnload');
    if (btnFinish) btnFinish.style.display = 'none';

    if (summary) {
      const missingHtml = missing.length > 0
        ? `<div class="unload-missing-list">
            <div class="unload-missing-title">
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="#ea4335" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-.1em;margin-right:5px"><path d="M10 5v6"/><circle cx="10" cy="15" r="1" fill="#ea4335" stroke="none"/></svg>
              Not returned:
            </div>
            ${missing.map(b => `<div class="unload-missing-item"><span class="unload-missing-barcode">${esc(b.barcode || '')}</span> ${esc(b.name || '')}</div>`).join('')}
          </div>`
        : `<div class="unload-all-clear"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#1e8e3e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-.2em;margin-right:6px"><path d="M3 10l5 5L18 5"/></svg>All boxes accounted for!</div>`;

      summary.innerHTML = `
        <div class="unload-summary-inner">
          <div class="unload-summary-stats">
            <div class="unload-stat">
              <svg width="24" height="24" viewBox="0 0 20 20" fill="none" stroke="#1e8e3e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10l5 5L18 5"/></svg>
              <span class="unload-stat-num" style="color:#1e8e3e">${unloadTicked.size}</span>
              <span class="unload-stat-label">Received</span>
            </div>
            <div class="unload-stat">
              <svg width="24" height="24" viewBox="0 0 20 20" fill="none" stroke="${missing.length > 0 ? '#ea4335' : '#adb5bd'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 5v6"/><circle cx="10" cy="15" r="1" fill="${missing.length > 0 ? '#ea4335' : '#adb5bd'}" stroke="none"/></svg>
              <span class="unload-stat-num" style="color:${missing.length > 0 ? '#ea4335' : '#adb5bd'}">${missing.length}</span>
              <span class="unload-stat-label">Missing</span>
            </div>
          </div>
          ${missingHtml}
          <button class="btn btn-primary" style="margin-top:16px;width:100%;font-size:.9rem;padding:10px" onclick="LoadEngine.closeUnloadMode()">
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-.15em;margin-right:6px"><path d="M3 10l5 5L18 5"/></svg>Done — Back to Load Planning
          </button>
        </div>`;
      summary.style.display = 'block';
    }
  }

  function closeUnloadMode() {
    unloadMode = false;
    unloadLocationId = null;
    unloadLocationName = '';
    unloadTicked = new Set();
    unloadFinished = false;
    const overlay = document.getElementById('unloadOverlay');
    if (overlay) overlay.style.display = 'none';
    renderAll();
  }

  // ========== PUBLIC API ==========
  // ========== ZONE MINIMAP ==========
  function updateMinimap() {
    // Update minimap cells to show which zones have boxes
    const truck = getTruck();
    if (!truck) return;
    for (let i = 1; i <= 8; i++) {
      const cell = document.getElementById('mm' + i);
      if (!cell) continue;
      const zoneKey = 'zone_' + i;
      const hasBoxes = currentLoad.placements.some(p => p.zone === zoneKey);
      cell.classList.toggle('has-boxes', hasBoxes);
      cell.classList.toggle('empty', !hasBoxes);
    }
  }

  function toggleMinimap() {
    const strip = document.getElementById('zoneMinimap');
    const btn   = document.getElementById('btnToggleMinimap');
    if (!strip) return;
    const visible = strip.classList.toggle('visible');
    if (btn) btn.classList.toggle('active', visible);
    try { localStorage.setItem('lp_showmap', visible ? '1' : '0'); } catch(e) {}
    if (visible) updateMinimap();
  }

  window.LoadEngine = {
    init,
    selectBox,
    removeBox,
    removeAsset,
    placeAsset,
    removeInventory,
    placeInventory,
    showBoxModal,
    doRemove,
    getTruckList: () => trucks,
    getCurrentTruckId: () => currentLoad.truckId,
    getLocationList: () => locations,
    getItemLabel: (type, id) => {
      if (type === 'box') {
        const b = boxes.find(b => String(b.id) === String(id));
        return b ? (b.name || b.barcode || 'Box') : `Box ${id}`;
      }
      if (type === 'asset') {
        const a = assets.find(a => String(a.id) === String(id));
        return a ? (a.name || a.barcode || 'Asset') : `Asset ${id}`;
      }
      if (type === 'inventory') {
        const i = inventory.find(i => String(i.id) === String(id));
        return i ? (i.name || i.sku || 'Item') : `Item ${id}`;
      }
      return id;
    },
    toggleBoxExpand,
    switchTab,
    setFilter,
    renderAssets,
    renderInventory,
    exportPackingListCSV,
    exportPackingListPDF,
    toggleMinimap,
    startUnloadMode,
    confirmUnloadDestination,
    tickUnloadBox,
    finishUnloading,
    closeUnloadMode,
    setCameraPreset,
    screenshot3D,
    print4View,
    enterStepMode,
    exitStepMode,
    stepNext,
    stepPrev,
    togglePlayback,
    showAutoPackPanel,
    hideAutoPackPanel,
    togglePackRule,
    runAutoPack,
    applyAutoPack,
    buildCatInspector,
    selectCatFilter,
    jumpTo3DBox,
    togglePileBoxDetail,
    movePileBox,
    clearBoxSelection
  };

  // Auto-initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
