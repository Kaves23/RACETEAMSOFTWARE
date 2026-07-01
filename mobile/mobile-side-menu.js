// mobile-side-menu.js — single source of truth for mobile navigation.
// Renders a grouped slide-in menu that only lists pages with a dedicated,
// mobile-optimised version. Also rebuilds the bottom bar (Dashboard · Log Trip ·
// Menu) and remembers the last visited page so the app can resume there.
(function () {
  'use strict';

  // ── Remember last visited page (used by the login screen to resume) ─────────
  (function trackLastPage() {
    try {
      var file = (window.location.pathname.split('/').pop() || '').toLowerCase();
      if (file && file !== 'index.html') localStorage.setItem('mobile_last_page', file);
    } catch (e) { /* ignore */ }
  })();

  function svg(paths) {
    return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + paths + '</svg>';
  }

  var ICON = {
    dashboard: svg('<path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"/><polyline points="9 21 9 12 15 12 15 21"/>'),
    load:      svg('<rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 3v5h-7"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>'),
    boxes:     svg('<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>'),
    vehicles:  svg('<path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3"/><rect x="9" y="11" width="14" height="10" rx="1"/><circle cx="12" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>'),
    inventory: svg('<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>'),
    assets:    svg('<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>'),
    tasks:     svg('<line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4.5" cy="6" r="1.5"/><circle cx="4.5" cy="12" r="1.5"/><circle cx="4.5" cy="18" r="1.5"/>'),
    scan:      svg('<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/>'),
    events:    svg('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>'),
    calendar:  svg('<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>'),
    entries:   svg('<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>'),
    track:     svg('<path d="M3 17c3-6 7-10 11-10 2.5 0 4 1.5 4 3.5 0 3-3 3.5-3 6.5 0 1.5.7 2.4 2 3"/><circle cx="7" cy="17" r="1.2"/><circle cx="18" cy="20" r="1.2"/>'),
    control:   svg('<path d="M12 3l8 4v6c0 5-3.5 7.5-8 8-4.5-.5-8-3-8-8V7l8-4z"/><path d="M12 8v5"/><path d="M12 16h.01"/>'),
    weather:   svg('<path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25"/><line x1="8" y1="19" x2="8.01" y2="19"/><line x1="16" y1="19" x2="16.01" y2="19"/><line x1="12" y1="21" x2="12.01" y2="21"/>'),
    strategy:  svg('<path d="M3 3v18h18"/><path d="M7 14l3-3 3 2 5-6"/>'),
    f1:        svg('<path d="M4 19V9"/><path d="M4 19h16"/><path d="M8 15l3-3 2 2 5-6"/>'),
    pipeline:  svg('<path d="M2 9l10-5 10 5-10 5-10-5z"/><path d="M6 11.5v4.5c0 1.6 2.7 3 6 3s6-1.4 6-3v-4.5"/>'),
    reports:   svg('<line x1="4" y1="19" x2="20" y2="19"/><rect x="5" y="11" width="3" height="6"/><rect x="10" y="8" width="3" height="9"/><rect x="15" y="5" width="3" height="12"/>'),
    data:      svg('<circle cx="8" cy="8" r="2"/><circle cx="16" cy="8" r="2"/><circle cx="8" cy="16" r="2"/><circle cx="16" cy="16" r="2"/><line x1="10" y1="8" x2="14" y2="8"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="16" y1="10" x2="16" y2="14"/><line x1="10" y1="16" x2="14" y2="16"/>'),
    grid:      svg('<path d="M3 3h7v7H3z"/><path d="M14 3h7v5h-7z"/><path d="M14 12h7v9h-7z"/><path d="M3 14h7v7H3z"/>'),
    list:      svg('<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1.5"/><circle cx="4" cy="12" r="1.5"/><circle cx="4" cy="18" r="1.5"/>'),
    gantt:     svg('<line x1="3" y1="5" x2="21" y2="5"/><rect x="4" y="8" width="9" height="3" rx="1"/><rect x="8" y="14" width="8" height="3" rx="1"/><line x1="3" y1="20" x2="21" y2="20"/>'),
    milestone: svg('<path d="M12 3l4 9-4 9-4-9 4-9z"/>'),
    workload:  svg('<path d="M3 5h18"/><path d="M3 12h18"/><path d="M3 19h18"/><rect x="4" y="4" width="4" height="2" rx="1"/><rect x="10" y="11" width="8" height="2" rx="1"/><rect x="7" y="18" width="12" height="2" rx="1"/>'),
    runbooks:  svg('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'),
    drivers:   svg('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>'),
    practice:  svg('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M9 16l2 2 4-4"/>'),
    logtrip:   svg('<path d="M3 10l1-3a2 2 0 0 1 1.9-1.4h12.2A2 2 0 0 1 20 7l1 3v7H3v-7z"/><circle cx="7" cy="17" r="1.5"/><circle cx="17" cy="17" r="1.5"/><line x1="9" y1="17" x2="15" y2="17"/>'),
    menu:      svg('<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>')
  };

  // Only dedicated, mobile-optimised pages are listed here.
  var MENU = [
    { home: true, label: 'Dashboard', href: 'dashboard.html', icon: ICON.dashboard },
    { section: 'Logistics', items: [
      { label: 'Load Plan',     href: 'load.html',      icon: ICON.load },
      { label: 'Boxes',         href: 'boxes.html',     icon: ICON.boxes },
      { label: 'Inventory',     href: 'inventory.html', icon: ICON.inventory },
      { label: 'Assets',        href: 'assets.html',    icon: ICON.assets },
      { label: 'Vehicles',      href: 'vehicles.html',  icon: ICON.vehicles },
      { label: 'Lists & Tasks', href: 'tasks.html',     icon: ICON.tasks },
      { label: 'Scan',          href: 'scan.html',      icon: ICON.scan }
    ]},
    { section: 'Sporting', items: [
      { label: 'Events',        href: 'events.html',            icon: ICON.events },
      { label: 'Calendar',      href: 'sporting-calendar.html', icon: ICON.calendar },
      { label: 'Entries',       href: 'entries.html',           icon: ICON.entries },
      { label: 'Track Map',     href: 'track-map.html',         icon: ICON.track },
      { label: 'Race Control',  href: 'race-control.html',      icon: ICON.control },
      { label: 'Weather',       href: 'weather.html',           icon: ICON.weather },
      { label: 'Race Strategy', href: 'race-strategy.html',     icon: ICON.strategy },
      { label: 'F1 Live',       href: 'f1-live.html',           icon: ICON.f1 }
    ]},
    { section: 'Academy', items: [
      { label: 'Pipeline', href: 'academy-pipeline.html', icon: ICON.pipeline },
      { label: 'Sessions', href: 'academy-sessions.html', icon: ICON.events },
      { label: 'Reports',  href: 'academy-reports.html',  icon: ICON.reports },
      { label: 'Data',     href: 'academy-data.html',     icon: ICON.data }
    ]},
    { section: 'Projects', items: [
      { label: 'Overview',   href: 'projects-dashboard.html', icon: ICON.grid },
      { label: 'Projects',   href: 'projects-list.html',      icon: ICON.list },
      { label: 'Gantt',      href: 'projects-gantt.html',     icon: ICON.gantt },
      { label: 'Tasks',      href: 'tasks.html',              icon: ICON.tasks },
      { label: 'Milestones', href: 'milestones.html',         icon: ICON.milestone },
      { label: 'Workload',   href: 'projects-workload.html',  icon: ICON.workload },
      { label: 'Reports',    href: 'projects-reports.html',   icon: ICON.reports },
      { label: 'Runbooks',   href: 'runbooks.html',           icon: ICON.runbooks }
    ]},
    { section: 'Driver', items: [
      { label: 'Drivers',           href: 'drivers.html',           icon: ICON.drivers },
      { label: 'Practice Tracking', href: 'practice-tracking.html', icon: ICON.practice }
    ]}
  ];

  function currentFile() {
    return (window.location.pathname.split('/').pop() || '').toLowerCase();
  }
  function fileOf(href) {
    return (String(href).split('/').pop().split('?')[0] || '').toLowerCase();
  }

  function linkHTML(item, active) {
    return '<a class="mobile-side-link' + (active ? ' active' : '') + '" href="' + item.href + '">' +
      '<span class="mobile-side-link-icon" aria-hidden="true">' + item.icon + '</span>' +
      '<span class="mobile-side-link-label">' + item.label + '</span></a>';
  }

  function buildDrawer() {
    var here = currentFile();

    var overlay = document.createElement('div');
    overlay.className = 'mobile-side-overlay';

    var drawer = document.createElement('aside');
    drawer.className = 'mobile-side-drawer';
    drawer.setAttribute('aria-hidden', 'true');

    var header = document.createElement('div');
    header.className = 'mobile-side-header';
    header.innerHTML =
      '<div class="mobile-side-title">Menu</div>' +
      '<button class="mobile-side-close" type="button" aria-label="Close menu">&times;</button>';

    var list = document.createElement('nav');
    list.className = 'mobile-side-list';

    var html = '';
    MENU.forEach(function (entry) {
      if (entry.home) {
        html += linkHTML(entry, fileOf(entry.href) === here);
      } else if (entry.section) {
        html += '<div class="mobile-side-section">' + entry.section + '</div>';
        entry.items.forEach(function (item) {
          html += linkHTML(item, fileOf(item.href) === here);
        });
      }
    });
    list.innerHTML = html;

    drawer.appendChild(header);
    drawer.appendChild(list);
    document.body.appendChild(overlay);
    document.body.appendChild(drawer);

    return { overlay: overlay, drawer: drawer, closeBtn: header.querySelector('.mobile-side-close') };
  }

  function openMenu(p) {
    p.overlay.classList.add('open');
    p.drawer.classList.add('open');
    p.drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('mobile-side-open');
  }
  function closeMenu(p) {
    p.overlay.classList.remove('open');
    p.drawer.classList.remove('open');
    p.drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('mobile-side-open');
  }

  function navBtn(label, href, icon, active) {
    var a = document.createElement('a');
    a.className = 'nav-item' + (active ? ' active' : '');
    a.href = href;
    a.innerHTML = '<span class="nav-icon">' + icon + '</span>' +
      '<span class="nav-label">' + label + '</span><div class="nav-dot"></div>';
    return a;
  }

  function init() {
    var navBar = document.querySelector('.app-nav .nav-bar');
    if (!navBar) return;

    var here = currentFile();
    var parts = buildDrawer();

    // Rebuild the bottom bar into three consistent slots.
    navBar.innerHTML = '';
    navBar.appendChild(navBtn('Dashboard', 'dashboard.html', ICON.dashboard, here === 'dashboard.html'));
    navBar.appendChild(navBtn('Log Trip', 'vehicles.html?log=1', ICON.logtrip, false));

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'nav-item nav-item-menu';
    trigger.innerHTML = '<span class="nav-icon">' + ICON.menu + '</span>' +
      '<span class="nav-label">Menu</span><div class="nav-dot"></div>';
    navBar.appendChild(trigger);

    trigger.addEventListener('click', function () { openMenu(parts); });
    parts.overlay.addEventListener('click', function () { closeMenu(parts); });
    parts.closeBtn.addEventListener('click', function () { closeMenu(parts); });
    parts.drawer.addEventListener('click', function (e) {
      if (e.target.closest('.mobile-side-link')) closeMenu(parts);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMenu(parts);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
