/* LLRO Dashboard service worker: the app works offline with the last data it saw.
   15 Nov 2026: on a slow mobile connection the page waited for the whole 1.7 MB page every time ("not working"). Now the saved
   page opens at once when the network is slow (4 s) and the newer page is saved in the background for next time (the app
   itself notices a new build and offers to reload); data files rewritten in place wait at most 8 s before the saved copy is used. */
var V = 'llro-app-b52d7e1c90', DATA = 'llro-data';
var SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(V).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) { e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k.indexOf('llro-app-') === 0 && k !== V; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); })); });
function late(ms) { return new Promise(function (res) { setTimeout(function () { res(null); }, ms); }); }
// the network, but no longer than ms when a saved copy exists; the network answer is still saved when it comes
function netFirst(e, net, saved, ms) {
  return saved.then(function (m) {
    if (!m) return net.catch(function () { return saved; });
    return Promise.race([net.catch(function () { return null; }), late(ms)]).then(function (r) { return r && r.ok ? r : m; });
  });
}
self.addEventListener('fetch', function (e) {
  var req = e.request, u = new URL(req.url);
  if (req.method !== 'GET' || u.origin !== location.origin) return;
  if (/\/data\/(latest\.json|live\.bin|status\.json|hist\.bin|booking\.bin|navya\.bin)$/.test(u.pathname)) { // files rewritten in place
    var net1 = fetch(req).then(function (r) {
      if (!r.ok) return r;
      return r.blob().then(function (b) { var whole = new Response(b, { status: r.status, statusText: r.statusText, headers: r.headers }); e.waitUntil(caches.open(DATA).then(function (x) { return x.put(u.pathname, whole.clone()); })); return whole; });
    });
    e.respondWith(netFirst(e, net1, caches.open(DATA).then(function (x) { return x.match(u.pathname); }), 8000));
    return;
  }
  if (/\/data\//.test(u.pathname)) { // data files never change once written
    e.respondWith(caches.open(DATA).then(function (x) { return x.match(u.pathname).then(function (m) { return m || fetch(req).then(function (r) { if (r.ok) x.put(u.pathname, r.clone()); return r; }); }); }));
    return;
  }
  if (req.mode === 'navigate') { // newest page when the network answers within 4 s, else the saved page (the newer one is saved for next time)
    // the whole page has to arrive within 4 s (a slow connection sends the headers quickly and the 1.7 MB body slowly)
    var net2 = fetch(req.url, { cache: 'no-store', credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) return r;
      return r.blob().then(function (b) { var whole = new Response(b, { status: r.status, statusText: r.statusText, headers: r.headers }); e.waitUntil(caches.open(V).then(function (x) { return x.put('./index.html', whole.clone()); })); return whole; });
    });
    e.respondWith(netFirst(e, net2, caches.match('./index.html'), 4000));
    return;
  }
  e.respondWith(caches.match(req).then(function (m) { return m || fetch(req); }));
});
