/* Race Team OS - Top Tabs Navigation
 * Replaces the left sidebar with a compact top tab bar.
 * Works in file:// contexts.
 */
(function(){
  const tabs = [
    { href: 'index.html', label: 'Dashboard' },
    { href: 'events.html', label: 'Events' },
    { href: 'tasks.html', label: 'Tasks' },
    { href: 'drivers.html', label: 'Drivers' },
    { href: 'assets.html', label: 'Assets' },
    { href: 'inventory.html', label: 'Inventory' },
    { href: 'load.html', label: 'Load Plan' },
    { href: 'compliance.html', label: 'Compliance' },
    { href: 'invoice.html', label: 'Invoicing' },
    { href: 'expenses.html', label: 'Finance' },
    { href: 'service.html', label: 'Service' },
    { href: 'forecast.html', label: 'Forecast' },
    { href: 'strategy.html', label: 'Strategy' },
    { href: 'incidents.html', label: 'Incidents' },
    { href: 'performance.html', label: 'Performance' },
    { href: 'integrations.html', label: 'Integrations' },
    { href: 'settings.html', label: 'Settings' }
  ];

  function esc(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  function build(){
    const host = document.getElementById('rtsTopNav');
    if(!host) return;

    const li = tabs.map(t => (
      `<li class="nav-item"><a class="nav-link" href="${esc(t.href)}">${esc(t.label)}</a></li>`
    )).join('');

    host.innerHTML = `
      <div class="rts-topbar">
        <div class="rts-topbar-inner">
          <div class="rts-brand">
            <span class="rts-brand-mark">RT</span>
            <span class="rts-brand-text">Race Team OS</span>
          </div>

          <div class="rts-topbar-tabs-wrap">
            <ul class="nav nav-tabs rts-topnav" role="tablist">
              ${li}
            </ul>
          </div>

          <div class="rts-topbar-right">
            <div class="d-flex align-items-center me-2">
              <input id="rtsQuickSearch" class="form-control form-control-sm" type="search" placeholder="Search… (press /)" style="min-width:220px; max-width:360px;">
            </div>
            <div class="btn-group" role="group" aria-label="Site actions">
              <button id="rtsExportBtn" class="btn btn-sm btn-outline-light mlo-btn" type="button">Export</button>
              <button id="rtsImportBtn" class="btn btn-sm btn-outline-light mlo-btn" type="button">Import</button>
              <input id="rtsImportInput" type="file" accept=".json,application/json" style="display:none;" />
            </div>
            <span class="rts-env-badge">Prototype</span>
          </div>
        </div>
      </div>
    `;

    // Append a lightweight search results modal into the topnav host so we don't need to touch body elsewhere
    try {
      const searchModalTpl = `
        <div class="modal fade" id="rtsSearchModal" tabindex="-1" aria-hidden="true">
          <div class="modal-dialog modal-dialog-centered modal-lg">
            <div class="modal-content bg-dark text-white border-0">
              <div class="modal-header border-0">
                <h5 class="modal-title">Search</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>
              <div class="modal-body" style="max-height:60vh; overflow:auto;">
                <div id="rtsSearchResults" class="list-group"></div>
              </div>
              <div class="modal-footer border-0 text-secondary" style="font-size:0.85rem;">
                <div class="me-auto">Press <kbd>/</kbd> to focus search</div>
                <div>Press Enter to open first result</div>
              </div>
            </div>
          </div>
        </div>`;
      const tmp = document.createElement('div'); tmp.innerHTML = searchModalTpl.trim();
      host.appendChild(tmp.firstChild);
    } catch(_e){}

    // Hook up robust active tab detection and immediate click feedback.
    const navLinks = host.querySelectorAll('.rts-topnav .nav-link');

    function normalizePath(p){
      if (!p) return '';
      // strip query/hash and directories, return last segment lowercased
      try {
        const s = String(p).split('?')[0].split('#')[0];
        return s.split('/').pop().toLowerCase();
      } catch(_e){ return String(p).toLowerCase(); }
    }

    function applyActive(){
      const page = normalizePath(location.pathname) || normalizePath(location.href);
      navLinks.forEach(a => a.classList.remove('active'));
      navLinks.forEach(a => {
        const href = normalizePath(a.getAttribute('href') || '');
        // treat empty page as index.html for convenience
        const pageNorm = page || 'index.html';
        const hrefNorm = href || 'index.html';
        if (hrefNorm === pageNorm) a.classList.add('active');
      });
    }

    // immediate visual feedback on click (before navigation completes)
    navLinks.forEach(a => {
      a.addEventListener('click', (ev) => {
        navLinks.forEach(x => x.classList.remove('active'));
        a.classList.add('active');
        // allow default navigation to proceed — this just gives immediate feedback
      });
    });

    // Prefer the shared helper if available (updates other sidebars too). Always apply our robust fallback.
    if (window.RTS && typeof window.RTS.setActiveNav === 'function') {
      try { window.RTS.setActiveNav(); } catch(_e){}
    }
    applyActive();

    // Export / Import localStorage (rts.*) helpers
    try {
      const exportBtn = host.querySelector('#rtsExportBtn');
      const importBtn = host.querySelector('#rtsImportBtn');
      const importInput = host.querySelector('#rtsImportInput');

      function getRTSKeys(){
        try {
          return Object.keys(window.localStorage || {}).filter(k => String(k).startsWith('rts.'));
        } catch(_e){ return []; }
      }

      function downloadJSON(obj, filename){
        try {
          const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } catch (e){ alert('Export failed: ' + (e && e.message)); }
      }

      if (exportBtn) exportBtn.addEventListener('click', ()=>{
        const keys = getRTSKeys();
        if (!keys.length){ alert('No RTS data found in localStorage.'); return; }
        const out = {};
        keys.forEach(k => {
          try { out[k] = JSON.parse(window.localStorage.getItem(k)); } catch(_e){ out[k] = window.localStorage.getItem(k); }
        });
        const ts = new Date().toISOString().replace(/[:.]/g,'-');
        downloadJSON(out, `rts-export-${ts}.json`);
      });

      if (importBtn && importInput){
        importBtn.addEventListener('click', ()=> importInput.click());
        importInput.addEventListener('change', (ev) => {
          const f = (ev.target.files && ev.target.files[0]) ? ev.target.files[0] : null;
          if (!f) return;
          const reader = new FileReader();
          reader.onload = (e) => {
            (async function(){
              try {
                const data = JSON.parse(String(e.target.result || '{}'));
                if (!data || typeof data !== 'object') { alert('Invalid import file.'); return; }
                const keys = Object.keys(data).filter(k => String(k).startsWith('rts.'));
                const doConfirm = (msg) => {
                  if (window.RTS && typeof window.RTS.confirmPrompt === 'function') return window.RTS.confirmPrompt(String(msg || 'Are you sure?'));
                  return Promise.resolve(window.confirm(String(msg || 'Are you sure?')));
                };
                if (!keys.length) {
                  const ok = await doConfirm('No rts.* keys found in this file. Do you want to import everything anyway?');
                  if (!ok) return;
                } else {
                  const ok = await doConfirm(`This will overwrite ${keys.length} local RTS keys. Proceed?`);
                  if (!ok) return;
                }
                keys.length ? keys.forEach(k => {
                  try {
                    if (window.RTS && typeof window.RTS.safeSaveJSON === 'function') window.RTS.safeSaveJSON(k, data[k]);
                    else window.localStorage.setItem(k, JSON.stringify(data[k]));
                  } catch(_e){ /* ignore per-key errors */ }
                }) : Object.keys(data).forEach(k => {
                  try {
                    if (window.RTS && typeof window.RTS.safeSaveJSON === 'function') window.RTS.safeSaveJSON(k, data[k]);
                    else window.localStorage.setItem(k, JSON.stringify(data[k]));
                  } catch(_e){ }
                });
                alert('Import complete. Reload the page to apply changes.');
              } catch (err){ alert('Failed to parse import file: ' + (err && err.message)); }
            })();
          };
          reader.readAsText(f);
        });
      }
    } catch(_e) { /* non-fatal */ }

    // Quick-search wiring -------------------------------------------------
    try {
      const searchInput = host.querySelector('#rtsQuickSearch');
      const searchModalEl = document.getElementById('rtsSearchModal');
      const searchResultsEl = document.getElementById('rtsSearchResults');
      const searchModal = (searchModalEl && window.bootstrap) ? new bootstrap.Modal(searchModalEl) : null;
      let searchTimer = null;

      function mapStorageKeyToPage(key){
        const k = String(key||'').toLowerCase();
        if (k.includes('events')) return 'events.html';
        if (k.includes('assets')) return 'assets.html';
        if (k.includes('drivers')) return 'drivers.html';
        if (k.includes('invoice') || k.includes('invoices')) return 'invoice.html';
        if (k.includes('tasks')) return 'tasks.html';
        if (k.includes('expenses') || k.includes('expense') || k.includes('fin')) return 'expenses.html';
        if (k.includes('incidents')) return 'incidents.html';
        if (k.includes('service')) return 'service.html';
        if (k.includes('inventory')) return 'inventory.html';
        return null;
      }

      function performSearch(q){
        const out = [];
        try {
          const keys = Object.keys(window.localStorage || {}).filter(k => String(k||'').startsWith('rts.'));
          const needle = String(q||'').toLowerCase();
          keys.forEach(k => {
            try {
              const arr = (window.RTS && typeof window.RTS.safeLoadJSON === 'function') ? window.RTS.safeLoadJSON(k, null) : JSON.parse(window.localStorage.getItem(k));
              if (!Array.isArray(arr)) return;
              arr.forEach(item => {
                if (!item || typeof item !== 'object') return;
                const title = String(item.title || item.name || item.number || item.id || '').toLowerCase();
                if (!title) return;
                if (title.indexOf(needle) !== -1){
                  out.push({ key:k, id: item.id || item.number || '', title: item.title || item.name || item.number || String(item.id||''), raw: item });
                }
              });
            } catch(_e){ /* ignore parse errors */ }
          });
        } catch(_e){}
        return out.slice(0, 200);
      }

      function renderSearchResults(results, query){
        if (!searchResultsEl) return;
        searchResultsEl.innerHTML = '';
        if (!query || !results.length){
          const empty = document.createElement('div');
          empty.className = 'text-secondary';
          empty.textContent = query ? 'No results' : 'Type to search local data (events, drivers, assets, invoices, tasks)';
          searchResultsEl.appendChild(empty);
          return;
        }

        // Group by storage key prefix for readability
        const groups = {};
        results.forEach(r => {
          const g = String(r.key).replace(/^rts\./,'').replace(/\.v\d+$/,'').split('.')[0] || r.key;
          groups[g] = groups[g] || [];
          groups[g].push(r);
        });

        Object.keys(groups).forEach(g => {
          const hdr = document.createElement('div'); hdr.className = 'mb-1'; hdr.innerHTML = `<div class="text-muted" style="font-size:0.78rem; margin-bottom:4px;">${g}</div>`;
          searchResultsEl.appendChild(hdr);
          groups[g].forEach(item => {
            const a = document.createElement('button');
            a.type = 'button';
            a.className = 'list-group-item list-group-item-action bg-dark text-white';
            a.style.border = '1px solid rgba(255,255,255,0.04)';
            a.innerHTML = `<div style="display:flex; justify-content:space-between; gap:8px;"><div><strong>${esc(item.title)}</strong><div class="text-secondary" style="font-size:0.82rem;">${esc(item.key)}</div></div><div style="text-align:right; font-size:0.85rem;">${esc(String(item.id||''))}</div></div>`;
            a.addEventListener('click', ()=>{
              try {
                // open mapped page where possible, else fallback to index
                const page = mapStorageKeyToPage(item.key) || 'index.html';
                const params = { select: item.id };
                if (window.RTS && typeof window.RTS.openPage === 'function') window.RTS.openPage(page, params, {});
                else window.location.href = page + (item.id ? ('?select=' + encodeURIComponent(item.id)) : '');
              } catch(_e){}
            });
            searchResultsEl.appendChild(a);
          });
        });
      }

      if (searchInput){
        searchInput.addEventListener('input', (e)=>{
          const v = String(e.target.value || '');
          clearTimeout(searchTimer);
          searchTimer = setTimeout(()=>{
            const res = performSearch(v.trim());
            renderSearchResults(res, v.trim());
            if (searchModal) searchModal.show();
          }, 180);
        });

        // Enter opens first result
        searchInput.addEventListener('keydown', (e)=>{
          if (e.key === 'Enter'){
            e.preventDefault();
            const res = performSearch(String(searchInput.value||'').trim());
            if (res && res[0]){
              const item = res[0];
              const page = mapStorageKeyToPage(item.key) || 'index.html';
              if (window.RTS && typeof window.RTS.openPage === 'function') window.RTS.openPage(page, { select: item.id }, {});
              else window.location.href = page + (item.id ? ('?select=' + encodeURIComponent(item.id)) : '');
            }
          }
        });

        // Global keyboard shortcut: / to focus (unless typing)
        document.addEventListener('keydown', (ev)=>{
          if (ev.key === '/' && !ev.ctrlKey && !ev.metaKey && !ev.altKey){
            const tag = (document.activeElement && document.activeElement.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'textarea' || document.activeElement.isContentEditable) return;
            ev.preventDefault();
            try { searchInput.focus(); searchInput.select(); } catch(_e){}
          }
        });
      }
    } catch(_e) { /* non-fatal */ }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
