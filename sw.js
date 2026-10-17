// Service Worker: offline spielbar. "Netzwerk zuerst", damit neue Versionen sofort ankommen.
const CACHE = 'hexkrone-v8';
const ASSETS = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/main.js', 'js/render.js', 'js/input.js', 'js/game.js', 'js/ai.js', 'js/data.js', 'js/hex.js',
  'js/mapgen.js', 'js/rng.js', 'js/levels.js', 'js/storage.js', 'js/art.js', 'js/audio.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
