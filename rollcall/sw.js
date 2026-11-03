// Offline cache for Roll Call. Bump VERSION whenever any cached file changes.
// Roster and attendance data never pass through here: they live in the
// device's local storage and are never sent to the network.
const VERSION = 'rollcall-v4';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-180.png', './icon-192.png', './icon-512.png'];
const PAGE_TIMEOUT_MS = 4000;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS.map(a => new Request(a, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('rollcall-') && k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(req.mode === 'navigate' ? pageFirstFromNetwork(e) : assetFromCache(e));
});

// The page: always the latest version when online; the saved copy when offline
// or when the network is too slow to answer within PAGE_TIMEOUT_MS.
async function pageFirstFromNetwork(e) {
  const cache = await caches.open(VERSION);
  const network = fetch(e.request, { cache: 'no-cache' }).then(res => {
    if (res.ok && res.type === 'basic') cache.put('./', res.clone());
    return res;
  });
  e.waitUntil(network.catch(() => {}));
  const timeout = new Promise(resolve => setTimeout(resolve, PAGE_TIMEOUT_MS, null));
  try {
    const res = await Promise.race([network, timeout]);
    if (res) return res;
  } catch (_) { /* offline: fall through to the saved copy */ }
  const saved = await cache.match('./');
  return saved || network;
}

// Icons and manifest: saved copy first, refreshed in the background.
async function assetFromCache(e) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(e.request, { ignoreSearch: true });
  const fresh = fetch(e.request).then(res => {
    if (res.ok && res.type === 'basic') cache.put(e.request, res.clone());
    return res;
  }).catch(() => null);
  if (hit) { e.waitUntil(fresh); return hit; }
  return (await fresh) || new Response('Offline and not saved yet.', { status: 503 });
}
