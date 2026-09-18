/* DANSMUSIC SERVICE WORKER UNTUK APLIKASI WEB-TO-APP PWA CEPAT DAN RINGAN */

const CACHE_NAME = 'dansmusic-v3';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/state.js',
  '/player.js',
  '/views.js',
  '/pages.js',
  '/manifest.json'
];

/* INSTALASI SERVICE WORKER DAN PRECACHE FILE STATIS */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

/* AKTIVASI SERVICE WORKER DAN PEMBERSIHAN CACHE LAMA */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

/* INTERSEPSI REQUEST JARINGAN (STRATEGI STALE-WHILE-REVALIDATE UNTUK ASET STATIS) */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // ABAIKAN REQUEST KE API, AUDIO STREAMING, ATAU YOUTUBE (BIARKAN LANGSUNG KE JARINGAN)
  if (url.pathname.startsWith('/api/') || url.hostname.includes('youtube.com') || url.hostname.includes('googlevideo.com') || url.hostname.includes('ytimg.com')) {
    return;
  }

  // RESPON CEPAT DARI CACHE JIKA ADA, LALU PERBARUI DI LATAR BELAKANG
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
