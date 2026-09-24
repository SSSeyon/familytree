// Service worker: offline app shell + cached photos. Bump VERSION when shipping changes.
const VERSION = 'ft-v2';
const SHELL = [
  './', 'index.html', 'config.js', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/data.js', 'js/i18n.js', 'js/ui.js', 'js/chart.js', 'js/views.js', 'js/person.js',
  'js/relate.js', 'js/editor.js', 'js/export.js', 'js/settings.js', 'js/backend.js',
  'data/tree.json', 'icons/icon-192.png', 'icons/favicon-64.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // live data from the Google backend is never cached here (the app keeps its own copy)
  if (url.hostname.endsWith('script.google.com') || url.hostname.endsWith('script.googleusercontent.com')) return;
  const sameOrigin = url.origin === location.origin;
  const isPhoto = /\/(photos|icons)\//.test(url.pathname) || url.hostname === 'lh3.googleusercontent.com';
  const isCdn = /cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com/.test(url.hostname);
  if (isPhoto || isCdn) e.respondWith(cacheFirst(req));
  else if (sameOrigin) e.respondWith(networkFirst(req));
});

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') (await caches.open(VERSION)).put(req, res.clone());
  return res;
}
async function networkFirst(req) {
  try {
    const res = await fetch(req);
    if (res.ok) (await caches.open(VERSION)).put(req, res.clone());
    return res;
  } catch (err) {
    return (await caches.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? caches.match('index.html') : Response.error());
  }
}
