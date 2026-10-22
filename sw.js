const VERSION = 'bearbao-2026-10-22-v5';
const SHELL_CACHE = `bearbao-shell-${VERSION}`;
const DATA_CACHE = 'bearbao-sheet-data';
const LIB_CACHE = 'bearbao-libs';
const SHELL = ['./', './index.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png', './icons/logo.png', './icons/bear-helper.png'];
const LIB_HOSTS = ['unpkg.com', 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('bearbao-shell-') && k !== SHELL_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function dataKey(url) {
  const u = new URL(url);
  u.searchParams.delete('_');
  u.searchParams.delete('t');
  return u.toString();
}

async function networkFirst(request, cacheName, key, fresh) {
  const cache = await caches.open(cacheName);
  try {
        const response = fresh ? await fetch(request.url, { cache: 'no-store', credentials: 'same-origin' }) : await fetch(request);
    if (response && response.ok) cache.put(key || request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(key || request, { ignoreSearch: false });
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && (response.ok || response.type === 'opaque')) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

    if (url.origin === self.location.origin) {
    if (request.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('.html')) {
      event.respondWith(networkFirst(request, SHELL_CACHE, './index.html', true));
    } else {
      event.respondWith(networkFirst(request, SHELL_CACHE));
    }
    return;
  }

    if (url.hostname === 'docs.google.com' && url.pathname.includes('/spreadsheets/') && /format=csv|out%3Acsv|out:csv/.test(url.search)) {
    event.respondWith(networkFirst(request, DATA_CACHE, dataKey(request.url)));
    return;
  }

    if (LIB_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(request, LIB_CACHE));
  }
  });
