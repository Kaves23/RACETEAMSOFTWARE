(function () {
  'use strict';

  function buildMenuItem(link) {
    var href = link.getAttribute('href') || '#';
    var labelEl = link.querySelector('.nav-label');
    var iconEl = link.querySelector('.nav-icon');
    var label = labelEl ? labelEl.textContent.trim() : 'Link';
    var iconHTML = iconEl ? iconEl.innerHTML : '';
    var isActive = link.classList.contains('active');

    var a = document.createElement('a');
    a.className = 'mobile-side-link' + (isActive ? ' active' : '');
    a.href = href;
    a.innerHTML =
      '<span class="mobile-side-link-icon" aria-hidden="true">' + iconHTML + '</span>' +
      '<span class="mobile-side-link-label">' + label + '</span>';

    return a;
  }

  function createDrawer(allItems) {
    var overlay = document.createElement('div');
    overlay.className = 'mobile-side-overlay';

    var drawer = document.createElement('aside');
    drawer.className = 'mobile-side-drawer';
    drawer.setAttribute('aria-hidden', 'true');

    var header = document.createElement('div');
    header.className = 'mobile-side-header';
    header.innerHTML =
      '<div class="mobile-side-title">Navigation</div>' +
      '<button class="mobile-side-close" type="button" aria-label="Close menu">&times;</button>';

    var list = document.createElement('nav');
    list.className = 'mobile-side-list';

    allItems.forEach(function (item) {
      list.appendChild(buildMenuItem(item));
    });

    drawer.appendChild(header);
    drawer.appendChild(list);

    document.body.appendChild(overlay);
    document.body.appendChild(drawer);

    return { overlay: overlay, drawer: drawer, closeBtn: header.querySelector('.mobile-side-close') };
  }

  function openMenu(parts) {
    parts.overlay.classList.add('open');
    parts.drawer.classList.add('open');
    parts.drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('mobile-side-open');
  }

  function closeMenu(parts) {
    parts.overlay.classList.remove('open');
    parts.drawer.classList.remove('open');
    parts.drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('mobile-side-open');
  }

  function initMobileSideMenu() {
    var navBar = document.querySelector('.app-nav .nav-bar');
    if (!navBar) return;

    var navItems = Array.prototype.slice.call(navBar.querySelectorAll('.nav-item'));
    if (navItems.length < 6) return;

    var keepCount = 4;
    if (document.getElementById('navLogistics') && document.getElementById('navSporting') && document.getElementById('navProjects')) {
      // Keep browse tabs visible on browse page.
      keepCount = 5;
    }

    var kept = navItems.slice(0, keepCount);
    var drawerParts = createDrawer(navItems);

    while (navBar.firstChild) {
      navBar.removeChild(navBar.firstChild);
    }

    kept.forEach(function (item) {
      navBar.appendChild(item);
    });

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'nav-item nav-item-menu';
    trigger.innerHTML =
      '<span class="nav-icon" aria-hidden="true">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>' +
      '</span>' +
      '<span class="nav-label">Menu</span>' +
      '<div class="nav-dot"></div>';

    navBar.appendChild(trigger);

    trigger.addEventListener('click', function () {
      openMenu(drawerParts);
    });

    drawerParts.overlay.addEventListener('click', function () {
      closeMenu(drawerParts);
    });

    drawerParts.closeBtn.addEventListener('click', function () {
      closeMenu(drawerParts);
    });

    drawerParts.drawer.addEventListener('click', function (event) {
      var link = event.target.closest('.mobile-side-link');
      if (link) {
        closeMenu(drawerParts);
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        closeMenu(drawerParts);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileSideMenu);
  } else {
    initMobileSideMenu();
  }
})();
