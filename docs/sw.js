const CACHE_NAME = 'rhs-v1';
const ASSETS = [
  './index.html',
  './js/config.js',
  './js/api.js',
  './js/app.js',
  './js/fitur-baru.js',
  './js/input-cepat.js',
  'https://cdn.tailwindcss.com/3.4.17',
  'https://cdn.jsdelivr.net/npm/lucide@0.263.0/dist/umd/lucide.min.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request))
  );
});