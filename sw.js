// PointagePro Service Worker — Offline-First Strategy
// ═══════════════════════════════════════════════════════════════════════════
// IMPORTANT : Ce SW est conçu pour fonctionner EN NAVIGATEUR uniquement.
// Dans Electron (détecté via self.isElectronContext), il se désactive
// automatiquement pour éviter les conflits avec le protocole file://.
// ═══════════════════════════════════════════════════════════════════════════

const CACHE_NAME = 'pointagepro-v2';

// Détection de l'environnement Electron
// Electron ne supporte pas les Service Workers sur file:// de manière fiable.
// On détecte le contexte et on se désactive proprement.
const isElectron = (
  self.location.protocol === 'file:' ||
  self.navigator.userAgent.toLowerCase().includes('electron')
);

if (isElectron) {
  // En mode Electron : le SW s'installe mais ne fait RIEN.
  // Cela évite les erreurs de cache et les blocages au chargement.
  self.addEventListener('install', () => {
    console.log('[SW] Mode Electron détecté — Service Worker désactivé');
    self.skipWaiting();
  });

  self.addEventListener('activate', () => {
    self.clients.claim();
  });

  // Pas d'interception des requêtes fetch en mode Electron
} else {
  // ─── MODE NAVIGATEUR : Stratégie Cache-First pour les assets locaux ─────

  // Assets à mettre en cache lors de l'installation
  // UNIQUEMENT des chemins relatifs (pas d'URLs externes qui pourraient échouer)
  const LOCAL_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './html5-qrcode.min.js',
  ];

  // Install: cache les assets locaux uniquement
  self.addEventListener('install', evt => {
    self.skipWaiting();
    evt.waitUntil(
      caches.open(CACHE_NAME).then(cache => {
        // addAll avec gestion d'erreur individuelle pour éviter l'échec total
        return Promise.allSettled(
          LOCAL_ASSETS.map(asset =>
            cache.add(asset).catch(err =>
              console.warn(`[SW] Cache miss pour ${asset}:`, err)
            )
          )
        );
      })
    );
  });

  // Activate: nettoyage des anciens caches
  self.addEventListener('activate', evt => {
    evt.waitUntil(
      caches.keys().then(keys =>
        Promise.all(
          keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
        )
      ).then(() => self.clients.claim())
    );
  });

  // Fetch: Cache-First pour les assets locaux, Network-First pour le reste
  self.addEventListener('fetch', evt => {
    if (evt.request.method !== 'GET') return;

    const url = new URL(evt.request.url);

    // Ignorer les requêtes vers des domaines externes (fonts, CDN, etc.)
    if (url.origin !== self.location.origin) return;

    evt.respondWith(
      caches.match(evt.request).then(cached => {
        if (cached) return cached;

        return fetch(evt.request)
          .then(response => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(evt.request, clone));
            }
            return response;
          })
          .catch(() => caches.match('./index.html'));
      })
    );
  });

  // Background sync pour les pointages hors-ligne
  self.addEventListener('sync', evt => {
    if (evt.tag === 'sync-pointages') {
      evt.waitUntil(syncPendingPointages());
    }
  });

  async function syncPendingPointages() {
    console.log('[SW] Syncing pending pointages...');
    const clients = await self.clients.matchAll();
    clients.forEach(c => c.postMessage({ type: 'SYNC_COMPLETE' }));
  }
}
