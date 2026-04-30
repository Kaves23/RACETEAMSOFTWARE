/* ─────────────────────────────────────────────────────────────────────────────
   Race Team OS · Mobile Service Worker
   Cache: ONLY static assets (css/js). HTML pages always fetched from network.
   ───────────────────────────────────────────────────────────────────────────── */

var CACHE_NAME = 'rts-mobile-v16';
var DATA_CACHE = 'rts-offline-data'; // persists across SW version bumps
// Only cache static assets — NEVER HTML pages (they change with every deploy)
var SHELL_FILES = [
  '/mobile/mobile.css',
  '/mobile/mobile-auth.js'
];

// ── Install: pre-cache shell files ─────────────────────────────────────────
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(SHELL_FILES);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

// ── Activate: clean up old caches ──────────────────────────────────────────
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME && k !== DATA_CACHE; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// ── Fetch: routing strategy ────────────────────────────────────────────────
self.addEventListener('fetch', function(event) {
  var url = new URL(event.request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  // Never intercept non-GET requests — Cache API only supports GET
  if (event.request.method !== 'GET') return;

  var path = url.pathname;

  // API GET routes: network-first, store in persistent data cache, fall back to data cache
  if (path.startsWith('/api/') && event.request.method === 'GET') {
    event.respondWith(apiNetworkFirst(event.request));
    return;
  }

  // HTML pages: always network, no caching (so deploys are instant)
  if (path.endsWith('.html') || path === '/mobile/' || path === '/') {
    return; // Let browser handle normally
  }

  // Static assets (css, js): cache-first
  if (SHELL_FILES.indexOf(path) !== -1) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Everything else: network-first with cache fallback
  event.respondWith(networkFirst(event.request));
});

// ── Strategy: API network-first (data cache) ──────────────────────────────
function apiNetworkFirst(request) {
  return fetch(request.clone()).then(function(response) {
    if (response && response.status === 200) {
      var clone = response.clone();
      caches.open(DATA_CACHE).then(function(cache) {
        cache.put(request, clone);
      });
    }
    return response;
  }).catch(function() {
    return caches.open(DATA_CACHE).then(function(cache) {
      return cache.match(request);
    });
  });
}

// ── Strategy: stale-while-revalidate ──────────────────────────────────────
function staleWhileRevalidate(request) {
  return caches.open(CACHE_NAME).then(function(cache) {
    return cache.match(request).then(function(cached) {
      var networkFetch = fetch(request.clone()).then(function(response) {
        if (response && response.status === 200) {
          cache.put(request, response.clone());
        }
        return response;
      }).catch(function() { return null; });

      return cached || networkFetch;
    });
  });
}

// ── Strategy: cache-first ─────────────────────────────────────────────────
function cacheFirst(request) {
  return caches.open(CACHE_NAME).then(function(cache) {
    return cache.match(request).then(function(cached) {
      if (cached) return cached;
      return fetch(request).then(function(response) {
        if (response && response.status === 200) {
          cache.put(request, response.clone());
        }
        return response;
      });
    });
  });
}

// ── Strategy: network-first ───────────────────────────────────────────────
function networkFirst(request) {
  return fetch(request.clone()).then(function(response) {
    if (response && response.status === 200 && request.method === 'GET') {
      // Clone BEFORE any async operation — body can only be consumed once
      var responseClone = response.clone();
      caches.open(CACHE_NAME).then(function(cache) {
        cache.put(request, responseClone);
      });
    }
    return response;
  }).catch(function() {
    return caches.match(request);
  });
}
