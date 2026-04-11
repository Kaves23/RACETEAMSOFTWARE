/* ─────────────────────────────────────────────────────────────────────────────
   Race Team OS · Mobile Service Worker
   Cache: shell files on install, stale-while-revalidate for API routes
   ───────────────────────────────────────────────────────────────────────────── */

var CACHE_NAME = 'rts-mobile-v1';
var SHELL_FILES = [
  '/mobile/mobile.css',
  '/mobile/index.html',
  '/mobile/load.html',
  '/mobile/lists.html',
  '/mobile/scan.html'
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
        keys.filter(function(k) { return k !== CACHE_NAME; })
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

  var path = url.pathname;

  // API routes: stale-while-revalidate
  if (path === '/api/trucks' || path.startsWith('/api/scan/manifest/')) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // Shell files: cache-first
  if (SHELL_FILES.indexOf(path) !== -1) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Everything else: network-first with cache fallback
  event.respondWith(networkFirst(event.request));
});

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
    if (response && response.status === 200) {
      caches.open(CACHE_NAME).then(function(cache) {
        cache.put(request, response.clone());
      });
    }
    return response;
  }).catch(function() {
    return caches.match(request);
  });
}
