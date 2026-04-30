/* Race Team OS - Top Tabs Navigation
 * Replaces the left sidebar with a compact top tab bar.
 * Works in file:// contexts.
 */
(function(){
  // Grouped navigation + singles; groups open a quick-select modal
  // Order groups so the most-used are left-most in the top bar
  const groups = [
    { label: 'Sporting', items: [
      { href: 'events.html',            label: 'Events',           key: 'E' },
      { href: 'sporting-calendar.html', label: 'Calendar',         key: 'C' },
      { href: 'entries.html',           label: 'Entries',          key: 'N' },
      { href: 'track-map.html',         label: 'Track Map',        key: 'K' },
      { href: 'regulations.html',       label: 'Regulations',      key: 'R' },
      { href: 'penalties.html',         label: 'Penalties',        key: 'P' },
      { href: 'notes.html',             label: 'Briefings',        key: 'B' },
      { href: 'incidents.html',         label: 'Incidents',        key: 'I' },
      { href: 'weather.html',           label: 'Weather Station',  key: 'T' },
      { href: 'race-strategy.html',     label: 'Race Strategy',    key: 'S' }
    ]},
    { label: 'Technical', items: [
      { href: 'cars.html',              label: 'Cars',             key: 'C' },
      { href: 'components.html',        label: 'Components',       key: 'O' },
      { href: 'allocations.html',       label: 'Allocations',      key: 'A' },
      { href: 'setups.html',            label: 'Setups',           key: 'U' },
      { href: 'homologation.html',      label: 'Homologation',     key: 'H' },
      { href: 'compliance.html',        label: 'Conformity',       key: 'F' },
      { href: 'session-changes.html',   label: 'Session Changes',  key: 'G' },
      { href: 'tech-failures.html',     label: 'Failures',         key: 'L' },
      { href: 'engineering-data.html',  label: 'Engineering Data', key: 'E' },
      { href: 'service.html',           label: 'Service',          key: 'V' },
      { href: 'fuel-calcs.html',        label: 'Fuel Calcs',       key: 'I' }
    ]},
    { label: 'Build', items: [
      { href: 'build-dashboard.html',   label: 'Overview',         key: 'O' },
      { href: 'build-status.html',      label: 'Build Status',     key: 'B' },
      { href: 'build-sheets.html',      label: 'Build Sheets',     key: 'S' },
      { href: 'assembly.html',          label: 'Assembly',         key: 'A' },
      { href: 'build-qc.html',          label: 'QC',               key: 'Q' },
      { href: 'build-repairs.html',     label: 'Repairs',          key: 'R' },
      { href: 'rebuilds.html',          label: 'Rebuilds',         key: 'E' },
      { href: 'consumables.html',       label: 'Consumables',      key: 'C' },
      { href: 'garage-prep.html',       label: 'Garage Prep',      key: 'G' }
    ]},
    { label: 'Performance', items: [
      { href: 'performance-dashboard.html', label: 'Overview',      key: 'O' },
      { href: 'run-plans.html',         label: 'Run Plans',        key: 'R' },
      { href: 'performance.html',       label: 'Analysis',         key: 'A' },
      { href: 'tyre-register.html',     label: 'Tyres',            key: 'T' },
      { href: 'fuel-calcs.html',        label: 'Fuel',             key: 'F' },
      { href: 'benchmarking.html',      label: 'Benchmarking',     key: 'B' },
      { href: 'driver-trends.html',     label: 'Driver Trends',    key: 'D' },
      { href: 'correlation.html',       label: 'Correlation',      key: 'C' },
      { href: 'debriefs.html',          label: 'Debriefs',         key: 'E' },
      { href: 'engineering-notes.html', label: 'Eng Notes',        key: 'N' },
      { href: 'strategy.html',          label: 'Strategy',         key: 'S' },
      { href: 'results.html',           label: 'Results',          key: 'L' },
      { href: 'telemetry-sessions.html', label: 'Data Sessions',    key: 'Z' },
      { href: 'telemetry.html',          label: 'Telemetry',        key: 'Y' },
      { href: 'drive-import.html',       label: 'Drive Import',     key: 'I' }
    ]},
    { label: 'Reliability', items: [
      { href: 'reliability-dashboard.html',  label: 'Overview',          key: 'O' },
      { href: 'reliability-incidents.html',  label: 'Incidents',         key: 'I' },
      { href: 'rca.html',                    label: 'RCA',               key: 'R' },
      { href: 'corrective-actions.html',     label: 'Corrective Actions',key: 'C' },
      { href: 'preventive-maintenance.html', label: 'Maintenance',       key: 'M' },
      { href: 'reliability-trends.html',     label: 'Trends',            key: 'T' },
      { href: 'risk-map.html',               label: 'Risk Map',          key: 'K' },
      { href: 'review-board.html',           label: 'Review Board',      key: 'B' }
    ]},
    { label: 'Projects', items: [
      { href: 'project-management.html?tab=dashboard', label: 'Dashboard',    key: 'D' },
      { href: 'project-management.html?tab=projects',  label: 'Projects',     key: 'P' },
      { href: 'project-management.html?tab=gantt',     label: 'Gantt',        key: 'G' },
      { href: 'tasks.html',                            label: 'Tasks',        key: 'T' },
      { href: 'milestones.html',                       label: 'Milestones',   key: 'M' },
      { href: 'project-management.html?tab=workload',  label: 'Workload',     key: 'W' },
      { href: 'project-management.html?tab=reports',   label: 'Reports',      key: 'R' },
      { href: 'runbooks.html',                         label: 'Runbooks',     key: 'B' }
    ]},
    { label: 'Logistics', items: [
      { href: 'load.html',              label: 'Load Plan',        key: 'L' },
      { href: 'scan-load.html',         label: 'Scan to Load',     key: 'S' },
      { href: 'box-packing.html',       label: 'Box Packing',      key: 'B' },
      { href: 'vehicles.html',          label: 'Vehicles',         key: 'V' },
      { href: 'race-fleet.html',        label: 'Race Fleet',       key: 'R' },
      { href: 'event-notes.html',       label: 'Checklists',       key: 'C' },
      { href: 'inventory.html',         label: 'Inventory',        key: 'I' },
      { href: 'assets.html',            label: 'Assets',           key: 'A' },
      { href: 'history.html',           label: 'Activity History', key: 'H' }
    ]},
    { label: 'Finance', items: [
      { href: 'finance-dashboard.html', label: 'Overview',         key: 'O' },
      { href: 'budgets.html',           label: 'Budgets',          key: 'B' },
      { href: 'cost-cap.html',          label: 'Cost Cap',         key: 'C' },
      { href: 'requisitions.html',      label: 'Requisitions',     key: 'R' },
      { href: 'purchase-orders.html',   label: 'Purchase Orders',  key: 'P' },
      { href: 'invoice.html',           label: 'Invoicing',        key: 'I' },
      { href: 'expenses.html',          label: 'Expenses',         key: 'E' },
      { href: 'packages.html',          label: 'Driver Packages',  key: 'K' },
      { href: 'finance-forecast.html',  label: 'Forecasting',      key: 'F' },
      { href: 'audit-trail.html',       label: 'Audit Trail',      key: 'A' }
    ]},
    { label: 'Procurement', items: [
      { href: 'procurement-dashboard.html', label: 'Overview',        key: 'O' },
      { href: 'proc-suppliers.html',    label: 'Suppliers',        key: 'S' },
      { href: 'rfqs.html',              label: 'RFQs',             key: 'R' },
      { href: 'quotes.html',            label: 'Quotes',           key: 'Q' },
      { href: 'proc-contracts.html',    label: 'Contracts',        key: 'C' },
      { href: 'slas.html',              label: 'SLAs',             key: 'L' },
      { href: 'lead-times.html',        label: 'Lead Times',       key: 'T' },
      { href: 'orders.html',            label: 'Orders',           key: 'N' },
      { href: 'emergency-orders.html',  label: 'Emergency Orders', key: 'E' },
      { href: 'supplier-issues.html',   label: 'Supplier Issues',  key: 'I' }
    ]},
    { label: 'HR', items: [
      { href: 'staff.html',             label: 'People',           key: 'P' },
      { href: 'org-chart.html',         label: 'Org Chart',        key: 'O' },
      { href: 'rotas.html',             label: 'Rotas',            key: 'R' },
      { href: 'leave.html',             label: 'Leave',            key: 'L' },
      { href: 'training.html',          label: 'Training',         key: 'T' },
      { href: 'recruitment.html',       label: 'Recruitment',      key: 'C' },
      { href: 'welfare.html',           label: 'Welfare',          key: 'W' },
      { href: 'medical-fitness.html',   label: 'Medical Fitness',  key: 'M' },
      { href: 'staff-reviews.html',     label: 'Reviews',          key: 'V' }
    ]},
    { label: 'Driver', items: [
      { href: 'drivers.html',           label: 'Profiles',         key: 'P' },
      { href: 'driver-dashboard.html',  label: 'Driver Portal',    key: 'D' },
      { href: 'driver-calendar.html',   label: 'Calendar',         key: 'C' },
      { href: 'driver-contracts.html',  label: 'Contracts',        key: 'T' },
      { href: 'simulator.html',         label: 'Simulator',        key: 'S' },
      { href: 'driver-fitness.html',    label: 'Fitness',          key: 'F' },
      { href: 'driver-debriefs.html',   label: 'Debriefs',         key: 'B' },
      { href: 'media.html',             label: 'Media',            key: 'M' },
      { href: 'licences.html',          label: 'Licences',         key: 'L' },
      { href: 'driver-prefs.html',      label: 'Preferences',      key: 'R' },
      { href: 'junior-programme.html',  label: 'Junior Programme', key: 'J' }
    ]},
    { label: 'Compliance', items: [
      { href: 'compliance-dashboard.html', label: 'Overview',       key: 'O' },
      { href: 'compliance.html',        label: 'FIA Compliance',   key: 'F' },
      { href: 'policies.html',          label: 'Policies',         key: 'P' },
      { href: 'legal-contracts.html',   label: 'Legal Contracts',  key: 'L' },
      { href: 'insurance.html',         label: 'Insurance',        key: 'I' },
      { href: 'legal.html',             label: 'Legal',            key: 'G' },
      { href: 'data-protection.html',   label: 'Data Protection',  key: 'D' },
      { href: 'health-safety.html',     label: 'Health & Safety',  key: 'H' },
      { href: 'compliance-risks.html',  label: 'Risk Register',    key: 'R' },
      { href: 'crisis-management.html', label: 'Crisis Mgmt',      key: 'C' }
    ]},
    { label: 'Executive', items: [
      { href: 'exec-dashboard.html',        label: 'Overview',         key: 'O' },
      { href: 'live-ops.html',              label: 'Live Operations',  key: 'L' },
      { href: 'kpi-dashboard.html',         label: 'KPI Dashboard',    key: 'K' },
      { href: 'dept-status.html',           label: 'Dept Status',      key: 'D' },
      { href: 'approvals.html',             label: 'Approvals',        key: 'A' },
      { href: 'exec-actions.html',          label: 'Actions',          key: 'N' },
      { href: 'decisions.html',             label: 'Decisions',        key: 'E' },
      { href: 'announcements.html',         label: 'Announcements',    key: 'C' },
      { href: 'strategic-objectives.html',  label: 'Strategy',         key: 'S' },
      { href: 'board-reports.html',         label: 'Board Reports',    key: 'B' },
      { href: 'doc-control.html',           label: 'Document Control', key: 'T' },
      { href: 'export-centre.html',         label: 'Export Centre',    key: 'X' }
    ]}
  ];
  const singles = [
    { href: 'index.html', label: 'Dashboard' },
    { href: 'integrations.html', label: 'Integrations' },
    { href: 'settings.html', label: 'Settings' },
    { href: 'users.html', label: 'Users' }
  ];

  // Default top-level keybinds (letters) — only active when not typing
  // D: Dashboard, S: Sporting, T: Technical, B: Build, P: Performance, R: Reliability
  // L: Logistics, F: Finance, O: Procurement, H: HR, V: Driver, A: Compliance, X: Executive
  const topKeybinds = {
    'D': { type: 'single',  href: 'index.html' },
    'S': { type: 'group',   label: 'Sporting' },
    'T': { type: 'group',   label: 'Technical' },
    'B': { type: 'group',   label: 'Build' },
    'P': { type: 'group',   label: 'Performance' },
    'R': { type: 'group',   label: 'Reliability' },
    'J': { type: 'group',   label: 'Projects' },
    'L': { type: 'group',   label: 'Logistics' },
    'F': { type: 'group',   label: 'Finance' },
    'O': { type: 'group',   label: 'Procurement' },
    'H': { type: 'group',   label: 'HR' },
    'V': { type: 'group',   label: 'Driver' },
    'A': { type: 'group',   label: 'Compliance' },
    'X': { type: 'group',   label: 'Executive' },
    'I': { type: 'single',  href: 'integrations.html' }
  };

  function esc(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  function build(){
    const host = document.getElementById('rtsTopNav');
    if(!host) return;

    // Helper maps for displaying top-level shortcut letters
    const singleKeyMap = { 'index.html': 'D', 'integrations.html': 'I', 'settings.html': 'S' };
  const groupKeyMap = {
    'Sporting': 'S', 'Technical': 'T', 'Build': 'B', 'Performance': 'P',
    'Reliability': 'R', 'Projects': 'J', 'Logistics': 'L', 'Finance': 'F',
    'Procurement': 'O', 'HR': 'H', 'Driver': 'V', 'Compliance': 'A', 'Executive': 'X'
  };

    const liSingles = singles.map(t => {
      const k = singleKeyMap[t.href] || '';
      const keyBadge = k ? `<span class="rts-key-letter" aria-hidden="true">${k}</span>` : '';
      return `<li class="nav-item"><a class="nav-link" href="${esc(t.href)}">${keyBadge}${esc(t.label)}</a></li>`;
    }).join('');
    const liGroups = groups.map(g => {
      const k = groupKeyMap[g.label] || '';
      const keyBadge = k ? `<span class="rts-key-letter" aria-hidden="true">${k}</span>` : '';
      return `<li class="nav-item"><a class="nav-link rts-group-link" href="#" data-group="${esc(g.label)}">${keyBadge}${esc(g.label)}</a></li>`;
    }).join('');
  // Put the high-usage groups on the left; push singles (Integrations/Settings) to the right
  const li = liGroups + liSingles;

    host.innerHTML = `
      <div class="rts-topbar">
        <div class="rts-topbar-inner">
          <div class="rts-topbar-row1">
            <div class="rts-brand">
              <span class="rts-brand-mark">RT</span>
              <span class="rts-brand-text">Race Team OS</span>
            </div>
            <div class="rts-lt-badge" id="rtsLtBadge" style="display:none;">
              <span class="rts-lt-dot rts-lt-dot--waiting" id="rtsLtDot"></span>
              <span class="rts-lt-badge-text" id="rtsLtBadgeText">Live</span>
            </div>
            <div class="rts-topbar-right">
              <div class="d-flex align-items-center me-2">
                <input id="rtsQuickSearch" class="form-control form-control-sm" type="search" placeholder="Search… (press /)" style="min-width:160px; max-width:280px;">
              </div>
              <div class="btn-group" role="group" aria-label="Site actions">
                <button id="rtsExportBtn" class="btn btn-sm btn-outline-light mlo-btn" type="button">Export</button>
                <button id="rtsImportBtn" class="btn btn-sm btn-outline-light mlo-btn" type="button">Import</button>
                <input id="rtsImportInput" type="file" accept=".json,application/json" style="display:none;" />
              </div>
              <div class="d-flex align-items-center gap-2 ms-2">
                <span id="rtsCurrentUser" class="text-light" style="font-size: 0.85rem;"></span>
                <button id="rtsLogoutBtn" class="btn btn-sm btn-outline-danger" type="button">Logout</button>
              </div>
              <span class="rts-env-badge">Prototype</span>
            </div>
          </div>
          <div class="rts-lt-row" id="rtsLtRow" style="display:none;">
            <span class="rts-lt-status" id="rtsLtStatus">⏸ Waiting</span>
            <div class="rts-lt-track" id="rtsLtTrack">
              <div class="rts-lt-inner" id="rtsLtInner"></div>
            </div>
            <div class="rts-lt-controls">
              <button class="rts-lt-toggle" id="rtsLtToggle" type="button" title="Toggle all drivers / our drivers only">All</button>
              <a class="rts-lt-extlink" id="rtsLtExtLink" href="#" target="_blank" rel="noopener" title="Open timing page" style="display:none;">↗</a>
            </div>
          </div>
          <div class="rts-topbar-tabs-wrap">
            <ul class="nav nav-tabs rts-topnav" role="tablist">
              ${li}
            </ul>
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

    // Group quick-select modal (large buttons + letter shortcuts)
    let activeGroupKeys = null;
    let groupModal = null;
    try {
      const groupModalTpl = `
        <div class="modal fade" id="rtsGroupQuickModal" tabindex="-1" aria-hidden="true">
          <div class="modal-dialog modal-dialog-centered modal-lg">
            <div class="modal-content" style="background:#ffffff; color:#000000; border:2px solid #000000; font-family: 'Sedgwick Ave Display', 'Rubik Wet Paint', 'Bangers', 'Permanent Marker', 'Montserrat', system-ui, sans-serif;">
              <div class="modal-header" style="border-bottom:2px solid #000000;">
                <h5 class="modal-title" style="color:#000000; font-weight:700;"><span id="rtsGroupTitle"></span></h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>
              <div class="modal-body" style="background:#ffffff;">
                <div class="d-flex flex-wrap gap-2" id="rtsGroupButtons"></div>
                <div class="mt-3" style="font-size:0.85rem; color:#000000; font-weight:600;">Press the highlighted letter to jump instantly.</div>
              </div>
            </div>
          </div>
        </div>`;
      const tmp2 = document.createElement('div'); tmp2.innerHTML = groupModalTpl.trim();
      host.appendChild(tmp2.firstChild);
      const groupModalEl = document.getElementById('rtsGroupQuickModal');
      if (groupModalEl && window.bootstrap) groupModal = new bootstrap.Modal(groupModalEl);

      function navigateTo(href){
        try {
          if (groupModal) groupModal.hide();
          if (window.RTS && typeof window.RTS.openPage === 'function') window.RTS.openPage(href, {}, {});
          else window.location.href = href;
        } catch(_e){}
      }

      function openGroupModal(label){
        try {
          const g = groups.find(x => x.label === label);
          if (!g) return;
          const titleEl = document.getElementById('rtsGroupTitle');
          const btnWrap = document.getElementById('rtsGroupButtons');
          if (titleEl) titleEl.textContent = `${g.label}`;
          if (btnWrap) btnWrap.innerHTML = '';
          activeGroupKeys = {};
          g.items.forEach(item => {
            const key = String(item.key || item.label[0] || '').toUpperCase();
            activeGroupKeys[key] = item.href;
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'btn btn-lg mlo-btn rts-quick-btn rts-quick-btn-light';
            // Square buttons with consistent width/height
            b.style.width = '220px';
            b.style.height = '220px';
            b.style.display = 'flex';
            b.style.flexDirection = 'column';
            b.style.alignItems = 'center';
            b.style.justifyContent = 'center';
            b.style.gap = '10px';
            b.innerHTML = `
              <div class="rts-quick-letter" aria-hidden="true">${key}</div>
              <div class="rts-quick-label">${esc(item.label)}</div>
            `;
            b.addEventListener('click', ()=> navigateTo(item.href));
            btnWrap.appendChild(b);
          });
          if (groupModal) groupModal.show();
        } catch(_e){}
      }

      // Keyboard shortcuts while modal is open
      document.addEventListener('keydown', (ev)=>{
        try {
          if (!activeGroupKeys) return;
          if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
          const k = String(ev.key || '').toUpperCase();
          if (k.length === 1 && activeGroupKeys[k]){
            ev.preventDefault();
            navigateTo(activeGroupKeys[k]);
          } else if (k === 'ESCAPE'){
            if (groupModal) groupModal.hide();
          }
        } catch(_e){}
      });

      // Open group modal when clicking group links
      host.querySelectorAll('.rts-group-link').forEach(a => {
        a.addEventListener('click', (ev)=>{
          ev.preventDefault();
          const label = a.getAttribute('data-group');
          openGroupModal(label);
        });
      });

      // Clear active map on modal hide
      if (groupModalEl){
        groupModalEl.addEventListener('hidden.bs.modal', ()=>{ activeGroupKeys = null; });
      }
    } catch(_e){}

    // Global keybinds for top-level tabs (only when not typing and modal not active)
    try {
      document.addEventListener('keydown', (ev)=>{
        try {
          // Ignore if quick-select is already active — those keys handled above
          if (activeGroupKeys) return;
          // Ignore if typing in an input/textarea/contentEditable
          const ae = document.activeElement;
          const tag = (ae && ae.tagName || '').toLowerCase();
          if (tag === 'input' || tag === 'textarea' || (ae && ae.isContentEditable)) return;
          if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
          const k = String(ev.key || '').toUpperCase();
          if (k.length !== 1) return;
          const bind = topKeybinds[k];
          if (!bind) return;
          ev.preventDefault();
          // Visual flash on the corresponding top tab
          let flashEl = null;
          if (bind.type === 'group') {
            flashEl = host.querySelector(`.rts-group-link[data-group="${CSS.escape(bind.label)}"]`);
          } else if (bind.type === 'single' && bind.href){
            flashEl = host.querySelector(`.rts-topnav .nav-link[href="${CSS.escape(bind.href)}"]`);
          }
          try {
            if (flashEl){
              flashEl.classList.add('rts-key-flash');
              setTimeout(()=>{ try { flashEl.classList.remove('rts-key-flash'); } catch(_e){} }, 280);
            }
          } catch(_e){}
          if (bind.type === 'group') {
            openGroupModal(bind.label);
          } else if (bind.type === 'single' && bind.href){
            if (window.RTS && typeof window.RTS.openPage === 'function') window.RTS.openPage(bind.href, {}, {});
            else window.location.href = bind.href;
          }
        } catch(_e){}
      });
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
      let matched = false;
      navLinks.forEach(a => {
        const href = normalizePath(a.getAttribute('href') || '');
        const pageNorm = page || 'index.html';
        const hrefNorm = href || 'index.html';
        if (hrefNorm === pageNorm) {
          a.classList.add('active');
          matched = true;
        }
      });
      // If no direct tab matched, highlight the group that contains the current page
      if (!matched){
        try {
          const p = page || 'index.html';
          const g = groups.find(grp => grp.items.some(it => normalizePath(it.href) === p));
          if (g){
            const link = host.querySelector(`.rts-group-link[data-group="${CSS.escape(g.label)}"]`);
            if (link) link.classList.add('active');
          }
        } catch(_e){}
      }
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

    // Auth - Display user and logout button -----------------------------------
    try {
      const userDisplay = host.querySelector('#rtsCurrentUser');
      const logoutBtn = host.querySelector('#rtsLogoutBtn');
      
      if (userDisplay && logoutBtn) {
        // Display current user
        const userStr = localStorage.getItem('user');
        if (userStr) {
          try {
            const user = JSON.parse(userStr);
            userDisplay.textContent = `👤 ${user.name || user.username}`;
          } catch(e) {}
        }
        
        // Logout handler
        logoutBtn.addEventListener('click', async () => {
          const token = localStorage.getItem('auth_token');
          
          // Call logout API
          if (token) {
            try {
              await fetch('/api/auth/logout', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${token}`
                }
              });
            } catch(e) {
              console.error('Logout API error:', e);
            }
          }
          
          // Clear local storage
          localStorage.removeItem('auth_token');
          localStorage.removeItem('user');
          
          // Redirect to login
          window.location.replace('/login.html');
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

      function handleCommand(cmd){
        const q = String(cmd||'').trim();
        if (!q) return false;
        const raw = q.startsWith('>') ? q.slice(1).trim() : q;
        // add driver NAME
        const addDrv = raw.match(/^add\s+driver\s+(.+)$/i);
        if (addDrv){
          const name = addDrv[1].trim();
          try {
            const settings = window.RTS ? window.RTS.getSettings() : {};
            settings.drivers = Array.isArray(settings.drivers) ? settings.drivers : [];
            const id = (window.RTS && typeof window.RTS.uid==='function') ? window.RTS.uid('drv') : String(Date.now());
            settings.drivers.push({ id, name, active: true });
            if (window.RTS && typeof window.RTS.safeSaveJSON==='function') window.RTS.safeSaveJSON('rts.settings.v1', settings);
            else window.localStorage.setItem('rts.settings.v1', JSON.stringify(settings));
            // navigate to Drivers and select
            if (window.RTS && typeof window.RTS.openPage==='function') window.RTS.openPage('drivers.html', { select: id }, {});
            else window.location.href = 'drivers.html' + (`?select=${encodeURIComponent(id)}`);
          } catch(e){ alert('Failed to add driver: ' + (e && e.message)); }
          return true;
        }
        // stock QUERY -> open inventory filtered results in modal
        const stock = raw.match(/^stock\s+(.+)$/i);
        if (stock){
          const needle = stock[1].trim().toLowerCase();
          const results = performSearch(needle).filter(r => String(r.key||'').toLowerCase().includes('inventory'));
          renderSearchResults(results, needle);
          if (searchModal) searchModal.show();
          return true;
        }
        // reset -> clear local rts.* keys
        if (/^reset$/i.test(raw)){
          (async function(){
            const doConfirm = (msg) => {
              if (window.RTS && typeof window.RTS.confirmPrompt === 'function') return window.RTS.confirmPrompt(String(msg || 'Are you sure?'));
              return Promise.resolve(window.confirm(String(msg || 'Are you sure?')));
            };
            const ok = await doConfirm('Reset local RTS data? This clears rts.* keys and pages will reseed.');
            if (!ok) return;
            try {
              const keys = Object.keys(window.localStorage||{}).filter(k => k.startsWith('rts.'));
              keys.forEach(k => { try { window.localStorage.removeItem(k); } catch(_e){} });
              alert('Reset complete. Reload the page to apply changes.');
            } catch(e){ alert('Reset failed: ' + (e && e.message)); }
          })();
          return true;
        }
        return false;
      }

      if (searchInput){
        searchInput.addEventListener('input', (e)=>{
          const v = String(e.target.value || '');
          clearTimeout(searchTimer);
          searchTimer = setTimeout(()=>{
            const trimmed = v.trim();
            if (!handleCommand(trimmed)){
              const res = performSearch(trimmed);
              renderSearchResults(res, trimmed);
              if (searchModal) searchModal.show();
            }
          }, 180);
        });

        // Enter opens first result
        searchInput.addEventListener('keydown', (e)=>{
          if (e.key === 'Enter'){
            e.preventDefault();
            const q = String(searchInput.value||'').trim();
            if (!handleCommand(q)){
              const res = performSearch(q);
              if (res && res[0]){
                const item = res[0];
                const page = mapStorageKeyToPage(item.key) || 'index.html';
                if (window.RTS && typeof window.RTS.openPage === 'function') window.RTS.openPage(page, { select: item.id }, {});
                else window.location.href = page + (item.id ? ('?select=' + encodeURIComponent(item.id)) : '');
              }
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

    // ── Global Barcode Scanner ─────────────────────────────────────────────
    // Press SPACE from any page (when not typing) → scan overlay opens.
    // Type or scan any box / asset / inventory barcode or name to get
    // item-specific quick actions and inline history.
    try {
      const _scanReadySvg = '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#30363d" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" style="display:block;margin:0 auto 10px;"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3"/><path d="M17 17v3h3"/><path d="M14 20h3"/></svg>';
      const scanModalHtml = `
        <div class="modal fade" id="rtsScanModal" tabindex="-1" aria-hidden="true">
          <div class="modal-dialog modal-dialog-centered" style="max-width:600px;">
            <div class="modal-content" style="background:#0d1117;color:#e6edf3;border:1px solid #30363d;border-radius:12px;overflow:hidden;">
              <div class="modal-body p-0">
                <div style="background:#161b22;padding:18px 20px 14px;border-bottom:1px solid #30363d;">
                  <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#388bfd" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M7.76 7.76a6 6 0 0 0 0 8.49"/><path d="M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>
                    <span style="font-size:1rem;font-weight:700;color:#e6edf3;">Quick Scan</span>
                    <span style="margin-left:auto;font-size:0.71rem;color:#8b949e;">SPACE to open &middot; ESC to close</span>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" style="margin:0;"></button>
                  </div>
                  <div style="position:relative;">
                    <span style="position:absolute;left:11px;top:50%;transform:translateY(-50%);pointer-events:none;color:#8b949e;line-height:0;">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                    </span>
                    <input id="rtsScanInput" type="text" autocomplete="off" autocorrect="off" spellcheck="false"
                      placeholder="Scan barcode or type box / asset name…"
                      style="width:100%;padding:10px 38px 10px 34px;background:#0d1117;color:#e6edf3;border:1.5px solid #388bfd;border-radius:6px;font-size:1rem;outline:none;box-sizing:border-box;"/>
                    <span id="rtsScanSpinner" style="position:absolute;right:11px;top:50%;transform:translateY(-50%);display:none;line-height:0;">
                      <span class="spinner-border" style="width:14px;height:14px;border-width:2px;color:#388bfd;"></span>
                    </span>
                  </div>
                  <div style="font-size:0.72rem;color:#8b949e;margin-top:6px;">Box &middot; Asset &middot; Inventory — scan or type. Results appear live.</div>
                </div>
                <div id="rtsScanResults" style="max-height:62vh;overflow-y:auto;padding:12px 14px;">
                  <div id="rtsScanEmpty" style="text-align:center;padding:40px 0;color:#8b949e;">
                    ${_scanReadySvg}
                    <div style="font-size:0.88rem;">Ready to scan</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>`;
      // Inject scoped styles so modal buttons are readable even on pages
      // that set `button{color:#202124!important}` (e.g. box-packing.html)
      const _rtsScanStyle = document.createElement('style');
      _rtsScanStyle.textContent = [
        '#rtsScanModal .rts-sa{background:#21262d!important;color:#c9d1d9!important;border:1px solid #30363d!important;border-radius:5px!important;padding:5px 12px!important;font-size:0.77rem!important;cursor:pointer!important;white-space:nowrap!important;}',
        '#rtsScanModal .rts-sa:hover{border-color:#388bfd!important;color:#79c0ff!important;}',
        '#rtsScanModal{color:#e6edf3!important;}',
        '#rtsScanResults{background:#0d1117!important;}'
      ].join('');
      document.head.appendChild(_rtsScanStyle);

      const scanTmpDiv = document.createElement('div');
      scanTmpDiv.innerHTML = scanModalHtml.trim();
      host.appendChild(scanTmpDiv.firstChild);

      const scanModalEl   = document.getElementById('rtsScanModal');
      const scanInput     = document.getElementById('rtsScanInput');
      const scanResultsEl = document.getElementById('rtsScanResults');
      const scanSpinner   = document.getElementById('rtsScanSpinner');
      const scanEmpty     = document.getElementById('rtsScanEmpty');
      const scanModal     = (scanModalEl && window.bootstrap) ? new bootstrap.Modal(scanModalEl, { backdrop: true }) : null;

      // XSS-safe escaping
      function sEsc(s){ return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

      function statusBadge(status){
        const s = String(status||'').toLowerCase().replace(/_/g,' ');
        const colors = { active:'#2ea044', available:'#2ea044', packed:'#388bfd', loaded:'#388bfd',
          'in transit':'#388bfd', 'in use':'#d29922', maintenance:'#d29922',
          missing:'#f85149', retired:'#6e7681', returned:'#6e7681', 'on truck':'#58a6ff' };
        const c = colors[s] || '#6e7681';
        return `<span style="background:${c}22;color:${c};font-size:0.67rem;font-weight:700;padding:2px 8px;border-radius:10px;border:1px solid ${c}55;white-space:nowrap;">${sEsc(s||'—')}</span>`;
      }
      function typePill(type){
        const cfg = {
          box:       { label:'BOX',   bg:'#1c6efb22', color:'#58a6ff', border:'#1c6efb55' },
          item:      { label:'ASSET', bg:'#8957e522', color:'#d2a8ff', border:'#8957e555' },
          inventory: { label:'STOCK', bg:'#2ea04422', color:'#7ee787', border:'#2ea04455' }
        }[type] || { label:type.toUpperCase(), bg:'#55555522', color:'#8b949e', border:'#55555555' };
        return `<span style="background:${cfg.bg};color:${cfg.color};border:1px solid ${cfg.border};font-size:0.64rem;font-weight:700;padding:2px 8px;border-radius:10px;letter-spacing:.06em;">${cfg.label}</span>`;
      }
      function actionBtn(label, onClick){
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = label;
        b.className = 'rts-sa';
        b.addEventListener('click', onClick);
        return b;
      }
      function goPage(url){ try { const _el=document.getElementById('rtsScanModal'); if(_el&&window.bootstrap) bootstrap.Modal.getOrCreateInstance(_el).hide(); } catch(_e){} window.location.href = url; }

      // Inline history — supports boxes (/api/history/boxes/:id) and items (/api/items/:id/history)
      async function expandHistory(btn, itemId, itemType, card){
        btn.innerHTML = '<span class="spinner-border" style="width:10px;height:10px;border-width:2px;color:#388bfd;vertical-align:middle;"></span>';
        btn.disabled = true;
        try {
          const token = localStorage.getItem('auth_token') || '';
          const url   = itemType === 'box'
            ? `/api/history/boxes/${encodeURIComponent(itemId)}`
            : `/api/items/${encodeURIComponent(itemId)}/history`;
          const r    = await fetch(url, { headers:{ 'Authorization':'Bearer '+token } });
          const data = await r.json();
          const hist = (data.history || []).slice(0, 8);

          if (!hist.length){ btn.textContent = 'No history'; btn.disabled = false; return; }

          const ACTION_LABELS = {
            created:'Box Created', item_added:'Item Packed In', item_removed:'Item Removed',
            box_emptied:'Box Emptied', loaded_to_truck:'Added to Load Plan',
            removed_from_truck:'Removed from Plan', scanned:'Scanned onto Truck',
            unloaded:'Scanned off Truck', location_changed:'Location Changed', status_changed:'Status Changed'
          };
          const ACTION_COLORS = {
            created:'#2ea044', item_added:'#388bfd', item_removed:'#d29922',
            box_emptied:'#f85149', loaded_to_truck:'#2ea044', removed_from_truck:'#6e7681',
            scanned:'#388bfd', unloaded:'#d29922', location_changed:'#bc8cff', status_changed:'#6e7681'
          };

          const wrap = document.createElement('div');
          wrap.style.cssText = 'background:#0d1117;border-radius:6px;padding:10px 12px;margin-top:8px;border:1px solid #21262d;';
          const title = document.createElement('div');
          title.style.cssText = 'font-size:0.68rem;font-weight:700;color:#6e7681;text-transform:uppercase;letter-spacing:.07em;margin-bottom:7px;';
          title.textContent = 'Recent History';
          wrap.appendChild(title);

          hist.forEach((h, i) => {
            const row   = document.createElement('div');
            row.style.cssText = `padding:5px 0;${i < hist.length-1 ? 'border-bottom:1px solid #161b22;' : ''}`;
            const act   = h.action || '—';
            const label = ACTION_LABELS[act] || act;
            const color = ACTION_COLORS[act] || '#8b949e';
            const ts    = h.timestamp ? new Date(h.timestamp).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—';
            const who   = h.user_name || '';
            const truck = h.to_truck_name || h.from_truck_name || '';
            row.innerHTML = `
              <div style="display:flex;align-items:baseline;gap:6px;">
                <span style="width:7px;height:7px;min-width:7px;border-radius:50%;background:${color};display:inline-block;margin-top:3px;flex-shrink:0;"></span>
                <span style="color:#e6edf3;font-size:0.76rem;font-weight:600;flex:1;">${sEsc(label)}</span>
                <span style="color:#6e7681;font-size:0.69rem;white-space:nowrap;">${sEsc(ts)}</span>
              </div>
              ${h.details?`<div style="font-size:0.71rem;color:#8b949e;margin-left:13px;margin-top:1px;">${sEsc(h.details)}</div>`:''}
              ${(who||truck)?`<div style="font-size:0.69rem;color:#6e7681;margin-left:13px;">${truck?sEsc(truck)+(who?' · ':''):''}${who?sEsc(who):''}</div>`:''}
            `;
            wrap.appendChild(row);
          });

          btn.style.display = 'none';
          card.appendChild(wrap);
        } catch(_e){ btn.innerHTML = ''; btn.textContent = 'History unavailable'; btn.disabled = false; }
      }

      function renderScanResults(results, query){
        if (!scanResultsEl) return;
        Array.from(scanResultsEl.children).forEach(c => { if (c.id !== 'rtsScanEmpty') c.remove(); });
        if (!results || !results.length){
          if (scanEmpty){
            scanEmpty.style.display='';
            scanEmpty.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#30363d" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:block;margin:0 auto 10px;"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>'
              + `<div style="font-size:0.9rem;">No results for <strong style="color:#e6edf3;">${sEsc(query)}</strong></div>`
              + '<div style="font-size:0.75rem;margin-top:5px;color:#6e7681;">This item may only exist locally — try Box Packing or Assets</div>';
          }
          return;
        }
        if (scanEmpty) scanEmpty.style.display = 'none';

        results.forEach(({ type, record: r }) => {
          const card = document.createElement('div');
          card.style.cssText = 'background:#161b22;border:1px solid #30363d;border-radius:8px;padding:14px 16px;margin-bottom:10px;';

          let subHtml='', metaHtml='', nameStr='';
          if (type === 'box') {
            nameStr  = r.name || r.barcode || '—';
            const truckSpan  = r.truck_name  ? ` <span style="color:#58a6ff;font-weight:600;">· on ${sEsc(r.truck_name)}</span>` : '';
            const driverSpan = r.driver_name ? ` <span style="color:#8b949e;">· ${sEsc(r.driver_name)}</span>` : '';
            subHtml  = (r.barcode?`<span style="font-family:monospace;font-size:0.77rem;color:#8b949e;background:#0d1117;padding:1px 6px;border-radius:3px;margin-right:5px;">${sEsc(r.barcode)}</span>`:'')
              + statusBadge(r.status)
              + (r.item_count!=null?` <span style="font-size:0.74rem;color:#6e7681;margin-left:4px;">${r.item_count} item${r.item_count!==1?'s':''}</span>`:'');
            metaHtml = `<div style="font-size:0.77rem;margin-top:4px;color:#8b949e;">${r.location_name?sEsc(r.location_name):'No location'}${truckSpan}${driverSpan}</div>`;
          } else if (type === 'item') {
            nameStr  = r.name || '—';
            const locTxt    = r.box_name ? `In box: ${sEsc(r.box_name)}` : (r.location_name ? sEsc(r.location_name) : 'No location');
            const staffSpan = r.assigned_staff_name ? ` <span>· ${sEsc(r.assigned_staff_name)}</span>` : '';
            subHtml  = (r.barcode?`<span style="font-family:monospace;font-size:0.77rem;color:#8b949e;background:#0d1117;padding:1px 6px;border-radius:3px;margin-right:5px;">${sEsc(r.barcode)}</span>`:'')
              + statusBadge(r.status)
              + (r.item_type?` <span style="font-size:0.74rem;color:#6e7681;margin-left:4px;text-transform:capitalize;">${sEsc(r.item_type)} · ${sEsc(r.category||'—')}</span>`:'');
            metaHtml = `<div style="font-size:0.77rem;margin-top:4px;color:#8b949e;">${locTxt}${staffSpan}</div>`;
          } else {
            nameStr  = r.name || '—';
            subHtml  = r.sku ? `<span style="font-family:monospace;font-size:0.77rem;color:#8b949e;background:#0d1117;padding:1px 6px;border-radius:3px;">SKU: ${sEsc(r.sku)}</span>` : '';
            metaHtml = `<div style="font-size:0.77rem;margin-top:4px;color:#8b949e;">${r.location_name?sEsc(r.location_name):'No location'} <span style="color:#2ea044;font-weight:700;margin-left:6px;">Qty: ${r.quantity!=null?r.quantity:'—'}${r.quantity_unit?' '+sEsc(r.quantity_unit):''}</span></div>`;
          }

          card.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
              ${typePill(type)}
              <span style="font-size:0.93rem;font-weight:700;color:#c9d1d9;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${sEsc(nameStr)}">${sEsc(nameStr)}</span>
            </div>
            ${subHtml?`<div style="margin-bottom:3px;">${subHtml}</div>`:''}
            ${metaHtml}
            <div class="rts-scan-actions" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;"></div>
          `;

          const act = card.querySelector('.rts-scan-actions');
          if (type === 'box') {
            act.appendChild(actionBtn('Box Packing',  () => goPage('box-packing.html')));
            act.appendChild(actionBtn('Load Plan',    () => goPage('load.html')));
            act.appendChild(actionBtn('Scan to Load', () => goPage('scan-load.html')));
            if (r.barcode){
              act.appendChild(actionBtn('Print Label', () => {
                const qr  = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(r.barcode)}&size=140x140`;
                const win = window.open('','_blank','width=420,height=300,toolbar=0,menubar=0');
                if (!win) return;
                win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Label</title>
                  <style>body{margin:0;display:flex;flex-direction:column;align-items:center;font-family:monospace;padding:16px;}
                  img{max-width:140px;margin:6px 0;}h2{font-size:1.4rem;margin:4px 0;}p{font-size:0.9rem;margin:2px 0;color:#555;}</style>
                  </head><body><img src="${qr}"/><h2>${sEsc(r.barcode)}</h2><p>${sEsc(r.name)}</p>
                  <script>window.onload=function(){window.print();}` + `<\/script></body></html>`);
                win.document.close();
              }));
            }
            const histBtnBox = actionBtn('History', () => expandHistory(histBtnBox, r.id, 'box', card));
            act.appendChild(histBtnBox);
          } else if (type === 'item') {
            act.appendChild(actionBtn('View in Assets', () => goPage('assets.html')));
            act.appendChild(actionBtn('Box Packing',    () => goPage('box-packing.html')));
            const histBtnItem = actionBtn('History', () => expandHistory(histBtnItem, r.id, 'item', card));
            act.appendChild(histBtnItem);
          } else {
            act.appendChild(actionBtn('View Stock',  () => goPage('inventory.html')));
            act.appendChild(actionBtn('Box Packing', () => goPage('box-packing.html')));
          }

          scanResultsEl.insertBefore(card, scanEmpty);
        });
      }

      async function doScan(q){
        if (!q) return;
        if (scanSpinner) scanSpinner.style.display = '';
        if (scanEmpty){
          scanEmpty.style.display='';
          scanEmpty.innerHTML = '<span class="spinner-border" style="width:20px;height:20px;border-width:2px;color:#388bfd;"></span><div style="font-size:0.88rem;margin-top:10px;color:#8b949e;">Searching…</div>';
        }
        Array.from(scanResultsEl.children).forEach(c => { if (c.id !== 'rtsScanEmpty') c.remove(); });
        try {
          const token = localStorage.getItem('auth_token') || '';
          const resp  = await fetch(`/api/lookup?q=${encodeURIComponent(q)}`, { headers:{'Authorization':'Bearer '+token} });
          const data  = await resp.json();
          renderScanResults(data.results || [], q);
        } catch(_e){
          if (scanEmpty){ scanEmpty.style.display=''; scanEmpty.innerHTML='<div style="font-size:0.88rem;color:#f85149;">Lookup failed — check connection</div>'; }
        } finally {
          if (scanSpinner) scanSpinner.style.display = 'none';
        }
      }

      let scanDebounce = null;
      if (scanInput){
        // Enter: fire immediately (barcode scanners always append Enter)
        scanInput.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          clearTimeout(scanDebounce);
          const q = scanInput.value.trim();
          if (q) doScan(q);
        });
        // Live typing: debounced 380ms
        scanInput.addEventListener('input', () => {
          clearTimeout(scanDebounce);
          const q = scanInput.value.trim();
          if (q.length >= 2) scanDebounce = setTimeout(() => doScan(q), 380);
        });
      }

      // Reset state every time the modal opens
      if (scanModalEl){
        scanModalEl.addEventListener('show.bs.modal', () => {
          if (scanInput) scanInput.value = '';
          if (scanEmpty){
            scanEmpty.style.display='';
            scanEmpty.innerHTML = '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#30363d" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" style="display:block;margin:0 auto 10px;"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3"/><path d="M17 17v3h3"/><path d="M14 20h3"/></svg><div style="font-size:0.88rem;">Ready to scan</div>';
          }
          Array.from(scanResultsEl.children).forEach(c => { if (c.id !== 'rtsScanEmpty') c.remove(); });
          if (scanSpinner) scanSpinner.style.display = 'none';
        });
        scanModalEl.addEventListener('shown.bs.modal', () => { if (scanInput) scanInput.focus(); });
      }

    } catch(_e) { /* non-fatal */ }
    // ── Live Timing ──────────────────────────────────────────────────────────
    try {
      function getLtSettings() {
        try {
          const s = window.RTS && typeof RTS.getSettings === 'function' ? RTS.getSettings() : {};
          return s.liveTiming || null;
        } catch(e) { return null; }
      }

      function ltStatusInfo(status) {
        // Custom SVG icons — no generic emoji
        const flagSvg    = `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" style="vertical-align:-2px;margin-right:4px"><rect x="2" y="1" width="5" height="5" fill="#fff"/><rect x="7" y="1" width="5" height="5" fill="#222"/><rect x="2" y="6" width="5" height="5" fill="#222"/><rect x="7" y="6" width="5" height="5" fill="#fff"/><line x1="2" y1="1" x2="2" y2="15" stroke="#fff" stroke-width="1.5"/></svg>`;
        const raceSvg    = `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" style="vertical-align:-2px;margin-right:4px"><polygon points="8,2 14,12 2,12" fill="none" stroke="#22c55e" stroke-width="1.8"/><circle cx="8" cy="8" r="2" fill="#22c55e"/></svg>`;
        const stopwatchSvg = `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" style="vertical-align:-2px;margin-right:4px"><circle cx="8" cy="9" r="5.5" stroke="#f59e0b" stroke-width="1.5"/><line x1="8" y1="3.5" x2="8" y2="6.5" stroke="#f59e0b" stroke-width="1.5"/><line x1="6" y1="1.5" x2="10" y2="1.5" stroke="#f59e0b" stroke-width="1.5"/></svg>`;
        const pauseSvg   = `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" style="vertical-align:-2px;margin-right:4px"><rect x="3" y="3" width="3.5" height="10" rx="1" fill="rgba(255,255,255,0.55)"/><rect x="9.5" y="3" width="3.5" height="10" rx="1" fill="rgba(255,255,255,0.55)"/></svg>`;
        switch(status) {
          case 'racing':     return { dot: 'rts-lt-dot--racing',     label: raceSvg,       labelText: 'RACE' };
          case 'qualifying': return { dot: 'rts-lt-dot--qualifying', label: stopwatchSvg,  labelText: 'QUALI' };
          case 'practice':   return { dot: 'rts-lt-dot--qualifying', label: stopwatchSvg,  labelText: 'PRACTICE' };
          case 'finished':   return { dot: 'rts-lt-dot--finished',   label: flagSvg,       labelText: 'FINISHED' };
          case 'paused':     return { dot: 'rts-lt-dot--qualifying', label: pauseSvg,      labelText: 'PAUSED' };
          default:           return { dot: 'rts-lt-dot--waiting',    label: pauseSvg,      labelText: 'Waiting' };
        }
      }

      let ltTickerMode = 'all';
      let ltAnimTimer = null;

      function renderLtTicker(state) {
        const ltCfg = getLtSettings();
        const rowEl   = document.getElementById('rtsLtRow');
        const badgeEl = document.getElementById('rtsLtBadge');
        const dotEl   = document.getElementById('rtsLtDot');
        const badgeTxtEl = document.getElementById('rtsLtBadgeText');
        const statusEl   = document.getElementById('rtsLtStatus');
        const innerEl    = document.getElementById('rtsLtInner');
        const toggleEl   = document.getElementById('rtsLtToggle');
        const extLinkEl  = document.getElementById('rtsLtExtLink');
        if (!rowEl) return;

        // If error === 'live' (all connection methods failed), show an open-timing link
        if (state.error === 'live' && ltCfg && ltCfg.url) {
          if (extLinkEl) { extLinkEl.href = ltCfg.url; extLinkEl.style.display = ''; }
          if (badgeEl && ltCfg.showBadge !== false) {
            badgeEl.style.display = '';
            if (dotEl) { dotEl.className = 'rts-lt-dot rts-lt-dot--waiting'; }
            if (badgeTxtEl) badgeTxtEl.textContent = 'Live ↗';
            badgeEl.style.cursor = 'pointer';
            badgeEl.title = 'Open timing page';
            badgeEl.onclick = () => window.open(ltCfg.url, '_blank', 'noopener');
          }
          if (ltCfg.showTicker !== false) {
            rowEl.style.display = '';
            if (statusEl) statusEl.textContent = '⏸ Connecting…';
            if (innerEl) innerEl.textContent = 'Unable to connect to live timing data. Open timing page for live results.';
            document.documentElement.style.setProperty('--rts-topbar-h', '108px');
          }
          return;
        }

        if (extLinkEl && ltCfg && ltCfg.url) { extLinkEl.href = ltCfg.url; extLinkEl.style.display = state.connected ? '' : 'none'; }

        const info  = ltStatusInfo(state.status);
        const hasData = state.drivers && state.drivers.length > 0;

        // Row 1 badge
        if (badgeEl && ltCfg && ltCfg.showBadge !== false) {
          badgeEl.style.display = '';
          if (dotEl) dotEl.className = `rts-lt-dot ${info.dot}`;
          if (badgeTxtEl) {
            let badgeTxt = info.labelText;
            if (state.classOnTrack) badgeTxt += ' · ' + state.classOnTrack;
            // Find our best position
            if (state.ourDrivers && state.ourDrivers.length) {
              const best = state.ourDrivers.reduce((a,b) => (a.pos||99) <= (b.pos||99) ? a : b);
              badgeTxt += ' · P' + best.pos;
            }
            if (state.laps && state.totalLaps) badgeTxt += ` · Lap ${state.laps}/${state.totalLaps}`;
            else if (state.timeRemaining) badgeTxt += ` · ${state.timeRemaining}`;
            badgeTxtEl.innerHTML = info.label + badgeTxt;
          }
        } else if (badgeEl) {
          badgeEl.style.display = 'none';
        }

        // Ticker strip
        // After a race finishes, show final results for 5 minutes then auto-hide
        if (state.status === 'finished') {
          if (!renderLtTicker._finishedAt) renderLtTicker._finishedAt = Date.now();
          if (Date.now() - renderLtTicker._finishedAt > 5 * 60 * 1000) {
            rowEl.style.display = 'none';
            document.documentElement.style.setProperty('--rts-topbar-h', '84px');
            return;
          }
        } else {
          renderLtTicker._finishedAt = null;
        }

        if (!ltCfg || ltCfg.showTicker === false || (!hasData && state.status === 'waiting' && !state.connected)) {
          rowEl.style.display = 'none';
          document.documentElement.style.setProperty('--rts-topbar-h', '84px');
          return;
        }

        rowEl.style.display = '';
        document.documentElement.style.setProperty('--rts-topbar-h', '108px');

        if (statusEl) {
          let sText = info.labelText;
          if (state.status === 'finished') {
            sText = 'Final Results';
            if (state.classOnTrack) sText += ' · ' + state.classOnTrack;
          } else {
            if (state.classOnTrack) sText += ' · ' + state.classOnTrack;
            if (state.laps && state.totalLaps) sText += ` · Lap ${state.laps}/${state.totalLaps}`;
            else if (state.timeRemaining) sText += ` · ${state.timeRemaining}`;
          }
          statusEl.innerHTML = info.label + sText;
        }

        if (toggleEl) toggleEl.textContent = ltTickerMode === 'ours' ? 'Ours' : 'All';

        if (innerEl && hasData) {
          const source = ltTickerMode === 'ours'
            ? (state.ourDrivers.length ? state.ourDrivers : state.drivers)
            : state.drivers;

          const items = source.map(d => {
            const pos  = d.pos ? `P${d.pos}` : '';
            const pit  = d.inPit ? ' 🛑' : '';
            const kart = d.kart ? ` #${d.kart}` : '';
            // Show last lap (current pace) during race; fall back to best lap
            const lap  = d.lastLap || d.bestLap || '';
            // Gap: suppress for P1; no + prefix; "N Laps" shown as-is
            let gap = '';
            if (d.gap && d.pos !== 1) {
              gap = /lap/i.test(d.gap) ? ` ${d.gap}` : ` +${d.gap}`;
            }
            const kartBold = d.kart ? ` <b>#${d.kart}</b>` : '';
            if (d.isOurs) {
              return `<span class="rts-lt-item rts-lt-ours" style="--lt-color:${d.ourColor||'#ffd700'}">★ ${pos} ${d.name}${kartBold}${gap}${pit}</span>`;
            }
            return `<span class="rts-lt-item">${pos} ${d.name}${kartBold}${gap}${pit}</span>`;
          }).join('<span class="rts-lt-sep"> &nbsp;│&nbsp; </span>');

          // Structural key = pos+name+kart (drives animation restart)
          // Live values (lap times, gaps) update innerHTML without restarting scroll
          const structKey = source.map(d => `${d.pos}|${d.name}|${d.kart}`).join(',');
          const contentChanged = innerEl.dataset.lastContent !== items;
          const structChanged  = innerEl.dataset.lastStruct  !== structKey;

          if (contentChanged) {
            innerEl.dataset.lastContent = items;
            innerEl.innerHTML = items;
          }
          if (structChanged) {
            innerEl.dataset.lastStruct = structKey;
            // Restart scroll animation only when driver list structure changes
            innerEl.classList.remove('rts-lt-scroll');
            void innerEl.offsetWidth; // force reflow
            innerEl.classList.add('rts-lt-scroll');
            const charCount = innerEl.textContent.length;
            const duration = Math.max(20, Math.min(120, charCount * 0.18));
            innerEl.style.animationDuration = duration + 's';
          }
        } else if (innerEl && !hasData) {
          innerEl.textContent = state.connected ? 'Waiting for timing data…' : 'Connecting to live timing…';
          innerEl.innerHTML = innerEl.textContent;
        }
      }

      function initLiveTiming() {
        // Fetch settings from DB first (so Apex URL set by any user/device is picked up),
        // then start live timing with the fresh config.
        const tryStart = () => {
          const ltCfg = getLtSettings();
          if (!ltCfg || !ltCfg.enabled || !ltCfg.url) return;

          // Dynamically load live-timing.js if not already present
          if (!window.RTSLiveTiming) {
            const script = document.createElement('script');
            // Resolve path relative to topnav.js location
            const base = (() => {
              try {
                const scripts = Array.from(document.querySelectorAll('script[src]'));
                const topnavScript = scripts.find(s => /topnav\.js/.test(s.src));
                if (topnavScript) {
                  const u = new URL(topnavScript.src);
                  return u.origin + u.pathname.replace(/topnav\.js.*$/, '');
                }
              } catch(e) {}
              return '';
            })();
            script.src = base + 'live-timing.js?v=20260424-5';
            script.onload = () => {
              if (!window.RTSLiveTiming) return;
              RTSLiveTiming.onUpdate(renderLtTicker);
              RTSLiveTiming.start(ltCfg);
              // Restore persisted ticker mode
              try { ltTickerMode = localStorage.getItem('rts.lt.tickerMode') || ltCfg.tickerMode || 'all'; } catch(e){}
            };
            document.head.appendChild(script);
          } else {
            RTSLiveTiming.onUpdate(renderLtTicker);
            RTSLiveTiming.start(ltCfg);
            try { ltTickerMode = localStorage.getItem('rts.lt.tickerMode') || ltCfg.tickerMode || 'all'; } catch(e){}
          }

          // Toggle button: cycle All ↔ Ours
          const toggleEl = document.getElementById('rtsLtToggle');
          if (toggleEl) {
            toggleEl.addEventListener('click', () => {
              ltTickerMode = ltTickerMode === 'all' ? 'ours' : 'all';
              try { localStorage.setItem('rts.lt.tickerMode', ltTickerMode); } catch(e) {}
              toggleEl.textContent = ltTickerMode === 'ours' ? 'Ours' : 'All';
              if (window.RTSLiveTiming) renderLtTicker(RTSLiveTiming.state);
            });
          }

          // Pause scroll on hover
          const trackEl = document.getElementById('rtsLtTrack');
          if (trackEl) {
            trackEl.addEventListener('mouseenter', () => {
              const innerEl = document.getElementById('rtsLtInner');
              if (innerEl) innerEl.classList.add('rts-lt-paused');
            });
            trackEl.addEventListener('mouseleave', () => {
              const innerEl = document.getElementById('rtsLtInner');
              if (innerEl) innerEl.classList.remove('rts-lt-paused');
            });
          }
        }; // end tryStart

        // Pull latest settings from DB (merges liveTiming URL into localStorage),
        // then start. Fall back to cached localStorage immediately if DB call fails/slow.
        tryStart(); // start immediately with cached settings
        if (window.RTS && typeof RTS.syncSettingsFromDB === 'function') {
          RTS.syncSettingsFromDB().then(() => {
            // If live timing wasn't running yet (no cached URL), try again with DB value
            if (!window.RTSLiveTiming || !RTSLiveTiming.state.connected) tryStart();
          }).catch(() => {});
        }
      }

      initLiveTiming();
    } catch(_e) { /* live timing non-fatal */ }

    // ── Spacebar → scanner (standalone — never swallowed by scanner init errors) ──
    try {
      document.addEventListener('keydown', function rtsScanSpaceHandler(ev) {
        if (ev.key !== ' ') return;
        if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
        const ae  = document.activeElement;
        const tag = (ae && ae.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || (ae && ae.isContentEditable)) return;
        // Don't open scanner if another Bootstrap modal is already visible
        if (document.querySelector('.modal.show')) return;
        ev.preventDefault();
        const el = document.getElementById('rtsScanModal');
        if (!el) return;
        if (!window.bootstrap) return;
        try { bootstrap.Modal.getOrCreateInstance(el).show(); } catch(_e2) {}
      });
    } catch(_e) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
