const CACHE_NAME = 'rhs-app-v11'; // Naikkan versi jika ada update kode
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

// Install Service Worker
self.addEventListener('install', (e) => {
  self.skipWaiting(); // Paksa aktif langsung
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// Aktivasi & Hapus Cache Lama
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Ambil Data (Network First, fallback ke Cache)
self.addEventListener('fetch', (e) => {
  // Jangan cache request ke Google Apps Script (API)
  if (e.request.url.includes('script.google.com')) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // Simpan salinan ke cache
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(e.request, resClone);
        });
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});