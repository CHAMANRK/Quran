/* Najiful Quran service worker.
   Naya version deploy karte waqt VER ka number badal dein (qq-v3, qq-v4...) taaki purana cache saaf ho.
   Agar tahleel/, morph.json ya maadda.json ka data badla ho to DATA_VER bhi badal dein — tab sab users ko
   dobara "ڈیٹا تیار ہو رہا ہے" loader dikhega. */
const VER = 'qq-v3'
const DATA = 'qq-data-v1';           // optional offline data (user hata sakta hai) — naam badalte hi purana khud saaf
const APP = ['index.html', 'style.css', 'script.js', 'sarf.js', 'sarf.css', 'tahleel.js', 'offline.js', 'multiplayer.js', 'bounty.js', 'bounty.css',
  'pwa.js', 'quran_full.json', 'manifest.webmanifest', 'logo.png', 'icon-192.png'];
const PACK = ['morph.json', 'maadda.json', ...Array.from({ length: 30 }, (_, i) => `tahleel/p${i + 1}.json`)];
const CORE = ['./', ...APP];
const PACK_RE = /\/(morph\.json|maadda\.json|tahleel\/p\d+\.json)$/;
const CDN = ['fonts.googleapis.com', 'fonts.gstatic.com', 'www.gstatic.com']; // fonts + Firebase SDK files

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VER).then(c => Promise.all(CORE.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VER && k !== DATA).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url), same = url.origin === location.origin;
  if (!same && !CDN.includes(url.hostname)) return;      // Firebase database, Analytics etc: hamesha seedha network
  if (same && url.pathname.endsWith('/admin.html')) return; // admin page cache nahi hota
  if (same && PACK_RE.test(url.pathname)) { e.respondWith(packFirst(req)); return; }  // optional offline data
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
// Offline data: cache me ho to wahi se, warna seedha network (cache me khud nahi daalte —
// isliye user jab "ہٹائیں" dabata hai to data sach me hat jata hai aur wapas khud nahi aata).
async function packFirst(req) {
  const c = await caches.open(DATA), hit = await c.match(req);
  return hit || fetch(req);
}

/* ---------- offline data: download / status / remove (offline.js se message aate hain) ---------- */
async function say(msg) { (await self.clients.matchAll({ includeUncontrolled: true })).forEach(c => c.postMessage(msg)); }

async function status() {
  const dc = await caches.open(DATA), keys = await dc.keys();
  let bytes = 0;
  for (const k of keys) { const r = await dc.match(k); if (r) bytes += (await r.blob()).size; }
  say({ type: 'STATUS', dataVer: DATA, count: keys.length, total: PACK.length, bytes, complete: keys.length >= PACK.length });
}

let cancelled = false;
async function precache() {
  cancelled = false;
  const vc = await caches.open(VER), dc = await caches.open(DATA);
  const jobs = [...APP.map(u => ({ u, c: vc, skipIfCached: true })), ...PACK.map(u => ({ u, c: dc }))];
  const total = jobs.length;
  let done = 0, fail = 0, bytes = 0, i = 0;
  say({ type: 'PROGRESS', done, total, bytes, fail });
  async function worker() {
    while (i < jobs.length && !cancelled) {
      const j = jobs[i++];
      let ok = false;
      if (j.skipIfCached && await j.c.match(j.u)) ok = true;
      for (let t = 0; t < 2 && !ok; t++) {
        try {
          const res = await fetch(new Request(j.u, { cache: 'reload' }));
          if (res.ok) { bytes += (await res.clone().blob()).size; await j.c.put(j.u, res); ok = true; }
        } catch (_) { /* dobara koshish */ }
      }
      if (!ok) fail++;
      done++;
      say({ type: 'PROGRESS', done, total, bytes, fail });
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  say({ type: cancelled ? 'CANCELLED' : 'DONE', done, total, bytes, fail });
}

self.addEventListener('message', e => {
  const t = (e.data || {}).type;
  if (t === 'PRECACHE') e.waitUntil(precache());
  else if (t === 'CANCEL') cancelled = true;
  else if (t === 'STATUS') e.waitUntil(status());
  else if (t === 'CLEAR_DATA') e.waitUntil(caches.delete(DATA).then(() => say({ type: 'CLEARED' })));
});
