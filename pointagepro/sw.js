// PointagePro Service Worker — Offline-First Strategy
const CACHE_NAME = 'pointagepro-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Space+Mono:wght@400;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css'
];

// Install: cache core assets
self.addEventListener('install', evt => {
  self.skipWaiting();
  evt.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS.filter(a => a.startsWith('/')));
    })
  );
});

// Activate: cleanup old caches
self.addEventListener('activate', evt => {
  evt.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: Network first, fallback to cache
self.addEventListener('fetch', evt => {
  if (evt.request.method !== 'GET') return;
  evt.respondWith(
    fetch(evt.request)
      .then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(evt.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(evt.request).then(r => r || caches.match('/index.html')))
  );
});

// Background sync for offline pointages
self.addEventListener('sync', evt => {
  if (evt.tag === 'sync-pointages') {
    evt.waitUntil(syncPendingPointages());
  }
});

async function syncPendingPointages() {
  // In production: read from IndexedDB and POST to server
  console.log('[SW] Syncing pending pointages...');
  const clients = await self.clients.matchAll();
  clients.forEach(c => c.postMessage({ type: 'SYNC_COMPLETE' }));
}
