// Service worker — caches static app files only.
// Supabase API / storage responses and ntfy requests are NEVER cached.
const VERSION = 'v1';
const CACHE = `safety-officer-${VERSION}`;
const ASSETS = [
  './', './index.html', './import.html', './app.webmanifest', './config.js',
  './css/app.css', './css/print.css', './css/import.css',
  './js/app.js', './js/nav.js', './js/db.js', './js/ui.js', './js/icons.js', './js/items.js', './js/docs.js',
  './js/ntfy.js', './js/qr.js', './js/signature.js', './js/import.js',
  './js/views/common.js', './js/views/dashboard.js', './js/views/vehicles.js', './js/views/vehicle-form.js',
  './js/views/expiry-rows.js', './js/views/tacho.js', './js/views/drivers.js', './js/views/driver-form.js',
  './js/views/services.js', './js/views/service-form.js', './js/views/documents.js', './js/views/settings.js',
  './js/views/illustrations.js',
  './icons/icon.svg', './icons/apple-touch-icon.png', './icons/icon-192.png', './icons/icon-512.png',
];
// Third-party static files (library + font) — cached, never API data
const STATIC_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !STATIC_HOSTS.includes(url.hostname)) return; // Supabase, ntfy, etc. → network only

  if (sameOrigin) {
    // network first, so updates arrive immediately; cache fallback for offline
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
        return res;
      }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))),
    );
  } else {
    // CDN/fonts: cache first
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok || res.type === 'opaque') caches.open(CACHE).then((c) => c.put(req, res.clone()));
        return res;
      })),
    );
  }
});
