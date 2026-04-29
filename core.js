/* Race Team OS (Front-end prototype)
 * Shared utilities: safe storage, nav activation, tri-pane resizers.
 * Works in file:// contexts.
 */

// Theme initialization - runs immediately
(function() {
  const THEME_KEY = 'rts.theme';
  const savedTheme = localStorage.getItem(THEME_KEY) || 'dark';
  if (savedTheme === 'light') {
    document.documentElement.classList.add('light-mode');
    if (document.body) {
      document.body.classList.add('light-mode');
    } else {
      document.addEventListener('DOMContentLoaded', function() {
        document.body.classList.add('light-mode');
      });
    }
  }
})();

(function(){
  function isObj(v){ return v && typeof v === 'object' && !Array.isArray(v); }

  function deepMerge(target, source){
    const out = Array.isArray(target) ? target.slice() : (isObj(target) ? {...target} : {});
    if (!isObj(source) && !Array.isArray(source)) return out;
    const keys = Array.isArray(source) ? Object.keys(source) : Object.keys(source);
    for (const k of keys){
      const sv = source[k];
      const tv = out[k];
      if (isObj(sv) && isObj(tv)) out[k] = deepMerge(tv, sv);
      else out[k] = sv;
    }
    return out;
  }

  // Safe wrapper around pickDriveFiles to avoid uncaught rejects and provide user feedback
  async function safePickDriveFiles(options){
    try {
      const res = await pickDriveFiles(options || {});
      return Array.isArray(res) ? res : [];
    } catch (err){
      try { console.error('pickDriveFiles error', err); } catch(_e){}
      try { alert('Drive picker failed: ' + (err && err.message ? err.message : 'unknown error')); } catch(_e){}
      return [];
    }
  }

  function safeParseJSON(str, fallback){
    try {
      const v = JSON.parse(str);
      return (v === null || v === undefined) ? fallback : v;
    } catch(_e){
      return fallback;
    }
  }

  function safeGetItem(key){
    try { return window.localStorage.getItem(key); } catch(_e){ return null; }
  }

  function safeSetItem(key, value){
    try { window.localStorage.setItem(key, value); } catch(_e){ /* ignore */ }
  }

  function safeRemoveItem(key){
    try { window.localStorage.removeItem(key); } catch(_e){ /* ignore */ }
  }

  function safeLoadJSON(key, fallback){
    const raw = safeGetItem(key);
    if (!raw) return fallback;
    return safeParseJSON(raw, fallback);
  }

  function safeSaveJSON(key, obj){
    safeSetItem(key, JSON.stringify(obj));
  }

  function setActiveNav(){
    const page = (location.pathname.split('/').pop() || '').toLowerCase();
    const links = document.querySelectorAll('.sidebar .nav-link, .rts-topnav .nav-link');
    links.forEach(a => {
      a.classList.remove('active');
      const href = (a.getAttribute('href')||'').toLowerCase();
      if (href === page) a.classList.add('active');
    });
  }

  function initTriPaneResizers(shellEl, storeKey){
    if (!shellEl) return;
    const left = shellEl.querySelector('.mlo-pane-left');
    const right = shellEl.querySelector('.mlo-pane-right');
    const resizers = shellEl.querySelectorAll('.mlo-resizer');
    const minLeft = 180;
    const minRight = 280;

    // restore widths
    const saved = safeLoadJSON(storeKey, null) || {};
    if (saved && left && typeof saved.left === 'number') left.style.width = Math.max(minLeft, saved.left) + 'px';
    if (saved && right && typeof saved.right === 'number') right.style.width = saved.right + 'px';
    // inspector collapsed support
    function setRightCollapsed(flag){
      if (!right) return;
      right.style.display = flag ? 'none' : '';
      // hide adjacent resizer if any
      const rzRight = shellEl.querySelector('.mlo-resizer[data-resize="right"]');
      if (rzRight) rzRight.style.display = flag ? 'none' : '';
      persist();
    }
    if (saved && saved.collapsedRight) setRightCollapsed(true);

    function persist(){
      if (!left || !right) return;
      safeSaveJSON(storeKey, {
        left: Math.round(left.getBoundingClientRect().width),
        right: Math.round(right.getBoundingClientRect().width),
        collapsedRight: (right.style.display === 'none')
      });
    }

    resizers.forEach(rz => {
      const side = rz.getAttribute('data-resize');
      let startX = 0;
      let startLeft = 0;
      let startRight = 0;

      function onMove(e){
        const dx = e.clientX - startX;
        if (side === 'left' && left){
          const w = Math.max(minLeft, startLeft + dx);
          left.style.width = w + 'px';
        }
        if (side === 'right' && right){
          const w = Math.max(minRight, startRight - dx);
          right.style.width = w + 'px';
        }
      }

      function onUp(){
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        persist();
      }

      rz.addEventListener('mousedown', (e) => {
        startX = e.clientX;
        if (left) startLeft = left.getBoundingClientRect().width;
        if (right) startRight = right.getBoundingClientRect().width;
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    });

    // Add a compact toggle button to the inspector header for collapse/expand
    try {
      const rHeader = right && right.querySelector('.mlo-pane-header');
      if (rHeader){
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-sm btn-outline-light mlo-btn mlo-inspector-toggle';
        btn.textContent = (saved && saved.collapsedRight) ? 'Show Editor' : 'Hide Editor';
        btn.style.marginLeft = 'auto';
        // place at end of header
        rHeader.appendChild(btn);
        btn.addEventListener('click', ()=>{
          const hidden = right && right.style.display === 'none';
          setRightCollapsed(!hidden);
          btn.textContent = hidden ? 'Hide Editor' : 'Show Editor';
        });
      }
    } catch(_e){}

    // Keyboard shortcut: ] to toggle inspector (when not typing)
    try {
      const onKey = (ev)=>{
        try {
          const ae = document.activeElement;
          const tag = (ae && ae.tagName || '').toLowerCase();
          if (tag === 'input' || tag === 'textarea' || (ae && ae.isContentEditable)) return;
          if (ev.metaKey || ev.ctrlKey || ev.altKey || ev.shiftKey) return;
          const k = String(ev.key||'');
          if (k === ']'){
            ev.preventDefault();
            const hidden = right && right.style.display === 'none';
            setRightCollapsed(!hidden);
            try {
              const btn = right && right.querySelector('.mlo-inspector-toggle');
              if (btn) btn.textContent = hidden ? 'Hide Editor' : 'Show Editor';
            } catch(_e){}
          }
        } catch(_e){}
      };
      document.addEventListener('keydown', onKey);
    } catch(_e){}
  }

  function moneyZAR(n){
    const v = (typeof n === 'number') ? n : parseFloat(n || 0);
    return 'R' + (isNaN(v) ? '0.00' : v.toFixed(2));
  }

  function uid(prefix){
    const p = prefix || 'id';
    return p + '_' + Math.random().toString(36).slice(2,9) + Math.random().toString(36).slice(2,6);
  }

  const SETTINGS_KEY = 'rts.settings.v1';
  function externalSettings(){
    try {
      return (typeof window !== 'undefined' && window.RTS_CONFIG && window.RTS_CONFIG.settings) ? window.RTS_CONFIG.settings : {};
    } catch(_e){
      return {};
    }
  }

  function defaultSettings(){
    const ext = externalSettings();
    const base = {
      drivers: [
        { id: uid('drv'), name:'Driver #42', class:'OK-N', raceNumber:'42', email:'', phone:'', guardianName:'', guardianPhone:'', active:true, tags:['A'] },
        { id: uid('drv'), name:'Driver #77', class:'OK-J', raceNumber:'77', email:'', phone:'', guardianName:'', guardianPhone:'', active:true, tags:['A'] },
        { id: uid('drv'), name:'Driver #11', class:'OK-N', raceNumber:'11', email:'', phone:'', guardianName:'', guardianPhone:'', active:true, tags:['B'] }
      ],
      staff: [
        { id: uid('stf'), name:'Team Manager', role:'Team Manager', position:'Operations', email:'', phone:'', active:true },
        { id: uid('stf'), name:'Race Engineer', role:'Race Engineer', position:'Engineering', email:'', phone:'', active:true },
        { id: uid('stf'), name:'Mechanic #1', role:'Mechanic', position:'Technical', email:'', phone:'', active:true },
        { id: uid('stf'), name:'Mechanic #2', role:'Mechanic', position:'Technical', email:'', phone:'', active:true },
        { id: uid('stf'), name:'Inventory Controller', role:'Parts & Inventory', position:'Logistics', email:'', phone:'', active:true }
      ],
      roles: ['Team Principal','Team Manager','Race Engineer','Mechanic','Technician','Inventory Controller','Finance','Media/Comms'],
      suppliers: [
        { id: uid('sup'), name:'Supplier – Tyres', email:'', phone:'', leadTimeDays:2, vatNumber:'', accountNumber:'', notes:'' },
        { id: uid('sup'), name:'Supplier – Fuel', email:'', phone:'', leadTimeDays:1, vatNumber:'', accountNumber:'', notes:'' },
        { id: uid('sup'), name:'Supplier – Engine Service', email:'', phone:'', leadTimeDays:7, vatNumber:'', accountNumber:'', notes:'' }
      ],
      locations: [],
      assetTypes: [
        { name: 'Equipment', color: '#0ea5e9' },
        { name: 'Asset', color: '#a855f7' },
        { name: 'Tools', color: '#22c55e' },
        { name: 'Consumables', color: '#f59e0b' },
        { name: 'Parts', color: '#ef4444' }
      ],
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
      ],
      calendars: { google: { enabled:false, calendarId:'', lastSync:'', notes:'' } },
      teamName: '',
      teamLogoUrl: '',
      brandColor: '#e32636'
    };
    return deepMerge(base, ext);
  }

  function getSettings(){
    const raw = safeLoadJSON(SETTINGS_KEY, null);
    const merged = deepMerge(defaultSettings(), (raw && isObj(raw)) ? raw : {});
    // ensure persisted (also upgrades older versions)
    safeSaveJSON(SETTINGS_KEY, merged);
    return merged;
  }

  function saveSettings(patch){
    const cur = getSettings();
    const next = deepMerge(cur, patch || {});
    safeSaveJSON(SETTINGS_KEY, next);
    return next;
  }

  // Fetch settings from the server and merge into localStorage so all pages see the latest branding.
  // Call this once on page load (fire-and-forget). Returns the merged settings object.
  async function syncSettingsFromDB() {
    try {
      const token = localStorage.getItem('auth_token') || '';
      if (!token) return getSettings();
      const resp = await fetch('/api/settings', { headers: { Authorization: `Bearer ${token}` } });
      if (!resp.ok) return getSettings();
      const data = await resp.json();
      if (data.ok && data.settings && typeof data.settings === 'object') {
        saveSettings(data.settings);
      }
    } catch(_e) {
      // Network failure — use cached localStorage value
    }
    return getSettings();
  }

  // ----------------------------
  // Deep linking helpers
  // ----------------------------
  function getQueryParam(name){
    try {
      const u = new URL(window.location.href);
      return u.searchParams.get(name);
    } catch(_e){
      return null;
    }
  }

  // ----------------------------
  // API facade: talk to PITWALL server when available, fallback to localStorage
  // ----------------------------
  // Legacy telemetry apiFetch uses empty string base - always use relative /api paths
  const API_BASE = '';

  async function apiFetch(path, opts){
    opts = opts || {};
    // Always use relative paths - works on any hostname (production, staging, local)
    const url = path.indexOf('/') === 0 ? path : '/' + path;
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error('API error: ' + res.status + ' ' + res.statusText);
    return res.json();
  }

  // High-level sync helpers. These try the API first and fall back to localStorage on failure.
  async function apiGetCollection(collection){
    try {
      if (!API_BASE) throw new Error('No API');
      const r = await apiFetch(`/api/${collection}`);
      if (r && r.ok) return r.items || r[collection] || [];
      throw new Error('Bad payload');
    } catch (err){
      // fallback: read localStorage
      try { return safeLoadJSON('rts.' + collection + '.v4', []); } catch(_e){ return []; }
    }
  }

  async function apiSyncCollection(collection, items){
    try {
      if (!API_BASE) throw new Error('No API');
      const r = await apiFetch(`/api/${collection}/sync`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ items }) });
      return r;
    } catch (err){
      // fallback: persist locally
      safeSaveJSON('rts.' + collection + '.v4', items || []);
      return { ok:false, error: String(err) };
    }
  }

  // Create one item with a sequential unique id; fallback assigns local sequence
  async function apiCreate(collection, payload){
    try {
      if (!API_BASE) throw new Error('No API');
      const r = await apiFetch(`/api/${collection}/create`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(payload||{}) });
      if (r && r.ok && r.item) return r.item;
      throw new Error('Bad payload');
    } catch (err){
      // offline/local fallback: use local sequence
      const seqKey = 'rts.sequences.v1';
      const seq = safeLoadJSON(seqKey, {});
      const last = Number(seq[collection]||0);
      const next = last + 1;
      seq[collection] = next;
      safeSaveJSON(seqKey, seq);
      let id = String(next);
      if (collection === 'assets') id = 'AS-' + String(next).padStart(4,'0');
      const item = { ...(payload||{}), id };
      // also persist locally in collection store for visibility
      const key = 'rts.' + collection + '.v4';
      const cur = safeLoadJSON(key, []);
      cur.unshift(item);
      safeSaveJSON(key, cur);
      return item;
    }
  }
  
  // NEW: Collections API helpers (tasks, notes, runbooks, drivers, expenses, etc.)
  async function apiGetCollectionItems(table, filters = {}) {
    try {
      if (!window.RTS_API) throw new Error('RTS_API not available');
      return await window.RTS_API.getCollectionItems(table, filters);
    } catch (err) {
      console.warn(`apiGetCollectionItems(${table}) failed:`, err.message);
      const localKey = 'rts.' + table + '.v4';
      return { success: true, items: safeLoadJSON(localKey, []), count: 0 };
    }
  }

  async function apiCreateCollectionItem(table, data) {
    try {
      if (!window.RTS_API) throw new Error('RTS_API not available');
      return await window.RTS_API.createCollectionItem(table, data);
    } catch (err) {
      console.warn(`apiCreateCollectionItem(${table}) failed:`, err.message);
      const localKey = 'rts.' + table + '.v4';
      const items = safeLoadJSON(localKey, []);
      const item = { id: generateId(), ...data };
      items.push(item);
      safeSaveJSON(localKey, items);
      return { success: true, item };
    }
  }

  async function apiUpdateCollectionItem(table, id, data) {
    try {
      if (!window.RTS_API) throw new Error('RTS_API not available');
      return await window.RTS_API.updateCollectionItem(table, id, data);
    } catch (err) {
      console.warn(`apiUpdateCollectionItem(${table}, ${id}) failed:`, err.message);
      const localKey = 'rts.' + table + '.v4';
      const items = safeLoadJSON(localKey, []);
      const index = items.findIndex(item => item.id === id);
      if (index >= 0) {
        items[index] = { ...items[index], ...data };
        safeSaveJSON(localKey, items);
        return { success: true, item: items[index] };
      }
      return { success: false, error: 'Not found' };
    }
  }

  async function apiDeleteCollectionItem(table, id) {
    try {
      if (!window.RTS_API) throw new Error('RTS_API not available');
      return await window.RTS_API.deleteCollectionItem(table, id);
    } catch (err) {
      console.warn(`apiDeleteCollectionItem(${table}, ${id}) failed:`, err.message);
      const localKey = 'rts.' + table + '.v4';
      const items = safeLoadJSON(localKey, []);
      const filtered = items.filter(item => item.id !== id);
      safeSaveJSON(localKey, filtered);
      return { success: true };
    }
  }

  async function apiBulkUpsertCollection(table, items) {
    try {
      if (!window.RTS_API) throw new Error('RTS_API not available');
      return await window.RTS_API.bulkUpsertCollection(table, items);
    } catch (err) {
      console.warn(`apiBulkUpsertCollection(${table}) failed:`, err.message);
      const localKey = 'rts.' + table + '.v4';
      safeSaveJSON(localKey, items);
      return { success: true, count: items.length };
    }
  }

  async function apiLogHistory(kind, id, entry){
    try {
      if (!API_BASE) throw new Error('No API');
      const r = await apiFetch(`/api/history`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ kind, id, ...entry }) });
      return r;
    } catch(err){
      // local fallback: append into local collection item
      const key = 'rts.' + kind + '.v4';
      const cur = safeLoadJSON(key, []);
      const idx = cur.findIndex(x=> String(x.id)===String(id));
      if (idx >= 0){
        const obj = cur[idx];
        obj.history = Array.isArray(obj.history) ? obj.history : [];
        obj.history.push({ tsMs: Date.now(), by: entry.by||'admin', action: entry.action||'Updated', note: entry.note||'', eventId: entry.eventId||'' });
        safeSaveJSON(key, cur);
      }
      return { ok:false, error:String(err) };
    }
  }

  // Telemetry API helpers (prototype)
  async function apiUploadTelemetry(meta, points){
    try {
      if (!API_BASE) throw new Error('No API');
      const r = await apiFetch(`/api/telemetry/upload`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ ...meta, points }) });
      return r;
    } catch (err){
      // offline fallback: queue upload
      const q = safeLoadJSON('rts.telemetry.queue.v1', []);
      q.push({ id: uid('teleq'), meta, points });
      safeSaveJSON('rts.telemetry.queue.v1', q);
      // Also store a local upload meta for UI visibility
      const uploads = safeLoadJSON('rts.telemetry.uploads.v1', []);
      const up = { id: meta.uploadId || uid('tele'), driverId: meta.driverId, sessionId: meta.sessionId, sessionName: meta.sessionName || '', uploadedTs: Date.now(), tags: meta.tags||[], pointsCount: Array.isArray(points)?points.length:0 };
      uploads.push(up);
      safeSaveJSON('rts.telemetry.uploads.v1', uploads);
      return { ok:false, queued:true, error: String(err) };
    }
  }

  async function apiGetTelemetryUploads(driverId){
    try {
      if (!API_BASE) throw new Error('No API');
      const url = driverId ? `/api/telemetry/uploads?driverId=${encodeURIComponent(driverId)}` : '/api/telemetry/uploads';
      const r = await apiFetch(url);
      return (r && r.ok) ? (r.uploads||[]) : [];
    } catch (err){
      const all = safeLoadJSON('rts.telemetry.uploads.v1', []);
      if (driverId) return all.filter(u=>u.driverId===driverId);
      return all;
    }
  }

  async function apiGetTelemetryPoints(query){
    try {
      if (!API_BASE) throw new Error('No API');
      const params = new URLSearchParams({ driverId: query.driverId||'', sessionId: query.sessionId||'', limit: String(query.limit||'') });
      const r = await apiFetch(`/api/telemetry/points?${params.toString()}`);
      return (r && r.ok) ? (r.points||[]) : [];
    } catch (err){
      // fallback to local points cache (if any)
      const pts = safeLoadJSON('rts.telemetry.points.v1', []);
      let out = pts;
      if (query.driverId) out = out.filter(p=>p.driverId===query.driverId);
      if (query.sessionId) out = out.filter(p=>p.sessionId===query.sessionId);
      if (query.limit && out.length > query.limit) out = out.slice(0, query.limit);
      return out;
    }
  }


  function setQueryParam(name, value, mode){
    // mode: 'replace' (default) or 'push'
    try {
      const u = new URL(window.location.href);
      if (value === null || value === undefined || String(value).trim() === '') u.searchParams.delete(name);
      else u.searchParams.set(name, String(value));

      const fn = (mode === 'push') ? 'pushState' : 'replaceState';
      try {
        window.history[fn]({}, '', u.toString());
      } catch(_e){
        // Some embedded previewers block history mutations; ignore.
      }
      return u.toString();
    } catch(_e){
      return window.location.href;
    }
  }

  // ----------------------------
  // Google Drive Picker (front-end prototype)
  // ----------------------------
  function defaultDrivePickerSettings(){
    return {
      enabled: false,
      apiKey: '',
      clientId: '',
      appId: '',
      folderId: '',
      scopes: 'https://www.googleapis.com/auth/drive.readonly'
    };
  }

  // Extend default settings shape to include Drive picker config
  const _origDefaultSettings = defaultSettings;
  defaultSettings = function(){
    const base = _origDefaultSettings();
    if (!base.drive) base.drive = {};
    if (!base.drive.picker) base.drive.picker = defaultDrivePickerSettings();
    // Backwards compatibility: if calendars existed previously, keep them.
    return base;
  };

  function loadScriptOnce(src){
    return new Promise((resolve, reject) => {
      try {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) return resolve();
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.defer = true;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error('Failed to load script: ' + src));
        document.head.appendChild(s);
      } catch (e){
        reject(e);
      }
    });
  }

  async function ensurePickerLib(){
    // Loads Google API + Picker + Identity Services
    await loadScriptOnce('https://apis.google.com/js/api.js');
    await loadScriptOnce('https://accounts.google.com/gsi/client');

    // Wait for gapi.picker
    await new Promise((resolve, reject) => {
      try {
        if (!window.gapi) return reject(new Error('gapi not available'));
        window.gapi.load('picker', { callback: resolve });
      } catch (e){
        reject(e);
      }
    });
  }

  let _driveToken = null;
  let _driveTokenExp = 0;
  let _tokenClient = null;

  function getDriveCfg(){
    const s = getSettings();
    const cfg = (s.drive && s.drive.picker) ? s.drive.picker : defaultDrivePickerSettings();
    return deepMerge(defaultDrivePickerSettings(), cfg);
  }

  function resetDriveToken(){
    _driveToken = null;
    _driveTokenExp = 0;
  }

  async function ensureDriveToken(opts){
    const cfg = getDriveCfg();
    if (!cfg.enabled) throw new Error('Google Drive Picker is disabled in Settings.');
    if (!cfg.clientId) throw new Error('Missing Google OAuth Client ID (Settings → Google Calendar).');

    const now = Date.now();
    if (_driveToken && (_driveTokenExp - now) > 60000) return _driveToken;

    if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
      throw new Error('Google Identity Services not available.');
    }

    if (!_tokenClient) {
      _tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: cfg.clientId,
        scope: cfg.scopes,
        callback: () => {}
      });
    }

    const forcePrompt = !!(opts && opts.forcePrompt);
    return await new Promise((resolve, reject) => {
      try {
        _tokenClient.callback = (resp) => {
          if (resp && resp.access_token) {
            _driveToken = resp.access_token;
            // GIS doesn't always give expires_in, but often does.
            const exp = resp.expires_in ? (Date.now() + (resp.expires_in * 1000)) : (Date.now() + 50 * 60 * 1000);
            _driveTokenExp = exp;
            resolve(_driveToken);
          } else {
            reject(new Error('No access token returned.'));
          }
        };
        _tokenClient.requestAccessToken({ prompt: forcePrompt ? 'consent' : '' });
      } catch (e){
        reject(e);
      }
    });
  }

  async function pickDriveFiles(options){
    const cfg = getDriveCfg();
    if (!cfg.enabled) {
      alert('Google Drive Picker is disabled. Go to Settings → Google Calendar and enable/configure Drive Picker.');
      return [];
    }
    if (!cfg.apiKey || !cfg.clientId) {
      alert('Drive Picker requires an API Key and OAuth Client ID. Configure in Settings → Google Calendar.');
      return [];
    }

    await ensurePickerLib();
    const token = await ensureDriveToken(options);

    const includeFolders = !!(options && options.includeFolders);
    const multi = (options && options.multiSelect !== undefined) ? !!options.multiSelect : true;

    return await new Promise((resolve, reject) => {
      try {
        const view = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS)
          .setIncludeFolders(includeFolders)
          .setSelectFolderEnabled(includeFolders);
        if (cfg.folderId) {
          try { view.setParent(cfg.folderId); } catch(_e){ /* ignore */ }
        }

        let builder = new window.google.picker.PickerBuilder()
          .setDeveloperKey(cfg.apiKey)
          .setOAuthToken(token)
          .addView(view)
          .setCallback((data) => {
            try {
              if (data.action === window.google.picker.Action.CANCEL) return resolve([]);
              if (data.action !== window.google.picker.Action.PICKED) return;

              const docs = (data.docs || []).map(d => ({
                provider: 'gdrive',
                id: d.id,
                name: d.name,
                url: d.url,
                mimeType: d.mimeType,
                iconUrl: d.iconUrl,
                sizeBytes: d.sizeBytes,
                pickedAt: new Date().toISOString()
              }));
              resolve(docs);
            } catch (e){
              reject(e);
            }
          });

        if (cfg.appId) {
          try { builder = builder.setAppId(cfg.appId); } catch(_e){ /* ignore */ }
        }
        if (multi) builder = builder.enableFeature(window.google.picker.Feature.MULTISELECT_ENABLED);
        builder = builder.enableFeature(window.google.picker.Feature.SUPPORT_DRIVES);

        const picker = builder.build();
        picker.setVisible(true);
      } catch (e){
        reject(e);
      }
    });
  }

  // ----------------------------
  // Small global helpers: confirm dialog and page navigation helpers
  // ----------------------------
  function createConfirmModalIfNeeded(){
    if (window._rtsConfirmModalEl) return;
    try {
      const tpl = `
        <div class="modal fade" id="rtsConfirmModal" tabindex="-1" aria-hidden="true">
          <div class="modal-dialog modal-sm modal-dialog-centered">
            <div class="modal-content bg-dark text-white border-0">
              <div class="modal-header border-0">
                <h5 class="modal-title">Confirm</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>
              <div class="modal-body"></div>
              <div class="modal-footer border-0">
                <button type="button" class="btn btn-sm btn-outline-light rts-confirm-cancel" data-bs-dismiss="modal">Cancel</button>
                <button type="button" class="btn btn-sm btn-danger rts-confirm-ok">Yes</button>
              </div>
            </div>
          </div>
        </div>`;
      const div = document.createElement('div');
      div.innerHTML = tpl.trim();
      document.body.appendChild(div.firstChild);
      const modalEl = document.getElementById('rtsConfirmModal');
      window._rtsConfirmModalEl = modalEl;
      try {
        // bootstrap JS must be present; create modal API instance
        window._rtsConfirmModal = new bootstrap.Modal(modalEl, { backdrop: 'static' });
      } catch(_e){ window._rtsConfirmModal = null; }
    } catch(_e){ /* ignore */ }
  }

  function confirmPrompt(message){
    return new Promise(resolve => {
      try {
        createConfirmModalIfNeeded();
        const modalEl = window._rtsConfirmModalEl;
        if (!modalEl || !window._rtsConfirmModal){
          // Fallback to synchronous confirm for environments without bootstrap
          const ok = window.confirm(String(message || 'Are you sure?'));
          return resolve(Boolean(ok));
        }

        modalEl.querySelector('.modal-body').textContent = String(message || 'Are you sure?');
        const okBtn = modalEl.querySelector('.rts-confirm-ok');
        const cancelBtn = modalEl.querySelector('.rts-confirm-cancel');

        function cleanup(){
          okBtn.removeEventListener('click', onOk);
          cancelBtn.removeEventListener('click', onCancel);
          modalEl.removeEventListener('hidden.bs.modal', onHidden);
        }
        function onOk(){ cleanup(); window._rtsConfirmModal.hide(); resolve(true); }
        function onCancel(){ cleanup(); window._rtsConfirmModal.hide(); resolve(false); }
        function onHidden(){ cleanup(); resolve(false); }

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        modalEl.addEventListener('hidden.bs.modal', onHidden, { once: true });
        window._rtsConfirmModal.show();
      } catch(_e){ resolve(false); }
    });
  }

  function buildUrl(page, params){
    try {
      const base = new URL(page, window.location.href);
      if (params && typeof params === 'object'){
        Object.keys(params).forEach(k => {
          const v = params[k];
          if (v === null || v === undefined || String(v).trim() === '') base.searchParams.delete(k);
          else base.searchParams.set(k, String(v));
        });
      }
      return base.toString();
    } catch(_e){
      // fallback: join manually
      let u = page;
      if (params && Object.keys(params).length) {
        const q = Object.keys(params).map(k=>encodeURIComponent(k)+'='+encodeURIComponent(String(params[k]||''))).join('&');
        u += (u.indexOf('?')===-1?('?'+q):('&'+q));
      }
      return u;
    }
  }

  function openPage(page, params, opts){
    opts = opts || {};
    const url = buildUrl(page, params);
    if (opts.newTab) window.open(url, '_blank', 'noopener');
    else window.location.href = url;
  }

  function openWithTab(page, idParamName, idValue, tabName, opts){
    const params = {};
    if (idParamName && idValue !== undefined && idValue !== null) params[idParamName] = idValue;
    if (tabName) params.tab = tabName;
    openPage(page, params, opts);
  }

  // Activate a bootstrap tab on load using the `tab` query parameter (value can be either the tab id suffix
  // (e.g. 'as-main' for 'tab-as-main') or the actual tab button id). Pages can call this helper on startup.
  function activateTabFromQuery(){
    const tab = getQueryParam('tab');
    if (!tab) return;
    try {
      document.addEventListener('DOMContentLoaded', ()=>{
        try {
          // Try common id formats
          const byId = document.getElementById(tab) || document.getElementById('tab-' + tab);
          const byTarget = document.querySelector(`[data-bs-target="#${tab}"]`) || document.querySelector(`[data-target="#${tab}"]`);
          const btn = byId || byTarget;
          if (!btn) return;
          try {
            const inst = bootstrap.Tab.getOrCreateInstance(btn);
            inst.show();
          } catch(_e){
            btn.click();
          }
        } catch(_e){}
      });
    } catch(_e){}
  }

  // Global capture-phase listener for destructive clicks (async via modal).
  // Matches elements with data-confirm attribute OR id starting with 'btnDel' OR class 'rts-confirm-delete'.
  document.addEventListener('click', function captureDeleteConfirm(e){
    try {
      const el = e.target && e.target.closest ? e.target.closest('button,a,[data-confirm]') : null;
      if (!el) return;

      // If this click was already confirmed programmatically, allow it once
      if (el.dataset && el.dataset.rtsConfirmed === '1'){
        delete el.dataset.rtsConfirmed;
        return; // allow event
      }

      const hasConfirmAttr = el.hasAttribute && el.hasAttribute('data-confirm');
      const id = el.id || '';
      const isDel = id.startsWith('btnDel') || (el.classList && el.classList.contains('rts-confirm-delete'));
      if (!hasConfirmAttr && !isDel) return;

      // Prevent the click until the user confirms (async)
      e.preventDefault();
      e.stopImmediatePropagation();

      const msg = el.getAttribute && el.getAttribute('data-confirm') ? el.getAttribute('data-confirm') : 'Are you sure? This action cannot be undone.';
      confirmPrompt(msg).then(ok => {
        try {
          if (!ok) return;
          // mark and re-dispatch a click so the original handler runs
          if (el.dataset) el.dataset.rtsConfirmed = '1';
          // For anchors, navigate directly if href exists
          const href = el.getAttribute && el.getAttribute('href');
          if (href && el.tagName && el.tagName.toLowerCase() === 'a'){
            window.location.href = href;
            return;
          }
          // Otherwise, simulate a click
          el.click();
        } catch(_e){ /* ignore */ }
      }).catch(_e => {/* ignore */});
    } catch(_e){ /* ignore */ }
  }, true);


  // Export
  window.RTS = {
    deepMerge,
    safeLoadJSON,
    safeSaveJSON,
    safeRemoveItem,
    setActiveNav,
    initTriPaneResizers,
    moneyZAR,
    uid,
    getSettings,
    saveSettings,
    syncSettingsFromDB,
    getQueryParam,
    setQueryParam,
    pickDriveFiles,
    resetDriveToken
    ,
    // helpers
    confirmPrompt,
    openPage,
    openWithTab
    ,
    safePickDriveFiles,
    // api helpers
    apiFetch: apiFetch,
    apiGetCollection: apiGetCollection,
    apiSyncCollection: apiSyncCollection,
    apiCreate,
    apiGetCollectionItems,
    apiCreateCollectionItem,
    apiUpdateCollectionItem,
    apiDeleteCollectionItem,
    apiBulkUpsertCollection,
    apiLogHistory,
    apiUploadTelemetry,
    apiGetTelemetryUploads,
    apiGetTelemetryPoints,
    activateTabFromQuery,
    showToast: function(message, type = 'info') {
      const colors = {
        success: '#34a853',
        error: '#ea4335',
        warning: '#fbbc04',
        info: '#4285f4'
      };
      const toast = document.createElement('div');
      toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${colors[type] || colors.info};
        color: white;
        padding: 12px 20px;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        font-family: 'Montserrat', sans-serif;
        font-size: 0.9rem;
        font-weight: 600;
        animation: slideIn 0.3s ease;
      `;
      toast.textContent = message;
      document.body.appendChild(toast);
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }
  };

  // ----------------------------
  // Crosshair overlay helper
  // ----------------------------
  function enableCrosshair(opts){
    try {
      opts = opts || {};
      if (window._rtsCrosshair && window._rtsCrosshair.enabled) return;
      const color = opts.color || 'var(--rts-accent)';
      const thickness = Math.max(1, Number(opts.thickness||2));
      const opacity = Math.min(1, Math.max(0, Number(opts.opacity||0.75)));
      const wrap = document.createElement('div');
      wrap.className = 'rts-crosshair';
      wrap.style.pointerEvents = 'none';
      wrap.style.position = 'fixed';
      wrap.style.left = '0';
      wrap.style.top = '0';
      wrap.style.right = '0';
      wrap.style.bottom = '0';
      wrap.style.zIndex = '9999';
      const lineX = document.createElement('div');
      lineX.className = 'line-x';
      lineX.style.position = 'fixed';
      lineX.style.left = '0';
      lineX.style.right = '0';
      lineX.style.height = thickness + 'px';
      lineX.style.background = color;
      lineX.style.opacity = String(opacity);
      lineX.style.boxShadow = '0 0 0.5px rgba(0,0,0,0.8)';
      const lineY = document.createElement('div');
      lineY.className = 'line-y';
      lineY.style.position = 'fixed';
      lineY.style.top = '0';
      lineY.style.bottom = '0';
      lineY.style.width = thickness + 'px';
      lineY.style.background = color;
      lineY.style.opacity = String(opacity);
      lineY.style.boxShadow = '0 0 0.5px rgba(0,0,0,0.8)';
      wrap.appendChild(lineX);
      wrap.appendChild(lineY);
      document.body.appendChild(wrap);
      function onMove(e){
        try {
          const x = e.clientX;
          const y = e.clientY;
          lineX.style.top = y + 'px';
          lineY.style.left = x + 'px';
        } catch(_e){}
      }
      document.addEventListener('mousemove', onMove);
      window._rtsCrosshair = { enabled:true, el: wrap, onMove };
    } catch(_e){ /* ignore */ }
  }

  function disableCrosshair(){
    try {
      const ch = window._rtsCrosshair;
      if (!ch || !ch.enabled) return;
      document.removeEventListener('mousemove', ch.onMove);
      if (ch.el && ch.el.parentNode) ch.el.parentNode.removeChild(ch.el);
      window._rtsCrosshair = { enabled:false, el:null, onMove:null };
    } catch(_e){ /* ignore */ }
  }

  // augment export
  window.RTS.enableCrosshair = enableCrosshair;
  window.RTS.disableCrosshair = disableCrosshair;
})();

// ============================================================================
// API ADAPTER - For connecting to PlanetScale database
// ============================================================================
(function() {
  const API_BASE = window.RTS_CONFIG?.api?.baseURL || '/api';

  // Auto-login if no token exists
  async function ensureAuthenticated() {
    let token = localStorage.getItem('auth_token');
    
    // If token exists, verify it's still valid
    if (token) {
      try {
        const response = await fetch(`${API_BASE}/auth/verify`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (response.ok) {
          return token; // Token is valid
        }
      } catch (e) {
        // Token validation failed, remove it
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');
        token = null;
      }
    }
    
    // No token or invalid token - auto-login with default credentials
    if (!token) {
      try {
        const response = await fetch(`${API_BASE}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: 'admin', password: 'password' })
        });
        
        if (response.ok) {
          const data = await response.json();
          localStorage.setItem('auth_token', data.token);
          localStorage.setItem('user', JSON.stringify(data.user));
          console.log('✅ Auto-logged in as:', data.user.username);
          return data.token;
        } else {
          console.error('❌ Auto-login failed:', response.status);
          return null;
        }
      } catch (error) {
        console.error('❌ Auto-login error:', error);
        return null;
      }
    }
  }

  async function apiRequest(endpoint, options = {}) {
    try {
      // Ensure we have a valid token before making requests
      await ensureAuthenticated();
      
      const url = `${API_BASE}${endpoint}`;
      
      // Get auth token from localStorage
      const token = localStorage.getItem('auth_token');
      
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          ...options.headers
        },
        ...options
      });
      
      if (!response.ok) {
        // If unauthorized, try to re-authenticate once
        if (response.status === 401) {
          localStorage.removeItem('auth_token');
          localStorage.removeItem('user');
          
          // Try auto-login one more time
          const newToken = await ensureAuthenticated();
          if (newToken) {
            // Retry the original request with new token
            return await apiRequest(endpoint, options);
          }
          
          throw new Error('Authentication failed');
        }
        // Read error body to get server's specific error message
        let serverMessage = `API error: ${response.status}`;
        try {
          const errorBody = await response.json();
          if (errorBody && errorBody.error) serverMessage = errorBody.error;
        } catch {}
        throw new Error(serverMessage);
      }
      
      return await response.json();
    } catch (error) {
      console.error('API request failed:', endpoint, error);
      throw error;
    }
  }

  // Items API
  window.RTS_API = {
    // Get all items
    async getItems() {
      return await apiRequest('/items');
    },

    // Create item
    async createItem(data) {
      return await apiRequest('/items', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },

    // Update item
    async updateItem(id, data) {
      return await apiRequest(`/items/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    },

    // Delete item
    async deleteItem(id) {
      return await apiRequest(`/items/${id}`, {
        method: 'DELETE'
      });
    },

    // Get all boxes
    async getBoxes() {
      return await apiRequest('/boxes');
    },

    // Create box
    async createBox(data) {
      return await apiRequest('/boxes', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },

    // Update box
    async updateBox(id, data) {
      return await apiRequest(`/boxes/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    },

    // Unload box from truck — clears current_truck_id, sets status to warehouse
    async unloadBox(id, locationId) {
      return await apiRequest(`/boxes/${id}/unload`, {
        method: 'POST',
        body: JSON.stringify({ location_id: locationId || null })
      });
    },

    // Delete box
    async deleteBox(id) {
      return await apiRequest(`/boxes/${id}`, {
        method: 'DELETE'
      });
    },

    // Get all box contents
    async getBoxContents() {
      return await apiRequest('/box-contents');
    },

    // Create box content (add item to box)
    async createBoxContent(data) {
      return await apiRequest('/box-contents', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },

    // Delete box content (remove item from box)
    async deleteBoxContent(id) {
      return await apiRequest(`/box-contents/${id}`, {
        method: 'DELETE'
      });
    },

    // Pack item into box
    async packItem(boxId, itemId) {
      return await apiRequest('/items/pack', {
        method: 'POST',
        body: JSON.stringify({ boxId, itemId })
      });
    },

    // Unpack item from box
    async unpackItem(boxId, itemId) {
      return await apiRequest('/items/unpack', {
        method: 'POST',
        body: JSON.stringify({ boxId, itemId })
      });
    },

    // Get all asset types
    async getAssetTypes() {
      return await apiRequest('/asset-types');
    },

    // Create asset type
    async createAssetType(data) {
      return await apiRequest('/asset-types', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },

    // Update asset type
    async updateAssetType(id, data) {
      return await apiRequest(`/asset-types/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    },

    // Delete asset type
    async deleteAssetType(id) {
      return await apiRequest(`/asset-types/${id}`, {
        method: 'DELETE'
      });
    },

    // Pack inventory item into box
    async packInventoryItem(boxId, itemId, quantity, { override = false } = {}) {
      return await apiRequest('/inventory/pack', {
        method: 'POST',
        body: JSON.stringify({ boxId, itemId, quantity: quantity || 1, override })
      });
    },

    // Unpack inventory item from box
    async unpackInventoryItem(itemId) {
      return await apiRequest('/inventory/unpack', {
        method: 'POST',
        body: JSON.stringify({ itemId })
      });
    },

    // Update inventory item
    async updateInventoryItem(id, data) {
      return await apiRequest(`/inventory/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    },

    // Delete inventory item
    async deleteInventoryItem(id) {
      return await apiRequest(`/inventory/${id}`, {
        method: 'DELETE'
      });
    },

    // Generic collection methods (for tables like drivers, tasks, notes, etc.)
    async getCollectionItems(tableName) {
      return await apiRequest(`/collections/${tableName}`);
    },

    async createCollectionItem(tableName, data) {
      return await apiRequest(`/collections/${tableName}`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },

    async updateCollectionItem(tableName, id, data) {
      return await apiRequest(`/collections/${tableName}/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    },

    async deleteCollectionItem(tableName, id) {
      return await apiRequest(`/collections/${tableName}/${id}`, {
        method: 'DELETE'
      });
    },

    // Get all locations from the locations table
    async getLocations() {
      try {
        const resp = await apiRequest('/collections/locations');
        if (resp && resp.success && Array.isArray(resp.items) && resp.items.length > 0) {
          return { success: true, items: resp.items.filter(l => l.is_active !== false) };
        }
      } catch (e) {
        console.warn('getLocations: API fetch failed', e.message);
      }
      return { success: true, items: [] };
    },

    // ============================================
    // PACKING LIST API
    // ============================================
    
    // Get packing list for an event
    async getEventPackingList(eventId) {
      return await apiRequest(`/events/${eventId}/packing-list`);
    },
    
    // Create packing list for event
    async createPackingList(data) {
      return await apiRequest('/packing-lists', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },
    
    // Get items in a packing list
    async getPackingItems(listId) {
      return await apiRequest(`/packing-lists/${listId}/items`);
    },
    
    // Add item to packing list
    async addPackingItem(listId, data) {
      return await apiRequest(`/packing-lists/${listId}/items`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },
    
    // Mark item as packed
    async markItemPacked(listId, itemId, data) {
      return await apiRequest(`/packing-lists/${listId}/items/${itemId}/mark-packed`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },
    
    // Mark item as loaded
    async markItemLoaded(listId, itemId, data) {
      return await apiRequest(`/packing-lists/${listId}/items/${itemId}/mark-loaded`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },
    
    // Report issue with item
    async reportPackingIssue(listId, itemId, data) {
      return await apiRequest(`/packing-lists/${listId}/items/${itemId}/report-issue`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },
    
    // Get packing activity feed
    async getPackingActivity(listId, since = null) {
      const url = since 
        ? `/packing-lists/${listId}/activity?since=${since}`
        : `/packing-lists/${listId}/activity`;
      return await apiRequest(url);
    },
    
    // Get event vehicles
    async getEventVehicles(eventId) {
      return await apiRequest(`/events/${eventId}/vehicles`);
    },
    
    // Create packing list from template
    async createPackingListFromTemplate(listId, templateId) {
      return await apiRequest(`/packing-lists/${listId}/create-from-template`, {
        method: 'POST',
        body: JSON.stringify({ template_id: templateId })
      });
    },
    
    // Get packing templates
    async getPackingTemplates() {
      return await apiRequest('/packing-templates');
    },
    
    // Subscribe phone to event packing updates
    async subscribeToPackingList(data) {
      return await apiRequest('/whatsapp/subscribe', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },

    // ============================================
    // TRUCKS / VEHICLES API
    // ============================================

    async getTrucks(filters = {}) {
      const params = new URLSearchParams(filters);
      return await apiRequest(`/trucks?${params}`);
    },

    async getTruck(id) {
      return await apiRequest(`/trucks/${id}`);
    },

    async getLoadPlanDraft(truckId) {
      const qs = truckId ? `?truck_id=${encodeURIComponent(truckId)}` : '';
      return await apiRequest(`/load-plans/draft${qs}`);
    },

    async finaliseLoadPlan(truckId) {
      return await apiRequest('/load-plans/finalise', {
        method: 'POST',
        body: JSON.stringify({ truck_id: truckId || null })
      });
    },

    async getLoadPlanHistory() {
      return await apiRequest('/load-plans/history');
    },

    async getDashboardAlerts() {
      return await apiRequest('/dashboard/alerts');
    },

    async getScanManifest(truckId) {
      return await apiRequest(`/scan/manifest/${truckId}`);
    },

    async confirmScan(barcode, truckId, mode, returnLocationId) {
      return await apiRequest('/scan/confirm', {
        method: 'POST',
        body: JSON.stringify({ barcode, truck_id: truckId, mode, return_location_id: returnLocationId })
      });
    },

    async saveLoadPlanDraft(data) {
      return await apiRequest('/load-plans/draft', {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    },

    async createTruck(data) {
      return await apiRequest('/trucks', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },

    async updateTruck(id, data) {
      return await apiRequest(`/trucks/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    },

    async deleteTruck(id) {
      return await apiRequest(`/trucks/${id}`, {
        method: 'DELETE'
      });
    },

    // ---- Inventory Categories ----
    async getInventoryCategories() {
      return await apiRequest('/inventory-categories');
    },
    async createInventoryCategory(data) {
      return await apiRequest('/inventory-categories', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },
    async updateInventoryCategory(id, data) {
      return await apiRequest(`/inventory-categories/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    },
    async deleteInventoryCategory(id) {
      return await apiRequest(`/inventory-categories/${id}`, {
        method: 'DELETE'
      });
    },

    // ---- Suppliers ----
    async getSuppliers() {
      return await apiRequest('/suppliers');
    },
    async createSupplier(data) {
      return await apiRequest('/suppliers', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },
    async updateSupplier(id, data) {
      return await apiRequest(`/suppliers/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
    },
    async deleteSupplier(id) {
      return await apiRequest(`/suppliers/${id}`, {
        method: 'DELETE'
      });
    }
  };

  console.log('✅ RTS_API initialized:', API_BASE);
})();

// ============================================================================
// FETCH INTERCEPTOR — auto-inject auth header on all /api/ requests
// Fixes pages that call fetch('/api/...') without explicit Authorization header
// ============================================================================
(function () {
  const _origFetch = window.fetch.bind(window);
  window.fetch = function (resource, options) {
    try {
      const urlStr = typeof resource === 'string' ? resource : (resource && resource.url) || '';
      if (urlStr.includes('/api/') && !urlStr.includes('/api/auth/')) {
        const token = localStorage.getItem('auth_token');
        if (token) {
          options = options ? { ...options } : {};
          options.headers = Object.assign({ 'Authorization': 'Bearer ' + token }, options.headers || {});
        }
      }
    } catch (_e) { /* never break a fetch */ }
    return _origFetch(resource, options);
  };
})();
