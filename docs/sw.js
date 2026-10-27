const CACHE_NAME = 'rhs-v3';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './js/config.js',
  './js/api.js',
  './js/app.js',
  './js/fitur-baru.js',
  './js/input-cepat.js'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(key => {
        if (key !== CACHE_NAME) return caches.delete(key);
      })
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Hanya tangani request GET lokal (dari domain Anda sendiri)
  // Abaikan CDN (Tailwind, Chart.js, API GAS) agar tidak kena CORS
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) {
    return;
  }
  
  e.respondWith(
    caches.match(e.request).then((res) => {
      return res || fetch(e.request);
    })
  );
});