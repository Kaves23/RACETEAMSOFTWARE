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
  let filterAssetType = 'all';
  let filterAssetStatus = 'all';
  let filterInvCat = 'all';
  let scene, camera, renderer, controls;
  let boxModal;

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
        const placements = draftResp.placements || [];
        // All placements are kept — if a box is missing from the list it will
        // show a "box data missing" card rather than silently disappearing.
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
    
    // Populate dropdowns
    const selectEvent = document.getElementById('selectEvent');
    if (eventsLoadError) {
      selectEvent.innerHTML = '<option value="">⚠ NO LOCAL DATA — DB unavailable</option>';
      selectEvent.style.color = '#dc3545';
      selectEvent.disabled = true;
    } else {
      selectEvent.innerHTML =
        '<option value="">— Current (Live / No Event) —</option>' +
        '<option disabled style="color:#bbb;font-size:.7rem">──────── Events ────────</option>' +
        events.map(e => `<option value="${e.id}">${esc(e.title || e.name || 'Event')}</option>`).join('');
      if (currentLoad.eventId) selectEvent.value = currentLoad.eventId;
    }

    const selectTruck = document.getElementById('selectTruck');
    selectTruck.innerHTML = '<option value="">Select Truck/Trailer</option>' +
      trucks.map(t => `<option value="${t.id}">${esc(t.name)} (${esc(t.type)})</option>`).join('');
    if (currentLoad.truckId) selectTruck.value = currentLoad.truckId;

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
              placements: resp.placements || [],
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
      const matchCat = filterBoxCat === 'all' || (b.category || '').toLowerCase() === filterBoxCat;
      const matchSearch = !search ||
        (b.barcode || '').toLowerCase().includes(search) ||
        (b.name || '').toLowerCase().includes(search) ||
        (b.contents || '').toLowerCase().includes(search);
      return matchCat && matchSearch;
    });

    // Separate garage boxes to bottom
    const normalBoxes  = filtered.filter(b => b.boxType !== 'garage');
    const garageBoxes  = filtered.filter(b => b.boxType === 'garage');

    const renderBoxItem = (box) => {
      const placement = currentLoad.placements.find(p => p.boxId === box.id);
      const isLoaded = !!placement;
      const isScanned = !!(placement?.scannedAt);
      const isGarage = box.boxType === 'garage';

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
      } else {
        statusBadge = `<div class="box-status warehouse">📦 Available</div>`;
      }

      const garageBadge = isGarage
        ? `<span style="float:right;font-size:.6rem;font-weight:700;color:#8d6e63;background:#efebe9;border:1px solid #bcaaa4;padding:1px 5px;border-radius:3px;line-height:1.4">🏚️ GARAGE</span>`
        : '';

      return `
        <div class="box-item${isLoaded ? ' loaded' : ''}${inOtherTruck ? ' in-other-truck' : ''}${isGarage ? ' garage-box-item' : ''}${selected}"
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
    if (tab === 'boxes')                          { filterBoxCat      = value; renderBoxes();     }
    else if (tab === 'assets' && key === 'type')  { filterAssetType   = value; renderAssets();    }
    else if (tab === 'assets' && key === 'status'){ filterAssetStatus = value; renderAssets();    }
    else if (tab === 'inventory')                 { filterInvCat      = value; renderInventory(); }

    // Update active chip visual
    const group = tab === 'assets' ? `assets_${key}` : `${tab}_cat`;
    document.querySelectorAll(`[data-filter-group="${group}"]`).forEach(el => {
      el.classList.toggle('active', el.dataset.filterValue === value);
    });
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
      const matchSearch = !search ||
        (a.name          || '').toLowerCase().includes(search) ||
        (a.barcode       || '').toLowerCase().includes(search) ||
        (a.category      || '').toLowerCase().includes(search) ||
        (a.serial_number || '').toLowerCase().includes(search);
      return matchType && matchStatus && matchSearch;
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
      const statusBadge = placed
        ? `<div class="box-status loaded" style="margin-top:4px;">✓ In This Truck</div>`
        : `<div class="box-status warehouse" style="margin-top:4px;">📦 Available</div>`;
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
          <div class="box-barcode" style="color:#34a853;">${esc(a.barcode || a.id.slice(0,8))}</div>
          <div class="box-name">${esc(a.name)}</div>
          <div class="box-dims" style="margin-top:2px;display:flex;gap:4px;flex-wrap:wrap;">${catBadge}${fleetBadge}</div>
          ${a.serial_number ? `<div class="box-weight">S/N: ${esc(a.serial_number)}</div>` : ''}
          ${locName ? `<div class="box-weight" style="color:#1a73e8;">📍 ${esc(locName)}</div>` : ''}
          ${statusBadge}
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

    // Build dynamic category chips
    const chipsEl = document.getElementById('filterInventoryChips');
    if (chipsEl) {
      const cats = [...new Set(inventory.map(i => i.category).filter(Boolean))].sort();
      chipsEl.innerHTML =
        `<button class="filter-chip${filterInvCat === 'all' ? ' active' : ''}" data-filter-group="inventory_cat" data-filter-value="all" onclick="LoadEngine.setFilter('inventory','cat','all')">All</button>` +
        cats.map(c => `<button class="filter-chip${filterInvCat === c ? ' active' : ''}" data-filter-group="inventory_cat" data-filter-value="${esc(c)}" onclick="LoadEngine.setFilter('inventory','cat',${JSON.stringify(c)})">${esc(c)}</button>`).join('');
    }

    let sorted = [...inventory];
    sorted = sorted.filter(i => {
      const matchCat = filterInvCat === 'all' || (i.category || '') === filterInvCat;
      const matchSearch = !search ||
        (i.name     || '').toLowerCase().includes(search) ||
        (i.sku      || '').toLowerCase().includes(search) ||
        (i.category || '').toLowerCase().includes(search);
      return matchCat && matchSearch;
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
      const statusBadge = placed
        ? `<div class="box-status loaded" style="margin-top:4px;">✓ In This Truck</div>`
        : `<div class="box-status warehouse" style="margin-top:4px;">📦 Available</div>`;
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
          <div class="box-barcode" style="color:#9c27b0;">${esc(i.sku || i.id?.slice(0,8) || '—')}</div>
          <div class="box-name">${esc(i.name)}</div>
          <div class="box-dims" style="margin-top:2px;display:flex;gap:4px;flex-wrap:wrap;">${catBadge}${qtyBadge}</div>
          ${statusBadge}
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
      const placements = currentLoad.placements.filter(p => p.zone === zoneKey && p.type !== 'asset');
      const assetPlacements     = currentLoad.placements.filter(p => p.zone === zoneKey && p.type === 'asset');
      const inventoryPlacements = currentLoad.placements.filter(p => p.zone === zoneKey && p.type === 'inventory');
      const gridNum = parseInt(zoneKey.replace('grid-', ''));
      const zoneColor = gridColors[(gridNum - 1) % gridColors.length];
      
      let totalWeight = 0;
      let totalVolume = 0;
      
      const boxesHtml = placements.map(p => {
        const box = getBox(p.boxId);
        if (!box) {
          // Box is in the plan but not in the loaded box list — show a stub card
          return `
            <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:6px 8px;margin-bottom:4px;">
              <div style="font-size:.7rem;font-weight:700;color:#856404;">⚠ Box not found</div>
              <div style="font-size:.65rem;color:#856404;">ID: ${esc(p.boxId)}</div>
              <button style="font-size:.65rem;margin-top:4px;padding:1px 6px;background:#dc3545;color:#fff;border:none;border-radius:3px;cursor:pointer;" onclick="LoadEngine.removeBox('${p.boxId}')">Remove from plan</button>
            </div>
          `;
        }
        if (box) {
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
            <div class="placed-box" data-box-id="${box.id}" onclick="LoadEngine.toggleBoxExpand('${box.id}')">
              <div class="placed-box-header">
                ${p.scannedAt ? '<div class="scan-confirmed-dot" title="Physically scanned onto truck"></div>' : ''}
                <div class="placed-box-info">
                  <div class="placed-box-barcode">${esc(box.barcode)}</div>
                  <div class="placed-box-name">${esc(box.name)}</div>
                  <div style="font-size:.7rem;color:#5f6368;margin-top:3px;">${bl}×${bwid}×${bh}cm | ${boxVolume}m³ | ${bw}kg</div>
                </div>
                <div style="display:flex;align-items:center;gap:4px;">
                  <span class="placed-box-expand-icon">▼</span>
                  <button class="btn-remove-box" onclick="event.stopPropagation();LoadEngine.removeBox('${box.id}')">×</button>
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
            <button style="font-size:.65rem;margin-top:2px;padding:1px 6px;background:#dc3545;color:#fff;border:none;border-radius:3px;cursor:pointer;" onclick="LoadEngine.removeAsset('${p.assetId}')">Remove</button>
          </div>`;
        return `
          <div class="placed-asset">
            <div>
              <div class="placed-asset-name">🔧 ${esc(asset.name)}</div>
              <div class="placed-asset-meta">${esc(asset.barcode || '')}${asset.category ? ' · ' + esc(asset.category) : ''}</div>
            </div>
            <button class="btn-remove-box" onclick="LoadEngine.removeAsset('${asset.id}')">×</button>
          </div>`;
      }).join('');

      const inventoryHtml = inventoryPlacements.map(p => {
        const item = inventory.find(i => i.id === p.inventoryId);
        if (!item) return `
          <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:4px;padding:5px 8px;margin-bottom:4px;">
            <div style="font-size:.7rem;font-weight:700;color:#856404;">⚠ Item not found</div>
            <button style="font-size:.65rem;margin-top:2px;padding:1px 6px;background:#dc3545;color:#fff;border:none;border-radius:3px;cursor:pointer;" onclick="LoadEngine.removeInventory('${p.inventoryId}')">Remove</button>
          </div>`;
        return `
          <div class="placed-asset" style="border-color:#9c27b0;background:#f3e5f5;">
            <div>
              <div class="placed-asset-name" style="color:#6a1b9a;">🗃️ ${esc(item.name)}</div>
              <div class="placed-asset-meta">${esc(item.sku || '')}${item.category ? ' · ' + esc(item.category) : ''}${item.quantity !== undefined ? ' · Qty: ' + item.quantity : ''}</div>
            </div>
            <button class="btn-remove-box" onclick="LoadEngine.removeInventory('${item.id}')">×</button>
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

    currentLoad.placements.push({
      boxId: boxId,
      zone: zone,
      position: calculatePosition(boxId, zone),
      timestamp: new Date().toISOString()
    });

    currentLoad.updatedAt = new Date().toISOString();
    saveData();
    renderAll();
  }

  function removeBox(boxId) {
    const index = currentLoad.placements.findIndex(p => p.boxId === boxId);
    if (index !== -1) {
      currentLoad.placements.splice(index, 1);
      currentLoad.updatedAt = new Date().toISOString();
      saveData();
      renderAll();
    }
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

    document.getElementById('wbbFront').style.width  = frontPct + '%';
    document.getElementById('wbbRear').style.width   = rearPct  + '%';
    document.getElementById('wbbFrontLabel').textContent = `Front — ${frontKg.toFixed(0)} kg (${frontPct}%)`;
    document.getElementById('wbbRearLabel').textContent  = `Rear — ${rearKg.toFixed(0)} kg (${rearPct}%)`;

    // Warning colour if >60/40 imbalance
    const imbalanced = frontPct > 65 || rearPct > 65;
    document.getElementById('wbbFront').style.background = imbalanced ? '#f29900' : '#1a73e8';
    document.getElementById('wbbRear').style.background  = imbalanced ? '#ea4335' : '#34a853';
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
    document.getElementById('btn2DView').classList.toggle('active', view === '2D');
    document.getElementById('btn3DView').classList.toggle('active', view === '3D');
    document.getElementById('view2D').style.display = view === '2D' ? 'grid' : 'none';
    document.getElementById('view3D').style.display = view === '3D' ? 'block' : 'none';

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

      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
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

    // Draw truck walls (transparent)
    const truckGeometry = new THREE.BoxGeometry(truck.length, truck.height, truck.width);
    const truckMaterial = new THREE.MeshPhongMaterial({ 
      color: 0x999999, 
      transparent: true, 
      opacity: 0.15,
      side: THREE.DoubleSide
    });
    const truckMesh = new THREE.Mesh(truckGeometry, truckMaterial);
    truckMesh.position.set(0, truck.height / 2, 0);
    scene.add(truckMesh);

    // Draw truck wireframe
    const wireframe = new THREE.WireframeGeometry(truckGeometry);
    const line = new THREE.LineSegments(wireframe, new THREE.LineBasicMaterial({ color: 0x666666 }));
    line.position.copy(truckMesh.position);
    scene.add(line);

    // Draw boxes
    currentLoad.placements.forEach(placement => {
      const box = getBox(placement.boxId);
      if (!box) return;

      const boxGeometry = new THREE.BoxGeometry(box.length, box.height, box.width);
      const boxMaterial = new THREE.MeshPhongMaterial({ 
        color: getCategoryColor(box.category),
        shininess: 30
      });
      const boxMesh = new THREE.Mesh(boxGeometry, boxMaterial);

      const pos = calculatePositionIn3D(placement, box, truck);
      boxMesh.position.set(pos.x, pos.y, pos.z);

      const boxEdges = new THREE.EdgesGeometry(boxGeometry);
      const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x000000, linewidth: 2 });
      const edgesLine = new THREE.LineSegments(boxEdges, edgesMaterial);
      edgesLine.position.copy(boxMesh.position);

      scene.add(boxMesh);
      scene.add(edgesLine);

      // Add barcode label on box
      const labelCanvas = document.createElement('canvas');
      labelCanvas.width = 128;
      labelCanvas.height = 64;
      const labelCtx = labelCanvas.getContext('2d');
      labelCtx.fillStyle = '#ffffff';
      labelCtx.fillRect(0, 0, 128, 64);
      labelCtx.fillStyle = '#000000';
      labelCtx.font = 'bold 16px Arial';
      labelCtx.textAlign = 'center';
      labelCtx.textBaseline = 'middle';
      labelCtx.fillText(box.barcode, 64, 32);
      
      const labelTexture = new THREE.CanvasTexture(labelCanvas);
      const labelSpriteMaterial = new THREE.SpriteMaterial({ map: labelTexture });
      const labelSprite = new THREE.Sprite(labelSpriteMaterial);
      labelSprite.position.set(pos.x, pos.y + box.height/2 + 10, pos.z);
      labelSprite.scale.set(40, 20, 1);
      scene.add(labelSprite);
    });

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

      const boxGeometry = new THREE.BoxGeometry(box.length, box.height, box.width);
      
      // SPRING GREEN (#00FF7F / 0x00FF7F) for matches, GRAY (0x808080) for non-matches
      const boxColor = searchLower 
        ? (isMatch ? 0x00FF7F : 0x808080) 
        : getCategoryColor(box.category);
      
      const boxMaterial = new THREE.MeshPhongMaterial({ 
        color: boxColor,
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
        color: isSelected ? 0xFFFF00 : (isMatch ? 0x00FF00 : 0x000000), 
        linewidth: isSelected ? 4 : (isMatch ? 3 : 2) 
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

      // Add barcode label on box (brighter for matches)
      const labelCanvas = document.createElement('canvas');
      labelCanvas.width = 128;
      labelCanvas.height = 64;
      const labelCtx = labelCanvas.getContext('2d');
      labelCtx.fillStyle = isMatch ? '#00FF7F' : '#ffffff';
      labelCtx.fillRect(0, 0, 128, 64);
      labelCtx.fillStyle = isMatch ? '#000000' : '#000000';
      labelCtx.font = isMatch ? 'bold 18px Arial' : 'bold 16px Arial';
      labelCtx.textAlign = 'center';
      labelCtx.textBaseline = 'middle';
      labelCtx.fillText(box.barcode, 64, 32);
      
      const labelTexture = new THREE.CanvasTexture(labelCanvas);
      const labelSpriteMaterial = new THREE.SpriteMaterial({ map: labelTexture });
      const labelSprite = new THREE.Sprite(labelSpriteMaterial);
      labelSprite.position.set(pos.x, pos.y + box.height/2 + 10, pos.z);
      labelSprite.scale.set(isMatch ? 50 : 40, isMatch ? 25 : 20, 1);
      labelSprite.userData.isBox = true;
      scene.add(labelSprite);
      
      // Add pulsing animation for matching boxes
      if (isMatch) {
        const pulseScale = 1 + Math.sin(Date.now() * 0.003) * 0.05;
        boxMesh.scale.set(pulseScale, pulseScale, pulseScale);
      }
    });

    if (renderer) renderer.render(scene, camera);
  }

  function calculatePositionIn3D(placement, box, truck) {
    // Get zone data from truck
    const zone = truck.zones[placement.zone];
    if (!zone) {
      return { x: 0, y: box.height / 2, z: 0 };
    }
    
    // Use the pre-calculated position from the zone
    const zonePos = { x: zone.posX, z: zone.posZ };
    
    // Calculate stacking height - check other boxes in same grid
    let stackHeight = 0;
    const boxesInGrid = currentLoad.placements.filter(p => 
      p.zone === placement.zone && p.boxId !== placement.boxId
    );
    
    boxesInGrid.forEach(p => {
      const otherBox = getBox(p.boxId);
      if (otherBox) {
        stackHeight += otherBox.height;
      }
    });

    const y = stackHeight + box.height / 2;

    return { 
      x: zonePos.x + (placement.offsetX || 0), 
      y: y + (placement.offsetY || 0), 
      z: zonePos.z + (placement.offsetZ || 0)
    };
  }

  function animate3D() {
    if (currentView !== '3D') return;
    requestAnimationFrame(animate3D);
    
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

      if (e.button === 0 || e.buttons === 1) { // Left click - rotate
        cameraRotation.theta += deltaX * 0.005;
        cameraRotation.phi += deltaY * 0.005;
        cameraRotation.phi = Math.max(0.1, Math.min(Math.PI - 0.1, cameraRotation.phi));
        updateCameraPosition();
      }

      previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    canvas.addEventListener('mouseup', () => {
      isDragging = false;
    });

    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      cameraDistance += e.deltaY * 0.5;
      cameraDistance = Math.max(300, Math.min(2000, cameraDistance));
      updateCameraPosition();
    });
  }

  function updateCameraPosition() {
    if (!camera) return;
    camera.position.x = cameraDistance * Math.sin(cameraRotation.phi) * Math.cos(cameraRotation.theta);
    camera.position.y = cameraDistance * Math.cos(cameraRotation.phi);
    camera.position.z = cameraDistance * Math.sin(cameraRotation.phi) * Math.sin(cameraRotation.theta);
    camera.lookAt(0, 100, 0);
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
        if (intersect.object.userData && intersect.object.userData.isBox) {
          selected3DBoxId = intersect.object.userData.boxId;
          console.log('📦 Selected box in 3D:', selected3DBoxId);
          render3DWithSearch(currentSearchTerm); // Re-render to show selection
          return;
        }
      }
      
      // Clicked empty space - deselect
      selected3DBoxId = null;
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
          if (confirm(`Remove box ${selected3DBoxId} from truck?`)) {
            removeBox(selected3DBoxId);
            selected3DBoxId = null;
            console.log('🗑️ Removed box');
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
    toggleBoxExpand,
    switchTab,
    setFilter,
    renderAssets,
    renderInventory,
    exportPackingListCSV,
    exportPackingListPDF,
    toggleMinimap
  };

  // Auto-initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
