/* Race Team OS (Front-end prototype)
 * Shared utilities: safe storage, nav activation, tri-pane resizers.
 * Works in file:// contexts.
 */

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
    const saved = safeLoadJSON(storeKey, null);
    if (saved && left && typeof saved.left === 'number') left.style.width = saved.left + 'px';
    if (saved && right && typeof saved.right === 'number') right.style.width = saved.right + 'px';

    function persist(){
      if (!left || !right) return;
      safeSaveJSON(storeKey, {
        left: Math.round(left.getBoundingClientRect().width),
        right: Math.round(right.getBoundingClientRect().width)
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
      locations: ['Workshop','Trailer','Trackside Box','Store Room','Office'],
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
      calendars: { google: { enabled:false, calendarId:'', lastSync:'', notes:'' } }
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
    activateTabFromQuery
  };
})();
