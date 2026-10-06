/* LLRO Dashboard service worker: the app works offline with the last data it saw */
var V = 'llro-app-4b6aa7c775', DATA = 'llro-data';
var SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(V).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) { e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k.indexOf('llro-app-') === 0 && k !== V; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); })); });
self.addEventListener('fetch', function (e) {
  var req = e.request, u = new URL(req.url);
  if (req.method !== 'GET' || u.origin !== location.origin) return;
  if (/\/data\/latest\.json$/.test(u.pathname)) { // always try the network first
    e.respondWith(fetch(req).then(function (r) { if (r.ok) { var c = r.clone(); caches.open(DATA).then(function (x) { x.put(u.pathname, c); }); } return r; }).catch(function () { return caches.open(DATA).then(function (x) { return x.match(u.pathname); }); }));
    return;
  }
  if (/\/data\//.test(u.pathname)) { // data files never change once written
    e.respondWith(caches.open(DATA).then(function (x) { return x.match(u.pathname).then(function (m) { return m || fetch(req).then(function (r) { if (r.ok) x.put(u.pathname, r.clone()); return r; }); }); }));
    return;
  }
  if (req.mode === 'navigate') { // newest code when online, cached page when not
    e.respondWith(fetch(req).then(function (r) { if (r.ok) { var c = r.clone(); caches.open(V).then(function (x) { x.put('./index.html', c); }); } return r; }).catch(function () { return caches.match('./index.html'); }));
    return;
  }
  e.respondWith(caches.match(req).then(function (m) { return m || fetch(req); }));
});
