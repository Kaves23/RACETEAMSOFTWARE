/* Box Packing & Inventory Engine
 * Traceable container system with nested item tracking
 * Many-to-many relationship: Boxes ↔ Items (Equipment/Assets)
 */

console.log('📦 box-packing-engine.js LOADING...', new Date().toISOString());

(function() {
  'use strict';

  console.log('📦 box-packing-engine.js IIFE EXECUTING...');


  // ========== CONFIGURATION ==========
  const LS_BOXES = 'rts.boxes.v1';
  const LS_BOX_CONTENTS = 'rts.box.contents.v1';
  const LS_BOX_HISTORY = 'rts.box.history.v1';
  const LS_EQUIPMENT = 'rts.equipment.v1';
  const LS_ASSETS = 'rts.assets.v1';
  const SS_CACHE_KEY = 'rts.bp.cache.v1'; // sessionStorage key for stale-while-revalidate
  const SS_CACHE_MAX_AGE_MS = 5 * 60_000;  // Max age before cache is ignored (5 min)

  // ========== FRESHNESS INDICATOR ==========
  // States: 'loading' | 'cached' | 'refreshing' | 'live' | 'error'
  function setFreshnessState(state, label) {
    const indicator = document.getElementById('dataFreshnessIndicator');
    const dot       = document.getElementById('dataFreshnessDot');
    const text      = document.getElementById('dataFreshnessText');
    if (!indicator || !dot || !text) return;
    const styles = {
      loading:    { bg:'#fff8e1', color:'#f57f17', border:'#ffe082', dotColor:'#ffa000', spin:true,  lbl: label||'LOADING'    },
      cached:     { bg:'#fff3e0', color:'#e65100', border:'#ffcc80', dotColor:'#ff9800', spin:false, lbl: label||'CACHED'     },
      refreshing: { bg:'#e3f2fd', color:'#1565c0', border:'#90caf9', dotColor:'#1e88e5', spin:true,  lbl: label||'REFRESHING' },
      live:       { bg:'#e8f5e9', color:'#2e7d32', border:'#a5d6a7', dotColor:'#43a047', spin:false, lbl: label||'LIVE'       },
      error:      { bg:'#fce4ec', color:'#b71c1c', border:'#ef9a9a', dotColor:'#e53935', spin:false, lbl: label||'ERROR'      },
    };
    const s = styles[state] || styles.live;
    indicator.style.background   = s.bg;
    indicator.style.color        = s.color;
    indicator.style.borderColor  = s.border;
    dot.style.background         = s.dotColor;
    dot.style.animation          = s.spin ? 'bp-dot-pulse 1s ease-in-out infinite' : 'none';
    text.textContent             = s.lbl;
    // Inject keyframes once
    if (!document.getElementById('bp-dot-keyframes')) {
      const style = document.createElement('style');
      style.id = 'bp-dot-keyframes';
      style.textContent = '@keyframes bp-dot-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(1.3)}}';
      document.head.appendChild(style);
    }
  }

  // ========== STATE ==========
  let boxes = [];
  let boxContents = [];
  let boxHistory = [];
  let equipment = [];
  let assets = [];
  let inventoryItems = []; // Inventory items from inventory table
  let inventoryBoxTracking = new Map(); // Track inventory item ID -> box ID mapping
  let currentBoxId = null;
  let currentFilter = 'all';
  let boxModal, historyModal, unpackModal;
  let unpackStepReturnModal, unpackStepBillModal, unpackStepConfirmModal;
  let unpackState = null; // State for multi-step Shopify unpack flow
  let allAssetTypes = []; // Asset types from settings with colors
  let allLocations = []; // Locations from database
  let selectedBoxes = new Set(); // Track selected box IDs for bulk operations
  let selectedItems = new Set(); // Track selected item IDs for multi-drag
  let boxLoadFilter = 'all'; // 'all' | 'available' | 'loaded'
  let itemLocationFilter = ''; // '' = all locations, or a location id
  let itemsPage = 1; // Fix 14: pagination state
  const ITEMS_PER_PAGE = 50;

  // ========== INITIALIZATION ==========
  async function init() {
    console.log('🚀 BOX PACKING INIT STARTED', new Date().toISOString());
    console.log('🔍 RTS_API available?', !!window.RTS_API);
    console.log('🔍 RTS_API.getItems available?', !!window.RTS_API?.getItems);
    
    RTS.setActiveNav();
    setFreshnessState('loading');

    // ── Stale-while-revalidate ────────────────────────────────────────────────
    // Expose force-refresh so the indicator can be clicked
    window.__bpForceRefresh = async () => {
      setFreshnessState('refreshing');
      await loadData(true);
      renderAll();
    };

    const cached = _readCache();
    if (cached) {
      // Render cached data instantly, then silently fetch live in background
      _applyApiResponses(cached.boxesResp, cached.itemsResp, cached.contentsResp);
      setFreshnessState('cached', `CACHED ${_cacheAgeLabel(cached.ts)}`);
      await loadDrivers();
      initUI();
      renderAll();
      // Background live refresh
      setFreshnessState('refreshing');
      loadData(true).then(() => {
        renderAll();
        setFreshnessState('live');
      }).catch(() => setFreshnessState('error'));
    } else {
      // No cache — full blocking load
      await loadData(false);
      console.log('📊 After loadData - equipment:', equipment.length, 'assets:', assets.length, 'boxes:', boxes.length);
      await loadDrivers();
      initUI();
      renderAll();
      setFreshnessState('live');
    }
  }

  function _cacheAgeLabel(ts) {
    const secs = Math.round((Date.now() - ts) / 1000);
    if (secs < 60) return `${secs}s ago`;
    return `${Math.round(secs / 60)}m ago`;
  }

  function _readCache() {
    try {
      const raw = sessionStorage.getItem(SS_CACHE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !obj.ts || Date.now() - obj.ts > SS_CACHE_MAX_AGE_MS) return null;
      return obj;
    } catch { return null; }
  }

  function _writeCache(boxesResp, itemsResp, contentsResp) {
    try {
      sessionStorage.setItem(SS_CACHE_KEY, JSON.stringify({ ts: Date.now(), boxesResp, itemsResp, contentsResp }));
    } catch { /* quota exceeded — ignore */ }
  }

  // Apply raw API responses to module state — used by the cache path in init()
  function _applyApiResponses(boxesResp, itemsResp, contentsResp) {
    // ── Boxes ────────────────────────────────────────────────────────────────
    boxes = (boxesResp?.boxes || []).map(b => ({
      id: b.id, barcode: b.barcode, name: b.name,
      boxType: b.box_type || 'regular',
      length: b.dimensions_length_cm, width: b.dimensions_width_cm, height: b.dimensions_height_cm,
      weightCapacity: b.max_weight_kg, currentWeight: b.current_weight_kg || 0,
      location: b.current_location_id, zone: b.current_zone,
      assignedDriverId: b.assigned_driver_id, assignedDriverName: b.assigned_driver_name,
      status: b.status || 'available', itemCount: b.item_count || 0,
      truckId: b.load_plan_truck_id || b.current_truck_id || null,
      scannedAt: b.load_plan_scanned_at || null,
      createdAt: b.created_at, updatedAt: b.updated_at
    }));
    // ── Items ─────────────────────────────────────────────────────────────────
    const mapped = (itemsResp?.items || []).map(i => ({
      id: i.id, barcode: i.barcode, name: i.name, description: i.description,
      category: i.category, serialNumber: i.serial_number, status: i.status,
      currentBoxId: i.current_box_id, currentLocationId: i.current_location_id,
      weightKg: i.weight_kg, valueUsd: i.value_usd,
      lastMaintenanceDate: i.last_maintenance_date, nextMaintenanceDate: i.next_maintenance_date,
      itemType: i.item_type, createdAt: i.created_at, updatedAt: i.updated_at
    }));
    equipment = mapped.filter(i => i.itemType === 'equipment');
    assets    = mapped.filter(i => i.itemType !== 'equipment');
    // ── Box Contents ──────────────────────────────────────────────────────────
    if (contentsResp?.success && contentsResp.boxContents) {
      boxContents = contentsResp.boxContents.map(c => ({
        id: String(c.id), boxId: c.box_id, itemId: c.item_id,
        itemType: c.item_type || 'equipment', packedAt: c.packed_at,
        positionInBox: c.position_in_box, quantityPacked: c.quantity_packed || 1
      }));
    } else {
      boxContents = [];
    }
    // Rebuild inventory tracking
    inventoryBoxTracking.clear();
    const invQty = new Map();
    boxContents.forEach(c => {
      if (c.itemType === 'inventory') {
        const q = c.quantityPacked || 1;
        invQty.set(c.itemId, (invQty.get(c.itemId) || 0) + q);
        inventoryBoxTracking.set(c.itemId, c.boxId);
      }
    });
    window.inventoryPackedQuantities = invQty;
    boxHistory = RTS.safeLoadJSON(LS_BOX_HISTORY, null) || [];
  }

  async function loadData(isRefresh = false) {
    console.log('🔄 Loading data in parallel...');
    
    // Declare these at function scope so they're accessible in all try blocks
    let boxesResp, itemsResp, contentsResp;
    
    // Load ALL data in parallel for better performance
    try {
      if (!window.RTS_API) {
        throw new Error('RTS_API not available');
      }
      
      console.log('⏱️ Starting parallel data load...');
      const startTime = Date.now();
      
      // Execute all API calls in parallel
      [boxesResp, itemsResp, contentsResp] = await Promise.all([
        window.RTS_API.getBoxes(),
        window.RTS_API.getItems(),
        window.RTS_API.getBoxContents()
      ]);
      
      const loadTime = Date.now() - startTime;
      console.log(`✅ Parallel load completed in ${loadTime}ms`);

      // Persist to cache for next page open
      _writeCache(boxesResp, itemsResp, contentsResp);

      // Process boxes response
      boxes = (boxesResp.boxes || []).map(box => ({
        id: box.id,
        barcode: box.barcode,
        name: box.name,
        boxType: box.box_type || 'regular',
        length: box.dimensions_length_cm,
        width: box.dimensions_width_cm,
        height: box.dimensions_height_cm,
        weightCapacity: box.max_weight_kg,
        currentWeight: box.current_weight_kg || 0,
        location: box.current_location_id,
        zone: box.current_zone,
        assignedDriverId: box.assigned_driver_id,
        assignedDriverName: box.assigned_driver_name,
        status: box.status || 'available',
        itemCount: box.item_count || 0,
        truckId: box.load_plan_truck_id || box.current_truck_id || null,
        createdAt: box.created_at,
        updatedAt: box.updated_at
      }));
      console.log(`✅ Loaded ${boxes.length} boxes from API`);
      
      // If API returned empty, seed initial data
      if (boxes.length === 0) {
        console.log('📦 No boxes in database, creating seed data...');
        const seedData = seedBoxes();
        
        // Upload seed boxes to database
        try {
          for (const box of seedData) {
            await RTS_API.createBox({
              barcode: box.barcode,
              name: box.name,
              dimensions_length_cm: box.length,
              dimensions_width_cm: box.width,
              dimensions_height_cm: box.height,
              max_weight_kg: box.weightCapacity,
              current_weight_kg: box.currentWeight || 0,
              current_location_id: box.locationId || null,
              current_truck_id: box.truckId || null,
              current_zone: box.zone || null,
              rfid_tag: box.rfidTag || null,
              status: box.status || 'available'
            });
          }
          console.log(`✅ Uploaded ${seedData.length} seed boxes to database`);
          
          // Re-fetch boxes from database to get correct IDs
          const boxesResp = await RTS_API.getBoxes();
          boxes = (boxesResp.boxes || []).map(box => ({
            id: box.id,
            barcode: box.barcode,
            name: box.name,
            boxType: box.box_type || 'regular',
            length: box.dimensions_length_cm,
            width: box.dimensions_width_cm,
            height: box.dimensions_height_cm,
            weightCapacity: box.max_weight_kg,
            currentWeight: box.current_weight_kg || 0,
            location: box.current_location_id,
            zone: box.current_zone,
            assignedDriverId: box.assigned_driver_id,
            assignedDriverName: box.assigned_driver_name,
            status: box.status || 'available',
            createdAt: box.created_at,
            updatedAt: box.updated_at
          }));
          console.log(`✅ Re-fetched ${boxes.length} boxes from database`);
        } catch (uploadError) {
          console.warn('Could not upload seed boxes to database:', uploadError.message);
          boxes = seedData; // Fallback to local seed data
        }
      }
    } catch (e) {
      console.warn('Could not load boxes from API, using localStorage:', e.message);
      boxes = RTS.safeLoadJSON(LS_BOXES, null) || seedBoxes();
      console.log(`📦 Using ${boxes.length} boxes from localStorage/seed`);
    }

    // Load items (equipment and assets) from API
    try {
      if (!window.RTS_API) {
        throw new Error('RTS_API not available');
      }
      const itemsResp = await window.RTS_API.getItems();
      const allItems = itemsResp.items || [];
      console.log(`✅ Loaded ${allItems.length} total items from API`);
      
      // If API returned empty, seed initial data
      if (allItems.length === 0) {
        console.log('📦 No items in database, creating seed data...');
        const seedEquip = seedEquipment();
        const seedAsset = seedAssets();
        
        // Upload seed items to database
        const allSeedItems = [...seedEquip, ...seedAsset];
        try {
          for (const item of allSeedItems) {
            await RTS_API.createItem({
              barcode: item.barcode,
              name: item.name,
              item_type: item.itemType || item.type || 'equipment',
              category: item.category || '',
              description: item.description || '',
              serial_number: item.serialNumber || '',
              status: item.status || 'available',
              current_box_id: item.currentBoxId || null,
              current_location_id: item.currentLocationId || null,
              weight_kg: item.weightKg || null,
              value_usd: item.valueUsd || null,
              last_maintenance_date: item.lastMaintenanceDate || null,
              next_maintenance_date: item.nextMaintenanceDate || null
            });
          }
          console.log(`✅ Uploaded ${allSeedItems.length} seed items to database`);
          
          // Re-fetch items from database to get correct IDs
          const itemsResp = await RTS_API.getItems();
          allItems = (itemsResp.items || []).map(item => ({
            id: item.id,
            barcode: item.barcode,
            name: item.name,
            itemType: item.item_type,
            category: item.category || '',
            description: item.description || '',
            serialNumber: item.serial_number || '',
            currentBoxId: item.current_box_id,
            status: item.status || 'available',
            createdAt: item.created_at,
            updatedAt: item.updated_at
          }));
          
          // Split into equipment and assets based on item_type
          equipment = allItems.filter(item => item.itemType === 'equipment');
          assets = allItems.filter(item => item.itemType === 'asset');
          console.log(`✅ Re-fetched ${allItems.length} items from database (${equipment.length} equipment, ${assets.length} assets)`);
        } catch (uploadError) {
          console.warn('Could not upload seed items to database:', uploadError.message);
          equipment = seedEquip; // Fallback to local seed data
          assets = seedAsset;
        }
      } else {
        // Map database fields (snake_case) to code fields (camelCase)
        const mappedItems = allItems.map(item => ({
          id: item.id,
          barcode: item.barcode,
          name: item.name,
          description: item.description,
          category: item.category,
          serialNumber: item.serial_number,
          status: item.status,
          currentBoxId: item.current_box_id,
          currentLocationId: item.current_location_id,
          weightKg: item.weight_kg,
          valueUsd: item.value_usd,
          lastMaintenanceDate: item.last_maintenance_date,
          nextMaintenanceDate: item.next_maintenance_date,
          itemType: item.item_type,
          createdAt: item.created_at,
          updatedAt: item.updated_at
        }));
        
        // equipment = items with type 'equipment'; assets = everything else (asset, custom types, etc.)
        equipment = mappedItems.filter(item => item.itemType === 'equipment');
        assets = mappedItems.filter(item => item.itemType !== 'equipment');
      }
      
      console.log(`📦 Loaded: ${equipment.length} items in equipment view + ${assets.length} items in assets view (total: ${equipment.length + assets.length})`);
    } catch (e) {
      console.warn('Could not load items from API, using localStorage:', e.message);
      equipment = RTS.safeLoadJSON(LS_EQUIPMENT, null) || seedEquipment();
      assets = RTS.safeLoadJSON(LS_ASSETS, null) || seedAssets();
      console.log(`📦 Using ${equipment.length} equipment + ${assets.length} assets from localStorage/seed`);
    }

    // Process box contents (already loaded in parallel)
    try {
      
      if (contentsResp && contentsResp.success && contentsResp.boxContents) {
        boxContents = contentsResp.boxContents.map(content => ({
          id: String(content.id),
          boxId: content.box_id,
          itemId: content.item_id,
          itemType: content.item_type || 'equipment',
          packedAt: content.packed_at,
          positionInBox: content.position_in_box,
          quantityPacked: content.quantity_packed || 1
        }));
        console.log(`✅ Loaded ${boxContents.length} box contents from API in 1 query (was ${boxes.length} queries)`);
      } else {
        boxContents = [];
        console.log('⚠️ No box contents returned from API');
      }
      
      // Rebuild inventoryBoxTracking Map from loaded box contents
      // Changed: Track quantities, not just presence
      inventoryBoxTracking.clear();
      const inventoryQuantities = new Map(); // itemId -> total packed quantity
      
      boxContents.forEach(content => {
        if (content.itemType === 'inventory') {
          const quantity = content.quantityPacked || 1;
          const currentTotal = inventoryQuantities.get(content.itemId) || 0;
          inventoryQuantities.set(content.itemId, currentTotal + quantity);
          inventoryBoxTracking.set(content.itemId, content.boxId);
          console.log(`  📦 Inventory item ${content.itemId}: +${quantity} units (total: ${currentTotal + quantity}), boxId: ${content.boxId}`);
        }
      });
      
      // Store as global for use in rendering
      window.inventoryPackedQuantities = inventoryQuantities;
      
      console.log(`✅ Rebuilt inventory quantities tracking: ${inventoryQuantities.size} inventory items with packed units`);
    } catch (e) {
      console.warn('Could not load box contents from API, using localStorage:', e.message);
      boxContents = RTS.safeLoadJSON(LS_BOX_CONTENTS, null) || [];
      
      // Rebuild inventoryBoxTracking from localStorage fallback too
      inventoryBoxTracking.clear();
      const inventoryQuantities = new Map();
      boxContents.forEach(content => {
        if (content.itemType === 'inventory') {
          const quantity = content.quantityPacked || 1;
          const currentTotal = inventoryQuantities.get(content.itemId) || 0;
          inventoryQuantities.set(content.itemId, currentTotal + quantity);
          inventoryBoxTracking.set(content.itemId, content.boxId);
        }
      });
      window.inventoryPackedQuantities = inventoryQuantities;
      console.log(`✅ Rebuilt inventory quantities from localStorage: ${inventoryQuantities.size} items`);
    }
    
    // Box history - For now keep in localStorage, will add API endpoint later
    boxHistory = RTS.safeLoadJSON(LS_BOX_HISTORY, null) || [];
    
    // Load asset types from database API
    try {
      const assetTypesResponse = await RTS_API.getAssetTypes();
      if (assetTypesResponse && assetTypesResponse.success && assetTypesResponse.assetTypes.length > 0) {
        allAssetTypes = assetTypesResponse.assetTypes;
        console.log(`✅ Loaded ${allAssetTypes.length} asset types from database`);
      } else {
        // Fallback to localStorage if API fails
        const settings = RTS.getSettings();
        const assetTypesFromSettings = settings.assetTypes || [{name:'Equipment',color:'#0ea5e9'},{name:'Asset',color:'#a855f7'}];
        allAssetTypes = assetTypesFromSettings.map(t => 
          typeof t === 'string' ? {name:t, color:'#0ea5e9'} : {name:t.name, color:t.color||'#0ea5e9'}
        );
        console.log(`⚠️ Using fallback asset types from localStorage`);
      }
    } catch (error) {
      console.error('Error loading asset types:', error);
      // Fallback
      const settings = RTS.getSettings();
      const assetTypesFromSettings = settings.assetTypes || [{name:'Equipment',color:'#0ea5e9'},{name:'Asset',color:'#a855f7'}];
      allAssetTypes = assetTypesFromSettings.map(t => 
        typeof t === 'string' ? {name:t, color:'#0ea5e9'} : {name:t.name, color:t.color||'#0ea5e9'}
      );
    }
    
    // Load locations from database only — no localStorage fallback
    try {
      const locationsResponse = await RTS_API.getLocations({ is_active: true });
      if (locationsResponse && locationsResponse.items && locationsResponse.items.length > 0) {
        allLocations = locationsResponse.items;
        console.log(`✅ Loaded ${allLocations.length} locations from database`);
        // Populate the location filter dropdown
        const locSel = document.getElementById('filterItemLocation');
        if (locSel) {
          locSel.innerHTML = '<option value="">All Locations</option>' +
            allLocations.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
          locSel.value = itemLocationFilter;
        }
      } else {
        allLocations = [];
        console.warn('⚠️ No locations in database — add them in Settings > Locations');
      }
    } catch (error) {
      console.error('Error loading locations:', error);
      allLocations = [];
    }
    
    console.log(`✅ Data load complete: ${boxes.length} boxes, ${equipment.length} equipment, ${assets.length} assets`);
    
    // Fire inventory load in the background — boxes render immediately without waiting
    loadInventoryItems().then(() => {
      const badge = document.getElementById('inventoryCount');
      if (badge) badge.textContent = inventoryItems.filter(i => !i.shopify_variant_id).length;
      if (currentFilter === 'inventory') renderItems();
      if (currentFilter === 'shopify') renderLocalShopifyTab();
    }).catch(e => console.warn('Background inventory load failed:', e));

    // Seed box contents if empty (pack items into boxes for testing)
    if (boxContents.length === 0 && boxes.length > 0) {
      await seedBoxContents();
    }
    
    // Fix 15: Warn about items with no location and no box
    const lostItems = [...equipment, ...assets].filter(item => !item.currentBoxId && !item.currentLocationId);
    if (lostItems.length > 0) {
      showLostItemsWarning(lostItems);
    } else {
      const existing = document.getElementById('lostItemsBanner');
      if (existing) existing.remove();
    }

    saveData();
  }

  function showLostItemsWarning(items) {
    let banner = document.getElementById('lostItemsBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'lostItemsBanner';
      banner.style.cssText = 'background:#fff3cd;color:#856404;border:1px solid #ffc107;padding:10px 14px;margin:8px;border-radius:6px;font-size:.8rem;display:flex;align-items:center;gap:10px;';
      const container = document.querySelector('.left-panel') || document.body;
      container.prepend(banner);
    }
    const names = items.slice(0, 3).map(i => i.name).join(', ');
    const more = items.length > 3 ? ` +${items.length - 3} more` : '';
    banner.innerHTML = `<span style="font-size:1.1rem">⚠️</span><div><strong>${items.length} unassigned item${items.length > 1 ? 's' : ''}</strong> — no box or location set.<br><span style="opacity:.8">${names}${more}</span></div>`;
  }

  // Load inventory items from database
  async function loadInventoryItems() {
    try {
      console.log('📦 Loading inventory items from API...');
      
      // Use RTS_API if available, otherwise fallback to RTS wrapper
      let response = null;
      if (typeof RTS_API !== 'undefined' && RTS_API.getCollectionItems) {
        response = await RTS_API.getCollectionItems('inventory');
      } else if (typeof RTS !== 'undefined' && RTS.apiGetCollectionItems) {
        response = await RTS.apiGetCollectionItems('inventory');
      }
      
      // Extract items array from response object
      if (response && response.items && Array.isArray(response.items)) {
        inventoryItems = response.items;
        console.log(`✅ Loaded ${inventoryItems.length} inventory items from database`);
        if (inventoryItems.length > 0) {
          console.log(`  📋 First inventory item ID: ${inventoryItems[0].id}, type: ${typeof inventoryItems[0].id}`);
          console.log(`  📋 Sample inventory IDs:`, inventoryItems.slice(0, 5).map(i => i.id));
        }
      } else {
        inventoryItems = [];
        console.log('📋 No inventory items found');
      }
    } catch (error) {
      console.error('❌ Error loading inventory items:', error);
      inventoryItems = [];
    }
  }
  
  async function seedBoxContents() {
    // Pack equipment and assets into boxes for testing
    // Strategy: Distribute items across boxes to show realistic packing
    
    const allItems = [
      ...equipment.map(e => ({ ...e, type: 'equipment' })),
      ...assets.map(a => ({ ...a, type: 'assets' }))
    ];
    
    // Pack 3-5 items per box (randomized)
    let itemIndex = 0;
    const packedItems = [];
    
    boxes.forEach((box, boxIndex) => {
      const itemsToPackInThisBox = 3 + Math.floor(Math.random() * 3); // 3-5 items
      
      for (let i = 0; i < itemsToPackInThisBox && itemIndex < allItems.length; i++) {
        const item = allItems[itemIndex];
        
        // Create box content entry
        const boxContent = {
          id: RTS.uid('content'),
          boxId: box.id,
          itemId: item.id,
          itemType: item.type,
          packedAt: new Date(Date.now() - Math.random() * 20 * 24 * 60 * 60 * 1000).toISOString() // Random within last 20 days
        };
        boxContents.push(boxContent);
        packedItems.push({ boxId: box.id, itemId: item.id });
        
        // Update item's currentBoxId
        if (item.type === 'equipment') {
          const equipItem = equipment.find(e => e.id === item.id);
          if (equipItem) equipItem.currentBoxId = box.id;
        } else {
          const assetItem = assets.find(a => a.id === item.id);
          if (assetItem) assetItem.currentBoxId = box.id;
        }
        
        itemIndex++;
      }
      
      // Add history entry for each box
      if (boxContents.filter(c => c.boxId === box.id).length > 0) {
        boxHistory.push({
          id: RTS.uid('history'),
          boxId: box.id,
          action: 'packed',
          details: `Box packed with ${boxContents.filter(c => c.boxId === box.id).length} items at ${box.location}`,
          timestamp: new Date(Date.now() - Math.random() * 20 * 24 * 60 * 60 * 1000).toISOString()
        });
      }
    });
    
    // Upload box contents to database in batches (parallel requests for speed)
    if (packedItems.length > 0) {
      try {
        console.log(`📦 Uploading ${packedItems.length} seed box contents to database...`);
        
        // Process in batches of 10 for parallel speed
        const batchSize = 10;
        for (let i = 0; i < packedItems.length; i += batchSize) {
          const batch = packedItems.slice(i, i + batchSize);
          await Promise.all(batch.map(packed => 
            RTS_API.packItem(packed.boxId, packed.itemId).catch(err => {
              console.warn(`Failed to pack item ${packed.itemId}:`, err.message);
            })
          ));
          console.log(`📦 Uploaded ${Math.min(i + batchSize, packedItems.length)}/${packedItems.length} box contents...`);
        }
        
        console.log(`✅ Successfully uploaded ${packedItems.length} box contents to database`);
      } catch (uploadError) {
        console.warn('Could not upload box contents to database:', uploadError.message);
      }
    }
  }

  function saveData() {
    // Data now stored in PlanetScale database via API calls
    // No longer using localStorage for business data (boxes, items, box_contents)
    // Only UI preferences and auth tokens remain in localStorage
    console.log('📊 Data persisted to PlanetScale database');
  }

  function seedBoxes() {
    // 20 boxes with varied types, all same size (100x60x50cm, 35kg capacity)
    const boxTypes = [
      { name: 'Tools Container', location: 'Warehouse - Bay A1' },
      { name: 'Spare Parts Box', location: 'Warehouse - Bay A2' },
      { name: 'Engine Parts Storage', location: 'Warehouse - Bay A3' },
      { name: 'Brake Components', location: 'Warehouse - Bay B1' },
      { name: 'Electrical Equipment', location: 'Warehouse - Bay B2' },
      { name: 'Diagnostic Tools', location: 'Warehouse - Bay B3' },
      { name: 'Lifting Equipment', location: 'Warehouse - Bay C1' },
      { name: 'Cooling System Parts', location: 'Warehouse - Bay C2' },
      { name: 'Fuel System Components', location: 'Warehouse - Bay C3' },
      { name: 'Filtration Supplies', location: 'Warehouse - Bay D1' },
      { name: 'Suspension Parts', location: 'Warehouse - Bay D2' },
      { name: 'Transmission Tools', location: 'Warehouse - Bay D3' },
      { name: 'Safety Equipment', location: 'Warehouse - Bay E1' },
      { name: 'Pneumatic Tools', location: 'Warehouse - Bay E2' },
      { name: 'Welding Supplies', location: 'Warehouse - Bay E3' },
      { name: 'Measuring Instruments', location: 'Warehouse - Bay F1' },
      { name: 'Fluids & Lubricants', location: 'Warehouse - Bay F2' },
      { name: 'Fasteners & Hardware', location: 'Warehouse - Bay F3' },
      { name: 'Bodywork Tools', location: 'Warehouse - Bay G1' },
      { name: 'Emergency Spares', location: 'Warehouse - Bay G2' }
    ];

    return boxTypes.map((type, index) => ({
      id: RTS.uid('box'),
      barcode: `BOX-${String(index + 1).padStart(3, '0')}`,
      name: `${type.name} ${String.fromCharCode(65 + (index % 5))}`, // A, B, C, D, E
      length: 100,
      width: 60,
      height: 50,
      weightCapacity: 35,
      location: type.location,
      status: 'available',
      createdAt: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString() // Random date within last 30 days
    }));
  }

  function seedEquipment() {
    return [
      // Tools (15 items)
      { id: RTS.uid('equip'), barcode: 'EQ-001', name: 'Impact Wrench 1/2"', category: 'Tools', status: 'available', currentBoxId: null },
      { id: RTS.uid('equip'), barcode: 'EQ-002', name: 'Torque Wrench 50-250Nm', category: 'Tools', status: 'available', currentBoxId: null },
      { id: RTS.uid('equip'), barcode: 'EQ-003', name: 'Socket Set (150pc)', category: 'Tools', status: 'available', currentBoxId: null },
      { id: RTS.uid('equip'), barcode: 'EQ-004', name: 'Ratchet Set Metric', category: 'Tools', status: 'available', currentBoxId: null },
      { id: RTS.uid('equip'), barcode: 'EQ-005', name: 'Hex Key Set Long', category: 'Tools', status: 'available', currentBoxId: null },
      { id: RTS.uid('equip'), barcode: 'EQ-006', name: 'Pliers Set (5pc)', category: 'Tools', status: 'available', currentBoxId: null },
      { id: RTS.uid('equip'), barcode: 'EQ-007', name: 'Screwdriver Set Professional', category: 'Tools', status: 'available', currentBoxId: null },
      { id: RTS.uid('equip'), barcode: 'EQ-008', name: 'Breaker Bar 1/2" Drive', category: 'Tools', status: 'available', currentBoxId: null },
      { id: RTS.uid('equip'), barcode: 'EQ-009', name: 'Extension Bar Set', category: 'Tools', status: 'available', currentBoxId: null },
      { id: RTS.uid('equip'), barcode: 'EQ-010', name: 'Adjustable Wrench 12"', category: 'Tools', status: 'available', currentBoxId: null },
      { id: RTS.uid('equip'), barcode: 'EQ-011', name: 'Hammer Set (3pc)', category: 'Tools', status: 'available', currentBoxId: null },
      { id: RTS.uid('equip'), barcode: 'EQ-012', name: 'Pry Bar Set', category: 'Tools', status: 'available', currentBoxId: null },
      { id: RTS.uid('equip'), barcode: 'EQ-013', name: 'Wire Brush Set', category: 'Tools', status: 'available', currentBoxId: null },
      { id: RTS.uid('equip'), barcode: 'EQ-014', name: 'Pick & Hook Set', category: 'Tools', status: 'available', currentBoxId: null },
      { id: RTS.uid('equip'), barcode: 'EQ-015', name: 'Chisel Set Cold', category: 'Tools', status: 'available', currentBoxId: null },
      
      // Diagnostics (10 items)
      { id: RTS.uid('equip'), barcode: 'EQ-016', name: 'Timing Light Digital', category: 'Diagnostics', status: 'available', currentBoxId: null },
      { id: RTS.uid('equip'), barcode: 'EQ-017', name: 'Compression Tester Kit', category: 'Diagnostics', status: 'available', currentBoxId: null },
      { id: RTS.uid('equip'), barcode: 'EQ-018', name: 'Fuel Pressure Gauge', category: 'Diagnostics', status: 'available', currentBoxId: null },
      { id: RTS.uid('equip'), barcode: 'EQ-019', name: 'Multimeter Professional', category: 'Diagnostics', status: 'available', currentBoxId: null },
      { id: RTS.uid('equip'), barcode: 'EQ-020', name: 'OBD Scanner Pro', category: 'Diagnostics', status: 'available', currentBoxId: null },
      { id: RTS.uid('equip'), barcode: 'EQ-021', name: 'Vacuum Gauge', category: 'Diagnostics', status: 'available', currentBoxId: null },
      { id: RTS.uid('equip'), barcode: 'EQ-022', name: 'Leak Down Tester', category: 'Diagnostics', status: 'available', currentBoxId: null },
      { id: RTS.uid('equip'), barcode: 'EQ-023', name: 'Circuit Tester', category: 'Diagnostics', status: 'available', currentBoxId: null },
      { id: RTS.uid('equip'), barcode: 'EQ-024', name: 'Temperature Gun IR', category: 'Diagnostics', status: 'available', currentBoxId: null },
      { id: RTS.uid('equip'), barcode: 'EQ-025', name: 'Stethoscope Mechanic', category: 'Diagnostics', status: 'available', currentBoxId: null },
      
      // Lifting (8 items)
      { id: RTS.uid('equip'), barcode: 'EQ-026', name: 'Jack Stand 3-ton (Pair)', category: 'Lifting', status: 'available', currentBoxId: null },
      { id: RTS.uid('equip'), barcode: 'EQ-027', name: 'Floor Jack 3-ton Low Profile', category: 'Lifting', status: 'available', currentBoxId: null },
      { id: RTS.uid('equip'), barcode: 'EQ-028', name: 'Bottle Jack 6-ton', category: 'Lifting', status: 'available', currentBoxId: null },
      { id: RTS.uid('equip'), barcode: 'EQ-029', name: 'Engine Hoist 2-ton', category: 'Lifting', status: 'available', currentBoxId: null },
      { id: RTS.uid('equip'), barcode: 'EQ-030', name: 'Transmission Jack', category: 'Lifting', status: 'available', currentBoxId: null },
      { id: RTS.uid('equip'), barcode: 'EQ-031', name: 'Chain Hoist 1-ton', category: 'Lifting', status: 'available', currentBoxId: null },
      { id: RTS.uid('equip'), barcode: 'EQ-032', name: 'Wheel Dolly Set (4pc)', category: 'Lifting', status: 'available', currentBoxId: null },
      { id: RTS.uid('equip'), barcode: 'EQ-033', name: 'Ramps Aluminum (Pair)', category: 'Lifting', status: 'available', currentBoxId: null },
      
      // Equipment (12 items)
      { id: RTS.uid('equip'), barcode: 'EQ-034', name: 'Air Compressor 50L', category: 'Equipment', status: 'available', currentBoxId: null },
      { id: RTS.uid('equip'), barcode: 'EQ-035', name: 'Air Impact Gun 1"', category: 'Equipment', status: 'available', currentBoxId: null },
      { id: RTS.uid('equip'), barcode: 'EQ-036', name: 'Air Ratchet 3/8"', category: 'Equipment', status: 'available', currentBoxId: null },
      { id: RTS.uid('equip'), barcode: 'EQ-037', name: 'Grinder Angle 9"', category: 'Equipment', status: 'available', currentBoxId: null },
      { id: RTS.uid('equip'), barcode: 'EQ-038', name: 'Drill Press Bench', category: 'Equipment', status: 'available', currentBoxId: null },
      { id: RTS.uid('equip'), barcode: 'EQ-039', name: 'Welder MIG 200A', category: 'Equipment', status: 'available', currentBoxId: null },
      { id: RTS.uid('equip'), barcode: 'EQ-040', name: 'Battery Charger 50A', category: 'Equipment', status: 'available', currentBoxId: null },
      { id: RTS.uid('equip'), barcode: 'EQ-041', name: 'Pressure Washer 2000PSI', category: 'Equipment', status: 'available', currentBoxId: null },
      { id: RTS.uid('equip'), barcode: 'EQ-042', name: 'Work Light LED 5000lm', category: 'Equipment', status: 'available', currentBoxId: null },
      { id: RTS.uid('equip'), barcode: 'EQ-043', name: 'Heat Gun Industrial', category: 'Equipment', status: 'available', currentBoxId: null },
      { id: RTS.uid('equip'), barcode: 'EQ-044', name: 'Parts Washer 75L', category: 'Equipment', status: 'available', currentBoxId: null },
      { id: RTS.uid('equip'), barcode: 'EQ-045', name: 'Tire Inflator Digital', category: 'Equipment', status: 'available', currentBoxId: null }
    ];
  }

  function seedAssets() {
    return [
      // Brakes (10 items)
      { id: RTS.uid('asset'), barcode: 'AS-001', name: 'Brake Pad Set Front Performance', category: 'Brakes', status: 'available', currentBoxId: null },
      { id: RTS.uid('asset'), barcode: 'AS-002', name: 'Brake Pad Set Rear Performance', category: 'Brakes', status: 'available', currentBoxId: null },
      { id: RTS.uid('asset'), barcode: 'AS-003', name: 'Brake Disc Front Vented', category: 'Brakes', status: 'available', currentBoxId: null },
      { id: RTS.uid('asset'), barcode: 'AS-004', name: 'Brake Disc Rear Solid', category: 'Brakes', status: 'available', currentBoxId: null },
      { id: RTS.uid('asset'), barcode: 'AS-005', name: 'Brake Fluid DOT 5.1 (5L)', category: 'Brakes', status: 'available', currentBoxId: null },
      { id: RTS.uid('asset'), barcode: 'AS-006', name: 'Brake Caliper Piston Tool', category: 'Brakes', status: 'available', currentBoxId: null },
      { id: RTS.uid('asset'), barcode: 'AS-007', name: 'Brake Line Set Braided', category: 'Brakes', status: 'available', currentBoxId: null },
      { id: RTS.uid('asset'), barcode: 'AS-008', name: 'Master Cylinder Rebuild Kit', category: 'Brakes', status: 'available', currentBoxId: null },
      { id: RTS.uid('asset'), barcode: 'AS-009', name: 'Brake Bleeder Kit', category: 'Brakes', status: 'available', currentBoxId: null },
      { id: RTS.uid('asset'), barcode: 'AS-010', name: 'Caliper Slide Pin Kit', category: 'Brakes', status: 'available', currentBoxId: null },
      
      // Engine (15 items)
      { id: RTS.uid('asset'), barcode: 'AS-011', name: 'Spark Plug Set Platinum', category: 'Engine', status: 'available', currentBoxId: null },
      { id: RTS.uid('asset'), barcode: 'AS-012', name: 'Ignition Coil Pack', category: 'Engine', status: 'available', currentBoxId: null },
      { id: RTS.uid('asset'), barcode: 'AS-013', name: 'Timing Belt Kit Complete', category: 'Engine', status: 'available', currentBoxId: null },
      { id: RTS.uid('asset'), barcode: 'AS-014', name: 'Water Pump OEM', category: 'Engine', status: 'available', currentBoxId: null },
      { id: RTS.uid('asset'), barcode: 'AS-015', name: 'Thermostat 88°C', category: 'Engine', status: 'available', currentBoxId: null },
      { id: RTS.uid('asset'), barcode: 'AS-016', name: 'Head Gasket Set', category: 'Engine', status: 'available', currentBoxId: null },
      { id: RTS.uid('asset'), barcode: 'AS-017', name: 'Valve Cover Gasket', category: 'Engine', status: 'available', currentBoxId: null },
      { id: RTS.uid('asset'), barcode: 'AS-018', name: 'Piston Ring Set Standard', category: 'Engine', status: 'available', currentBoxId: null },
      { id: RTS.uid('asset'), barcode: 'AS-019', name: 'Camshaft Position Sensor', category: 'Engine', status: 'available', currentBoxId: null },
      { id: RTS.uid('asset'), barcode: 'AS-020', name: 'Crankshaft Position Sensor', category: 'Engine', status: 'available', currentBoxId: null },
      { id: RTS.uid('asset'), barcode: 'AS-021', name: 'Engine Oil Seal Kit', category: 'Engine', status: 'available', currentBoxId: null },
      { id: RTS.uid('asset'), barcode: 'AS-022', name: 'Intake Manifold Gasket', category: 'Engine', status: 'available', currentBoxId: null },
      { id: RTS.uid('asset'), barcode: 'AS-023', name: 'Exhaust Manifold Gasket', category: 'Engine', status: 'available', currentBoxId: null },
      { id: RTS.uid('asset'), barcode: 'AS-024', name: 'Serpentine Belt', category: 'Engine', status: 'available', currentBoxId: null },
      { id: RTS.uid('asset'), barcode: 'AS-025', name: 'Tensioner Pulley Assembly', category: 'Engine', status: 'available', currentBoxId: null },
      
      // Filters (8 items)
      { id: RTS.uid('asset'), barcode: 'AS-026', name: 'Oil Filter Performance (Pack of 6)', category: 'Filters', status: 'available', currentBoxId: null },
      { id: RTS.uid('asset'), barcode: 'AS-027', name: 'Air Filter High Flow', category: 'Filters', status: 'available', currentBoxId: null },
      { id: RTS.uid('asset'), barcode: 'AS-028', name: 'Fuel Filter Inline (Pack of 3)', category: 'Filters', status: 'available', currentBoxId: null },
      { id: RTS.uid('asset'), barcode: 'AS-029', name: 'Cabin Air Filter Carbon', category: 'Filters', status: 'available', currentBoxId: null },
      { id: RTS.uid('asset'), barcode: 'AS-030', name: 'Transmission Filter Kit', category: 'Filters', status: 'available', currentBoxId: null },
      { id: RTS.uid('asset'), barcode: 'AS-031', name: 'Fuel Pump Pre-Filter', category: 'Filters', status: 'available', currentBoxId: null },
      { id: RTS.uid('asset'), barcode: 'AS-032', name: 'Breather Filter', category: 'Filters', status: 'available', currentBoxId: null },
      { id: RTS.uid('asset'), barcode: 'AS-033', name: 'Hydraulic Filter', category: 'Filters', status: 'available', currentBoxId: null },
      
      // Cooling (7 items)
      { id: RTS.uid('asset'), barcode: 'AS-034', name: 'Radiator Aluminum Performance', category: 'Cooling', status: 'available', currentBoxId: null },
      { id: RTS.uid('asset'), barcode: 'AS-035', name: 'Coolant Hose Kit Silicone', category: 'Cooling', status: 'available', currentBoxId: null },
      { id: RTS.uid('asset'), barcode: 'AS-036', name: 'Electric Fan 12" High Flow', category: 'Cooling', status: 'available', currentBoxId: null },
      { id: RTS.uid('asset'), barcode: 'AS-037', name: 'Radiator Cap 1.3bar', category: 'Cooling', status: 'available', currentBoxId: null },
      { id: RTS.uid('asset'), barcode: 'AS-038', name: 'Coolant Temperature Sensor', category: 'Cooling', status: 'available', currentBoxId: null },
      { id: RTS.uid('asset'), barcode: 'AS-039', name: 'Expansion Tank', category: 'Cooling', status: 'available', currentBoxId: null },
      { id: RTS.uid('asset'), barcode: 'AS-040', name: 'Coolant Premix 50/50 (20L)', category: 'Cooling', status: 'available', currentBoxId: null }
    ];
  }

  function initUI() {
    boxModal = new bootstrap.Modal(document.getElementById('boxModal'));
    historyModal = new bootstrap.Modal(document.getElementById('historyModal'));
    unpackModal = new bootstrap.Modal(document.getElementById('unpackModal'));
    unpackStepReturnModal = new bootstrap.Modal(document.getElementById('unpackStepReturnModal'));
    unpackStepBillModal   = new bootstrap.Modal(document.getElementById('unpackStepBillModal'));
    unpackStepConfirmModal = new bootstrap.Modal(document.getElementById('unpackStepConfirmModal'));

    document.getElementById('btnNewBox').addEventListener('click', () => showBoxModal());
    document.getElementById('btnSaveBox').addEventListener('click', saveBox);
    document.getElementById('btnPrintLabel').addEventListener('click', printLabel);
    document.getElementById('btnBoxHistory').addEventListener('click', showHistory);
    document.getElementById('btnConfirmUnpack').addEventListener('click', confirmUnpack);
    document.getElementById('searchBoxes').addEventListener('input', renderBoxes);

    // Tab search inputs
    const searchAssetsEl = document.getElementById('searchAssets');
    const searchInvEl    = document.getElementById('searchInventory');
    const locFilterEl = document.getElementById('filterItemLocation');
    if (locFilterEl) locFilterEl.addEventListener('change', () => { itemLocationFilter = locFilterEl.value; itemsPage = 1; renderItems(); });
    if (searchAssetsEl) searchAssetsEl.addEventListener('input', () => { itemsPage = 1; renderItems(); });
    if (searchInvEl)    searchInvEl.addEventListener('input',    () => { itemsPage = 1; renderItems(); });

    // Legacy hidden search (kept for any code still referencing it)
    const legacySearch = document.getElementById('searchItems');
    if (legacySearch) legacySearch.addEventListener('input', () => { itemsPage = 1; renderItems(); });

    // Sort dropdowns
    const sortBoxes = document.getElementById('sortBoxes');
    if (sortBoxes) sortBoxes.addEventListener('change', renderBoxes);

    // Default to assets tab
    currentFilter = 'all';

    // Setup custom modal buttons
    setupCustomModals();

    setupDragAndDrop();
    setupResizablePanels();
    initShopifySearch();
  }

  // ========== ITEMS TAB SWITCHING ==========
  function switchItemsTab(tab) {
    currentFilter = tab === 'inventory' ? 'inventory' : (tab === 'shopify' ? 'shopify' : 'all');
    itemsPage = 1;

    // Tab button active states
    document.getElementById('tabBtnAssets')?.classList.toggle('active', tab === 'assets');
    document.getElementById('tabBtnInventory')?.classList.toggle('active', tab === 'inventory');
    document.getElementById('tabBtnShopify')?.classList.toggle('active', tab === 'shopify');

    // Tab pane visibility
    document.getElementById('paneAssets')?.classList.toggle('active', tab === 'assets');
    document.getElementById('paneInventory')?.classList.toggle('active', tab === 'inventory');
    document.getElementById('paneShopify')?.classList.toggle('active', tab === 'shopify');

    if (tab === 'inventory') {
      loadInventoryItems().then(() => renderItems());
    } else if (tab === 'shopify') {
      ensureShopifyLocations();
      renderLocalShopifyTab();
      setTimeout(() => document.getElementById('searchShopify')?.focus(), 50);
    } else {
      renderItems();
    }
  }
  // Expose so onclick in HTML works within the IIFE
  window.switchItemsTab = switchItemsTab;

  // ========== SHOPIFY LIVE SEARCH ==========

  let _shopifyDebounceTimer = null;
  let _shopifyLocations = null; // cached after first load

  // Fetches Shopify locations and caches in _shopifyLocations.
  // Safe to call multiple times — returns immediately if already loaded.
  async function loadShopifyLocationsCache() {
    if (_shopifyLocations) return;
    try {
      const resp = await fetch('/api/shopify/locations', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}` }
      });
      const data = await resp.json();
      if (resp.ok && data.success && data.locations && data.locations.length) {
        _shopifyLocations = data.locations;
        console.log('Shopify locations loaded:', _shopifyLocations.map(l => l.name));
      } else {
        console.warn('Shopify locations load failed:', data.error || data);
      }
    } catch (e) {
      console.error('Could not load Shopify locations:', e);
    }
  }

  async function ensureShopifyLocations() {
    await loadShopifyLocationsCache();
    const sel = document.getElementById('shopifyLocationSelect');
    if (!sel) return;
    sel.disabled = true;
    sel.innerHTML = '<option value="">⏳ Loading locations…</option>';
    try {
      if (_shopifyLocations && _shopifyLocations.length) {
        sel.innerHTML = '<option value="">All locations (combined)</option>' +
          _shopifyLocations.map(l => `<option value="${l.legacyId}">${l.name}</option>`).join('');
        // Re-run search if there is already a query
        const q = document.getElementById('searchShopify')?.value?.trim();
        if (q && q.length >= 2) searchShopify(q);
      } else {
        sel.innerHTML = '<option value="">⚠️ No Shopify locations found</option>';
      }
    } catch (e) {
      console.error('Could not populate Shopify locations select:', e);
      sel.innerHTML = '<option value="">⚠️ Could not load locations</option>';
    } finally {
      sel.disabled = false;
    }
  }

  function getShopifyLocationName(legacyId) {
    if (!_shopifyLocations || !legacyId) return legacyId || '';
    return (_shopifyLocations.find(l => l.legacyId === String(legacyId)) || {}).name || legacyId;
  }

  function initShopifySearch() {
    const el = document.getElementById('searchShopify');
    if (!el) return;
    el.addEventListener('input', () => {
      clearTimeout(_shopifyDebounceTimer);
      const q = el.value.trim();
      if (q.length < 2) {
        renderLocalShopifyTab();
        return;
      }
      _shopifyDebounceTimer = setTimeout(() => searchShopify(q), 350);
    });
    // Re-render or re-search when location changes
    document.getElementById('shopifyLocationSelect')?.addEventListener('change', () => {
      const q = el.value.trim();
      if (q.length >= 2) searchShopify(q);
      else renderLocalShopifyTab();
    });
  }

  async function searchShopify(q) {
    const spinner = document.getElementById('shopifySearchSpinner');
    const status  = document.getElementById('shopifySearchStatus');
    if (spinner) spinner.style.display = 'inline';
    if (status)  { status.textContent = `Searching Shopify for "${q}"…`; status.style.display = 'block'; }

    try {
      const locationId = document.getElementById('shopifyLocationSelect')?.value || '';
      const url = `/api/shopify/search?q=${encodeURIComponent(q)}${locationId ? `&locationId=${encodeURIComponent(locationId)}` : ''}`;
      const resp = await fetch(url, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}` }
      });
      const data = await resp.json();

      if (!resp.ok || !data.success) {
        const msg = data.error || 'Shopify search failed';
        if (status) { status.textContent = `⚠️ ${msg}`; status.style.display = 'block'; }
        renderShopifyResults([]);
        return;
      }

      if (status) {
        const locName = getShopifyLocationName(document.getElementById('shopifyLocationSelect')?.value || '');
        const locLabel = locName ? ` at ${locName}` : '';
        status.textContent = data.products.length
          ? `${data.products.length} result${data.products.length !== 1 ? 's' : ''} from Shopify${locLabel}`
          : `No products found for "${q}"${locLabel}`;
        status.style.display = 'block';
      }
      renderShopifyResults(data.products);
    } catch (err) {
      console.error('Shopify search error:', err);
      if (status) { status.textContent = '⚠️ Could not reach Shopify'; status.style.display = 'block'; }
      renderShopifyResults([]);
    } finally {
      if (spinner) spinner.style.display = 'none';
    }
  }

  function renderShopifyResults(products) {
    const list = document.getElementById('itemsList');
    if (!list) return;

    // Only render in Shopify tab
    if (currentFilter !== 'shopify') return;

    if (!products || products.length === 0) {
      const isEmpty = !document.getElementById('searchShopify')?.value?.trim();
      list.innerHTML = `<div style="text-align:center;padding:24px 12px;color:#5f6368;font-size:.82rem">
        ${isEmpty
          ? '🛍️ Type to search your Shopify store'
          : '🔍 No matching products found'}
      </div>`;
      return;
    }

    list.innerHTML = products.map(p => {
      const img = p.image_url
        ? `<img src="${esc(p.image_url)}" style="width:36px;height:36px;object-fit:cover;border-radius:3px;flex-shrink:0;border:1px solid #e0e0e0">`
        : `<div style="width:36px;height:36px;background:#f0f0f0;border-radius:3px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:1.1rem">📦</div>`;
      const qty = p.shopify_quantity;
      const qtyColour = qty > 0 ? '#34a853' : '#ea4335';
      return `
        <div class="item-card shopify-result-card"
             data-shopify-variant-id="${esc(p.shopify_variant_id)}"
             data-shopify-product-id="${esc(p.shopify_product_id)}"
             data-shopify-inventory-item-id="${esc(p.shopify_inventory_item_id)}"
             data-shopify-name="${esc(p.name)}"
             data-shopify-sku="${esc(p.sku)}"
             data-shopify-price="${esc(p.price)}"
             data-shopify-category="${esc(p.category)}"
             data-shopify-vendor="${esc(p.vendor)}"
             data-shopify-qty="${p.shopify_quantity}"
             style="cursor:pointer;padding:8px!important;padding-left:10px!important"
             onclick="shopifyPackCard(this)">
          <div style="display:flex;gap:8px;align-items:center">
            ${img}
            <div style="flex:1;min-width:0">
              <div style="font-size:.78rem;font-weight:600;color:#202124;line-height:1.3;margin-bottom:2px">${esc(p.name)}</div>
              <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
                ${p.sku ? `<span style="font-family:monospace;font-size:.68rem;color:#1a73e8">${esc(p.sku)}</span>` : ''}
                <span style="font-size:.68rem;color:#5f6368;background:#f0f0f0;padding:1px 5px;border-radius:3px">${esc(p.category)}</span>
                <span style="font-size:.68rem;font-weight:700;color:${qtyColour}">${qty} in stock</span>
              </div>
              <div style="font-size:.73rem;color:#34a853;font-weight:600;margin-top:2px">R${esc(p.price)} — click to pack ↓</div>
            </div>
          </div>
        </div>`;
    }).join('');
  }

  // Renders locally-imported Shopify items with live stock from the selected Shopify location.
  // Called on Shopify tab open and on location change (when no live search query).
  async function renderLocalShopifyTab() {
    if (currentFilter !== 'shopify') return;
    const list = document.getElementById('itemsList');
    const status = document.getElementById('shopifySearchStatus');
    if (!list) return;

    // Ensure inventory items are loaded
    if (inventoryItems.length === 0) {
      list.innerHTML = '<div style="text-align:center;padding:24px 12px;color:#5f6368;font-size:.82rem">⏳ Loading…</div>';
      await loadInventoryItems();
    }

    const shopifyItems = inventoryItems.filter(i => i.shopify_variant_id || i.shopify_inventory_item_id);
    const locationId = document.getElementById('shopifyLocationSelect')?.value || '';
    const locationName = getShopifyLocationName(locationId);

    if (shopifyItems.length === 0) {
      list.innerHTML = '<div style="text-align:center;padding:24px 12px;color:#5f6368;font-size:.82rem">🛒 No locally imported Shopify items.<br><span style="font-size:.75rem">Add items from the Shopify tab search to see them here.</span></div>';
      if (status) status.style.display = 'none';
      return;
    }

    // Show loading state while fetching stock
    if (status) { status.textContent = `⏳ Loading stock for ${shopifyItems.length} items…`; status.style.display = 'block'; }

    // Fetch live inventory levels from Shopify for selected location
    let levels = {};
    const invItemIds = shopifyItems.map(i => i.shopify_inventory_item_id).filter(Boolean);
    if (invItemIds.length > 0 && locationId) {
      try {
        const resp = await fetch(`/api/shopify/inventory-levels?locationId=${encodeURIComponent(locationId)}&ids=${invItemIds.join(',')}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}` }
        });
        const data = await resp.json();
        if (data.success) levels = data.levels;
      } catch (e) { console.warn('Could not fetch inventory levels:', e); }
    }

    if (status) {
      status.textContent = locationId
        ? `${shopifyItems.length} Shopify items at ${locationName}`
        : `${shopifyItems.length} Shopify items — select a location to see stock`;
      status.style.display = 'block';
    }

    // Apply search filter from input
    const q = (document.getElementById('searchShopify')?.value || '').toLowerCase().trim();
    const filtered = q
      ? shopifyItems.filter(i => (i.name || '').toLowerCase().includes(q) || (i.sku || '').toLowerCase().includes(q))
      : shopifyItems;

    if (filtered.length === 0) {
      list.innerHTML = `<div style="text-align:center;padding:24px 12px;color:#5f6368;font-size:.82rem">No results for "${esc(q)}"</div>`;
      return;
    }

    list.innerHTML = filtered.map(item => {
      const invId = String(item.shopify_inventory_item_id || '');
      const qty = invId && levels.hasOwnProperty(invId) ? levels[invId] : (locationId ? 0 : null);
      const qtyColour = qty != null && qty > 0 ? '#34a853' : '#ea4335';
      const packedQty = window.inventoryPackedQuantities?.get(item.id) || 0;
      return `
        <div class="item-card shopify-result-card"
             data-shopify-variant-id="${esc(item.shopify_variant_id || '')}"
             data-shopify-product-id="${esc(item.shopify_product_id || '')}"
             data-shopify-inventory-item-id="${esc(item.shopify_inventory_item_id || '')}"
             data-shopify-name="${esc(item.name)}"
             data-shopify-sku="${esc(item.sku || '')}"
             data-shopify-price="${esc(String(item.unit_cost || '0'))}"
             data-shopify-category="${esc(item.category || '')}"
             data-shopify-vendor="${esc(item.supplier || '')}"
             data-shopify-qty="${qty != null ? qty : 0}"
             style="cursor:pointer;padding:8px!important;padding-left:10px!important"
             onclick="shopifyPackCard(this)">
          <div style="display:flex;gap:8px;align-items:center">
            <div style="width:36px;height:36px;background:#f0f0f0;border-radius:3px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:1.1rem">📦</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:.78rem;font-weight:600;color:#202124;line-height:1.3;margin-bottom:2px">${esc(item.name)}</div>
              <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
                ${item.sku ? `<span style="font-family:monospace;font-size:.68rem;color:#1a73e8">${esc(item.sku)}</span>` : ''}
                ${item.category ? `<span style="font-size:.68rem;color:#5f6368;background:#f0f0f0;padding:1px 5px;border-radius:3px">${esc(item.category)}</span>` : ''}
                ${locationId
                  ? `<span style="font-size:.68rem;font-weight:700;color:${qtyColour}">${qty != null ? qty + ' in stock' : '—'}</span>`
                  : `<span style="font-size:.68rem;color:#5f6368">select location for stock</span>`}
                ${packedQty > 0 ? `<span style="font-size:.68rem;font-weight:700;color:#ff9800">${packedQty} packed</span>` : ''}
              </div>
              <div style="font-size:.73rem;color:#34a853;font-weight:600;margin-top:2px">R${esc(String(item.unit_cost || '0.00'))} — click to pack ↓</div>
            </div>
          </div>
        </div>`;
    }).join('');
  }
  window.renderLocalShopifyTab = renderLocalShopifyTab;

  // Called when user clicks a Shopify result card
  window.shopifyPackCard = async function(cardEl) {
    const variantId  = cardEl.dataset.shopifyVariantId;
    const productId  = cardEl.dataset.shopifyProductId;
    const invItemId  = cardEl.dataset.shopifyInventoryItemId;
    const name       = cardEl.dataset.shopifyName;
    const sku        = cardEl.dataset.shopifySku;
    const price      = cardEl.dataset.shopifyPrice;
    const category   = cardEl.dataset.shopifyCategory;
    const vendor     = cardEl.dataset.shopifyVendor;
    const shopifyQty = parseInt(cardEl.dataset.shopifyQty) || 0;

    const locationId   = document.getElementById('shopifyLocationSelect')?.value || '';
    const locationName = getShopifyLocationName(locationId);

    try {
      if (currentBoxId) {
        // ── Box selected: ask qty, decrement Shopify stock, then pack ──
        const box = boxes.find(b => b.id === currentBoxId);
        const locLabel = locationName ? ` at ${locationName}` : '';
        const quantityStr = await customPrompt(
          `📦 Pack "${name}"`,
          `Packing into: ${box ? box.name : currentBoxId}\n\nShopify stock${locLabel}: ${shopifyQty} units\n\nHow many to pack?`,
          `1`
        );
        if (!quantityStr || !quantityStr.trim()) return;
        const quantity = parseInt(quantityStr);
        if (isNaN(quantity) || quantity <= 0) { showToast('Invalid quantity', 'error'); return; }

        showLoading('Shopify', `Importing & packing ${name}…`);

        // Lazy-import
        const importResp = await fetch('/api/shopify/lazy-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}` },
          body: JSON.stringify({ shopify_variant_id: variantId, shopify_product_id: productId, shopify_inventory_item_id: invItemId, name, sku, price, category, vendor, shopify_quantity: shopifyQty })
        });
        const importData = await importResp.json();
        if (!importResp.ok || !importData.success) {
          hideLoading();
          showToast(`Import failed: ${importData.error || 'unknown error'}`, 'error');
          return;
        }

        // Decrement Shopify stock at selected location
        if (locationId && invItemId) {
          try {
            await fetch('/api/shopify/adjust-stock', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}` },
              body: JSON.stringify({ inventory_item_id: invItemId, location_id: locationId, adjustment: -quantity })
            });
          } catch (e) {
            console.warn('Shopify stock adjustment failed (non-fatal):', e);
          }
        }

        await loadInventoryItems();
        hideLoading();
        await packMultipleItems(currentBoxId, [{ id: String(importData.item.id), type: 'inventory' }], quantity);

      } else {
        // ── No box selected: import only, switch to Inventory tab ──
        showLoading('Shopify', `Importing ${name}…`);
        const importResp = await fetch('/api/shopify/lazy-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}` },
          body: JSON.stringify({ shopify_variant_id: variantId, shopify_product_id: productId, shopify_inventory_item_id: invItemId, name, sku, price, category, vendor, shopify_quantity: shopifyQty })
        });
        const importData = await importResp.json();
        if (!importResp.ok || !importData.success) {
          hideLoading();
          showToast(`Import failed: ${importData.error || 'unknown error'}`, 'error');
          return;
        }
        await loadInventoryItems();
        hideLoading();
        showToast(`✅ "${name}" imported — drag it from the Inventory tab to a box`, 'success');
        switchItemsTab('inventory');
      }

    } catch (err) {
      hideLoading();
      console.error('Shopify pack error:', err);
      showToast(`Error: ${err.message}`, 'error');
    }
  };

  // ========== CUSTOM MODAL HELPERS ==========
  function setupCustomModals() {
    // Prompt modal
    const promptModal = new bootstrap.Modal(document.getElementById('customPromptModal'));
    const promptInput = document.getElementById('promptModalInput');
    const btnPromptConfirm = document.getElementById('btnPromptConfirm');
    let promptResolve = null;
    
    window.customPrompt = function(title, message, placeholder = '') {
      return new Promise((resolve) => {
        document.getElementById('promptModalTitle').textContent = title;
        document.getElementById('promptModalMessage').textContent = message;
        promptInput.value = '';
        promptInput.placeholder = placeholder;
        promptResolve = resolve;
        promptModal.show();
        setTimeout(() => promptInput.focus(), 300);
      });
    };
    
    btnPromptConfirm.addEventListener('click', () => {
      const value = promptInput.value.trim();
      if (value && promptResolve) {
        const resolve = promptResolve;
        promptResolve = null;
        promptModal.hide();
        resolve(value);
      }
    });
    
    document.getElementById('customPromptModal').addEventListener('hidden.bs.modal', () => {
      if (promptResolve) {
        const resolve = promptResolve;
        promptResolve = null;
        resolve(null);
      }
    });
    
    promptInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && promptInput.value.trim()) {
        btnPromptConfirm.click();
      }
    });
    
    // Confirm modal
    const confirmModal = new bootstrap.Modal(document.getElementById('customConfirmModal'));
    const btnConfirmYes = document.getElementById('btnConfirmYes');
    let confirmResolve = null;
    let confirmResult = null;
    
    window.customConfirm = function(title, message, confirmButtonText = 'Confirm', isDanger = false) {
      return new Promise((resolve) => {
        document.getElementById('confirmModalTitle').textContent = title;
        document.getElementById('confirmModalMessage').textContent = message;
        btnConfirmYes.textContent = confirmButtonText;
        btnConfirmYes.className = isDanger ? 'btn btn-danger' : 'btn btn-primary';
        confirmResolve = resolve;
        confirmResult = null;
        confirmModal.show();
      });
    };
    
    btnConfirmYes.addEventListener('click', () => {
      if (confirmResolve) {
        confirmResult = true;
        confirmModal.hide();
      }
    });
    
    document.getElementById('customConfirmModal').addEventListener('hidden.bs.modal', () => {
      if (confirmResolve) {
        const resolve = confirmResolve;
        confirmResolve = null;
        resolve(confirmResult === true);
        confirmResult = null;
      }
    });
    
    // Select modal (for location picker)
    const selectModal = new bootstrap.Modal(document.getElementById('customSelectModal'));
    const selectDropdown = document.getElementById('selectModalDropdown');
    const btnSelectConfirm = document.getElementById('btnSelectConfirm');
    let selectResolve = null;
    
    window.customSelect = function(title, message, options = []) {
      return new Promise((resolve) => {
        document.getElementById('selectModalTitle').textContent = title;
        document.getElementById('selectModalMessage').textContent = message;
        
        // Populate dropdown with options
        let optionsHTML = '<option value="">Select...</option>';
        options.forEach(opt => {
          const value = opt.value || opt.id || opt;
          const label = opt.label || opt.name || opt;
          optionsHTML += `<option value="${value}">${label}</option>`;
        });
        selectDropdown.innerHTML = optionsHTML;
        
        selectResolve = resolve;
        selectModal.show();
        setTimeout(() => selectDropdown.focus(), 300);
      });
    };
    
    btnSelectConfirm.addEventListener('click', () => {
      const value = selectDropdown.value;
      if (value && selectResolve) {
        const resolve = selectResolve;
        selectResolve = null;
        selectModal.hide();
        
        // Find the selected option's full data
        const selectedOption = allLocations.find(loc => loc.id === value);
        resolve(selectedOption);
      }
    });
    
    document.getElementById('customSelectModal').addEventListener('hidden.bs.modal', () => {
      if (selectResolve) {
        const resolve = selectResolve;
        selectResolve = null;
        resolve(null);
      }
    });
    
    selectDropdown.addEventListener('change', (e) => {
      btnSelectConfirm.disabled = !e.target.value;
    });
  }
  
  // ========== RESIZABLE PANELS ==========
  function setupResizablePanels() {
    const resize1 = document.getElementById('resize1');
    const resize2 = document.getElementById('resize2');
    const leftPanel = document.getElementById('leftPanel');
    const middlePanel = document.getElementById('middlePanel');
    const rightPanel = document.getElementById('rightPanel');
    
    function makeResizable(handle, leftEl, rightEl) {
      let startX, startLeftWidth, startRightWidth;
      
      handle.addEventListener('mousedown', e => {
        startX = e.clientX;
        startLeftWidth = leftEl.offsetWidth;
        startRightWidth = rightEl.offsetWidth;
        
        function onMouseMove(e) {
          const dx = e.clientX - startX;
          const newLeftWidth = startLeftWidth + dx;
          const newRightWidth = startRightWidth - dx;
          
          if (newLeftWidth >= 180 && newRightWidth >= 180) {
            leftEl.style.flex = `0 0 ${newLeftWidth}px`;
            rightEl.style.flex = `0 0 ${newRightWidth}px`;
          }
        }
        
        function onMouseUp() {
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
        }
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        e.preventDefault();
      });
    }
    
    makeResizable(resize1, leftPanel, middlePanel);
    makeResizable(resize2, middlePanel, rightPanel);
  }

  // ========== COLOR UTILITY FUNCTIONS ==========
  function hexToRgba(hex, alpha = 1) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  
  function lightenColor(hex, percent) {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return '#' + (0x1000000 + 
      (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 + 
      (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 + 
      (B < 255 ? B < 1 ? 0 : B : 255)
    ).toString(16).slice(1);
  }
  
  function adjustBrightness(hex, percent) {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.max(0, Math.min(255, (num >> 16) + amt));
    const G = Math.max(0, Math.min(255, (num >> 8 & 0x00FF) + amt));
    const B = Math.max(0, Math.min(255, (num & 0x0000FF) + amt));
    return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
  }
  
  // ========== RENDERING ==========
  function renderAll() {
    renderBoxes();
    renderItems();
    updateStats();
    if (currentBoxId) renderBoxContents();
  }

  function renderBoxes() {
    const search = document.getElementById('searchBoxes').value.toLowerCase();
    const sortBy = document.getElementById('sortBoxes')?.value || 'name';

    // Count loaded vs available for filter badges
    const searchFiltered = boxes.filter(b =>
      (b.barcode || '').toLowerCase().includes(search) ||
      (b.name || '').toLowerCase().includes(search) ||
      (b.location || '').toLowerCase().includes(search)
    );
    const countLoaded    = searchFiltered.filter(b => !!b.truckId).length;
    const countAvailable = searchFiltered.filter(b => !b.truckId).length;
    const el_all  = document.getElementById('boxFilterCountAll');
    const el_avail= document.getElementById('boxFilterCountAvailable');
    const el_load = document.getElementById('boxFilterCountLoaded');
    if (el_all)   el_all.textContent   = searchFiltered.length;
    if (el_avail) el_avail.textContent = countAvailable;
    if (el_load)  el_load.textContent  = countLoaded;
    // Update active button
    document.querySelectorAll('.box-filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === boxLoadFilter);
    });

    // Apply load filter
    let filtered = searchFiltered.filter(b => {
      if (boxLoadFilter === 'available') return !b.truckId;
      if (boxLoadFilter === 'loaded')    return !!b.truckId;
      return true;
    });

    // Sort boxes
    filtered.sort((a, b) => {
      if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
      if (sortBy === 'barcode') return (a.barcode || '').localeCompare(b.barcode || '');
      if (sortBy === 'location') return (a.location || '').localeCompare(b.location || '');
      if (sortBy === 'size') {
        const volA = (a.length || 0) * (a.width || 0) * (a.height || 0);
        const volB = (b.length || 0) * (b.width || 0) * (b.height || 0);
        return volB - volA;
      }
      if (sortBy === 'contents') {
        const countA = boxContents.filter(c => c.boxId === a.id).length;
        const countB = boxContents.filter(c => c.boxId === b.id).length;
        return countB - countA;
      }
      return 0;
    });

    // Partition: garage boxes always go to the bottom, grouped by location
    const normalBoxes = filtered.filter(b => (b.boxType || b.box_type) !== 'garage');
    const garageBoxes = filtered.filter(b => (b.boxType || b.box_type) === 'garage')
      .sort((a, b) => (a.location || '').localeCompare(b.location || '') || (a.name || '').localeCompare(b.name || ''));

    function renderBoxCard(box) {
      const contentsCount = boxContents.filter(c => c.boxId === box.id).length;
      const isActive = currentBoxId === box.id ? ' active' : '';
      const isLoaded = !!box.truckId;
      const isScanned = !!box.scannedAt;
      const assignedDriverId = box.assignedDriverId || box.assigned_driver_id;
      const isDriverBox = !!(assignedDriverId) || box.boxType === 'driver' || box.box_type === 'driver';
      const isGarageBox = (box.boxType === 'garage' || box.box_type === 'garage') && !isDriverBox;
      
      // Get driver color if box is assigned to a driver
      const driver = assignedDriverId ? allDrivers.find(d => d.id === assignedDriverId) : null;
      const driverColor = driver?.color || '#ea4335'; // Default red if no color
      
      // Use driver color for styling
      const driverBoxClass = isDriverBox ? ` driver-box driver-box-${assignedDriverId || 'unassigned'}` : (isGarageBox ? ' garage-box' : '');
      const loadedClass = isLoaded ? ' in-truck' : '';
      const contentsBadge = contentsCount > 0 ? `<div class="box-contents-badge">${contentsCount}</div>` : '';

      // Loaded-on-truck badge (replaces EMPTY badge for loaded boxes)
      const loadedBadge = isLoaded
        ? `<div class="box-loaded-badge">🚛 On Truck</div>`
        : (contentsCount === 0
          ? `<div style="position:absolute;top:6px;right:6px;background:#e0e0e0;color:#666;font-size:.6rem;font-weight:700;padding:2px 6px;border-radius:3px;letter-spacing:.5px">EMPTY</div>`
          : '');
      
      // Garage storage badge
      let garageBadge = '';
      if (isGarageBox) {
        garageBadge = `<div class="garage-box-badge">🏚️ Garage</div>`;
      }

      // Driver badge with assignment info
      let driverBadge = '';
      if (isDriverBox) {
        const driverName = assignedDriverId ? (box.assignedDriverName || driver?.name || 'Assigned') : 'Unassigned';
        const assignIcon = assignedDriverId ? '✓' : '○';
        
        // Badge style - use inline background only if unassigned (CSS var handles assigned color)
        const badgeStyle = assignedDriverId ? '' : 'background:#9e9e9e!important';
        
        driverBadge = `
          <div class="driver-box-badge" onclick="event.stopPropagation(); showDriverAssignmentModal('${box.id}')" 
               title="Click to ${assignedDriverId ? 'change' : 'assign'} driver" 
               style="cursor:pointer;user-select:none;${badgeStyle}">
            🚗 ${assignIcon} ${esc(driverName)}
          </div>
        `;
      }

      // Mechanic (staff) badge
      const assignedStaffId = box.assignedStaffId || box.assigned_staff_id;
      let mechanicBadge = '';
      if (assignedStaffId) {
        const staffName = box.assignedStaffName || box.assigned_staff_name || 'Mechanic';
        mechanicBadge = `
          <div class="mechanic-box-badge" onclick="event.stopPropagation(); showStaffAssignmentModal('${box.id}')"
               title="Click to change mechanic" style="cursor:pointer;user-select:none;">
            🔧 ${esc(staffName)}
          </div>
        `;
      }
      
      return `
        <div class="box-container${isActive}${driverBoxClass}${loadedClass}" 
             onclick="handleBoxClick(event, '${box.id}')"
             ondragover="event.preventDefault(); this.style.background='${isDriverBox ? hexToRgba(driverColor, 0.15) : '#e8f0fe'}'"
             ondragleave="this.style.background=''"
             ondrop="handleBoxDrop(event, '${box.id}')"
             style="${isDriverBox && assignedDriverId ? `--driver-color:${driverColor};` : ''}">
          ${isScanned ? '<div class="scan-confirmed-dot" title="Physically scanned onto truck"></div>' : ''}  
          <input type="checkbox" class="box-checkbox" data-box-id="${box.id}" onclick="event.stopPropagation(); toggleBoxSelection('${box.id}')">
          ${contentsBadge}
          ${loadedBadge}
          ${driverBadge}
          ${mechanicBadge}
          ${garageBadge}
          <div class="box-barcode">${esc(box.barcode)}</div>
          <div class="box-name">${esc(box.name)}</div>
          <div class="box-dims">${box.length || 0}×${box.width || 0}×${box.height || 0}cm | ${box.weightCapacity || 0}kg</div>
          <div class="box-location">📍 ${esc(box.location || 'No location')}</div>
        </div>
      `;
    }

    // Build normal boxes HTML
    let html = normalBoxes.map(renderBoxCard).join('');

    // Append garage section if any garage boxes exist
    if (garageBoxes.length > 0) {
      html += `<div style="margin:10px 0 6px;padding:4px 8px;background:#ede0d4;border-radius:4px;font-size:0.68rem;font-weight:700;color:#5d4037;letter-spacing:.5px;text-transform:uppercase;">🏚️ Garage Storage</div>`;
      // Group by location
      const byLocation = {};
      garageBoxes.forEach(b => {
        const loc = b.location || 'No location';
        if (!byLocation[loc]) byLocation[loc] = [];
        byLocation[loc].push(b);
      });
      Object.entries(byLocation).forEach(([loc, locBoxes]) => {
        if (Object.keys(byLocation).length > 1) {
          html += `<div style="margin:4px 0 3px 4px;font-size:0.65rem;font-weight:600;color:#8d6e63;display:flex;align-items:center;gap:4px;"><span style="flex:1;height:1px;background:rgba(141,110,99,0.25);"></span>📍 ${esc(loc)}<span style="flex:1;height:1px;background:rgba(141,110,99,0.25);"></span></div>`;
        }
        html += locBoxes.map(renderBoxCard).join('');
      });
    }

    document.getElementById('boxesList').innerHTML = html || '<div style="text-align:center;padding:20px;color:#5f6368;font-size:.85rem">No boxes found</div>';
    document.getElementById('boxCount').textContent = normalBoxes.length + garageBoxes.length;
    
    // Update checkbox states and toolbar after rendering
    updateBoxCheckboxStates();
    updateBoxBulkToolbar();
  }

  function renderItems() {
    // Shopify tab has its own renderer — don't overwrite it
    if (currentFilter === 'shopify') return;

    console.log(`🔄 renderItems called - filter: ${currentFilter}, equipment: ${equipment.length}, assets: ${assets.length}, inventory: ${inventoryItems.length}`);
    
    // Read from the active tab's search input
    const activeSearchEl = currentFilter === 'inventory'
      ? document.getElementById('searchInventory')
      : document.getElementById('searchAssets');
    const search = (activeSearchEl?.value || document.getElementById('searchItems')?.value || '').toLowerCase();
    const sortBy = document.getElementById('sortAssets')?.value || document.getElementById('sortItems')?.value || 'name';
    let allItems = [];

    // If inventory filter is selected, show only inventory items
    if (currentFilter === 'inventory') {
      allItems = inventoryItems.filter(inv => !inv.shopify_variant_id).map(inv => {
        // Calculate packed quantity across all boxes
        const packedQty = (window.inventoryPackedQuantities?.get(inv.id) || 
                          window.inventoryPackedQuantities?.get(String(inv.id))) || 0;
        const totalQty = inv.quantity || 0;
        const availableQty = totalQty - packedQty;
        
        return {
          id: inv.id,
          barcode: String(inv.sku || inv.id || ''),
          name: String(inv.name || 'Unnamed Item'),
          category: String(inv.category || 'Inventory'),
          type: 'inventory',
          itemType: 'Inventory',
          serialNumber: String(inv.sku || 'N/A'),
          totalQuantity: totalQty,
          packedQuantity: packedQty,
          availableQuantity: availableQty,
          currentBoxId: null, // Inventory items can be in multiple boxes
          shopify_variant_id: inv.shopify_variant_id || null
        };
      });
    } else {
      // Collect all items
      allItems = allItems.concat(equipment.map(e => ({ ...e, type: 'equipment' })));
      allItems = allItems.concat(assets.map(a => ({ ...a, type: 'assets' })));

      // Filter by type if not 'all'
      if (currentFilter !== 'all') {
        allItems = allItems.filter(item => {
          const itemTypeKey = (item.itemType || item.type || '').toLowerCase().replace(/\s+/g, '_');
          return itemTypeKey === currentFilter;
        });
      }
    }

    console.log(`📊 After filter, allItems count: ${allItems.length}`);

    // Apply location filter (assets only — inventory items don't have a location)
    if (itemLocationFilter && currentFilter !== 'inventory') {
      allItems = allItems.filter(item => item.currentLocationId === itemLocationFilter);
    }

    // Show ALL items (not just packed ones) - users can drag them into boxes
    const filtered = allItems.filter(item =>
      String(item.barcode || '').toLowerCase().includes(search) ||
      String(item.name || '').toLowerCase().includes(search) ||
      String(item.category || '').toLowerCase().includes(search)
    );

    console.log(`🔍 After search filter, items: ${filtered.length}`);

    // Sort items
    filtered.sort((a, b) => {
      if (sortBy === 'name') return String(a.name || '').localeCompare(String(b.name || ''));
      if (sortBy === 'barcode') return String(a.barcode || '').localeCompare(String(b.barcode || ''));
      if (sortBy === 'category') return String(a.category || '').localeCompare(String(b.category || ''));
      if (sortBy === 'location') return String(a.currentLocationId || '').localeCompare(String(b.currentLocationId || ''));
      return 0;
    });


    // Fix 14: Pagination — slice to current page
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    if (itemsPage > totalPages) itemsPage = Math.max(1, totalPages);
    const start = (itemsPage - 1) * ITEMS_PER_PAGE;
    const pageItems = filtered.slice(start, start + ITEMS_PER_PAGE);

    const html = pageItems.map(item => {
      const boxName = item.currentBoxId ? getBoxName(item.currentBoxId) : 'Not packed';
      const categoryClass = (item.category || '').toLowerCase().replace(/\s+/g, '-');
      let isPacked = false, isPackedStyle = '', isPackedClass = '', draggable = true, cursorStyle = 'cursor:move', quantityInfo = '';
      if (item.type === 'inventory') {
        const allPacked = (item.availableQuantity || 0) === 0;
        isPacked = allPacked; isPackedStyle = allPacked ? 'opacity:0.4' : ''; isPackedClass = allPacked ? 'in-box' : '';
        draggable = !allPacked; cursorStyle = allPacked ? 'cursor:not-allowed' : 'cursor:move';
        const totalQty = item.totalQuantity || 0, packedQty = item.packedQuantity || 0, availQty = item.availableQuantity || 0;
        quantityInfo = `<div style="font-size:.75rem;color:#5f6368;margin-top:3px;font-weight:600">📦 Qty: <span style="color:#34a853">${availQty} available</span> / <span style="color:#ea4335">${packedQty} packed</span> / <span style="color:#1a73e8">${totalQty} total</span></div>`;
      } else {
        isPacked = !!item.currentBoxId; isPackedStyle = isPacked ? 'opacity:0.4' : ''; isPackedClass = isPacked ? 'in-box' : '';
        draggable = !isPacked; cursorStyle = isPacked ? 'cursor:not-allowed' : 'cursor:move';
      }
      const isSelected = selectedItems.has(item.id);
      const selectedClass = isSelected ? 'item-selected' : '';
      const itemTypeKey = (item.itemType || item.type || 'equipment').toLowerCase();
      const assetTypeObj = allAssetTypes.find(t => t.name.toLowerCase().replace(/\s+/g, '_') === itemTypeKey);
      const typeColor = assetTypeObj ? assetTypeObj.color : '#0ea5e9';
      const typeName = assetTypeObj ? assetTypeObj.name : (item.itemType || item.type || 'equipment');
      const serialNum = item.serialNumber || 'No S/N';
      return `
        <div class="item-card ${isPackedClass} ${selectedClass}" draggable="${draggable}" data-item-id="${item.id}" data-item-type="${item.type}" style="position:relative;padding:8px!important;padding-left:26px!important;${cursorStyle}">
          <input type="checkbox" class="item-checkbox" data-item-id="${item.id}" onclick="event.stopPropagation(); toggleItemSelection('${item.id}')" ${isSelected ? 'checked' : ''}>
          <div style="${isPackedStyle}">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <div class="item-barcode" style="font-family:monospace;font-size:.7rem;font-weight:700;color:#1a73e8">${esc(item.barcode)}</div>
            <div class="item-category ${categoryClass}" style="font-size:.65rem;padding:2px 6px">${esc(item.category || 'Uncategorized')}</div>
          </div>
          <div class="item-name" style="font-size:.8rem;color:#202124;font-weight:600;margin-bottom:4px;line-height:1.3">${esc(item.name)}</div>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:3px">
            <span style="background:${typeColor};color:white;font-weight:500;padding:3px 8px;border-radius:4px;font-size:.65rem;white-space:nowrap">${esc(typeName)}</span>
            ${item.shopify_variant_id ? '<span style="background:#96bf48;color:#fff;font-weight:600;padding:2px 6px;border-radius:4px;font-size:.6rem">SHOPIFY</span>' : ''}
            <div style="font-size:.65rem;color:#5f6368;display:flex;gap:4px"><span style="font-weight:600">S/N:</span><span style="font-family:monospace">${esc(serialNum)}</span></div>
          </div>
          ${quantityInfo}
          ${isPacked ? `<div style="font-size:.65rem;color:#ea4335;font-weight:600">📦 In ${esc(boxName)}</div>` : ''}
          </div>
          ${isPacked ? `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:2"><div style="background:rgba(220,53,69,0.88);color:#fff;font-weight:900;font-size:.8rem;padding:4px 14px;border-radius:4px;letter-spacing:2px;box-shadow:0 1px 4px rgba(0,0,0,.3)">PACKED</div></div>` : ''}
        </div>
      `;
    }).join('');

    // Pagination controls
    let paginationHtml = '';
    if (totalPages > 1) {
      paginationHtml = `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px;border-top:1px solid #e0e0e0;background:#f8f9fa;font-size:.75rem;color:#5f6368">
          <span>${start + 1}–${Math.min(start + ITEMS_PER_PAGE, totalItems)} of ${totalItems}</span>
          <div style="display:flex;gap:6px">
            <button onclick="BoxPacking.prevPage()" ${itemsPage <= 1 ? 'disabled' : ''} style="padding:2px 8px;border:1px solid #d0d0d0;background:${itemsPage <= 1 ? '#f0f0f0' : '#fff'};border-radius:4px;cursor:${itemsPage <= 1 ? 'default' : 'pointer'}">‹</button>
            <span style="padding:2px 6px">${itemsPage}/${totalPages}</span>
            <button onclick="BoxPacking.nextPage()" ${itemsPage >= totalPages ? 'disabled' : ''} style="padding:2px 8px;border:1px solid #d0d0d0;background:${itemsPage >= totalPages ? '#f0f0f0' : '#fff'};border-radius:4px;cursor:${itemsPage >= totalPages ? 'default' : 'pointer'}">›</button>
          </div>
        </div>
      `;
    }

    document.getElementById('itemsList').innerHTML = (html || '<div style="text-align:center;padding:20px;color:#5f6368;font-size:.85rem">No items found</div>') + paginationHtml;
    // Update the active tab badge
    if (currentFilter === 'inventory') {
      const invBadge = document.getElementById('inventoryCount');
      if (invBadge) invBadge.textContent = totalItems;
    } else {
      const assetBadge = document.getElementById('itemCount');
      if (assetBadge) assetBadge.textContent = totalItems;
    }
  }

  function renderBoxContents() {
    const box = boxes.find(b => b.id === currentBoxId);
    if (!box) {
      currentBoxId = null;
      document.getElementById('boxDetails').style.display = 'block';
      document.getElementById('boxContents').style.display = 'none';
      document.getElementById('currentBoxTitle').innerHTML = 'Select a Box';
      return;
    }

    document.getElementById('boxDetails').style.display = 'none';
    document.getElementById('boxContents').style.display = 'block';
    
    // Update header with box name and QR code
    document.getElementById('currentBoxTitle').innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;width:100%;gap:10px">
        <div style="flex:1;font-size:.9rem;font-weight:700;color:#202124">${esc(box.name)}</div>
        <div id="qrcode-${box.id}" style="flex:0 0 auto;padding:4px;background:#ffffff;border:1px solid #e0e0e0;border-radius:4px"></div>
      </div>
    `;
    
    // Generate QR code
    setTimeout(() => {
      try {
        const qrcodeEl = document.getElementById(`qrcode-${box.id}`);
        if (qrcodeEl && typeof QRCode !== 'undefined') {
          qrcodeEl.innerHTML = ''; // Clear any previous QR code
          new QRCode(qrcodeEl, {
            text: box.barcode,
            width: 60,
            height: 60,
            colorDark: "#1a73e8",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.M
          });
        } else {
          qrcodeEl.innerHTML = `<span style="font-family:monospace;font-size:.75rem;color:#1a73e8;font-weight:700">${esc(box.barcode)}</span>`;
        }
      } catch (e) {
        console.error('QR code generation error:', e);
        document.getElementById(`qrcode-${box.id}`).innerHTML = 
          `<span style="font-family:monospace;font-size:.75rem;color:#1a73e8;font-weight:700">${esc(box.barcode)}</span>`;
      }
    }, 50);

    const contents = boxContents.filter(c => c.boxId === currentBoxId);
    
    // Box details summary
    const summary = `
      <div style="font-size:.8rem;color:#202124;line-height:1.8">
        <strong>Barcode:</strong> ${esc(box.barcode)}<br>
        <strong>Dimensions:</strong> ${box.length || 0} × ${box.width || 0} × ${box.height || 0} cm<br>
        <strong>Capacity:</strong> ${box.weightCapacity || 0} kg<br>
        <strong>Location:</strong> ${esc(box.location || 'Not set')}
      </div>
    `;
    document.getElementById('boxDetailsSummary').innerHTML = summary;
    document.getElementById('contentsCount').textContent = contents.length;

    // Garage notes panel — shown only for garage-type boxes
    const isGarageBox = (box.boxType || box.box_type) === 'garage';
    let garageNotesEl = document.getElementById('garageNotesPanel');
    if (isGarageBox) {
      if (!garageNotesEl) {
        // Insert notes panel before the contents list
        const contentsListEl = document.getElementById('contentsList');
        const panel = document.createElement('div');
        panel.id = 'garageNotesPanel';
        panel.style.cssText = 'margin:0 0 10px;padding:10px 12px;background:#fdf6f0;border:1px solid #d4a88a;border-radius:6px;';
        panel.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
            <span style="font-size:.75rem;font-weight:700;color:#5d4037;">🏚️ Garage Notes / Contents List</span>
            <button onclick="saveGarageNotes('${box.id}')"
                    style="font-size:.7rem;padding:2px 8px;background:#8d6e63;color:#fff;border:none;border-radius:3px;cursor:pointer;">Save</button>
          </div>
          <textarea id="garageNotesText"
                    placeholder="List spares, tools, or anything stored here…&#10;e.g. - 2x spare wheel nuts&#10;- Jack stand&#10;- Tyre pressure gauge"
                    style="width:100%;min-height:80px;font-size:.78rem;border:1px solid #d4a88a;border-radius:4px;padding:6px;resize:vertical;background:#fffaf6;color:#3e2723;font-family:inherit;">${esc(box.notes || '')}</textarea>
        `;
        contentsListEl.parentNode.insertBefore(panel, contentsListEl);
      } else {
        // Update existing panel's textarea and button boxId
        garageNotesEl.querySelector('textarea').value = box.notes || '';
        garageNotesEl.querySelector('button').setAttribute('onclick', `saveGarageNotes('${box.id}')`);
        garageNotesEl.style.display = '';
      }
    } else if (garageNotesEl) {
      garageNotesEl.style.display = 'none';
    }

    if (contents.length === 0) {
      document.getElementById('contentsList').innerHTML = `
        <div style="text-align:center;padding:30px;color:#5f6368;font-size:.85rem">
          Drag items from the left panel here to pack them
        </div>
      `;
      return;
    }

    const html = contents.map(content => {
      const item = getItem(content.itemId, content.itemType);
      if (!item) return '';
      
      // Show quantity for inventory items
      const quantityBadge = content.itemType === 'inventory' && content.quantityPacked 
        ? `<span style="background:#34a853;color:white;padding:2px 6px;border-radius:3px;font-size:.7rem;font-weight:700;margin-right:8px">${content.quantityPacked}×</span>` 
        : '';
      
      return `
        <div class="packed-item">
          <div class="packed-item-info">
            <div class="packed-item-barcode">${quantityBadge}${esc(item.barcode)}</div>
            <div class="packed-item-name">${esc(item.name)}</div>
            <div style="font-size:.75rem;color:#5f6368;margin-top:3px">
              ${esc(item.category || 'Uncategorized')} · ${content.itemType === 'equipment' ? 'Equipment' : content.itemType === 'inventory' ? 'Inventory' : 'Asset'}${item.serialNumber ? ` · <span style="font-family:monospace;color:#1a73e8">SN: ${esc(item.serialNumber)}</span>` : ''}
            </div>
          </div>
          <button class="btn-remove-item" onclick="BoxPacking.removeItem('${content.id}')">✕</button>
        </div>
      `;
    }).join('');

    // Add EMPTY BOX button before the contents list
    const emptyBoxButton = `
      <div style="margin-bottom:12px">
        <button onclick="showUnpackModal()" class="btn btn-danger w-100" style="background:#d93025;border-color:#d93025;font-weight:600;padding:8px">
          🗑️ EMPTY BOX
        </button>
      </div>
    `;

    document.getElementById('contentsList').innerHTML = emptyBoxButton + html;
  }

  function updateStats() {
    // Could add additional stats here if needed
  }

  // ========== DRAG AND DROP ==========
  function setupDragAndDrop() {
    let draggedItemId = null;
    let draggedItemType = null;
    let draggedItems = []; // Array of {id, type} for multi-drag

    document.addEventListener('dragstart', e => {
      if (e.target.classList.contains('item-card') && !e.target.classList.contains('in-box')) {
        draggedItemId = e.target.dataset.itemId;
        draggedItemType = e.target.dataset.itemType;
        
        // If this item is selected and there are other selected items, drag all selected
        if (selectedItems.has(draggedItemId) && selectedItems.size > 1) {
          draggedItems = Array.from(selectedItems).map(id => {
            const item = getItemById(id);
            return item ? { id: item.id, type: item.type } : null;
          }).filter(Boolean);
          e.target.style.opacity = '0.5';
          // Visual feedback for multi-drag
          e.target.setAttribute('data-dragging-count', draggedItems.length);
        } else {
          // Single item drag
          draggedItems = [{ id: draggedItemId, type: draggedItemType }];
          e.target.style.opacity = '0.5';
        }
      }
    });

    document.addEventListener('dragend', e => {
      if (e.target.classList.contains('item-card')) {
        e.target.style.opacity = '1';
        e.target.removeAttribute('data-dragging-count');
      }
    });

    const contentsList = document.getElementById('contentsList');
    
    contentsList.addEventListener('dragover', e => {
      e.preventDefault();
      if (currentBoxId && draggedItemId) {
        contentsList.style.background = '#e8f0fe';
      }
    });

    contentsList.addEventListener('dragleave', e => {
      contentsList.style.background = '';
    });

    contentsList.addEventListener('drop', e => {
      e.preventDefault();
      contentsList.style.background = '';
      
      if (currentBoxId && draggedItems.length > 0) {
        // Pack all dragged items
        packMultipleItems(currentBoxId, draggedItems);
        draggedItemId = null;
        draggedItemType = null;
        draggedItems = [];
      }
    });
    
    // Make function globally accessible for box card drops
    window.handleBoxDrop = function(e, boxId) {
      e.preventDefault();
      e.stopPropagation();
      e.target.closest('.box-container').style.background = '';
      
      if (draggedItems.length > 0) {
        packMultipleItems(boxId, draggedItems);
        selectBox(boxId); // Auto-select the box to show contents
        draggedItemId = null;
        draggedItemType = null;
        draggedItems = [];
      }
    };
  }

  function packItem(boxId, itemId, itemType) {
    const item = getItem(itemId, itemType);
    if (!item || item.currentBoxId) {
      showToast('Item is not available or already packed', 'warning');
      return;
    }

    // Add to box contents
    const content = {
      id: RTS.uid('content'),
      boxId: boxId,
      itemId: itemId,
      itemType: itemType,
      packedAt: new Date().toISOString()
    };
    boxContents.push(content);

    // Update item's current box
    item.currentBoxId = boxId;

    // Add to history
    addHistory(boxId, 'item_added', `Added ${item.name} (${item.barcode})`);

    saveData();
    renderAll();
  }

  async function removeItem(contentId) {
    const content = boxContents.find(c => c.id === contentId);
    if (!content) return;

    // Show the unpack modal in single-item mode (item lookup happens inside modal)
    showUnpackModal(contentId);
  }

  // ========== BOX MANAGEMENT ==========
  async function showBoxModal() {
    document.getElementById('boxBarcode').value = generateBarcode();
    document.getElementById('boxName').value = '';
    document.getElementById('boxType').value = 'regular';
    document.getElementById('boxLength').value = '';
    document.getElementById('boxWidth').value = '';
    document.getElementById('boxHeight').value = '';
    document.getElementById('boxWeightCapacity').value = '';
    document.getElementById('boxDriver').value = '';
    
    // Populate location dropdown from DB locations
    const locationSelect = document.getElementById('boxLocation');
    locationSelect.innerHTML = '<option value="">Select Location</option>' +
      allLocations.map(loc => `<option value="${esc(loc.id)}">${esc(loc.name)}</option>`).join('');
    
    // Populate drivers from PlanetScale database
    // Reload to ensure we have latest drivers
    if (allDrivers.length === 0) {
      await loadDrivers();
    }
    const driverSelect = document.getElementById('boxDriver');
    if (allDrivers.length > 0) {
      driverSelect.innerHTML = '<option value="">No driver assigned</option>' +
        allDrivers.map(d => `<option value="${d.id}">${esc(d.name || 'Unnamed')} ${d.license_number ? '- ' + esc(d.license_number) : ''}</option>`).join('');
    } else {
      driverSelect.innerHTML = '<option value="">No drivers available (add in Drivers page)</option>';
    }
    
    // Hide driver selector initially (will show if driver type selected)
    document.getElementById('driverSelectContainer').style.display = 'none';
    
    // Add listener for box type changes
    const boxTypeSelect = document.getElementById('boxType');
    boxTypeSelect.onchange = function() {
      const isDriver = this.value === 'driver';
      document.getElementById('driverSelectContainer').style.display = isDriver ? 'block' : 'none';
    };
    
    boxModal.show();
  }

  // Driver Assignment
  let allDrivers = [];
  
  // Load drivers from PlanetScale database (NOT from settings)
  async function loadDrivers() {
    try {
      console.log('🔄 Loading drivers from PlanetScale database...');
      const resp = await RTS_API.getCollectionItems('drivers');
      
      if (!resp) {
        console.error('❌ No response from drivers API');
        showToast('⚠️ Could not connect to drivers database', 'warning');
        allDrivers = [];
        return;
      }
      
      if (!resp.success) {
        console.error('❌ Drivers API returned error:', resp.error || 'Unknown error');
        showToast(`❌ Failed to load drivers: ${resp.error || 'Unknown error'}`, 'error');
        allDrivers = [];
        return;
      }
      
      if (resp.items && resp.items.length > 0) {
        allDrivers = resp.items;
        console.log(`✅ Loaded ${allDrivers.length} drivers from PlanetScale database`);
        console.log('   Drivers:', allDrivers.map(d => d.name || 'Unnamed').join(', '));
      } else {
        console.warn('⚠️ No drivers found in database');
        console.warn('💡 Add drivers in Settings → Drivers first, then run migrate-drivers.html');
        allDrivers = [];
      }
    } catch (error) {
      console.error('❌ Error loading drivers from database:', error);
      showToast(`❌ Driver loading failed: ${error.message}`, 'error');
      allDrivers = [];
    }
  }
  
  async function showDriverAssignmentModal(boxId) {
    const box = boxes.find(b => b.id === boxId);
    if (!box) return;
    
    // Reload drivers to ensure we have the latest data from PlanetScale
    if (allDrivers.length === 0) {
      await loadDrivers();
    }
    
    // Create driver selection HTML
    const driverOptions = allDrivers.map(driver => {
      const driverColor = driver.color || '#ea4335';
      const colorDot = `<div style="width:24px;height:24px;background:${driverColor};border-radius:50%;border:2px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,0.2)"></div>`;
      
      return `
        <div class="driver-option" data-driver-id="${driver.id}" onclick="selectDriver('${driver.id}')">
          <div style="display:flex;align-items:center;gap:12px">
            ${colorDot}
            <div style="flex:1">
              <div style="font-weight:600">${esc(driver.name || 'Unnamed Driver')}</div>
              <div style="font-size:0.85rem;color:#5f6368">${esc(driver.license_number || 'No license')}</div>
            </div>
          </div>
        </div>
      `;
    }).join('');
    
    const currentDriverId = box.assignedDriverId || box.assigned_driver_id;
    const unassignBtn = currentDriverId ? `
      <button class="btn btn-outline-secondary" onclick="assignDriverToBox('${boxId}', null)">🚫 Unassign Driver</button>
    ` : '';
    
    // Show modal
    const modalHtml = `
      <div class="modal fade show" id="driverAssignModal" style="display:block;background:rgba(0,0,0,0.5)">
        <div class="modal-dialog">
          <div class="modal-content" style="background:#ffffff;color:#202124">
            <div class="modal-header" style="background:#f8f9fa;border-color:#e0e0e0">
              <h5 class="modal-title" style="font-weight:700">🚗 Assign Driver to Box</h5>
              <button type="button" class="btn-close" onclick="closeDriverAssignModal()"></button>
            </div>
            <div class="modal-body">
              <div style="margin-bottom:15px;padding:12px;background:#f8f9fa;border-radius:6px">
                <div style="font-weight:600;margin-bottom:4px">${esc(box.name)}</div>
                <div style="font-size:0.85rem;color:#5f6368">Barcode: ${esc(box.barcode)}</div>
              </div>
              <div style="margin-bottom:15px">
                <input type="text" id="driverSearch" class="form-control" placeholder="Search drivers..." 
                       oninput="filterDriverOptions()" style="margin-bottom:10px">
              </div>
              <div id="driverOptionsList" style="max-height:300px;overflow-y:auto">
                ${driverOptions || '<div style="text-align:center;padding:20px;color:#5f6368">No drivers available</div>'}
              </div>
            </div>
            <div class="modal-footer" style="border-color:#e0e0e0">
              ${unassignBtn}
              <button class="btn btn-secondary" onclick="closeDriverAssignModal()">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Store boxId for later use
    window.currentAssignBoxId = boxId;
  }
  
  function closeDriverAssignModal() {
    const modal = document.getElementById('driverAssignModal');
    if (modal) modal.remove();
    window.currentAssignBoxId = null;
  }
  
  function selectDriver(driverId) {
    if (!window.currentAssignBoxId) return;
    assignDriverToBox(window.currentAssignBoxId, driverId);
  }
  
  function filterDriverOptions() {
    const search = document.getElementById('driverSearch').value.toLowerCase();
    const options = document.querySelectorAll('.driver-option');
    options.forEach(opt => {
      const text = opt.textContent.toLowerCase();
      opt.style.display = text.includes(search) ? 'block' : 'none';
    });
  }
  
  async function assignDriverToBox(boxId, driverId) {
    try {
      const box = boxes.find(b => b.id === boxId);
      if (!box) throw new Error('Box not found');
      
      // Get previous driver ID to close old assignment
      const previousDriverId = box.assignedDriverId || box.assigned_driver_id;
      
      // Update box's current driver via API
      const resp = await RTS_API.updateBox(boxId, {
        assigned_driver_id: driverId
      });
      
      if (resp && resp.success) {
        // If there was a previous driver, close that box_assignment record
        if (previousDriverId && previousDriverId !== driverId) {
          try {
            await fetch(`${API_BASE_URL}/box-assignments/unassign`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ box_id: boxId, driver_id: previousDriverId })
            });
          } catch (e) {
            console.warn('Could not close previous box assignment:', e);
          }
        }
        
        // If assigning a new driver, create box_assignment record for many-to-many tracking
        if (driverId) {
          try {
            await fetch(`${API_BASE_URL}/box-assignments`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                box_id: boxId, 
                driver_id: driverId,
                assigned_by: 'user' // Could track actual user_id if auth is available
              })
            });
          } catch (e) {
            console.warn('Could not create box_assignment record:', e);
          }
        }
        
        // Update local state
        box.assignedDriverId = driverId;
        if (driverId) {
          const driver = allDrivers.find(d => d.id === driverId);
          box.assignedDriverName = driver ? driver.name : null;
          showToast(`✅ Box assigned to ${driver.name}`, 'success');
        } else {
          box.assignedDriverName = null;
          showToast('✅ Driver unassigned from box', 'success');
        }
        
        renderBoxes();
        closeDriverAssignModal();
      }
    } catch (error) {
      console.error('❌ Error assigning driver:', error);
      showToast('❌ Failed to assign driver', 'error');
    }
  }
  
  window.showDriverAssignmentModal = showDriverAssignmentModal;
  window.closeDriverAssignModal = closeDriverAssignModal;
  window.selectDriver = selectDriver;
  window.filterDriverOptions = filterDriverOptions;
  window.assignDriverToBox = assignDriverToBox;

  // ──────────────────────────────────────────────────────────────────
  // MECHANIC / STAFF ASSIGNMENT FOR BOXES
  // ──────────────────────────────────────────────────────────────────
  async function showStaffAssignmentModal(boxId) {
    const box = boxes.find(b => b.id === boxId);
    if (!box) return;

    let staffList = [];
    try {
      const resp = await fetch(`${API_BASE_URL}/staff-assignments`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
      });
      if (resp.ok) {
        const data = await resp.json();
        staffList = data.staff || [];
      }
    } catch (e) { console.warn('Could not load staff:', e); }

    const staffOptions = staffList.map(s => `
      <div class="staff-option" data-staff-id="${s.id}" onclick="selectStaffForBox('${s.id}')"
           style="padding:10px 12px;cursor:pointer;border-bottom:1px solid #f0f0f0;display:flex;align-items:center;gap:10px;transition:background .15s"
           onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background=''">
        <div style="width:32px;height:32px;background:#0072a3;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:.75rem;flex-shrink:0">
          ${esc((s.name||'?')[0].toUpperCase())}
        </div>
        <div>
          <div style="font-weight:600;font-size:.85rem">${esc(s.name)}</div>
          ${s.role ? `<div style="font-size:.75rem;color:#5f6368">${esc(s.role)}</div>` : ''}
        </div>
      </div>
    `).join('');

    const currentStaffId = box.assignedStaffId || box.assigned_staff_id;
    const unassignBtn = currentStaffId
      ? `<button class="btn btn-outline-secondary btn-sm" onclick="assignStaffToBox('${boxId}', null)">🚫 Unassign Mechanic</button>`
      : '';

    const modalHtml = `
      <div class="modal fade show" id="staffAssignModal" style="display:block;background:rgba(0,0,0,0.5)">
        <div class="modal-dialog">
          <div class="modal-content" style="background:#ffffff;color:#202124">
            <div class="modal-header" style="background:#e8f4fb;border-color:#a8d8ee">
              <h5 class="modal-title" style="font-weight:700">🔧 Assign Mechanic to Box</h5>
              <button type="button" class="btn-close" onclick="closeStaffAssignModal()"></button>
            </div>
            <div class="modal-body" style="padding:0">
              <div style="padding:12px 16px;background:#f8f9fa;border-bottom:1px solid #e0e0e0">
                <div style="font-weight:600">${esc(box.name)}</div>
                <div style="font-size:.8rem;color:#5f6368">Barcode: ${esc(box.barcode)}</div>
              </div>
              <div style="padding:10px 16px 6px">
                <input type="text" id="staffBoxSearch" class="form-control form-control-sm"
                       placeholder="Search mechanics..." oninput="filterStaffOptions()"
                       style="margin-bottom:6px">
              </div>
              <div id="staffOptionsList" style="max-height:300px;overflow-y:auto">
                ${staffOptions || '<div style="text-align:center;padding:20px;color:#5f6368;font-size:.85rem">No staff found</div>'}
              </div>
            </div>
            <div class="modal-footer" style="border-color:#e0e0e0">
              ${unassignBtn}
              <button class="btn btn-secondary btn-sm" onclick="closeStaffAssignModal()">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    window.currentAssignStaffBoxId = boxId;
  }

  function closeStaffAssignModal() {
    const m = document.getElementById('staffAssignModal');
    if (m) m.remove();
    window.currentAssignStaffBoxId = null;
  }

  function selectStaffForBox(staffId) {
    if (!window.currentAssignStaffBoxId) return;
    assignStaffToBox(window.currentAssignStaffBoxId, staffId);
  }

  function filterStaffOptions() {
    const search = document.getElementById('staffBoxSearch').value.toLowerCase();
    document.querySelectorAll('.staff-option').forEach(opt => {
      opt.style.display = opt.textContent.toLowerCase().includes(search) ? '' : 'none';
    });
  }

  async function assignStaffToBox(boxId, staffId) {
    try {
      const box = boxes.find(b => b.id === boxId);
      if (!box) throw new Error('Box not found');

      const resp = await RTS_API.updateBox(boxId, { assigned_staff_id: staffId });
      if (resp && resp.success) {
        box.assignedStaffId = staffId;
        box.assigned_staff_id = staffId;
        if (staffId) {
          // Find name from the DOM options list (already loaded)
          const opt = document.querySelector(`.staff-option[data-staff-id="${staffId}"]`);
          const name = opt ? opt.querySelector('[style*="font-weight:600"]')?.textContent?.trim() : null;
          box.assignedStaffName = name;
          box.assigned_staff_name = name;
          showToast(`✅ Box assigned to ${name || 'mechanic'}`, 'success');
        } else {
          box.assignedStaffName = null;
          box.assigned_staff_name = null;
          showToast('✅ Mechanic unassigned from box', 'success');
        }
        renderBoxes();
        closeStaffAssignModal();
      }
    } catch (error) {
      console.error('❌ Error assigning mechanic:', error);
      showToast('❌ Failed to assign mechanic', 'error');
    }
  }

  window.showStaffAssignmentModal = showStaffAssignmentModal;
  window.closeStaffAssignModal = closeStaffAssignModal;
  window.selectStaffForBox = selectStaffForBox;
  window.filterStaffOptions = filterStaffOptions;
  window.assignStaffToBox = assignStaffToBox;

  async function saveGarageNotes(boxId) {
    const textarea = document.getElementById('garageNotesText');
    if (!textarea) return;
    const notes = textarea.value;
    try {
      const resp = await RTS_API.updateBox(boxId, { notes });
      if (resp && resp.success) {
        const box = boxes.find(b => String(b.id) === String(boxId));
        if (box) box.notes = notes;
        showToast('Notes saved', 'success');
      } else {
        showToast('Failed to save notes', 'error');
      }
    } catch (e) {
      showToast('Failed to save notes', 'error');
    }
  }
  window.saveGarageNotes = saveGarageNotes;

  async function saveBox() {
    const name = document.getElementById('boxName').value.trim();
    if (!name) {
      showToast('Box name is required', 'warning');
      return;
    }

    const locationName = document.getElementById('boxLocation').value || 'Unknown';
    const boxType = document.getElementById('boxType').value || 'regular';
    const barcode = document.getElementById('boxBarcode').value || generateBarcode();
    const assignedDriverId = document.getElementById('boxDriver').value || null;
    const length = parseFloat(document.getElementById('boxLength').value);
    const width = parseFloat(document.getElementById('boxWidth').value);
    const height = parseFloat(document.getElementById('boxHeight').value);
    const weightCapacity = parseFloat(document.getElementById('boxWeightCapacity').value) || 0;
    
    // Validate dimensions
    if (!length || length <= 0 || !width || width <= 0 || !height || height <= 0) {
      showToast('Please enter valid dimensions (length, width, height must be greater than 0)', 'warning');
      return;
    }
    
    // Save to database FIRST - this is the source of truth
    try {
      const resp = await RTS_API.createBox({
        barcode: barcode,
        name: name,
        box_type: boxType,
        assigned_driver_id: assignedDriverId,
        length: length,                    // API expects 'length', not 'dimensions_length_cm'
        width: width,                      // API expects 'width', not 'dimensions_width_cm'
        height: height,                    // API expects 'height', not 'dimensions_height_cm'
        max_weight: weightCapacity,        // API expects 'max_weight', not 'max_weight_kg'
        current_weight: 0,
        location_id: null,                 // Use null for now - locations will be strings stored in location field
        status: 'available'
      });
      
      if (resp && resp.success && resp.box) {
        // Box successfully saved to database - now add to local state
        const newBox = {
          id: resp.box.id,
          barcode: resp.box.barcode,
          name: resp.box.name,
          boxType: resp.box.box_type || 'regular',
          length: resp.box.dimensions_length_cm,
          width: resp.box.dimensions_width_cm,
          height: resp.box.dimensions_height_cm,
          weightCapacity: resp.box.max_weight_kg,
          currentWeight: resp.box.current_weight_kg || 0,
          location: locationName,  // Use the location name from the form (not persisted to DB yet)
          assignedDriverId: resp.box.assigned_driver_id,
          assignedDriverName: resp.box.assigned_driver_name,
          status: resp.box.status || 'available',
          createdAt: resp.box.created_at,
          updatedAt: resp.box.updated_at
        };
        
        boxes.push(newBox);
        addHistory(newBox.id, 'created', `${boxType === 'driver' ? '🚗 Driver box' : boxType === 'garage' ? '🏚️ Garage storage box' : 'Box'} created at ${locationName}`);
        
        console.log(`✅ Created ${boxType} box in database:`, newBox.name);
        boxModal.hide();
        renderAll();
        
        if (boxType === 'driver') {
          showToast(`🚗 Driver box "${newBox.name}" created and saved to database!`, 'success');
        } else {
          showToast(`✅ Box "${newBox.name}" created and saved to database!`, 'success');
        }
      } else {
        throw new Error('Database did not return box data');
      }
    } catch (error) {
      console.error('❌ Error creating box in database:', error);
      showToast('❌ Failed to create box in database. Please try again.', 'error');
    }
  }

  function generateBarcode() {
    const existing = boxes.map(b => b.barcode).filter(b => b && b.startsWith('BOX-'));
    const numbers = existing.map(b => parseInt(b.split('-')[1])).filter(n => !isNaN(n));
    const maxNum = numbers.length > 0 ? Math.max(...numbers) : 0;
    return `BOX-${String(maxNum + 1).padStart(3, '0')}`;
  }

  async function selectBox(boxId) {
    currentBoxId = boxId;
    renderBoxes();   // Highlight selected box immediately
    renderItems();
    updateStats();
    
    // Reload box contents from DB for this box to ensure fresh data
    try {
      const contentsResp = await RTS_API.getBoxContents(currentBoxId);
      // API returns `boxContents` not `contents`
      if (contentsResp && contentsResp.success && contentsResp.boxContents) {
        boxContents = contentsResp.boxContents.map(c => ({
          id: String(c.id),
          boxId: c.box_id,
          itemId: c.item_id,
          itemType: c.item_type || 'equipment',
          quantityPacked: c.quantity_packed || 1,
          packedAt: c.packed_at
        }));
      }
    } catch (e) {
      console.warn('Could not reload box contents:', e.message);
    }
    
    renderBoxContents();
  }
  
  // Make globally accessible for onclick handlers
  window.selectBox = selectBox;
  
  // ========== UNPACK BOX ==========
  async function showUnpackModal(singleContentId = null) {
    // Determine if single-item or whole-box mode
    const isSingleItem = !!singleContentId;
    const targetBoxId = isSingleItem
      ? boxContents.find(c => c.id === singleContentId)?.boxId
      : currentBoxId;

    if (!targetBoxId) {
      showToast('No box selected', 'warning');
      return;
    }

    const box = boxes.find(b => b.id === targetBoxId);
    const contents = isSingleItem
      ? boxContents.filter(c => c.id === singleContentId)
      : boxContents.filter(c => c.boxId === targetBoxId);

    if (contents.length === 0) {
      showToast('This box is already empty', 'info');
      return;
    }

    // Check for Shopify items — whole-box always; single-item only when type is inventory
    if (!isSingleItem || contents[0]?.itemType === 'inventory') {
      await loadInventoryItems();
      const shopifyContents = contents.filter(c => {
        const item = getItem(c.itemId, c.itemType);
        console.log(`🔍 Unpack gate check — itemId:${c.itemId} type:${c.itemType} found:${!!item} shopify_variant_id:${item?.shopify_variant_id || 'null'}`);
        return item && c.itemType === 'inventory' && item.shopify_variant_id;
      });
      if (shopifyContents.length > 0) {
        await showUnpackReturnStep(targetBoxId, contents);
        return;
      }
    }
    
    // Populate location dropdown from DB locations
    const locationSelect = document.getElementById('unpackLocation');
    locationSelect.innerHTML = '<option value="">Select Location</option>' +
      allLocations.map(loc => `<option value="${esc(loc.id)}">${esc(loc.name)}</option>`).join('');

    // Update modal title, description, button text for single vs full-box mode
    const titleEl = document.getElementById('unpackModalTitle');
    const descEl = document.getElementById('unpackModalDesc');
    const btnEl = document.getElementById('btnConfirmUnpack');
    const hiddenId = document.getElementById('unpackSingleContentId');

    if (isSingleItem) {
      const item = getItem(contents[0].itemId, contents[0].itemType);
      titleEl.textContent = 'Remove Item - Select Location';
      descEl.textContent = `"${item?.name || 'Item'}" will be unpacked and moved to the selected location.`;
      btnEl.textContent = 'Remove Item';
      hiddenId.value = singleContentId;
    } else {
      titleEl.textContent = 'Empty Box - Select Unpack Location';
      descEl.textContent = 'All items from this box will be unpacked and moved to the selected location.';
      btnEl.textContent = 'Empty Box';
      hiddenId.value = '';
    }

    // Show items list
    const itemsHtml = contents.map(content => {
      const item = getItem(content.itemId, content.itemType);
      if (!item) return '';
      return `
        <div style="padding:6px;border-bottom:1px solid #e0e0e0;display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-weight:600;color:#202124;font-size:.85rem">${esc(item.name)}</div>
            <div style="font-size:.75rem;color:#5f6368">${esc(item.barcode)} · ${esc(item.category || 'Uncategorized')}</div>
          </div>
          <div style="font-size:.75rem;color:#1a73e8;font-weight:600">${content.itemType === 'equipment' ? 'Equipment' : content.itemType === 'inventory' ? 'Inventory' : 'Asset'}</div>
        </div>
      `;
    }).join('');

    document.getElementById('unpackItemsList').innerHTML = `
      <div style="font-size:.85rem;font-weight:600;color:#202124;margin-bottom:8px">
        Item${contents.length !== 1 ? 's' : ''} to unpack (${contents.length}):
      </div>
      ${itemsHtml}
    `;

    unpackModal.show();
  }

  async function confirmUnpack() {
    const locationId = document.getElementById('unpackLocation').value;
    if (!locationId) {
      showToast('Please select a location', 'warning');
      return;
    }
    const locationName = allLocations.find(l => l.id === locationId)?.name || locationId;

    const singleContentId = document.getElementById('unpackSingleContentId').value;
    const isSingleItem = !!singleContentId;

    // Determine which content rows to unpack
    let contents;
    let targetBoxId;
    if (isSingleItem) {
      const content = boxContents.find(c => c.id === singleContentId);
      if (!content) { showToast('Item not found', 'error'); return; }
      contents = [content];
      targetBoxId = content.boxId;
    } else {
      if (!currentBoxId) { showToast('No box selected', 'error'); return; }
      contents = boxContents.filter(c => c.boxId === currentBoxId);
      targetBoxId = currentBoxId;
      if (contents.length === 0) { showToast('This box is already empty', 'warning'); return; }
    }

    const box = boxes.find(b => b.id === targetBoxId);
    unpackModal.hide();

    showLoading(
      isSingleItem ? `Removing Item` : `Emptying Box: ${box?.name}`,
      `Moving ${contents.length} item${contents.length !== 1 ? 's' : ''} to ${locationName}...`
    );

    try {
      await new Promise(resolve => setTimeout(resolve, 300));

      let updateCount = 0;
      for (const content of contents) {
        const item = getItem(content.itemId, content.itemType);
        if (item) {
          item.currentBoxId = null;
          item.currentLocationId = locationId;

          if (content.itemType === 'inventory') {
            inventoryBoxTracking.delete(content.itemId);
            if (window.RTS_API?.unpackInventoryItem) {
              try { await window.RTS_API.unpackInventoryItem(item.id); }
              catch (e) { console.warn('unpackInventoryItem failed:', e.message); }
            }
          } else {
            // Use the proper unpack route — clears both items.current_box_id AND box_contents row
            try {
              await window.RTS_API.unpackItem(content.boxId, item.id);
              // Also set location if one was chosen
              if (locationId && window.RTS_API?.updateItem) {
                await window.RTS_API.updateItem(item.id, { current_location_id: locationId });
              }
            } catch (e) {
              console.error('unpackItem failed:', e.message);
              showToast(`Failed to unpack "${item.name}": ${e.message}`, 'error');
            }
          }
          updateCount++;
        }

        const subtext = document.getElementById('loadingSubtext');
        if (subtext) subtext.textContent = `${updateCount} of ${contents.length} items moved...`;
      }

      const contentIds = new Set(contents.map(c => c.id));
      boxContents = boxContents.filter(c => !contentIds.has(c.id));

      const itemNames = contents.map(c => getItem(c.itemId, c.itemType)?.name || 'Unknown').join(', ');
      if (isSingleItem) {
        addHistory(targetBoxId, 'item_removed', `Removed ${itemNames} to ${locationName}`);
      } else {
        addHistory(targetBoxId, 'box_emptied', `Emptied ${contents.length} items to ${locationName}: ${itemNames}`);
      }

      saveData();
      renderAll();
      hideLoading();
      showToast(
        isSingleItem
          ? `✅ ${itemNames} moved to ${locationName}`
          : `✅ Box emptied! ${contents.length} item${contents.length !== 1 ? 's' : ''} moved to ${locationName}`,
        'success'
      );
    } catch (e) {
      console.error('Error unpacking:', e);
      hideLoading();
      showToast('Error unpacking: ' + e.message, 'error');
    }
  }
  
  // Make globally accessible
  window.showUnpackModal = showUnpackModal;

  // ========== SHOPIFY MULTI-STEP UNPACK ==========

  async function showUnpackReturnStep(boxId, contents) {
    // Build initial state
    const shopifyItems = contents
      .filter(c => {
        const item = getItem(c.itemId, c.itemType);
        return item && c.itemType === 'inventory' && item.shopify_variant_id;
      })
      .map(c => {
        const item = getItem(c.itemId, c.itemType);
        return {
          contentId: c.id,
          itemId: c.itemId,
          variantId: item.shopify_variant_id,
          inventoryItemId: item.shopify_inventory_item_id || null,
          name: item.name,
          packedQty: c.quantityPacked || 1,
          unitCost: item.unit_cost || null
        };
      });

    const otherContents = contents.filter(c => {
      const item = getItem(c.itemId, c.itemType);
      return !(item && c.itemType === 'inventory' && item.shopify_variant_id);
    });

    unpackState = {
      boxId,
      allContents: contents,
      shopifyItems,
      otherContents,
      returnQtys: {},
      locationId: '',
      shopifyLocationId: document.getElementById('shopifyLocationSelect')?.value || null,
      customerAssignments: []
    };

    // Fetch live Shopify prices for all Shopify-linked items
    const variantIds = shopifyItems.map(si => si.variantId).filter(Boolean);
    if (variantIds.length > 0) {
      try {
        const priceResp = await fetch(`/api/shopify/variant-prices?ids=${variantIds.join(',')}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}` }
        });
        const priceData = await priceResp.json();
        if (priceData.success) {
          unpackState.shopifyItems.forEach(si => {
            const p = priceData.prices[String(si.variantId)];
            if (p != null) si.unitCost = parseFloat(p);
          });
        }
      } catch(e) { console.warn('Could not fetch Shopify prices:', e); }
    }

    // Populate location dropdown with Shopify locations (always — fetch if not yet loaded)
    const locSel = document.getElementById('returnStepLocation');
    const preselect = unpackState.shopifyLocationId;
    locSel.innerHTML = '<option value="">⏳ Loading Shopify locations…</option>';
    await loadShopifyLocationsCache();
    if (_shopifyLocations && _shopifyLocations.length > 0) {
      locSel.innerHTML = '<option value="">Select Shopify location…</option>' +
        _shopifyLocations.map(l => `<option value="${esc(l.legacyId)}"${l.legacyId === preselect ? ' selected' : ''}>${esc(l.name)}</option>`).join('');
    } else {
      // Shopify not connected or no locations returned — warn the user
      locSel.innerHTML = '<option value="">⚠️ No Shopify locations found — reconnect Shopify</option>';
    }

    // Render Shopify item rows
    const shopifyHtml = shopifyItems.map((si, idx) => `
      <div style="padding:10px;border:1px solid #e0e0e0;border-radius:6px;margin-bottom:8px;display:flex;align-items:center;gap:12px">
        <div style="flex:1">
          <div style="font-weight:600;font-size:.88rem;color:#202124">${esc(si.name)}</div>
          <div style="font-size:.78rem;color:#5f6368">Packed: ${si.packedQty} unit${si.packedQty !== 1 ? 's' : ''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <label style="font-size:.82rem;color:#5f6368;white-space:nowrap">Return to stock:</label>
          <input type="number" min="0" max="${si.packedQty}" value="${si.packedQty}"
                 id="returnQty_${idx}" data-idx="${idx}"
                 style="width:70px;text-align:center;border:1px solid #1a73e8;border-radius:4px;padding:4px;font-weight:700"
                 oninput="updateReturnStepConsumed(${idx})">
          <span style="font-size:.78rem;color:#e53935">consumed: <span id="consumed_${idx}">${0}</span></span>
        </div>
      </div>
    `).join('');
    document.getElementById('returnStepShopifyItems').innerHTML =
      `<div style="font-size:.8rem;font-weight:600;color:#5f6368;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Shopify Items</div>
      ${shopifyHtml}`;

    // Initialize consumed labels
    shopifyItems.forEach((_, idx) => updateReturnStepConsumed(idx));

    // Render other items
    if (otherContents.length > 0) {
      const otherHtml = otherContents.map(c => {
        const item = getItem(c.itemId, c.itemType);
        return `<div style="padding:4px 0;border-bottom:1px solid #e0e0e0">${esc(item?.name || 'Unknown')} <span style="color:#5f6368">(${c.quantityPacked || 1})</span></div>`;
      }).join('');
      document.getElementById('returnStepOtherList').innerHTML = otherHtml;
      document.getElementById('returnStepOtherItems').style.display = 'block';
    } else {
      document.getElementById('returnStepOtherItems').style.display = 'none';
    }

    unpackStepReturnModal.show();
  }

  window.updateReturnStepConsumed = function(idx) {
    const si = unpackState?.shopifyItems[idx];
    if (!si) return;
    const returnVal = parseInt(document.getElementById('returnQty_' + idx)?.value) || 0;
    const consumed = Math.max(0, si.packedQty - returnVal);
    const el = document.getElementById('consumed_' + idx);
    if (el) el.textContent = consumed;
  };

  window.handleReturnStepNext = function() {
    if (!unpackState) return;

    const locationId = document.getElementById('returnStepLocation').value;
    if (!locationId) { showToast('Please select a Shopify location', 'warning'); return; }
    // Store as both the Shopify location (for return-stock) and the local label
    unpackState.shopifyLocationId = locationId;
    unpackState.locationId = locationId;

    // Read return quantities
    let totalConsumed = 0;
    unpackState.shopifyItems.forEach((si, idx) => {
      const returnVal = Math.min(si.packedQty, Math.max(0, parseInt(document.getElementById('returnQty_' + idx)?.value) || 0));
      unpackState.returnQtys[idx] = returnVal;
      totalConsumed += (si.packedQty - returnVal);
    });

    unpackStepReturnModal.hide();

    if (totalConsumed === 0) {
      // Nothing consumed: skip billing, go straight to confirm
      unpackState.customerAssignments = [];
      showUnpackConfirmStep();
    } else {
      showUnpackBillStep();
    }
  };

  function showUnpackBillStep() {
    if (!unpackState) return;

    // Build consumed items array
    const consumed = unpackState.shopifyItems
      .map((si, idx) => ({
        ...si,
        consumedQty: si.packedQty - (unpackState.returnQtys[idx] || 0)
      }))
      .filter(si => si.consumedQty > 0);
    unpackState.consumedItems = consumed;

    // Render consumed list with live remaining counter
    document.getElementById('billStepConsumedList').innerHTML = consumed.map((si, idx) =>
      `<div style="padding:4px 0;border-bottom:1px solid #ffc107">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div style="font-weight:600">${esc(si.name)}</div>
          <div style="font-size:.82rem;font-weight:700;color:#e53935" id="billRemaining_${idx}">${si.consumedQty}</div>
        </div>
        <div style="font-size:.78rem">Qty to bill: <strong>${si.consumedQty}</strong></div>
       </div>`
    ).join('');

    // Reset customer rows — unless coming back from confirm step
    if (!unpackState._skipRowReset) {
      unpackState.customerRows = [];
      document.getElementById('billStepCustomerRows').innerHTML = '';
      addBillCustomerRow();
    }
    unpackState._skipRowReset = false;
    document.getElementById('billStepValidation').style.display = 'none';

    unpackStepBillModal.show();
  }

  window.addBillCustomerRow = function() {
    if (!unpackState) return;
    const rowId = 'custRow_' + Date.now();
    unpackState.customerRows = unpackState.customerRows || [];
    unpackState.customerRows.push({ rowId, customer: null });

    const qtyInputs = (unpackState.consumedItems || []).map((si, i) =>
      `<div style="display:flex;align-items:center;gap:4px;margin-bottom:4px">
        <span style="font-size:.76rem;color:#5f6368;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(si.name)}</span>
        <input type="number" min="0" max="${si.consumedQty}" value="0"
               id="${rowId}_item_${i}" oninput="updateBillRemainingCounters()" style="width:60px;text-align:center;border:1px solid #ccc;border-radius:4px;padding:2px;font-size:.82rem">
       </div>`
    ).join('');

    const html = `
      <div id="${rowId}" style="border:1px solid #e0e0e0;border-radius:6px;padding:10px;margin-bottom:8px;background:#f8f9fa">
        <div style="display:flex;align-items:flex-start;gap:8px">
          <div style="flex:1">
            <div style="position:relative">
              <input type="text" placeholder="Search customer..." autocomplete="off"
                     id="${rowId}_search"
                     style="width:100%;border:1px solid #ccc;border-radius:4px;padding:4px 8px;font-size:.84rem;margin-bottom:4px"
                     oninput="searchBillCustomer('${rowId}')">
              <div id="${rowId}_results" style="position:absolute;left:0;right:0;top:100%;background:#fff;border:1px solid #ccc;border-radius:4px;z-index:9999;max-height:140px;overflow-y:auto;display:none"></div>
            </div>
            <div id="${rowId}_name" style="font-size:.82rem;font-weight:600;color:#1a73e8;min-height:18px"></div>
          </div>
          <div style="min-width:140px">${qtyInputs}</div>
          <button class="btn btn-sm btn-outline-danger" style="padding:2px 6px;font-size:.78rem" onclick="removeBillCustomerRow('${rowId}')">✕</button>
        </div>
      </div>`;
    document.getElementById('billStepCustomerRows').insertAdjacentHTML('beforeend', html);
  };

  let _billSearchTimers = {};
  window.searchBillCustomer = function(rowId) {
    clearTimeout(_billSearchTimers[rowId]);
    _billSearchTimers[rowId] = setTimeout(async () => {
      const q = document.getElementById(rowId + '_search')?.value?.trim();
      const resultsEl = document.getElementById(rowId + '_results');
      if (!resultsEl) return;
      if (!q || q.length < 2) { resultsEl.style.display = 'none'; return; }
      try {
        const resp = await fetch(`/api/shopify/customers?q=${encodeURIComponent(q)}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}` }
        });
        const data = await resp.json();
        if (!data.success || !data.customers.length) {
          resultsEl.innerHTML = '<div style="padding:6px 10px;font-size:.82rem;color:#5f6368">No customers found</div>';
          resultsEl.style.display = 'block';
          return;
        }
        resultsEl.innerHTML = data.customers.map(c =>
          `<div style="padding:6px 10px;cursor:pointer;font-size:.84rem;border-bottom:1px solid #f0f0f0"
                onmousedown="selectBillCustomer('${rowId}', '${c.id}', '${esc(c.display_name)}', '${esc(c.email)}')"
                onmouseover="this.style.background='#f0f4ff'" onmouseout="this.style.background=''">
            <strong>${esc(c.display_name)}</strong> <span style="color:#5f6368;font-size:.78rem">${esc(c.email)}</span>
           </div>`
        ).join('');
        resultsEl.style.display = 'block';
      } catch(e) { console.warn('Customer search failed:', e); }
    }, 300);
  };

  window.selectBillCustomer = function(rowId, customerId, name, email) {
    const row = (unpackState?.customerRows || []).find(r => r.rowId === rowId);
    if (row) row.customer = { id: customerId, name, email };
    const searchEl = document.getElementById(rowId + '_search');
    const nameEl = document.getElementById(rowId + '_name');
    const resultsEl = document.getElementById(rowId + '_results');
    if (searchEl) searchEl.value = name + (email ? ` <${email}>` : '');
    if (nameEl) nameEl.textContent = name;
    if (resultsEl) resultsEl.style.display = 'none';
  };

  window.removeBillCustomerRow = function(rowId) {
    document.getElementById(rowId)?.remove();
    if (unpackState?.customerRows) {
      unpackState.customerRows = unpackState.customerRows.filter(r => r.rowId !== rowId);
    }
    updateBillRemainingCounters();
  };

  window.updateBillRemainingCounters = function() {
    const consumed = unpackState?.consumedItems || [];
    const activeRows = (unpackState?.customerRows || []).filter(r => document.getElementById(r.rowId));
    consumed.forEach((si, i) => {
      let assigned = 0;
      activeRows.forEach(row => {
        assigned += parseInt(document.getElementById(`${row.rowId}_item_${i}`)?.value) || 0;
      });
      const remaining = Math.max(0, si.consumedQty - assigned);
      const el = document.getElementById('billRemaining_' + i);
      if (el) {
        el.textContent = remaining;
        el.style.color = remaining === 0 ? '#34a853' : '#e53935';
      }
    });
  };

  window.handleBillStepBack = async function() {
    unpackStepBillModal.hide();
    // Re-show step 1 but restore the return quantities the user already set
    const savedReturnQtys = { ...unpackState.returnQtys };
    await showUnpackReturnStep(unpackState.boxId, unpackState.allContents);
    // Restore input values
    Object.entries(savedReturnQtys).forEach(([idx, qty]) => {
      const el = document.getElementById('returnQty_' + idx);
      if (el) { el.value = qty; updateReturnStepConsumed(parseInt(idx)); }
    });
  };

  window.handleBillStepNext = function() {
    if (!unpackState) return;
    const consumed = unpackState.consumedItems || [];

    // Validate: every customer row must have a selected customer
    const activeRows = (unpackState.customerRows || []).filter(r => document.getElementById(r.rowId));
    const validationEl = document.getElementById('billStepValidation');

    for (const row of activeRows) {
      if (!row.customer) {
        validationEl.textContent = 'Please select a customer from the dropdown for each row.';
        validationEl.style.display = 'block';
        return;
      }
    }

    // Build per-consumed-item totals assigned
    const assignedTotals = consumed.map(() => 0);
    for (const row of activeRows) {
      consumed.forEach((si, i) => {
        const val = parseInt(document.getElementById(`${row.rowId}_item_${i}`)?.value) || 0;
        assignedTotals[i] += val;
      });
    }

    // Validate totals match consumed
    for (let i = 0; i < consumed.length; i++) {
      if (assignedTotals[i] !== consumed[i].consumedQty) {
        validationEl.textContent = `"${consumed[i].name}": assigned ${assignedTotals[i]} but consumed ${consumed[i].consumedQty}. Please assign all consumed quantities.`;
        validationEl.style.display = 'block';
        return;
      }
    }
    validationEl.style.display = 'none';

    // Build customerAssignments
    unpackState.customerAssignments = activeRows
      .map(row => ({
        customer: row.customer,
        lineItems: consumed
          .map((si, i) => ({
            variantId: si.variantId,
            quantity: parseInt(document.getElementById(`${row.rowId}_item_${i}`)?.value) || 0,
            price: si.unitCost != null ? si.unitCost : null,
            name: si.name
          }))
          .filter(li => li.quantity > 0)
      }))
      .filter(ca => ca.lineItems.length > 0);

    unpackStepBillModal.hide();
    showUnpackConfirmStep();
  };

  function showUnpackConfirmStep() {
    if (!unpackState) return;

    // Order previews
    const assignmentsHtml = unpackState.customerAssignments.length > 0
      ? unpackState.customerAssignments.map(ca => {
          const linesHtml = ca.lineItems.map(li => {
            const lineTotal = li.price != null ? (parseFloat(li.price) * li.quantity).toFixed(2) : null;
            return `<div style="display:flex;justify-content:space-between;font-size:.82rem;padding:2px 0">
              <span>${esc(li.name)} <span style="color:#5f6368">×${li.quantity}</span></span>
              <span style="font-weight:600">${lineTotal != null ? 'R' + lineTotal : ''}</span>
             </div>`;
          }).join('');
          return `
            <div style="border:1px solid #e0e0e0;border-radius:6px;padding:12px;margin-bottom:10px">
              <div style="font-weight:700;font-size:.9rem;margin-bottom:8px;color:#1a73e8">📋 Order for ${esc(ca.customer.name)}</div>
              ${linesHtml}
            </div>`;
        }).join('')
      : '<div style="color:#5f6368;font-size:.85rem">No orders to create — all items being returned to stock.</div>';

    document.getElementById('confirmStepOrderPreviews').innerHTML = assignmentsHtml;

    // Return summary
    const returnedItems = unpackState.shopifyItems
      .map((si, idx) => ({ name: si.name, returnQty: unpackState.returnQtys[idx] || 0 }))
      .filter(x => x.returnQty > 0);
    const returnHtml = returnedItems.length > 0
      ? '📦 Returning to Shopify stock: ' + returnedItems.map(x => `${x.returnQty}× ${esc(x.name)}`).join(', ')
      : 'No items to return to stock.';
    document.getElementById('confirmStepReturnSummary').textContent = returnHtml;

    unpackStepConfirmModal.show();
  }

  window.handleConfirmStepBack = async function() {
    unpackStepConfirmModal.hide();
    if ((unpackState?.consumedItems || []).length > 0) {
      // Re-show bill step, restore customer rows that were already built
      // by calling showUnpackBillStep with a flag to skip row reset
      unpackState._skipRowReset = true;
      showUnpackBillStep();
    } else {
      const savedReturnQtys = { ...unpackState.returnQtys };
      await showUnpackReturnStep(unpackState.boxId, unpackState.allContents);
      Object.entries(savedReturnQtys).forEach(([idx, qty]) => {
        const el = document.getElementById('returnQty_' + idx);
        if (el) { el.value = qty; updateReturnStepConsumed(parseInt(idx)); }
      });
    }
  };

  window.handleConfirmAndCreate = async function() {
    if (!unpackState) return;
    const btn = document.getElementById('btnConfirmAndCreate');
    if (btn) { btn.disabled = true; btn.textContent = 'Creating orders…'; }

    try {
      // 1. Return stock to Shopify FIRST (before creating orders)
      const returnItems = unpackState.shopifyItems
        .map((si, idx) => ({
          inventory_item_id: si.inventoryItemId,
          location_id: unpackState.shopifyLocationId,
          adjustment: unpackState.returnQtys[idx] || 0
        }))
        .filter(x => x.inventory_item_id && x.location_id && x.adjustment > 0);

      // Warn about items that can't be returned (missing inventoryItemId)
      const missingIds = unpackState.shopifyItems
        .filter((si, idx) => (unpackState.returnQtys[idx] || 0) > 0 && !si.inventoryItemId)
        .map(si => si.name);
      if (missingIds.length > 0) {
        console.warn('Items missing inventoryItemId (stock not returned):', missingIds);
        showToast(`⚠️ Could not return stock for: ${missingIds.join(', ')} — inventory item ID not linked. Re-import from Shopify to fix.`, 'warning');
      }

      let stockErrors = [];
      if (returnItems.length > 0) {
        try {
          const stockResp = await fetch('/api/shopify/return-stock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}` },
            body: JSON.stringify({ items: returnItems })
          });
          const stockData = await stockResp.json();
          if (!stockResp.ok || stockData.errors?.length) {
            stockErrors = stockData.errors || [`Return stock failed (${stockResp.status})`];
            console.warn('Return stock errors:', JSON.stringify(stockErrors));
          }
        } catch(e) {
          stockErrors = [e.message];
          console.warn('Return stock exception:', e);
        }
      }

      // 2. Create Shopify orders
      const orderResults = [];
      for (const ca of unpackState.customerAssignments) {
        try {
          const resp = await fetch('/api/shopify/create-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('auth_token') || ''}` },
            body: JSON.stringify({
              customerId: ca.customer.id,
              locationId: unpackState.shopifyLocationId || null,
              lineItems: ca.lineItems
            })
          });
          const data = await resp.json();
          if (data.success) {
            const fulfillNote = data.fulfilled ? ' ✓ fulfilled' : (data.fulfillmentError ? ` (fulfillment failed: ${data.fulfillmentError})` : '');
            orderResults.push({ customer: ca.customer.name, orderNumber: data.order.order_number, fulfillNote });
          } else {
            console.warn('Order creation failed for', ca.customer.name, data.error);
            orderResults.push({ customer: ca.customer.name, error: data.error });
          }
        } catch(e) {
          console.warn('Order error:', e);
          orderResults.push({ customer: ca.customer.name, error: e.message });
        }
      }

      // 3. Run existing unpack logic (moves items to location in local DB)
      unpackStepConfirmModal.hide();

      const locationId = unpackState.locationId;
      const locationName = getShopifyLocationName(locationId) || allLocations.find(l => l.id === locationId)?.name || locationId;
      const contents = unpackState.allContents;
      const box = boxes.find(b => b.id === unpackState.boxId);

      showLoading(`Emptying Box: ${box?.name || ''}`, `Moving ${contents.length} items to ${locationName}...`);
      await new Promise(r => setTimeout(r, 300));

      let updateCount = 0;
      for (const content of contents) {
        const item = getItem(content.itemId, content.itemType);
        if (item) {
          item.currentBoxId = null;
          item.currentLocationId = locationId;
          if (content.itemType === 'inventory') {
            inventoryBoxTracking.delete(content.itemId);
            if (window.RTS_API?.unpackInventoryItem) {
              try { await window.RTS_API.unpackInventoryItem(item.id); } catch(e) {}
            }
          } else {
            try {
              await window.RTS_API.unpackItem(unpackState.boxId, item.id);
              if (locationId && window.RTS_API?.updateItem) {
                await window.RTS_API.updateItem(item.id, { current_location_id: locationId });
              }
            } catch(e) { console.error('unpackItem failed:', e.message); }
          }
          updateCount++;
        }
      }

      const contentIds = new Set(contents.map(c => c.id));
      boxContents = boxContents.filter(c => !contentIds.has(c.id));

      addHistory(unpackState.boxId, 'box_emptied', `Emptied ${contents.length} items to ${locationName}`);
      saveData();
      renderAll();
      hideLoading();

      // Build final toast
      const orderSummary = orderResults.length > 0
        ? '\n' + orderResults.map(r => r.error ? `  ✗ ${r.customer}: ${r.error}` : `  ✅ Order #${r.orderNumber} → ${r.customer}${r.fulfillNote || ''}`).join('\n')
        : '';
      const stockSummary = stockErrors.length > 0 ? `\n  ⚠️ Stock return errors: ${stockErrors.join('; ')}` : '';
      showToast(`✅ Box emptied! ${contents.length} items moved to ${locationName}${orderSummary}${stockSummary}`, 'success');

      unpackState = null;
    } catch(e) {
      console.error('handleConfirmAndCreate error:', e);
      hideLoading();
      showToast('Error: ' + e.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '✅ Create Orders & Empty Box'; }
    }
  };
  
  // ========== TOAST NOTIFICATIONS ==========
  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };
    
    const toast = document.createElement('div');
    toast.className = `custom-toast ${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${icons[type]}</span>
      <span class="toast-message">${message}</span>
      <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;
    
    container.appendChild(toast);
    
    // Auto remove after 4 seconds
    setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
  
  function showLoading(text = 'Processing...', subtext = 'Please wait') {
    const overlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');
    const loadingSubtext = document.getElementById('loadingSubtext');
    
    if (loadingText) loadingText.textContent = text;
    if (loadingSubtext) loadingSubtext.textContent = subtext;
    if (overlay) overlay.classList.add('show');
  }
  
  function updateLoadingText(subtext) {
    const loadingSubtext = document.getElementById('loadingSubtext');
    if (loadingSubtext) loadingSubtext.textContent = subtext;
  }
  
  function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.classList.remove('show');
  }

  // ========== HISTORY ==========
  function addHistory(boxId, action, details) {
    const entry = {
      id: RTS.uid('history'),
      boxId: boxId,
      action: action,
      details: details,
      location: getBox(boxId)?.location || 'Unknown',
      timestamp: new Date().toISOString()
    };
    boxHistory.push(entry);
  }

  function showHistory() {
    if (!currentBoxId) {
      showToast('Please select a box first', 'warning');
      return;
    }

    const box = getBox(currentBoxId);
    const history = boxHistory.filter(h => h.boxId === currentBoxId).sort((a, b) => 
      new Date(b.timestamp) - new Date(a.timestamp)
    );

    const html = `
      <h6 style="margin-bottom:15px">History for: ${esc(box.name)} (${esc(box.barcode)})</h6>
      ${history.map(entry => `
        <div class="history-entry">
          <div class="history-time">${new Date(entry.timestamp).toLocaleString()}</div>
          <div class="history-action"><strong>${formatAction(entry.action)}:</strong> ${esc(entry.details)}</div>
          <div class="history-location">📍 ${esc(entry.location)}</div>
        </div>
      `).join('')}
      ${history.length === 0 ? '<div style="text-align:center;padding:30px;color:#5f6368">No history entries</div>' : ''}
    `;

    document.getElementById('historyContent').innerHTML = html;
    historyModal.show();
  }

  function formatAction(action) {
    const actions = {
      'created': '✨ Created',
      'item_added': '➕ Item Added',
      'item_removed': '➖ Item Removed',
      'location_changed': '📍 Location Changed',
      'status_changed': '🔄 Status Changed'
    };
    return actions[action] || action;
  }

  // ========== PRINTING ==========
  function printLabel() {
    if (!currentBoxId) {
      showToast('Please select a box first', 'warning');
      return;
    }

    const box = getBox(currentBoxId);
    const contents = boxContents.filter(c => c.boxId === currentBoxId);
    
    const printWindow = window.open('', '_blank');
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Box Label - ${box.barcode}</title>
        <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
        <style>
          body { font-family: Arial; padding: 20px; }
          .label { border: 2px solid #000; padding: 20px; max-width: 600px; }
          h1 { margin: 0 0 10px 0; font-size: 1.5rem; }
          .barcode-container { margin: 15px 0; }
          svg { width: 100%; height: 80px; }
          .details { margin-top: 20px; }
          .details div { margin-bottom: 8px; }
          .contents-list { margin-top: 15px; border-top: 1px solid #ccc; padding-top: 15px; }
          .item { margin-bottom: 5px; font-size: 0.9rem; }
        </style>
      </head>
      <body>
        <div class="label">
          <h1>${box.name}</h1>
          <div class="barcode-container">
            <svg id="barcode"></svg>
          </div>
          <div class="details">
            <div><strong>Dimensions:</strong> ${box.length} × ${box.width} × ${box.height} cm</div>
            <div><strong>Weight Capacity:</strong> ${box.weightCapacity} kg</div>
            <div><strong>Location:</strong> ${box.location}</div>
            <div><strong>Items Inside:</strong> ${contents.length}</div>
          </div>
          <div class="contents-list">
            <strong>Contents:</strong>
            ${contents.map(c => {
              const item = getItem(c.itemId, c.itemType);
              return item ? `<div class="item">• ${item.name} (${item.barcode})</div>` : '';
            }).join('')}
          </div>
        </div>
        <script>
          JsBarcode("#barcode", "${box.barcode}", {
            format: "CODE128",
            displayValue: true,
            fontSize: 18,
            height: 60
          });
          setTimeout(() => window.print(), 500);
        </script>
      </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  }

  // ========== HELPER FUNCTIONS ==========
  function getBox(id) {
    return boxes.find(b => b.id === id);
  }

  function getBoxName(id) {
    const box = getBox(id);
    return box ? box.name : 'Unknown Box';
  }

  function getItem(id, type) {
    if (type === 'inventory') {
      // Find in inventoryItems array, but create a temporary item object
      // since inventory items don't have currentBoxId tracking yet
      console.log(`  🔍 Looking for inventory item with id: ${id}, type: ${typeof id}`);
      console.log(`  📊 inventoryItems array length: ${inventoryItems.length}`);
      const invItem = inventoryItems.find(i => i.id === id || String(i.id) === String(id));
      console.log(`  📌 Found inventory item:`, invItem ? `"${invItem.name}"` : 'NOT FOUND');
      if (invItem) {
        // Check if this inventory item is already packed in a box
        const packedBoxId = inventoryBoxTracking.get(id) || inventoryBoxTracking.get(String(id));
        console.log(`  📦 Tracking Map says boxId: ${packedBoxId}`);
        // Return a modified version with the required properties
        return {
          id: invItem.id,
          barcode: String(invItem.sku || invItem.id || ''),
          name: String(invItem.name || 'Unnamed Item'),
          category: String(invItem.category || 'Inventory'),
          type: 'inventory',
          itemType: 'Inventory',
          serialNumber: String(invItem.sku || 'N/A'),
          totalQuantity: invItem.quantity || 0,
          quantity: invItem.quantity || 0,
          currentBoxId: packedBoxId || null,
          shopify_variant_id: invItem.shopify_variant_id || null,
          shopify_inventory_item_id: invItem.shopify_inventory_item_id || null,
          unit_cost: invItem.unit_cost || null
        };
      }
    }
    // For equipment/asset/custom types: item_type in box_contents may not match
    // the actual item_type stored on the item (e.g. box has 'equipment' but item
    // has a custom type like 'Engine'). Search both arrays by ID — IDs are unique.
    return equipment.find(e => e.id === id) || assets.find(a => a.id === id) || null;
  }

  function esc(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ========== UTILITY FUNCTIONS ==========
  function resetDemoData() {
    if (confirm('⚠️ This will clear ALL data and reload with fresh demo data (20 boxes, 85 items). Continue?')) {
      localStorage.removeItem(LS_BOXES);
      localStorage.removeItem(LS_BOX_CONTENTS);
      localStorage.removeItem(LS_BOX_HISTORY);
      localStorage.removeItem(LS_EQUIPMENT);
      localStorage.removeItem(LS_ASSETS);
      location.reload();
    }
  }
  
  function getDataSummary() {
    return {
      boxes: boxes.length,
      equipment: equipment.length,
      assets: assets.length,
      totalItems: equipment.length + assets.length,
      packedItems: boxContents.length,
      emptyBoxes: boxes.filter(b => boxContents.filter(c => c.boxId === b.id).length === 0).length,
      fullestBox: boxes.reduce((max, box) => {
        const count = boxContents.filter(c => c.boxId === box.id).length;
        return count > (max.count || 0) ? { name: box.name, count } : max;
      }, {}),
      history: boxHistory.length
    };
  }
  
  // ========== ITEM SELECTION & MULTI-DRAG ==========
  
  function toggleItemSelection(itemId) {
    if (selectedItems.has(itemId)) {
      selectedItems.delete(itemId);
    } else {
      selectedItems.add(itemId);
    }
    // Update visual state without re-rendering entire list
    updateItemCheckboxStates();
  }
  
  function updateItemCheckboxStates() {
    // Update checkboxes and selected class for all items
    document.querySelectorAll('.item-checkbox').forEach(cb => {
      const itemId = cb.dataset.itemId;
      const isSelected = selectedItems.has(itemId);
      cb.checked = isSelected;
      
      // Update the parent item-card's selected class
      const itemCard = cb.closest('.item-card');
      if (itemCard) {
        if (isSelected) {
          itemCard.classList.add('item-selected');
        } else {
          itemCard.classList.remove('item-selected');
        }
      }
    });
  }
  
  function getItemById(itemId) {
    // Search in both equipment and assets arrays
    let item = equipment.find(e => e.id === itemId);
    if (item) return { ...item, type: 'equipment' };
    
    item = assets.find(a => a.id === itemId);
    if (item) return { ...item, type: 'assets' };
    
    return null;
  }
  
  async function packMultipleItems(boxId, items, presetQuantity = null) {
    if (!items || items.length === 0) return;
    
    const box = boxes.find(b => b.id === boxId);
    if (!box) {
      showToast('Box not found', 'error');
      return;
    }
    
    // If packing inventory items, ask for quantity
    const inventoryItems = items.filter(item => item.type === 'inventory');
    const nonInventoryItems = items.filter(item => item.type !== 'inventory');
    
    // Handle inventory items with quantity prompt
    if (inventoryItems.length > 0) {
      for (const {id, type} of inventoryItems) {
        const item = getItem(id, type);
        if (!item) continue;
        
        // Calculate available quantity
        const packedQty = (window.inventoryPackedQuantities?.get(id) || 
                          window.inventoryPackedQuantities?.get(String(id))) || 0;
        const totalQty = item.totalQuantity || item.quantity || 0;
        const availableQty = totalQty - packedQty;
        
        if (availableQty <= 0 && presetQuantity == null) {
          showToast(`No units available for ${item.name}`, 'warning');
          continue;
        }

        // Use preset quantity (from Shopify flow) or prompt the user
        let quantity;
        if (presetQuantity != null) {
          quantity = presetQuantity;
        } else {
          // Styled quantity prompt
          const quantityStr = await customPrompt(
            `📦 Pack "${item.name}"`,
            `Packing into: ${box.name}\n\nAvailable: ${availableQty} of ${totalQty} units (${packedQty} already packed).\n\nHow many units to pack?`,
            `1 – ${availableQty}`
          );

          if (!quantityStr || quantityStr.trim() === '') {
            continue; // User cancelled
          }

          quantity = parseInt(quantityStr);
          if (isNaN(quantity) || quantity <= 0) {
            showToast('Invalid quantity', 'error');
            continue;
          }
        }
        
        if (quantity > availableQty && presetQuantity == null) {
          showToast(`Only ${availableQty} units available`, 'error');
          continue;
        }
        
        showLoading(`Packing Inventory`, `Adding ${quantity} units of ${item.name} to ${box.name}...`);
        
        try {
          // Call API with quantity
          await RTS_API.packInventoryItem(boxId, id, quantity);
          
          // Update local tracking
          const currentPacked = window.inventoryPackedQuantities?.get(id) || 0;
          window.inventoryPackedQuantities.set(id, currentPacked + quantity);
          window.inventoryPackedQuantities.set(String(id), currentPacked + quantity);
          
          hideLoading();
          showToast(`✅ Packed ${quantity} units into ${box.name}`, 'success');
          
          // Reload data to get updated state
          await loadData();
          renderAll();
        } catch (error) {
          hideLoading();
          console.error('Error packing inventory item:', error);
          showToast(`Error: ${error.message || 'Failed to pack item'}`, 'error');
        }
      }
    }
    
    // Handle non-inventory items (equipment/assets) - existing logic
    if (nonInventoryItems.length > 0) {
      showLoading(`Packing Items`, `Adding ${nonInventoryItems.length} item(s) to ${box.name}...`);
      
      try {
        await new Promise(resolve => setTimeout(resolve, 300));
        
        let packedCount = 0;
        for (const {id, type} of nonInventoryItems) {
          console.log(`🔍 Attempting to pack item ${id} (type: ${type})`);
          const item = getItem(id, type);
          if (!item) {
            console.warn(`❌ Item ${id} (type: ${type}) not found`);
            continue;
          }
          console.log(`  📋 Item found: "${item.name}", currentBoxId: ${item.currentBoxId}`);
          if (item.currentBoxId && item.currentBoxId !== boxId) {
            const otherBox = boxes.find(b => b.id === item.currentBoxId);
            const otherName = otherBox ? otherBox.name : item.currentBoxId;
            showToast(`⚠️ "${item.name}" is already in ${otherName} — unpack it first`, 'warning');
            console.warn(`⚠️ Item ${id} "${item.name}" already packed in box ${item.currentBoxId}`);
            continue;
          }
          if (item.currentBoxId === boxId) {
            console.warn(`⚠️ Item ${id} "${item.name}" already in this box`);
            continue;
          }
          
          console.log(`✅ Packing item ${id} "${item.name}" into box ${boxId}`);
          
          // Update in database via items API for equipment/assets
          try {
            await RTS_API.packItem(boxId, id);
            packedCount++;
          } catch (error) {
            console.error('Error packing item via API:', error);
            // Parse the server message if available
            const msg = error.message?.includes('already packed')
              ? `⚠️ "${item.name}" is already packed in another box`
              : `Failed to pack "${item.name}": ${error.message || 'server error'}`;
            showToast(msg, 'error');
          }
        }
        
        // Clear selection after packing
        selectedItems.clear();
        
        hideLoading();
        
        if (packedCount > 0) {
          showToast(`✅ Packed ${packedCount} item(s) into ${box.name}`, 'success');
          
          // Reload data to get updated state
          await loadData();
          renderAll();
        } else if (nonInventoryItems.length > 0) {
          // All failed — reload anyway so UI reflects real DB state
          await loadData();
          renderAll();
        } else {
          showToast('No items were packed (already in boxes)', 'warning');
        }
      } catch (error) {
        hideLoading();
        console.error('Error in packMultipleItems:', error);
        showToast(`Error: ${error.message || 'Failed to pack items'}`, 'error');
      }
    }
  }

  // ========== BOX SELECTION & BULK ACTIONS ==========
  
  function handleBoxClick(event, boxId) {
    // If clicking the checkbox, let toggleBoxSelection handle it
    if (event.target.classList.contains('box-checkbox')) {
      return;
    }
    // Otherwise, select the box normally
    selectBox(boxId);
  }
  
  function toggleBoxSelection(boxId) {
    if (selectedBoxes.has(boxId)) {
      selectedBoxes.delete(boxId);
    } else {
      selectedBoxes.add(boxId);
    }
    updateBoxBulkToolbar();
    updateBoxCheckboxStates();
  }
  
  function updateBoxBulkToolbar() {
    const toolbar = document.getElementById('bulkBoxActionsToolbar');
    const count = document.getElementById('selectedBoxCount');
    
    if (!toolbar || !count) return;
    
    count.textContent = selectedBoxes.size;
    
    if (selectedBoxes.size > 0) {
      toolbar.classList.add('show');
    } else {
      toolbar.classList.remove('show');
    }
  }
  
  function updateBoxCheckboxStates() {
    document.querySelectorAll('.box-checkbox').forEach(cb => {
      cb.checked = selectedBoxes.has(cb.dataset.boxId);
    });
  }
  
  function clearBoxSelection() {
    selectedBoxes.clear();
    document.querySelectorAll('.box-checkbox').forEach(cb => cb.checked = false);
    updateBoxBulkToolbar();
  }
  
  function bulkPrintLabelSheets() {
    if (selectedBoxes.size === 0) {
      showToast('No boxes selected', 'warning');
      return;
    }
    const selectedBoxList = boxes.filter(b => selectedBoxes.has(b.id));

    function escHtml(str) {
      return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    const KOKORO_LOGO = 'https://www.fpzero.co.uk/images/partner_kokoro.png';
    const FTW_LOGO    = 'https://ftwmotorsport.com/cdn/shop/files/FTW_Logo_4d20e63f-d033-40e3-9d0e-70d69a8b59ce.png?v=1664635126&width=225';

    function stickerHtml(boxBarcode, boxName) {
      const label = boxBarcode || boxName;
      const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=4&data=' + encodeURIComponent(label);
      const nameLine = (boxName && boxName !== boxBarcode)
        ? `<div class="sticker-name">${escHtml(boxName)}</div>`
        : '';
      return `
        <div class="sticker">
          <div class="sticker-logo-top">
            <img src="${KOKORO_LOGO}" class="logo-img" alt="Kokoro">
          </div>
          <div class="sticker-qr">
            <img src="${qrUrl}" alt="QR: ${escHtml(label)}">
          </div>
          <div class="sticker-barcode">${escHtml(label)}</div>
          ${nameLine}
          <div class="sticker-logo-bottom">
            <img src="${FTW_LOGO}" class="logo-img logo-img-ftw" alt="FTW">
          </div>
        </div>`;
    }

    const pages = selectedBoxList.map(box => `
      <div class="page">
        ${stickerHtml(box.barcode, box.name)}
        ${stickerHtml(box.barcode, box.name)}
        ${stickerHtml(box.barcode, box.name)}
        ${stickerHtml(box.barcode, box.name)}
      </div>`
    ).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Box Label Sheets</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, Helvetica, sans-serif; background:#fff; }

    .page {
      width: 210mm;
      height: 297mm;
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-template-rows: 1fr 1fr;
      page-break-after: always;
      break-after: page;
    }

    .sticker {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 10mm;
      gap: 6mm;
      border: 1px dashed #bbb;
    }

    .sticker-logo-top,
    .sticker-logo-bottom {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
    }

    .logo-img {
      max-height: 16mm;
      max-width: 42mm;
      width: auto;
      object-fit: contain;
    }

    .logo-img-ftw {
      max-height: 12mm;
      max-width: 36mm;
    }

    .sticker-qr img {
      display: block;
      width: 48mm;
      height: 48mm;
    }

    .sticker-barcode {
      font-size: 15pt;
      font-weight: 800;
      text-align: center;
      color: #000;
      letter-spacing: 1px;
    }

    .sticker-name {
      font-size: 10pt;
      font-weight: 500;
      text-align: center;
      color: #444;
      word-break: break-word;
      max-width: 80mm;
      line-height: 1.2;
    }

    @media print {
      body { margin:0; }
      .page { border:none; page-break-after: always; break-after: page; }
      .sticker { border: 0.5pt dashed #999; }
    }
  </style>
</head>
<body>
  ${pages}
  <script>
    // Wait for all QR code images to load before printing
    window.addEventListener('load', function() {
      setTimeout(function() { window.print(); }, 400);
    });
  <\/script>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (!win) {
      showToast('Popup blocked — please allow popups for this page', 'warning');
      return;
    }
    win.document.write(html);
    win.document.close();
  }

  function toggleBulkBoxDropdown(event) {
    event.stopPropagation();
    const dropdown = document.getElementById('bulkBoxDropdown');
    dropdown.classList.toggle('show');
    
    // Close when clicking outside
    if (dropdown.classList.contains('show')) {
      setTimeout(() => {
        document.addEventListener('click', function closeDropdown(e) {
          if (!e.target.closest('.bulk-box-actions-dropdown')) {
            dropdown.classList.remove('show');
            document.removeEventListener('click', closeDropdown);
          }
        });
      }, 0);
    }
  }
  
  function closeBulkBoxDropdown() {
    const dropdown = document.getElementById('bulkBoxDropdown');
    dropdown.classList.remove('show');
  }
  
  async function bulkMoveBoxesToLocation() {
    if (selectedBoxes.size === 0) {
      showToast('No boxes selected', 'warning');
      return;
    }
    
    if (allLocations.length === 0) {
      showToast('No locations available. Add them in Settings > Locations.', 'error');
      return;
    }

    const location = await customSelect(
      '📦 Move Boxes to Location',
      `Select location to move ${selectedBoxes.size} box(es) (items stay packed):`,
      allLocations
    );
    if (!location) return;
    
    const locationId = location.id;
    const locationName = location.name;
    const selectedBoxArray = Array.from(selectedBoxes);
    
    showLoading(`Moving ${selectedBoxArray.length} boxes to ${locationName}...`);
    
    try {
      // Update each box's location via API
      await Promise.all(selectedBoxArray.map(boxId => 
        RTS_API.updateBox(boxId, { location_id: locationId })
      ));
      
      // Update local state
      selectedBoxArray.forEach(boxId => {
        const box = boxes.find(b => b.id === boxId);
        if (box) {
          box.currentLocationId = locationId;
          box.locationName = locationName;
        }
      });
      
      saveData();
      clearBoxSelection();
      renderAll();
      hideLoading();
      showToast(`✅ Moved ${selectedBoxArray.length} boxes to ${locationName}`, 'success');
    } catch (error) {
      hideLoading();
      showToast(`❌ Error: ${error.message}`, 'error');
    }
  }
  
  async function bulkUnpackBoxesToLocation() {
    if (selectedBoxes.size === 0) {
      showToast('No boxes selected', 'warning');
      return;
    }
    
    if (allLocations.length === 0) {
      showToast('No locations available. Add them in Settings > Locations.', 'error');
      return;
    }

    const location = await customSelect(
      '📍 Unpack Boxes to Location',
      `Select location to unpack ${selectedBoxes.size} box(es):`,
      allLocations
    );
    if (!location) return;
    
    const locationId = location.id;
    const locationName = location.name;
    const selectedBoxArray = Array.from(selectedBoxes);
    let totalItems = 0;
    
    // Count total items
    selectedBoxArray.forEach(boxId => {
      const contents = boxContents.filter(c => c.boxId === boxId);
      totalItems += contents.length;
    });
    
    if (totalItems === 0) {
      showToast('Selected boxes are empty', 'warning');
      return;
    }
    
    const confirmed = await customConfirm(
      'Confirm Unpack',
      `Unpack ${selectedBoxArray.length} box(es) containing ${totalItems} item(s) to "${locationName}"?`,
      'Unpack'
    );
    if (!confirmed) return;
    
    showLoading(`Unpacking Boxes`, `Moving ${totalItems} items to ${locationName}...`);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      
      for (const boxId of selectedBoxArray) {
        const contents = boxContents.filter(c => c.boxId === boxId);
        for (const content of contents) {
          const item = getItem(content.itemId, content.itemType);
          if (item) {
            item.currentBoxId = null;
            item.currentLocationId = locationId;
            
            // For inventory items, also clear the tracking Map
            if (content.itemType === 'inventory') {
              inventoryBoxTracking.delete(content.itemId);
              inventoryBoxTracking.delete(String(content.itemId));
              
              // Update via inventory API
              try {
                await RTS_API.unpackInventoryItem(content.itemId);
              } catch (error) {
                console.error('Error unpacking inventory item:', error);
              }
            } else {
              // Update in database for equipment/assets
              try {
                await RTS_API.unpackItem(content.itemId);
                await RTS_API.updateItem(content.itemId, { current_location_id: locationId });
              } catch (error) {
                console.error('Error updating item:', error);
              }
            }
          }
        }
        
        // Remove from box_contents
        await Promise.all(contents.map(c => RTS_API.removeFromBox(c.boxId, c.itemId)));
      }
      
      // Clear box contents locally
      boxContents = boxContents.filter(c => !selectedBoxArray.includes(c.boxId));
      
      saveData();
      clearBoxSelection();
      renderAll();
      hideLoading();
      showToast(`✅ Unpacked ${totalItems} items from ${selectedBoxArray.length} boxes to ${locationName}`, 'success');
    } catch (error) {
      hideLoading();
      showToast(`❌ Error: ${error.message}`, 'error');
    }
  }
  
  async function bulkDeleteBoxesAndMoveItems() {
    if (selectedBoxes.size === 0) {
      showToast('No boxes selected', 'warning');
      return;
    }
    
    if (allLocations.length === 0) {
      showToast('No locations available. Add them in Settings > Locations.', 'error');
      return;
    }

    const location = await customSelect(
      '⚠️ Delete Boxes and Move Items',
      `Select location to move items from ${selectedBoxes.size} box(es):`,
      allLocations
    );
    if (!location) return;
    
    const locationId = location.id;
    const locationName = location.name;
    const selectedBoxArray = Array.from(selectedBoxes);
    let totalItems = 0;
    
    selectedBoxArray.forEach(boxId => {
      const contents = boxContents.filter(c => c.boxId === boxId);
      totalItems += contents.length;
    });
    
    const boxNames = selectedBoxArray.map(id => boxes.find(b => b.id === id)?.name || id).join(', ');
    
    const confirmed = await customConfirm(
      '⚠️ Delete Boxes and Move Items',
      `This will:\n- Delete ${selectedBoxArray.length} box(es): ${boxNames}\n- Move ${totalItems} item(s) to "${locationName}"\n\nContinue?`,
      'Delete Boxes',
      false
    );
    if (!confirmed) return;
    
    showLoading(`Deleting Boxes`, `Moving items and deleting ${selectedBoxArray.length} boxes...`);
    
    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Move all items first
      for (const boxId of selectedBoxArray) {
        const contents = boxContents.filter(c => c.boxId === boxId);
        for (const content of contents) {
          const item = getItem(content.itemId, content.itemType);
          if (item) {
            item.currentBoxId = null;
            item.currentLocationId = locationId;
            
            // For inventory items, also clear the tracking Map
            if (content.itemType === 'inventory') {
              inventoryBoxTracking.delete(content.itemId);
              inventoryBoxTracking.delete(String(content.itemId));
              
              // Update via inventory API
              try {
                await RTS_API.unpackInventoryItem(content.itemId);
              } catch (error) {
                console.error('Error unpacking inventory item:', error);
              }
            } else {
              // Update in database for equipment/assets
              try {
                await RTS_API.unpackItem(content.itemId);
                await RTS_API.updateItem(content.itemId, { current_location_id: locationId });
              } catch (error) {
                console.error('Error updating item:', error);
              }
            }
          }
        }
        
        // Remove from box_contents
        await Promise.all(contents.map(c => RTS_API.removeFromBox(c.boxId, c.itemId)));
      }
      
      // Delete boxes
      for (const boxId of selectedBoxArray) {
        try {
          await RTS_API.deleteBox(boxId);
        } catch (error) {
          console.error('Error deleting box:', error);
        }
      }
      
      // Update local state
      boxContents = boxContents.filter(c => !selectedBoxArray.includes(c.boxId));
      boxes = boxes.filter(b => !selectedBoxArray.includes(b.id));
      
      saveData();
      clearBoxSelection();
      renderAll();
      hideLoading();
      showToast(`✅ Deleted ${selectedBoxArray.length} boxes and moved ${totalItems} items to ${locationName}`, 'success');
    } catch (error) {
      hideLoading();
      showToast(`❌ Error: ${error.message}`, 'error');
    }
  }
  
  async function bulkDeleteBoxesAndItems() {
    if (selectedBoxes.size === 0) {
      showToast('No boxes selected', 'warning');
      return;
    }
    
    const selectedBoxArray = Array.from(selectedBoxes);
    let totalItems = 0;
    
    selectedBoxArray.forEach(boxId => {
      const contents = boxContents.filter(c => c.boxId === boxId);
      totalItems += contents.length;
    });
    
    const boxNames = selectedBoxArray.map(id => boxes.find(b => b.id === id)?.name || id).join(', ');
    
    // First warning
    const confirmed1 = await customConfirm(
      '🚨 Permanent Delete Warning',
      `You are about to:\n- DELETE ${selectedBoxArray.length} box(es): ${boxNames}\n- DELETE ${totalItems} item(s) inside them\n\nThis action CANNOT be undone!\n\nAre you sure?`,
      'Continue',
      true
    );
    if (!confirmed1) return;
    
    // Wait for first modal to fully close before showing second
    await new Promise(resolve => setTimeout(resolve, 400));
    
    // Second warning (double confirmation)
    const confirmed2 = await customConfirm(
      '🚨 Final Confirmation',
      `This will PERMANENTLY DELETE:\n- ${selectedBoxArray.length} boxes\n- ${totalItems} items\n\nThis action is irreversible. Proceed with deletion?`,
      'Delete Everything',
      true
    );
    if (!confirmed2) return;
    
    showLoading(`Deleting Everything`, `Permanently removing ${selectedBoxArray.length} boxes and ${totalItems} items...`);
    
    try {
      let deletedItems = 0;
      let deletedBoxes = 0;
      
      // Delete all items in the boxes first (in batches for speed)
      const allItemsToDelete = [];
      for (const boxId of selectedBoxArray) {
        const contents = boxContents.filter(c => c.boxId === boxId);
        allItemsToDelete.push(...contents);
      }
      
      // Process items in batches of 10
      const batchSize = 10;
      for (let i = 0; i < allItemsToDelete.length; i += batchSize) {
        const batch = allItemsToDelete.slice(i, i + batchSize);
        await Promise.all(batch.map(async (content) => {
          try {
            // Call appropriate delete API based on item type
            if (content.itemType === 'inventory') {
              await RTS_API.deleteInventoryItem(content.itemId);
              // Clear tracking and remove from inventory array
              inventoryBoxTracking.delete(content.itemId);
              inventoryBoxTracking.delete(String(content.itemId));
              inventoryItems = inventoryItems.filter(inv => inv.id !== content.itemId);
            } else {
              await RTS_API.deleteItem(content.itemId);
              // Remove from equipment/assets arrays
              equipment = equipment.filter(e => e.id !== content.itemId);
              assets = assets.filter(a => a.id !== content.itemId);
            }
            deletedItems++;
          } catch (error) {
            console.error('Error deleting item:', error);
          }
        }));
        updateLoadingText(`Deleting items ${deletedItems}/${allItemsToDelete.length}...`);
      }
      
      // Delete boxes (in batches)
      for (let i = 0; i < selectedBoxArray.length; i += batchSize) {
        const batch = selectedBoxArray.slice(i, i + batchSize);
        await Promise.all(batch.map(async (boxId) => {
          try {
            await RTS_API.deleteBox(boxId);
            deletedBoxes++;
          } catch (error) {
            console.error('Error deleting box:', error);
          }
        }));
        updateLoadingText(`Deleting boxes ${deletedBoxes}/${selectedBoxArray.length}...`);
      }
      
      // Update local state
      boxContents = boxContents.filter(c => !selectedBoxArray.includes(c.boxId));
      boxes = boxes.filter(b => !selectedBoxArray.includes(b.id));
      
      saveData();
      clearBoxSelection();
      renderAll();
      hideLoading();
      showToast(`✅ Permanently deleted ${selectedBoxArray.length} boxes and ${totalItems} items`, 'success');
    } catch (error) {
      hideLoading();
      showToast(`❌ Error: ${error.message}`, 'error');
    }
  }

  // ========== PUBLIC API ==========
  window.BoxPacking = {
    init,
    selectBox,
    removeItem,
    resetDemoData,
    getDataSummary,
    prevPage() { if (itemsPage > 1) { itemsPage--; renderItems(); } },
    nextPage() { itemsPage++; renderItems(); }
  };
  
  // Expose box load-filter setter for onclick handlers in HTML
  window.setBoxLoadFilter = function(val) {
    boxLoadFilter = val;
    renderBoxes();
  };

  // Expose box selection functions globally for onclick handlers
  window.handleBoxClick = handleBoxClick;
  window.toggleBoxSelection = toggleBoxSelection;
  window.clearBoxSelection = clearBoxSelection;
  window.toggleBulkBoxDropdown = toggleBulkBoxDropdown;
  window.closeBulkBoxDropdown = closeBulkBoxDropdown;
  window.bulkMoveBoxesToLocation = bulkMoveBoxesToLocation;
  window.bulkUnpackBoxesToLocation = bulkUnpackBoxesToLocation;
  window.bulkDeleteBoxesAndMoveItems = bulkDeleteBoxesAndMoveItems;
  window.bulkDeleteBoxesAndItems = bulkDeleteBoxesAndItems;
  window.bulkPrintLabelSheets = bulkPrintLabelSheets;
  
  // Expose item selection functions globally
  window.toggleItemSelection = toggleItemSelection;
  window.updateItemCheckboxStates = updateItemCheckboxStates;

  // Auto-initialize on DOM ready
  console.log('📦 Setting up auto-initialization... readyState:', document.readyState);
  if (document.readyState === 'loading') {
    console.log('📦 DOM still loading, adding DOMContentLoaded listener');
    document.addEventListener('DOMContentLoaded', () => {
      console.log('📦 DOMContentLoaded fired, calling init()');
      init();
    });
  } else {
    console.log('📦 DOM already ready, calling init() immediately');
    init();
  }

  console.log('📦 box-packing-engine.js IIFE COMPLETE');

})();
