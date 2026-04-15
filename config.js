// Global configuration - single source of truth for shared lists.
// Include this before core.js on pages where you want to override defaults.
window.RTS_CONFIG = {
  // API Configuration
  api: {
    baseURL: '/api', // Relative URL - works with any hostname (Render, custom domain, localhost)
    timeout: 10000
  },
  
  // Data Storage Mode: 'api' or 'localStorage'
  dataMode: 'api', // Using PlanetScale PostgreSQL database
  
  settings: {
    venues: [
      { id:'redstar', name:'Red Star Raceway', location:'Delmas, Gauteng', notes:'Clockwise/anti-clockwise, windy' },
      { id:'killarney', name:'Killarney Kart Track', location:'Cape Town, Western Cape', notes:'Coastal, wind-sensitive' },
      { id:'idube', name:'iDube Kart Circuit', location:'KwaZulu-Natal', notes:'Elevation, technical' },
      { id:'formulak', name:'Formula K', location:'Benoni, Gauteng', notes:'High speed, chicanes' },
      { id:'zwartkops', name:'Zwartkops Kart Circuit', location:'Pretoria, Gauteng', notes:'Club layout, braking focus' },
      { id:'rheebok', name:'Rheebok', location:'George, Western Cape', notes:'Coastal, flowing' }
    ],
    eventTypes: [
      { code:'National Weekend', color:'#e32636' },
      { code:'Regional Weekend', color:'#ff7a1a' },
      { code:'Test Day', color:'#0ea5e9' },
      { code:'Promo / Media', color:'#a855f7' },
      { code:'International Trip', color:'#22c55e' },
      { code:'Travel Day', color:'#facc15' }
    ]
  }
};

// ============================================
// API Helper Functions
// ============================================

