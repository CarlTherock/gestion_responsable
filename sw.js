const CACHE = 'suivi-instr-v6';
const CORE = ['./index.html', './base.css', './style.css', './app.js', './manifest.json', './vendor/qrcode.min.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Réseau d'abord : garantit que les mises à jour de l'app sont vues dès la
// prochaine visite en ligne, tout en gardant un repli hors ligne sur le cache.
// cache: 'no-store' contourne aussi le cache HTTP du navigateur lui-même
// (distinct du cache du Service Worker), pour ne jamais servir une version
// intermédiaire mise en cache par le navigateur ou un CDN.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('/api/')) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-store' })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
