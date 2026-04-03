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
  let currentBoxId = null;
  let currentFilter = 'all';
  let boxModal, historyModal, unpackModal;
  let allAssetTypes = []; // Asset types from settings with colors

  // ========== INITIALIZATION ==========
  async function init() {
    console.log('🚀 BOX PACKING INIT STARTED', new Date().toISOString());
    console.log('🔍 RTS_API available?', !!window.RTS_API);
    console.log('🔍 RTS_API.getItems available?', !!window.RTS_API?.getItems);
    
    RTS.setActiveNav();
    await loadData();
    console.log('📊 After loadData - equipment:', equipment.length, 'assets:', assets.length, 'boxes:', boxes.length);
    initUI();
    renderAll();
  }

  async function loadData() {
    console.log('🔄 Loading data...');
    
    // Load boxes from API
    try {
      if (!window.RTS_API) {
        throw new Error('RTS_API not available');
      }
      const boxesResp = await window.RTS_API.getBoxes();
      boxes = boxesResp.boxes || [];
      console.log(`✅ Loaded ${boxes.length} boxes from API`);
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
      
      console.log(`📦 Loaded: ${equipment.length} items in equipment view + ${assets.length} items in assets view (total: ${mappedItems.length})`);
    } catch (e) {
      console.warn('Could not load items from API, using localStorage:', e.message);
      equipment = RTS.safeLoadJSON(LS_EQUIPMENT, null) || seedEquipment();
      assets = RTS.safeLoadJSON(LS_ASSETS, null) || seedAssets();
      console.log(`📦 Using ${equipment.length} equipment + ${assets.length} assets from localStorage/seed`);
    }

    // Box contents and history still from localStorage for now
    boxContents = RTS.safeLoadJSON(LS_BOX_CONTENTS, null) || [];
    boxHistory = RTS.safeLoadJSON(LS_BOX_HISTORY, null) || [];
    
    // Load asset types from settings for colored badges
    const settings = RTS.getSettings();
    const assetTypesFromSettings = settings.assetTypes || [{name:'Equipment',color:'#0ea5e9'},{name:'Asset',color:'#a855f7'}];
    // Handle both old string format and new object format
    allAssetTypes = assetTypesFromSettings.map(t => 
      typeof t === 'string' ? {name:t, color:'#0ea5e9'} : {name:t.name, color:t.color||'#0ea5e9'}
    );
    
    console.log(`✅ Data load complete: ${boxes.length} boxes, ${equipment.length} equipment, ${assets.length} assets`);
    
    // Seed box contents if empty (pack items into boxes for testing)
    if (boxContents.length === 0 && boxes.length > 0) {
      seedBoxContents();
    }
    
    saveData();
  }
  
  function seedBoxContents() {
    // Pack equipment and assets into boxes for testing
    // Strategy: Distribute items across boxes to show realistic packing
    
    const allItems = [
      ...equipment.map(e => ({ ...e, type: 'equipment' })),
      ...assets.map(a => ({ ...a, type: 'assets' }))
    ];
    
    // Pack 3-5 items per box (randomized)
    let itemIndex = 0;
    boxes.forEach((box, boxIndex) => {
      const itemsToPackInThisBox = 3 + Math.floor(Math.random() * 3); // 3-5 items
      
      for (let i = 0; i < itemsToPackInThisBox && itemIndex < allItems.length; i++) {
        const item = allItems[itemIndex];
        
        // Create box content entry
        boxContents.push({
          id: RTS.uid('content'),
          boxId: box.id,
          itemId: item.id,
          itemType: item.type,
          packedAt: new Date(Date.now() - Math.random() * 20 * 24 * 60 * 60 * 1000).toISOString() // Random within last 20 days
        });
        
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
  }

  function saveData() {
    RTS.safeSaveJSON(LS_BOXES, boxes);
    RTS.safeSaveJSON(LS_BOX_CONTENTS, boxContents);
    RTS.safeSaveJSON(LS_BOX_HISTORY, boxHistory);
    RTS.safeSaveJSON(LS_EQUIPMENT, equipment);
    RTS.safeSaveJSON(LS_ASSETS, assets);
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
      // Populate with asset types from settings
      const options = ['<option value="all">Filter: All Types</option>'];
      allAssetTypes.forEach(type => {
        options.push(`<option value="${esc(type.name.toLowerCase().replace(/\s+/g, '_'))}">${esc(type.name)}</option>`);
      });
      filterItemType.innerHTML = options.join('');
      filterItemType.addEventListener('change', e => {
        currentFilter = e.target.value;
        renderItems();
      });
    }

    setupDragAndDrop();
    setupResizablePanels();
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
      const contentsBadge = contents.length > 0 ? `<div class="box-contents-badge">${contents.length}</div>` : '';
      
      return `
        <div class="box-container${isActive}" 
             onclick="selectBox('${box.id}')"
             ondragover="event.preventDefault(); this.style.background='#e8f0fe'"
             ondragleave="this.style.background=''"
             ondrop="handleBoxDrop(event, '${box.id}')">
          ${contentsBadge}
          <div class="box-barcode">${esc(box.barcode)}</div>
          <div class="box-name">${esc(box.name)}</div>
          <div class="box-dims">${box.length || 0}×${box.width || 0}×${box.height || 0}cm | ${box.weightCapacity || 0}kg</div>
          <div class="box-location">📍 ${esc(box.location || 'No location')}</div>
        </div>
      `;
    }).join('');

    document.getElementById('boxesList').innerHTML = html || '<div style="text-align:center;padding:20px;color:#5f6368;font-size:.85rem">No boxes found</div>';
    document.getElementById('boxCount').textContent = filtered.length;
  }

  function renderItems() {
    console.log(`🔄 renderItems called - filter: ${currentFilter}, equipment: ${equipment.length}, assets: ${assets.length}`);
    
    const search = document.getElementById('searchItems').value.toLowerCase();
    const sortBy = document.getElementById('sortItems')?.value || 'name';
    let allItems = [];

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

    console.log(`📊 After filter, allItems count: ${allItems.length}`);

    // Show ALL items (not just packed ones) - users can drag them into boxes
    const filtered = allItems.filter(item =>
      (item.barcode || '').toLowerCase().includes(search) ||
      (item.name || '').toLowerCase().includes(search) ||
      (item.category || '').toLowerCase().includes(search)
    );

    console.log(`🔍 After search filter, items: ${filtered.length}`);

    // Sort items
    filtered.sort((a, b) => {
      if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
      if (sortBy === 'barcode') return (a.barcode || '').localeCompare(b.barcode || '');
      if (sortBy === 'category') return (a.category || '').localeCompare(b.category || '');
      return 0;
    });

    const html = filtered.map(item => {
      const boxName = item.currentBoxId ? getBoxName(item.currentBoxId) : 'Not packed';
      const categoryClass = (item.category || '').toLowerCase().replace(/\s+/g, '-');
      const isPacked = !!item.currentBoxId;
      const isPackedStyle = isPacked ? 'opacity:0.4' : '';
      const isPackedClass = isPacked ? 'in-box' : '';
      const draggable = !isPacked;
      const cursorStyle = isPacked ? 'cursor:not-allowed' : 'cursor:move';
      
      // Get asset type with color (matching assets table view)
      const itemTypeKey = item.itemType || item.type || 'equipment';
      const assetTypeObj = allAssetTypes.find(t => t.name.toLowerCase().replace(/\s+/g, '_') === itemTypeKey);
      const typeColor = assetTypeObj ? assetTypeObj.color : '#0ea5e9';
      const typeName = assetTypeObj ? assetTypeObj.name : itemTypeKey;
      
      // Get serial number
      const serialNum = item.serialNumber || 'No S/N';
      
      return `
        <div class="item-card ${isPackedClass}" 
             draggable="${draggable}"
             data-item-id="${item.id}"
             data-item-type="${item.type}"
             style="padding:8px!important;${isPackedStyle};${cursorStyle}">
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
      
      return `
        <div class="packed-item">
          <div class="packed-item-info">
            <div class="packed-item-barcode">${esc(item.barcode)}</div>
            <div class="packed-item-name">${esc(item.name)}</div>
            <div style="font-size:.75rem;color:#5f6368;margin-top:3px">
              ${esc(item.category || 'Uncategorized')} · ${content.itemType === 'equipment' ? 'Equipment' : 'Asset'}
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

    document.addEventListener('dragstart', e => {
      if (e.target.classList.contains('item-card') && !e.target.classList.contains('in-box')) {
        draggedItemId = e.target.dataset.itemId;
        draggedItemType = e.target.dataset.itemType;
        e.target.style.opacity = '0.5';
      }
    });

    document.addEventListener('dragend', e => {
      if (e.target.classList.contains('item-card')) {
        e.target.style.opacity = '1';
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
      
      if (currentBoxId && draggedItemId && draggedItemType) {
        packItem(currentBoxId, draggedItemId, draggedItemType);
        draggedItemId = null;
        draggedItemType = null;
      }
    });
    
    // Make function globally accessible for box card drops
    window.handleBoxDrop = function(e, boxId) {
      e.preventDefault();
      e.stopPropagation();
      e.target.closest('.box-container').style.background = '';
      
      if (draggedItemId && draggedItemType) {
        packItem(boxId, draggedItemId, draggedItemType);
        selectBox(boxId); // Auto-select the box to show contents
        draggedItemId = null;
        draggedItemType = null;
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

  function removeItem(contentId) {
    const content = boxContents.find(c => c.id === contentId);
    if (!content) return;

    const item = getItem(content.itemId, content.itemType);
    if (item) {
      item.currentBoxId = null;
      addHistory(content.boxId, 'item_removed', `Removed ${item.name} (${item.barcode})`);
    }

    boxContents = boxContents.filter(c => c.id !== contentId);
    saveData();
    renderAll();
  }

  // ========== BOX MANAGEMENT ==========
  function showBoxModal() {
    document.getElementById('boxBarcode').value = generateBarcode();
    document.getElementById('boxName').value = '';
    document.getElementById('boxLength').value = '';
    document.getElementById('boxWidth').value = '';
    document.getElementById('boxHeight').value = '';
    document.getElementById('boxWeightCapacity').value = '';
    
    // Populate location dropdown from settings
    const settings = RTS.getSettings();
    const locations = settings.locations || [];
    const locationSelect = document.getElementById('boxLocation');
    locationSelect.innerHTML = '<option value="">Select Location</option>' +
      locations.map(loc => `<option value="${esc(loc)}">${esc(loc)}</option>`).join('');
    
    boxModal.show();
  }

  function saveBox() {
    const name = document.getElementById('boxName').value.trim();
    if (!name) {
      showToast('Box name is required', 'warning');
      return;
    }

    const newBox = {
      id: RTS.uid('box'),
      barcode: document.getElementById('boxBarcode').value || generateBarcode(),
      name: name,
      length: parseFloat(document.getElementById('boxLength').value) || 0,
      width: parseFloat(document.getElementById('boxWidth').value) || 0,
      height: parseFloat(document.getElementById('boxHeight').value) || 0,
      weightCapacity: parseFloat(document.getElementById('boxWeightCapacity').value) || 0,
      location: document.getElementById('boxLocation').value || 'Unknown',
      status: 'available',
      createdAt: new Date().toISOString()
    };

    boxes.push(newBox);
    addHistory(newBox.id, 'created', `Box created at ${newBox.location}`);
    
    saveData();
    boxModal.hide();
    renderAll();
  }

  function generateBarcode() {
    const existing = boxes.map(b => b.barcode).filter(b => b && b.startsWith('BOX-'));
    const numbers = existing.map(b => parseInt(b.split('-')[1])).filter(n => !isNaN(n));
    const maxNum = numbers.length > 0 ? Math.max(...numbers) : 0;
    return `BOX-${String(maxNum + 1).padStart(3, '0')}`;
  }

  function selectBox(boxId) {
    currentBoxId = boxId;
    renderAll();
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
    
    // Populate location dropdown
    const settings = RTS.getSettings();
    const locations = settings.locations || [];
    const locationSelect = document.getElementById('unpackLocation');
    locationSelect.innerHTML = '<option value="">Select Location</option>' +
      locations.map(loc => `<option value="${esc(loc)}">${esc(loc)}</option>`).join('');
    
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
          
          // Update via API if available
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
          
          updateCount++;
          // Update loading text with progress
          const subtext = document.getElementById('loadingSubtext');
          if (subtext) {
            subtext.textContent = `${updateCount} of ${contents.length} items moved...`;
          }
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

  // ========== PUBLIC API ==========
  window.BoxPacking = {
    init,
    selectBox,
    removeItem,
    resetDemoData,
    getDataSummary
  };

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
