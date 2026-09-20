// Smart RV — service worker FIGÉ (ne plus jamais modifier ce fichier).
// Pourquoi : le navigateur compare sw.js à chaque ouverture ; s'il change d'un seul octet,
// il installe une nouvelle version et l'active dès que l'app est fermée puis rouverte
// = mise à jour « automatique ». Ici sw.js ne change plus jamais, donc plus aucune mise à jour toute seule.
// Pour mettre à jour l'app : déployer le nouvel index.html, puis appuyer sur
// « Vérifier les mises à jour » dans le menu de l'app (message CHECK_FOR_UPDATE ci-dessous).
const V = 'smartrv-app';
const CDN = [
  'https://cdn.tailwindcss.com',
  'https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
];
const LOCAL = ['./', './index.html', './manifest.json', './icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(V);
    await Promise.all(LOCAL.map(async u => {
      try { const res = await fetch(new Request(u, { cache: 'reload' })); if (res && res.ok) await c.put(u, res); } catch (_) {}
    }));
    await Promise.all(CDN.map(u => fetch(new Request(u, { mode: 'no-cors' })).then(r => c.put(u, r)).catch(() => {})));
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== V) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  const isCdn = CDN.includes(r.url) || /(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(u.hostname);
  if (isCdn) {                                   // bibliothèques : cache d'abord
    e.respondWith(caches.match(r.url).then(hit => hit || fetch(r).then(res => { caches.open(V).then(c => c.put(r.url, res.clone())).catch(() => {}); return res; })));
    return;
  }
  if (u.origin !== location.origin) return;
  e.respondWith((async () => {                   // pages de l'app : cache d'abord, jamais de mise à jour toute seule
    const hit = await caches.match(r, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(r);
      if (res && res.ok) { const c = await caches.open(V); c.put(r, res.clone()); }
      return res;
    } catch (_) {
      return (r.mode === 'navigate' ? await caches.match('./index.html') : Response.error());
    }
  })());
});

// Mise à jour MANUELLE : déclenchée uniquement par le bouton de l'app (aucun skipWaiting, aucune vérif automatique).
async function say(msg) {
  for (const cl of await self.clients.matchAll({ includeUncontrolled: true })) cl.postMessage(msg);
}
self.addEventListener('message', e => {
  if (e.data !== 'CHECK_FOR_UPDATE') return;
  e.waitUntil((async () => {
    try {
      const fresh = await fetch(new Request('./index.html', { cache: 'reload' }));
      if (!fresh || !fresh.ok) { await say('UPDATE_FAILED'); return; }
      const c = await caches.open(V);
      const old = await c.match('./index.html');
      const newText = await fresh.clone().text();
      if (old && (await old.text()) === newText) { await say('NO_UPDATE'); return; }
      await c.put('./index.html', fresh.clone());
      await c.put('./', fresh.clone());
      for (const u of ['./manifest.json', './icon-192.png']) {
        try { const res = await fetch(new Request(u, { cache: 'reload' })); if (res && res.ok) await c.put(u, res); } catch (_) {}
      }
      await say('UPDATE_READY');
    } catch (_) { await say('UPDATE_FAILED'); }
  })());
});
