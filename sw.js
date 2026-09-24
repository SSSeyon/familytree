// Service worker: offline app shell + cached photos. The cache name follows APP_VERSION
// in version.js, so bumping the version ships the update to everyone.
importScripts('version.js');
const VERSION = 'ft-' + self.APP_VERSION;
const REM_CACHE = 'ft-reminders'; // written by js/month.js
const SHELL = [
  './', 'index.html', 'version.js', 'config.js', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/data.js', 'js/i18n.js', 'js/ui.js', 'js/chart.js', 'js/views.js', 'js/person.js',
  'js/relate.js', 'js/editor.js', 'js/export.js', 'js/settings.js', 'js/backend.js', 'js/month.js',
  'data/tree.json', 'icons/icon-192.png', 'icons/favicon-64.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== REM_CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // uploaded photos / voice notes never change once saved, so keep them
  if (url.hostname === 'firestore.googleapis.com' && url.pathname.includes('/documents/media/')) return e.respondWith(cacheFirst(req));
  // other live data (the tree, sign-in) always goes to the network; the app keeps its own copy
  if (url.hostname.endsWith('googleapis.com')) return;
  const sameOrigin = url.origin === location.origin;
  const isPhoto = /\/(photos|icons)\//.test(url.pathname);
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

// ---------- birthday & remembrance reminders (see js/month.js) ----------
// Where the browser supports it (Chrome/Edge on Android, installed app), this runs about
// twice a day even when the app is closed. Elsewhere the app shows them when it's opened.
self.addEventListener('periodicsync', e => { if (e.tag === 'ft-remind') e.waitUntil(remindToday()); });
async function remindToday() {
  const c = await caches.open(REM_CACHE);
  const list = await c.match('reminders.json');
  if (!list) return;
  const now = new Date(), key = now.toDateString();
  const last = await c.match('reminders-last.txt');
  if (last && (await last.text()) === key) return;
  const { events } = await list.json();
  for (const x of events.filter(x => x.m === now.getMonth() + 1 && x.d === now.getDate()))
    await self.registration.showNotification(x.title, { body: x.body, tag: x.tag, icon: 'icons/icon-192.png', data: { url: x.url } });
  await c.put('reminders-last.txt', new Response(key));
}
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const win = list[0];
    return win ? win.focus().then(w => w.navigate(url)) : self.clients.openWindow(url);
  }));
});