window.RTS_API = {
  /**
   * Generic fetch wrapper with error handling
   */
  async request(endpoint, options = {}) {
    const url = `${window.RTS_CONFIG.api.baseURL}${endpoint}`;
    
    // Get auth token from localStorage
    const token = localStorage.getItem('auth_token');
    
    const config = {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...options.headers
      },
      ...options
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();
      
      if (!response.ok) {
        // If unauthorized, redirect to login
        if (response.status === 401) {
          localStorage.removeItem('auth_token');
          localStorage.removeItem('user');
          window.location.replace('/login.html');
          throw new Error('Session expired. Please login again.');
        }
        
        throw new Error(data.error || `HTTP ${response.status}: ${response.statusText}`);
      }
      
      return data;
    } catch (error) {
      console.error(`API Error [${endpoint}]:`, error);
      throw error;
    }
  },

  // ============================================
  // BOXES API
  // ============================================
  
  async getBoxes(filters = {}) {
    const params = new URLSearchParams(filters);
    return await this.request(`/boxes?${params}`);
  },

  async getBox(id) {
    return await this.request(`/boxes/${id}`);
  },

  async createBox(boxData) {
    return await this.request('/boxes', {
      method: 'POST',
      body: JSON.stringify(boxData)
    });
  },

  async updateBox(id, boxData) {
    return await this.request(`/boxes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(boxData)
    });
  },

  async deleteBox(id) {
    return await this.request(`/boxes/${id}`, {
      method: 'DELETE'
    });
  },

  // ============================================
  // ITEMS API
  // ============================================
  
  async getItems(filters = {}) {
    const params = new URLSearchParams(filters);
    return await this.request(`/items?${params}`);
  },

  async getItem(id) {
    return await this.request(`/items/${id}`);
  },

  async createItem(itemData) {
    return await this.request('/items', {
      method: 'POST',
      body: JSON.stringify(itemData)
    });
  },

  async updateItem(id, itemData) {
    return await this.request(`/items/${id}`, {
      method: 'PUT',
      body: JSON.stringify(itemData)
    });
  },

  async deleteItem(id) {
    return await this.request(`/items/${id}`, {
      method: 'DELETE'
    });
  },

  // ============================================
  // BOX CONTENTS API
  // ============================================
  
  async getBoxContents(boxId) {
    // No boxId → fetch ALL box contents from bulk endpoint
    if (!boxId) return await this.request('/box-contents');
    return await this.request(`/box-contents/${boxId}`);
  },

  async packItem(boxId, itemId, positionInBox = null) {
    return await this.request('/box-contents/pack', {
      method: 'POST',
      body: JSON.stringify({ box_id: boxId, item_id: itemId, position_in_box: positionInBox })
    });
  },

  async unpackItem(boxId, itemId) {
    return await this.request('/box-contents/unpack', {
      method: 'POST',
      body: JSON.stringify({ box_id: boxId, item_id: itemId })
    });
  },

  async clearBox(boxId) {
    return await this.request(`/box-contents/${boxId}/clear`, {
      method: 'DELETE'
    });
  },

  async getAllBoxContents() {
    const response = await this.request('/box-contents');
    return response.boxContents || [];
  },

  // ============================================
  // ASSET TYPES API
  // ============================================
  
  async getAssetTypes() {
    return await this.request('/asset-types');
  },

  async createAssetType(assetTypeData) {
    return await this.request('/asset-types', {
      method: 'POST',
      body: JSON.stringify(assetTypeData)
    });
  },

  async updateAssetType(id, assetTypeData) {
    return await this.request(`/asset-types/${id}`, {
      method: 'PUT',
      body: JSON.stringify(assetTypeData)
    });
  },

  async deleteAssetType(id) {
    return await this.request(`/asset-types/${id}`, {
      method: 'DELETE'
    });
  },

  // ============================================
  // TRUCKS / VEHICLES API
  // ============================================

  async getTrucks(filters = {}) {
    const params = new URLSearchParams(filters);
    return await this.request(`/trucks?${params}`);
  },

  async getTruck(id) {
    return await this.request(`/trucks/${id}`);
  },

  async createTruck(data) {
    return await this.request('/trucks', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async updateTruck(id, data) {
    return await this.request(`/trucks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async deleteTruck(id) {
    return await this.request(`/trucks/${id}`, {
      method: 'DELETE'
    });
  },

  // ============================================
  // LOCATIONS API (via Collections)
  // ============================================
  
  async getLocations(filters = {}) {
    const params = new URLSearchParams(filters);
    const response = await this.request(`/collections/locations?${params}`);
    return response;
  },

  async getLocation(id) {
    return await this.request(`/collections/locations/${id}`);
  },

  async createLocation(locationData) {
    return await this.request('/collections/locations', {
      method: 'POST',
      body: JSON.stringify(locationData)
    });
  },

  async updateLocation(id, locationData) {
    return await this.request(`/collections/locations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(locationData)
    });
  },

  async deleteLocation(id) {
    return await this.request(`/collections/locations/${id}`, {
      method: 'DELETE'
    });
  },

  // ============================================
  // GENERIC COLLECTION API (for backward compatibility)
  // ============================================
  
  async getCollection(collection) {
    return await this.request(`/${collection}`);
  },

  // ============================================
  // COLLECTIONS API (tasks, notes, runbooks, drivers, expenses, purchase_orders, inventory, events)
  // ============================================
  
  async getCollectionItems(table, filters = {}) {
    const params = new URLSearchParams(filters);
    return await this.request(`/collections/${table}?${params}`);
  },

  async getCollectionItem(table, id) {
    return await this.request(`/collections/${table}/${id}`);
  },

  async createCollectionItem(table, data) {
    return await this.request(`/collections/${table}`, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  async updateCollectionItem(table, id, data) {
    return await this.request(`/collections/${table}/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },

  async deleteCollectionItem(table, id) {
    return await this.request(`/collections/${table}/${id}`, {
      method: 'DELETE'
    });
  },

  async bulkUpsertCollection(table, items) {
    return await this.request(`/collections/${table}/bulk`, {
      method: 'POST',
      body: JSON.stringify({ items })
    });
  }
};

// ============================================
// Data Adapter - Auto-switch between API and localStorage
// ============================================

window.RTS_DATA = {
  /**
   * Get all boxes
   */
  async getBoxes(filters = {}) {
    if (window.RTS_CONFIG.dataMode === 'api') {
      const result = await window.RTS_API.getBoxes(filters);
      // Transform API response to match localStorage format
      return result.boxes.map(box => ({
        id: box.id,
        barcode: box.barcode,
        name: box.name,
        length: parseFloat(box.dimensions_length_cm),
        width: parseFloat(box.dimensions_width_cm),
        height: parseFloat(box.dimensions_height_cm),
        maxWeight: parseFloat(box.max_weight_kg) || null,
        currentWeight: parseFloat(box.current_weight_kg) || 0,
        locationId: box.current_location_id,
        truckId: box.current_truck_id,
        zone: box.current_zone,
        rfidTag: box.rfid_tag,
        status: box.status,
        createdAt: box.created_at,
        updatedAt: box.updated_at
      }));
    } else {
      // localStorage mode
      return JSON.parse(localStorage.getItem('rts.boxes.v1') || '[]');
    }
  },

  /**
   * Save box (create or update)
   */
  async saveBox(box) {
    if (window.RTS_CONFIG.dataMode === 'api') {
      const apiBox = {
        barcode: box.barcode || box.id,
        name: box.name,
        length: box.length,
        width: box.width,
        height: box.height,
        max_weight: box.maxWeight,
        current_weight: box.currentWeight || 0,
        location_id: box.locationId,
        current_truck_id: box.truckId,
        current_zone: box.zone,
        rfid_tag: box.rfidTag,
        status: box.status || 'warehouse'
      };
      
      if (box.id && box.id !== 'new') {
        await window.RTS_API.updateBox(box.id, apiBox);
      } else {
        await window.RTS_API.createBox(apiBox);
      }
    } else {
      // localStorage mode
      const boxes = JSON.parse(localStorage.getItem('rts.boxes.v1') || '[]');
      const index = boxes.findIndex(b => b.id === box.id);
      if (index >= 0) {
        boxes[index] = box;
      } else {
        boxes.push(box);
      }
      localStorage.setItem('rts.boxes.v1', JSON.stringify(boxes));
    }
  },

  /**
   * Get all items (equipment + assets)
   */
  async getItems(type = null) {
    if (window.RTS_CONFIG.dataMode === 'api') {
      const filters = type ? { item_type: type } : {};
      const result = await window.RTS_API.getItems(filters);
      // Return items as-is from API (don't transform field names)
      return result.items;
    } else {
      // localStorage mode
      const equipment = JSON.parse(localStorage.getItem('rts.equipment.v1') || '[]');
      const assets = JSON.parse(localStorage.getItem('rts.assets.v1') || '[]');
      const allItems = [...equipment, ...assets];
      return type ? allItems.filter(item => item.type === type) : allItems;
    }
  },

  /**
   * Save item (create or update)
   */
  async saveItem(item, isNew = false) {
    if (window.RTS_CONFIG.dataMode === 'api') {
      const apiItem = {
        barcode: item.barcode,
        name: item.name,
        item_type: item.type || item.item_type,
        category: item.category,
        description: item.description,
        serial_number: item.serialNumber || item.serial_number,
        weight_kg: item.weight_kg != null ? item.weight_kg : (item.weight != null ? item.weight : null),
        value_usd: item.value_usd ?? item.value ?? null,
        status: item.status,
        current_location_id: item.locationId || item.current_location_id,
        current_box_id: item.boxId || item.current_box_id,
        last_maintenance_date: item.lastMaintenance || item.last_maintenance_date,
        next_maintenance_date: item.nextMaintenance || item.next_maintenance_date,
        custom_fields: item.custom_fields || undefined,
        parent_asset_id: 'parent_asset_id' in item ? item.parent_asset_id : undefined
      };
      
      if (item.id && !isNew) {
        return await window.RTS_API.updateItem(item.id, apiItem);
      } else {
        return await window.RTS_API.createItem(apiItem);
      }
    } else {
      // localStorage mode
      const equipment = JSON.parse(localStorage.getItem('rts.equipment.v1') || '[]');
      const assets = JSON.parse(localStorage.getItem('rts.assets.v1') || '[]');
      const itemType = item.type || item.item_type || 'asset';
      const targetArray = itemType === 'equipment' ? equipment : assets;
      const storageKey = itemType === 'equipment' ? 'rts.equipment.v1' : 'rts.assets.v1';
      
      // Ensure item has required fields
      const normalizedItem = {
        id: item.id || `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        barcode: item.barcode || item.id,
        name: item.name,
        type: itemType,
        category: item.category || '',
        description: item.description || '',
        serialNumber: item.serialNumber || item.serial_number || '',
        weight: parseFloat(item.weight || item.weight_kg) || 0,
        value: parseFloat(item.value || item.value_usd) || 0,
        status: item.status || 'available',
        boxId: item.boxId || item.current_box_id || null,
        locationId: item.locationId || item.current_location_id || null,
        lastMaintenance: item.lastMaintenance || item.last_maintenance_date || null,
        nextMaintenance: item.nextMaintenance || item.next_maintenance_date || null,
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      const index = targetArray.findIndex(i => i.id === normalizedItem.id);
      if (index >= 0) {
        targetArray[index] = normalizedItem;
      } else {
        targetArray.push(normalizedItem);
      }
      localStorage.setItem(storageKey, JSON.stringify(targetArray));
      return { success: true, item: normalizedItem };
    }
  },

  /**
   * Delete item
   */
  async deleteItem(itemId) {
    if (window.RTS_CONFIG.dataMode === 'api') {
      return await window.RTS_API.deleteItem(itemId);
    } else {
      // localStorage mode - check both arrays
      const equipment = JSON.parse(localStorage.getItem('rts.equipment.v1') || '[]');
      const assets = JSON.parse(localStorage.getItem('rts.assets.v1') || '[]');
      
      const eqIndex = equipment.findIndex(i => i.id === itemId);
      if (eqIndex >= 0) {
        equipment.splice(eqIndex, 1);
        localStorage.setItem('rts.equipment.v1', JSON.stringify(equipment));
        return { success: true };
      }
      
      const assetIndex = assets.findIndex(i => i.id === itemId);
      if (assetIndex >= 0) {
        assets.splice(assetIndex, 1);
        localStorage.setItem('rts.assets.v1', JSON.stringify(assets));
        return { success: true };
      }
      
      return { success: false, error: 'Item not found' };
    }
  },

  /**
   * Pack item into box
   */
  async packItem(boxId, itemId) {
    if (window.RTS_CONFIG.dataMode === 'api') {
      return await window.RTS_API.packItem(boxId, itemId);
    } else {
      // localStorage mode - update item's boxId
      const allItems = await this.getItems();
      const item = allItems.find(i => i.id === itemId);
      if (!item) return { success: false, error: 'Item not found' };
      
      item.boxId = boxId;
      await this.saveItem(item);
      return { success: true };
    }
  },

  /**
   * Unpack item from box
   */
  async unpackItem(boxId, itemId) {
    if (window.RTS_CONFIG.dataMode === 'api') {
      return await window.RTS_API.unpackItem(boxId, itemId);
    } else {
      // localStorage mode - remove item's boxId
      const allItems = await this.getItems();
      const item = allItems.find(i => i.id === itemId);
      if (!item) return { success: false, error: 'Item not found' };
      
      item.boxId = null;
      await this.saveItem(item);
      return { success: true };
    }
  },

  /**
   * Get box contents
   */
  async getBoxContents(boxId) {
    if (window.RTS_CONFIG.dataMode === 'api') {
      const result = await window.RTS_API.getBoxContents(boxId);
      return result.contents.map(item => ({
        id: item.item_id,
        barcode: item.item_barcode,
        name: item.name,
        type: item.item_type,
        category: item.category,
        weight: parseFloat(item.weight_kg) || null,
        packedAt: item.packed_at
      }));
    } else {
      // localStorage mode - get items where boxId matches
      const items = await this.getItems();
      return items.filter(item => item.boxId === boxId);
    }
  }
};

console.log('✅ RTS Config loaded - Data mode:', window.RTS_CONFIG.dataMode);

// ============================================
// Keep-alive ping - prevents Render free tier cold starts
// Pings /api/health every 14 minutes (Render sleeps after 15m inactivity)
// Only runs when the API is in use (dataMode = 'api') and not on localhost
// ============================================
(function startKeepAlive() {
  const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (window.RTS_CONFIG.dataMode !== 'api' || isLocal) return;

  const INTERVAL_MS = 14 * 60 * 1000; // 14 minutes

  function ping() {
    fetch('/api/health', { method: 'GET', cache: 'no-store' }).catch(() => {
      // Silence errors — this is a best-effort background ping
    });
  }

  // Initial ping after 14 minutes of first page load
  setInterval(ping, INTERVAL_MS);
})();
