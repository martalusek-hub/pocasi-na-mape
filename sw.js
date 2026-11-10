/* Service worker – offline režim a instalace jako aplikace (PWA).
 *
 * Strategie:
 *  - vlastní soubory (HTML, CSS, JS, ikony): network-first s fallbackem do cache
 *  - knihovny z unpkg (verzované URL): cache-first + tichá aktualizace
 *  - data Open-Meteo a dlaždice mapy: vždy ze sítě (data musí být čerstvá)
 */

const VERSION = 'pocasi-v4';

const SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
];

/* Hosty, které se nikdy needcachují. */
const NETWORK_ONLY = [
  'api.open-meteo.com',
  'geocoding-api.open-meteo.com',
  'server.arcgisonline.com',
  'tile.openstreetmap.org',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(VERSION);
      /* allSettled = výpadek CDN nesmí zablokovat instalaci */
      await Promise.allSettled(
        SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' })))
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

async function networkFirst(request) {
  const cache = await caches.open(VERSION);

  let response = null;
  try {
    response = await fetch(request);
  } catch (error) {
    response = null;
  }

  if (response && response.ok) {
    cache.put(request, response.clone());
    return response;
  }

  /* Výpadek sítě nebo chyba serveru (5xx) – zkus poslední uloženou verzi. */
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;

  if (request.mode === 'navigate') {
    const shell = await cache.match('./index.html');
    if (shell) return shell;
  }

  if (response) return response;
  throw new Error('Network error');
}

async function cacheFirst(request) {
  const cache = await caches.open(VERSION);
  const cached = await cache.match(request);

  if (cached) {
    /* na pozadí zkusit obnovit (u verzovaných URL se stejně nezmění) */
    fetch(request)
      .then((response) => {
        if (response && response.ok) cache.put(request, response.clone());
      })
      .catch(() => {});
    return cached;
  }

  const response = await fetch(request);
  if (response && response.ok) {
    cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (NETWORK_ONLY.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.hostname === 'unpkg.com') {
    event.respondWith(cacheFirst(request));
  }
});
