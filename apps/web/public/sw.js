/* Lightweight app shell cache. Private API and signed music URLs are deliberately never cached. */
const CACHE = 'music-fuq-me-static-v2-2';
self.addEventListener('install', event => { self.skipWaiting(); event.waitUntil(caches.open(CACHE)); });
self.addEventListener('activate', event => { event.waitUntil((async () => { for (const name of await caches.keys()) if (name !== CACHE) await caches.delete(name); await self.clients.claim(); })()); });
self.addEventListener('fetch', event => {
  const r = event.request;
  if (r.method !== 'GET') return;
  const url = new URL(r.url);
  if (url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  if (r.mode === 'navigate') { event.respondWith(fetch(r).then(response => { if(response.ok) { const copy=response.clone(); void caches.open(CACHE).then(cache => cache.put(r, copy)); } return response; }).catch(async () => (await caches.match(r)) || Response.error())); return; }
  if (/\/_next\/static\/|\.(?:png|svg|ico|webmanifest|css|js)$/.test(url.pathname)) {
    event.respondWith(caches.match(r).then(cached => cached || fetch(r).then(response => { if(response.ok) { const copy=response.clone(); void caches.open(CACHE).then(cache => cache.put(r,copy)); } return response; })));
  }
});
