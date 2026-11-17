// Bump VERSION on every release so installed copies fetch the new files.
const VERSION = 'v5';
const CACHE = 'recipe-book-' + VERSION;
const FONT_CACHE = 'recipe-book-fonts'; // survives version bumps

const CORE = [
  './', './index.html', './style.css?v=2', './parser.js?v=2', './app.js?v=4',
  './manifest.webmanifest', './icon.svg', './apple-touch-icon.png', './icon-192.png', './icon-512.png',
];
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;900&display=swap';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(CORE);
    try {
      const fc = await caches.open(FONT_CACHE);
      const res = await fetch(FONT_CSS);
      if (res.ok) {
        await fc.put(FONT_CSS, res.clone());
        const css = await res.text();
        const urls = [...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]);
        await Promise.all(urls.map((u) => fc.add(u).catch(() => {})));
      }
    } catch (_) { /* fonts get cached at runtime */ }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('recipe-book-') && k !== CACHE && k !== FONT_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com') {
    event.respondWith((async () => {
      const fc = await caches.open(FONT_CACHE);
      const hit = await fc.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') fc.put(req, res.clone());
        return res;
      } catch (_) { return Response.error(); }
    })());
    return;
  }

  if (url.origin !== location.origin || url.pathname.includes('/api/')) return; // proxy + CDN: network only

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        (await caches.open(CACHE)).put('./index.html', res.clone());
        return res;
      } catch (_) {
        return (await caches.match('./index.html')) || (await caches.match('./'));
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  })());
});
