/* Najiful Quran service worker.
   Naya version deploy karte waqt VER ka number badal dein (qq-v2, qq-v3...) taaki purana cache saaf ho. */
const VER = 'qq-v1';
const CORE = ['./', 'index.html', 'style.css', 'script.js', 'multiplayer.js', 'bounty.js', 'bounty.css', 'pwa.js',
  'quran_full.json', 'manifest.webmanifest', 'logo.png', 'icon-192.png'];
const CDN = ['fonts.googleapis.com', 'fonts.gstatic.com', 'www.gstatic.com']; // fonts + Firebase SDK files

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VER).then(c => Promise.all(CORE.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VER).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url), same = url.origin === location.origin;
  if (!same && !CDN.includes(url.hostname)) return;      // Firebase database, Analytics etc: hamesha seedha network
  if (same && url.pathname.endsWith('/admin.html')) return; // admin page cache nahi hota
  const fast = !same || /\.(json|png|jpe?g|svg|webp|woff2?)$/i.test(url.pathname);
  e.respondWith(fast ? staleWhileRevalidate(req) : networkFirst(req));
});

async function networkFirst(req) {
  const c = await caches.open(VER);
  try {
    const res = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej('timeout'), 6000))]);
    if (res.ok) c.put(req, res.clone());
    return res;
  } catch (_) {
    return (await c.match(req)) || (req.mode === 'navigate' ? await c.match('index.html') : undefined) || Response.error();
  }
}
async function staleWhileRevalidate(req) {
  const c = await caches.open(VER), hit = await c.match(req);
  const net = fetch(req).then(res => { if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await net) || Response.error();
}
