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
  let allAssetTypes = []; // Asset types from settings with colors
  let allLocations = []; // Locations from database
  let selectedBoxes = new Set(); // Track selected box IDs for bulk operations
  let selectedItems = new Set(); // Track selected item IDs for multi-drag

  // ========== INITIALIZATION ==========
  async function init() {
    console.log('🚀 BOX PACKING INIT STARTED', new Date().toISOString());
    console.log('🔍 RTS_API available?', !!window.RTS_API);
    console.log('🔍 RTS_API.getItems available?', !!window.RTS_API?.getItems);
    
    RTS.setActiveNav();
    await loadData();
    console.log('📊 After loadData - equipment:', equipment.length, 'assets:', assets.length, 'boxes:', boxes.length);
    await loadDrivers(); // Load drivers from PlanetScale database on init
    initUI();
    renderAll();
  }

  async function loadData() {
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
        
        // Show all items regardless of item_type (supports custom types from settings)
        equipment = mappedItems.filter(item => item.itemType === 'equipment' || !['asset'].includes(item.itemType));
        assets = mappedItems.filter(item => item.itemType === 'asset' || !['equipment'].includes(item.itemType));
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
          inventoryQuantities.set(String(content.itemId), currentTotal + quantity);
          console.log(`  📦 Inventory item ${content.itemId}: +${quantity} units (total: ${currentTotal + quantity})`);
        }
      });
      
      // Store as global for use in rendering
      window.inventoryPackedQuantities = inventoryQuantities;
      
      console.log(`✅ Rebuilt inventory quantities tracking: ${inventoryQuantities.size / 2} inventory items with packed units`);
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
          inventoryQuantities.set(String(content.itemId), currentTotal + quantity);
        }
      });
      window.inventoryPackedQuantities = inventoryQuantities;
      console.log(`✅ Rebuilt inventory quantities from localStorage: ${inventoryQuantities.size / 2} items`);
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
    
    // Load locations from database API
    try {
      const locationsResponse = await RTS_API.getLocations({ is_active: true });
      if (locationsResponse && locationsResponse.items && locationsResponse.items.length > 0) {
        allLocations = locationsResponse.items;
        console.log(`✅ Loaded ${allLocations.length} locations from database`);
      } else {
        // Fallback to locations from settings
        const settings = RTS.getSettings();
        const settingsLocations = settings.locations || [];
        allLocations = settingsLocations.map((loc, idx) => ({
          id: `loc-${idx}`,
          name: typeof loc === 'string' ? loc : loc.name,
          is_active: true
        }));
        console.log(`⚠️ No locations in database, using ${allLocations.length} from settings`);
      }
    } catch (error) {
      console.error('Error loading locations:', error);
      // Fallback to settings on error
      const settings = RTS.getSettings();
      const settingsLocations = settings.locations || [];
      allLocations = settingsLocations.map((loc, idx) => ({
        id: `loc-${idx}`,
        name: typeof loc === 'string' ? loc : loc.name,
        is_active: true
      }));
      console.log(`⚠️ Error loading locations, using ${allLocations.length} from settings`);
    }
    
    console.log(`✅ Data load complete: ${boxes.length} boxes, ${equipment.length} equipment, ${assets.length} assets`);
    
    // Seed box contents if empty (pack items into boxes for testing)
    if (boxContents.length === 0 && boxes.length > 0) {
      await seedBoxContents();
    }
    
    saveData();
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

    document.getElementById('btnNewBox').addEventListener('click', () => showBoxModal());
    document.getElementById('btnSaveBox').addEventListener('click', saveBox);
    document.getElementById('btnPrintLabel').addEventListener('click', printLabel);
    document.getElementById('btnBoxHistory').addEventListener('click', showHistory);
    document.getElementById('btnConfirmUnpack').addEventListener('click', confirmUnpack);
    document.getElementById('searchBoxes').addEventListener('input', renderBoxes);
    document.getElementById('searchItems').addEventListener('input', renderItems);
    
    // Sort dropdowns
    const sortBoxes = document.getElementById('sortBoxes');
    const sortItems = document.getElementById('sortItems');
    if (sortBoxes) sortBoxes.addEventListener('change', renderBoxes);
    if (sortItems) sortItems.addEventListener('change', renderItems);

    // Filter dropdown
    const filterItemType = document.getElementById('filterItemType');
    if (filterItemType) {
      // Populate with asset types from settings + Inventory option
      const options = [
        '<option value="all">Filter: All Types</option>',
        '<option value="inventory" style="background:#e8f0fe;color:#1a73e8;font-weight:600">📦 Inventory Items</option>'
      ];
      allAssetTypes.forEach(type => {
        options.push(`<option value="${esc(type.name.toLowerCase().replace(/\s+/g, '_'))}" style="background:${type.color};color:#fff;font-weight:600">${esc(type.name)}</option>`);
      });
      filterItemType.innerHTML = options.join('');
      filterItemType.addEventListener('change', async e => {
        currentFilter = e.target.value;
        // If inventory filter selected, fetch inventory items
        if (currentFilter === 'inventory') {
          await loadInventoryItems();
        }
        renderItems();
      });
    }
    
    // Setup custom modal buttons
    setupCustomModals();

    setupDragAndDrop();
    setupResizablePanels();
  }
  
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
    
    let filtered = boxes.filter(b =>
      (b.barcode || '').toLowerCase().includes(search) ||
      (b.name || '').toLowerCase().includes(search) ||
      (b.location || '').toLowerCase().includes(search)
    );

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

    const html = filtered.map(box => {
      const contents = boxContents.filter(c => c.boxId === box.id);
      const isActive = currentBoxId === box.id ? ' active' : '';
      const isDriverBox = box.boxType === 'driver' || box.box_type === 'driver';
      const assignedDriverId = box.assignedDriverId || box.assigned_driver_id;
      
      // Get driver color if box is assigned to a driver
      const driver = assignedDriverId ? allDrivers.find(d => d.id === assignedDriverId) : null;
      const driverColor = driver?.color || '#ea4335'; // Default red if no color
      
      // Use driver color for styling
      const driverBoxClass = isDriverBox ? ` driver-box driver-box-${assignedDriverId || 'unassigned'}` : '';
      const contentsBadge = contents.length > 0 ? `<div class="box-contents-badge">${contents.length}</div>` : '';
      
      // Driver badge with assignment info
      let driverBadge = '';
      if (isDriverBox) {
        const driverName = assignedDriverId ? (box.assignedDriverName || driver?.name || 'Assigned') : 'Unassigned';
        const assignIcon = assignedDriverId ? '✓' : '○';
        
        // Inline styles using driver color
        const badgeStyle = assignedDriverId 
          ? `background:linear-gradient(135deg,${driverColor},${adjustBrightness(driverColor, -20)})!important` 
          : 'background:#9e9e9e!important';
        
        driverBadge = `
          <div class="driver-box-badge" onclick="event.stopPropagation(); showDriverAssignmentModal('${box.id}')" 
               title="Click to ${assignedDriverId ? 'change' : 'assign'} driver" 
               style="cursor:pointer;user-select:none;${badgeStyle}">
            🚗 ${assignIcon} ${esc(driverName)}
          </div>
        `;
      }
      
      return `
        <div class="box-container${isActive}${driverBoxClass}" 
             onclick="handleBoxClick(event, '${box.id}')"
             ondragover="event.preventDefault(); this.style.background='${isDriverBox ? hexToRgba(driverColor, 0.15) : '#e8f0fe'}'"
             ondragleave="this.style.background=''"
             ondrop="handleBoxDrop(event, '${box.id}')"
             style="${isDriverBox && assignedDriverId ? `border:2px solid ${driverColor};box-shadow:0 0 14px 3px ${hexToRgba(driverColor, 0.55)};` : ''}">  
          <input type="checkbox" class="box-checkbox" data-box-id="${box.id}" onclick="event.stopPropagation(); toggleBoxSelection('${box.id}')">
          ${contentsBadge}
          ${driverBadge}
          <div class="box-barcode">${esc(box.barcode)}</div>
          <div class="box-name">${esc(box.name)}</div>
          <div class="box-dims">${box.length || 0}×${box.width || 0}×${box.height || 0}cm | ${box.weightCapacity || 0}kg</div>
          <div class="box-location">📍 ${esc(box.location || 'No location')}</div>
        </div>
      `;
    }).join('');

    document.getElementById('boxesList').innerHTML = html || '<div style="text-align:center;padding:20px;color:#5f6368;font-size:.85rem">No boxes found</div>';
    document.getElementById('boxCount').textContent = filtered.length;
    
    // Update checkbox states and toolbar after rendering
    updateBoxCheckboxStates();
    updateBoxBulkToolbar();
  }

  function renderItems() {
    console.log(`🔄 renderItems called - filter: ${currentFilter}, equipment: ${equipment.length}, assets: ${assets.length}, inventory: ${inventoryItems.length}`);
    
    const search = document.getElementById('searchItems').value.toLowerCase();
    const sortBy = document.getElementById('sortItems')?.value || 'name';
    let allItems = [];

    // If inventory filter is selected, show only inventory items
    if (currentFilter === 'inventory') {
      allItems = inventoryItems.map(inv => {
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
          currentBoxId: null // Inventory items can be in multiple boxes
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
      return 0;
    });

    const html = filtered.map(item => {
      const boxName = item.currentBoxId ? getBoxName(item.currentBoxId) : 'Not packed';
      const categoryClass = (item.category || '').toLowerCase().replace(/\s+/g, '-');
      
      // For inventory items, check if ALL units are packed
      let isPacked = false;
      let isPackedStyle = '';
      let isPackedClass = '';
      let draggable = true;
      let cursorStyle = 'cursor:move';
      let quantityInfo = '';
      
      if (item.type === 'inventory') {
        // Inventory: only grey out if all units are packed
        const allPacked = (item.availableQuantity || 0) === 0;
        isPacked = allPacked;
        isPackedStyle = allPacked ? 'opacity:0.4' : '';
        isPackedClass = allPacked ? 'in-box' : '';
        draggable = !allPacked;
        cursorStyle = allPacked ? 'cursor:not-allowed' : 'cursor:move';
        
        // Show quantity info
        const totalQty = item.totalQuantity || 0;
        const packedQty = item.packedQuantity || 0;
        const availQty = item.availableQuantity || 0;
        quantityInfo = `
          <div style="font-size:.75rem;color:#5f6368;margin-top:3px;font-weight:600">
            📦 Qty: <span style="color:#34a853">${availQty} available</span> / 
            <span style="color:#ea4335">${packedQty} packed</span> / 
            <span style="color:#1a73e8">${totalQty} total</span>
          </div>
        `;
      } else {
        // Equipment/Assets: packed if currentBoxId exists
        isPacked = !!item.currentBoxId;
        isPackedStyle = isPacked ? 'opacity:0.4' : '';
        isPackedClass = isPacked ? 'in-box' : '';
        draggable = !isPacked;
        cursorStyle = isPacked ? 'cursor:not-allowed' : 'cursor:move';
      }
      
      const isSelected = selectedItems.has(item.id);
      const selectedClass = isSelected ? 'item-selected' : '';
      
      // Get asset type with color (matching assets table view) - case-insensitive
      const itemTypeKey = (item.itemType || item.type || 'equipment').toLowerCase();
      const assetTypeObj = allAssetTypes.find(t => {
        const normalizedName = t.name.toLowerCase().replace(/\s+/g, '_');
        return normalizedName === itemTypeKey;
      });
      const typeColor = assetTypeObj ? assetTypeObj.color : '#0ea5e9';
      const typeName = assetTypeObj ? assetTypeObj.name : (item.itemType || item.type || 'equipment');
      
      // Get serial number
      const serialNum = item.serialNumber || 'No S/N';
      
      return `
        <div class="item-card ${isPackedClass} ${selectedClass}" 
             draggable="${draggable}"
             data-item-id="${item.id}"
             data-item-type="${item.type}"
             style="padding:8px!important;padding-left:26px!important;${isPackedStyle};${cursorStyle}">
          <input type="checkbox" class="item-checkbox" data-item-id="${item.id}" onclick="event.stopPropagation(); toggleItemSelection('${item.id}')" ${isSelected ? 'checked' : ''}>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
            <div class="item-barcode" style="font-family:monospace;font-size:.7rem;font-weight:700;color:#1a73e8">${esc(item.barcode)}</div>
            <div class="item-category ${categoryClass}" style="font-size:.65rem;padding:2px 6px">${esc(item.category || 'Uncategorized')}</div>
          </div>
          <div class="item-name" style="font-size:.8rem;color:#202124;font-weight:600;margin-bottom:4px;line-height:1.3">${esc(item.name)}</div>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:3px">
            <span style="background:${typeColor};color:white;font-weight:500;padding:3px 8px;border-radius:4px;font-size:.65rem;white-space:nowrap">${esc(typeName)}</span>
            <div style="font-size:.65rem;color:#5f6368;display:flex;gap:4px">
              <span style="font-weight:600">S/N:</span>
              <span style="font-family:monospace">${esc(serialNum)}</span>
            </div>
          </div>
          ${quantityInfo}
          ${isPacked ? `<div style="font-size:.65rem;color:#ea4335;font-weight:600">📦 In ${esc(boxName)}</div>` : ''}
        </div>
      `;
    }).join('');

    document.getElementById('itemsList').innerHTML = html || '<div style="text-align:center;padding:20px;color:#5f6368;font-size:.85rem">No items found</div>';
    document.getElementById('itemCount').textContent = filtered.length;
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
              ${esc(item.category || 'Uncategorized')} · ${content.itemType === 'equipment' ? 'Equipment' : content.itemType === 'inventory' ? 'Inventory' : 'Asset'}
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

    const item = getItem(content.itemId, content.itemType);
    if (!item) return;
    
    const boxName = getBoxName(content.boxId);
    
    try {
      showLoading('Unpacking Item', `Removing ${item.name} from ${boxName}...`);
      
      // Call API to unpack from database
      if (content.itemType === 'inventory') {
        await RTS_API.unpackInventoryItem(content.itemId);
      } else {
        await RTS_API.unpackItem(content.itemId);
      }
      
      // Reload data from API to get fresh state
      await loadData();
      renderAll();
      
      hideLoading();
      showToast(`✅ Removed ${item.name} from ${boxName}`, 'success');
      
      addHistory(content.boxId, 'item_removed', `Removed ${item.name} (${item.barcode})`);
    } catch (error) {
      hideLoading();
      console.error('Error unpacking item:', error);
      showToast(`Error: ${error.message || 'Failed to unpack item'}`, 'error');
    }
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
    
    // Populate location dropdown from settings
    const settings = RTS.getSettings();
    const locations = settings.locations || [];
    const locationSelect = document.getElementById('boxLocation');
    locationSelect.innerHTML = '<option value="">Select Location</option>' +
      locations.map(loc => `<option value="${esc(loc)}">${esc(loc)}</option>`).join('');
    
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
        addHistory(newBox.id, 'created', `${boxType === 'driver' ? '🚗 Driver box' : 'Box'} created at ${locationName}`);
        
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
      const contentsResp = await RTS_API.getBoxContents();
      if (contentsResp && contentsResp.success && contentsResp.contents) {
        boxContents = contentsResp.contents.map(c => ({
          id: c.id,
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
  function showUnpackModal() {
    if (!currentBoxId) {
      showToast('No box selected', 'warning');
      return;
    }
    
    const box = boxes.find(b => b.id === currentBoxId);
    const contents = boxContents.filter(c => c.boxId === currentBoxId);
    
    if (contents.length === 0) {
      showToast('This box is already empty', 'info');
      return;
    }
    
    // Populate location dropdown – use allLocations (from DB) first, fallback to settings
    const locationSelect = document.getElementById('unpackLocation');
    const locOptions = allLocations && allLocations.length > 0
      ? allLocations
      : (RTS.getSettings().locations || []).map((l, i) => ({ id: `loc-${i}`, name: typeof l === 'string' ? l : l.name }));
    locationSelect.innerHTML = '<option value="">Select Location</option>' +
      locOptions.map(loc => `<option value="${esc(loc.name)}">${esc(loc.name)}</option>`).join('');
    
    // Show items that will be unpacked
    const itemsHtml = contents.map(content => {
      const item = getItem(content.itemId, content.itemType);
      if (!item) return '';
      return `
        <div style="padding:6px;border-bottom:1px solid #e0e0e0;display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-weight:600;color:#202124;font-size:.85rem">${esc(item.name)}</div>
            <div style="font-size:.75rem;color:#5f6368">${esc(item.barcode)} · ${esc(item.category || 'Uncategorized')}</div>
          </div>
          <div style="font-size:.75rem;color:#1a73e8;font-weight:600">${content.itemType === 'equipment' ? 'Equipment' : 'Asset'}</div>
        </div>
      `;
    }).join('');
    
    document.getElementById('unpackItemsList').innerHTML = `
      <div style="font-size:.85rem;font-weight:600;color:#202124;margin-bottom:8px">
        Items to unpack (${contents.length}):
      </div>
      ${itemsHtml}
    `;
    
    unpackModal.show();
  }
  
  async function confirmUnpack() {
    const locationName = document.getElementById('unpackLocation').value;
    
    if (!locationName) {
      showToast('Please select a location where the box is being unpacked', 'warning');
      return;
    }
    
    if (!currentBoxId) {
      showToast('No box selected', 'error');
      return;
    }
    
    const box = boxes.find(b => b.id === currentBoxId);
    const contents = boxContents.filter(c => c.boxId === currentBoxId);
    
    if (contents.length === 0) {
      showToast('This box is already empty', 'warning');
      return;
    }
    
    // Close the modal first
    unpackModal.hide();
    
    // Show loading with item count
    showLoading(
      `Emptying Box: ${box.name}`,
      `Moving ${contents.length} item${contents.length !== 1 ? 's' : ''} to ${locationName}...`
    );
    
    // Generate location ID (same format as in assets.html: lowercase with underscores)
    const locationId = locationName.toLowerCase().replace(/\s+/g, '_');
    
    try {
      // Small delay to show the animation
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Update each item to remove box and set location
      let updateCount = 0;
      for (const content of contents) {
        const item = getItem(content.itemId, content.itemType);
        if (item) {
          item.currentBoxId = null;
          item.currentLocationId = locationId;
          
          // For inventory items, also clear the tracking Map
          if (content.itemType === 'inventory') {
            inventoryBoxTracking.delete(content.itemId);
            inventoryBoxTracking.delete(String(content.itemId));
            
            // Unpack via inventory API
            if (window.RTS_API && window.RTS_API.unpackInventoryItem) {
              try {
                await window.RTS_API.unpackInventoryItem(item.id);
              } catch (e) {
                console.warn('Could not unpack inventory item via API:', e.message);
              }
            }
          } else {
            // Update via API for equipment/assets
            if (window.RTS_API && window.RTS_API.updateItem) {
              try {
                await window.RTS_API.updateItem(item.id, {
                  current_box_id: null,
                  current_location_id: locationId
                });
              } catch (e) {
                console.warn('Could not update item via API:', e.message);
              }
            }
          }
          updateCount++;
        }
        
        // Update loading text with progress
        const subtext = document.getElementById('loadingSubtext');
        if (subtext) {
          subtext.textContent = `${updateCount} of ${contents.length} items moved...`;
        }
      }
      
      // Clear box contents
      const itemNames = contents.map(c => {
        const item = getItem(c.itemId, c.itemType);
        return item ? item.name : 'Unknown';
      }).join(', ');
      
      boxContents = boxContents.filter(c => c.boxId !== currentBoxId);
      
      addHistory(currentBoxId, 'box_emptied', `Emptied ${contents.length} items to ${locationName}: ${itemNames}`);
      
      saveData();
      renderAll();
      
      // Hide loading and show success toast
      hideLoading();
      showToast(
        `Box emptied successfully! ${contents.length} item${contents.length !== 1 ? 's' : ''} moved to ${locationName}`,
        'success'
      );
    } catch (e) {
      console.error('Error unpacking box:', e);
      hideLoading();
      showToast('Error unpacking box: ' + e.message, 'error');
    }
  }
  
  // Make globally accessible
  window.showUnpackModal = showUnpackModal;
  
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
    if (type === 'equipment') {
      return equipment.find(e => e.id === id);
    } else if (type === 'assets') {
      return assets.find(a => a.id === id);
    } else if (type === 'inventory') {
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
          currentBoxId: packedBoxId || null
        };
      }
    }
    return null;
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
  
  async function packMultipleItems(boxId, items) {
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
        
        if (availableQty <= 0) {
          showToast(`No units available for ${item.name}`, 'warning');
          continue;
        }
        
        // Styled quantity prompt
        const quantityStr = await customPrompt(
          `📦 Pack "${item.name}"`,
          `Packing into: ${box.name}\n\nAvailable: ${availableQty} of ${totalQty} units (${packedQty} already packed).\n\nHow many units to pack?`,
          `1 – ${availableQty}`
        );
        
        if (!quantityStr || quantityStr.trim() === '') {
          continue; // User cancelled
        }
        
        const quantity = parseInt(quantityStr);
        if (isNaN(quantity) || quantity <= 0) {
          showToast('Invalid quantity', 'error');
          continue;
        }
        
        if (quantity > availableQty) {
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
          if (item.currentBoxId) {
            console.warn(`⚠️ Item ${id} "${item.name}" (type: ${type}) already packed in box ${item.currentBoxId}`);
            continue;
          }
          
          console.log(`✅ Packing item ${id} "${item.name}" into box ${boxId}`);
          
          // Update in database via items API for equipment/assets
          try {
            await RTS_API.packItem(boxId, id);
          } catch (error) {
            console.error('Error packing item via API:', error);
          }
          
          packedCount++;
        }
        
        // Clear selection after packing
        selectedItems.clear();
        
        hideLoading();
        
        if (packedCount > 0) {
          showToast(`✅ Packed ${packedCount} item(s) into ${box.name}`, 'success');
          
          // Reload data to get updated state
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
    
    // Ensure we have locations
    if (allLocations.length === 0) {
      const settings = RTS.getSettings();
      const settingsLocations = settings.locations || [];
      if (settingsLocations.length > 0) {
        allLocations = settingsLocations.map((loc, idx) => ({
          id: `loc-${idx}`,
          name: typeof loc === 'string' ? loc : loc.name,
          is_active: true
        }));
      } else {
        showToast('No locations available. Please add locations in settings.', 'error');
        return;
      }
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
    
    // Ensure we have locations (check database or fallback to settings)
    if (allLocations.length === 0) {
      const settings = RTS.getSettings();
      const settingsLocations = settings.locations || [];
      if (settingsLocations.length > 0) {
        allLocations = settingsLocations.map((loc, idx) => ({
          id: `loc-${idx}`,
          name: typeof loc === 'string' ? loc : loc.name,
          is_active: true
        }));
      } else {
        showToast('No locations available. Please add locations in settings.', 'error');
        return;
      }
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
    
    // Ensure we have locations (check database or fallback to settings)
    if (allLocations.length === 0) {
      const settings = RTS.getSettings();
      const settingsLocations = settings.locations || [];
      if (settingsLocations.length > 0) {
        allLocations = settingsLocations.map((loc, idx) => ({
          id: `loc-${idx}`,
          name: typeof loc === 'string' ? loc : loc.name,
          is_active: true
        }));
      } else {
        showToast('No locations available. Please add locations in settings.', 'error');
        return;
      }
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
    getDataSummary
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
