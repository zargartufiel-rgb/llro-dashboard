/* LLRO Pace Board — published copy (GitHub Pages).
   Stands in for the server's /api: reads data/index.json and the encrypted data files, unlocked with the same
   viewer passcode as the LLRO Dashboard (a passcode remembered by the dashboard on this device works here too). */
window.LLRO_STATIC = (function () {
  'use strict';
  var IDX = null, KEY = null, META = null, SALES = null, DAYS = {}, ENTMAP = null;
  var ROWK = ['m_a', 'm_ly', 'm_p', 'm_t', 'fy_a', 'fy_ly', 'fy_p', 'fy_aop'];
  function b2u(b64) { var s = atob(String(b64).replace(/\s+/g, '')), u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
  function index() { if (IDX) return Promise.resolve(IDX); return fetch('data/index.json', { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('The board has not been published yet.'); return r.json(); }).then(function (j) { IDX = j; return j; }); }
  function derive(pass, idx) {
    var c = crypto.subtle, enc = new TextEncoder();
    return c.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']).then(function (base) {
      return c.deriveKey({ name: 'PBKDF2', salt: b2u(idx.salt), iterations: idx.iter || 250000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    });
  }
  function decrypt(u8, key) {
    if (!(u8.length > 16 && u8[0] === 76 && u8[1] === 76 && u8[2] === 82 && u8[3] === 49)) return Promise.resolve(u8);
    return crypto.subtle.decrypt({ name: 'AES-GCM', iv: u8.subarray(4, 16) }, key, u8.subarray(16)).then(function (b) { return new Uint8Array(b); });
  }
  function gunzip(u8) { return new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('gzip'))).text(); }
  function bin(url) {
    return fetch(url).then(function (r) { if (!r.ok) throw new Error('Could not load ' + url.split('?')[0]); return r.arrayBuffer(); })
      .then(function (b) { return decrypt(new Uint8Array(b), KEY); }).then(gunzip).then(JSON.parse);
  }
  function saved(salt) { try { return localStorage.getItem('llro.pass.' + salt) || sessionStorage.getItem('llro.pass.' + salt); } catch (e) { return null; } }
  function remember(salt, pass) { try { localStorage.setItem('llro.pass.' + salt, pass); } catch (e) {} }
  function unlock(pass) {
    return index().then(function (idx) {
      return derive(pass, idx).then(function (key) {
        return decrypt(b2u(idx.check), key).then(function (u) { if (new TextDecoder().decode(u) !== 'LLRO-OK') throw 0; return key; }).catch(function () { throw new Error('Wrong passcode'); });
      }).then(function (key) { KEY = key; remember(idx.salt, pass); return bin(idx.files.meta); }).then(function (m) {
        META = m; ENTMAP = {}; m.ents.forEach(function (e) { ENTMAP[e.ent] = e; }); return true;
      });
    });
  }
  function auto() { return index().then(function (idx) { var p = saved(idx.salt); return p ? unlock(p).catch(function () { return false; }) : false; }); }
  function day(d) { if (!DAYS[d]) DAYS[d] = bin(IDX.files.days[d]).catch(function (e) { delete DAYS[d]; throw e; }); return DAYS[d]; }
  function entInfo(ent) { var e = ENTMAP[ent]; return e ? { lvl: e.lvl, name: e.name, sa: e.sa, district: e.district, status: e.status } : { lvl: ent === 'RO' ? 'ro' : 'sa', name: ent, sa: null, district: null, status: null }; }
  function board(q) {
    var date = q.date && IDX.files.days[q.date] ? q.date : IDX.latest;
    if (!date) return Promise.resolve({ none: true });
    return day(date).then(function (dv) {
      var lvl = q.lvl || 'all', sa = q.sa ? String(q.sa).toUpperCase() : null, vals = {}, ents = {};
      Object.keys(dv.vals).forEach(function (k) {
        if (q.kpi && k !== q.kpi) return;
        var row = dv.vals[k];
        Object.keys(row).forEach(function (ent) {
          var e = entInfo(ent), ok;
          if (q.ent) ok = ent === q.ent;
          else if (lvl === 'ro') ok = ent === 'RO';
          else if (lvl === 'sa') ok = e.lvl === 'sa';
          else if (lvl === 'dist') ok = e.lvl === 'dist' && (!sa || e.sa === sa);
          else if (lvl === 'top') ok = ent === 'RO' || e.lvl === 'sa';
          else ok = true;
          if (!ok) return;
          (vals[k] = vals[k] || {})[ent] = row[ent];
          if (!ents[ent]) ents[ent] = e;
        });
      });
      return Object.assign({}, META.dayMeta[date], { cols: ROWK, vals: vals, ents: ents });
    });
  }
  function trend(q) {
    var to = q.to && IDX.files.days[q.to] ? q.to : IDX.latest, from = q.from || to.slice(0, 8) + '01', ent = q.ent || 'RO';
    var ds = IDX.dates.filter(function (d) { return d >= from && d <= to; }).sort();
    return Promise.all(ds.map(function (d) { return day(d).catch(function () { return null; }); })).then(function (all) {
      var out = [];
      all.forEach(function (dv, i) { var r = dv && dv.vals[q.kpi] && dv.vals[q.kpi][ent]; if (!r) return; var o = { date: ds[i] }; ROWK.forEach(function (k, j) { o[k] = r[j]; }); out.push(o); });
      return out;
    });
  }
  function entities(q) { return META.ents.filter(function (e) { return (!q.lvl || e.lvl === q.lvl) && (!q.sa || e.sa === String(q.sa).toUpperCase()); }); }
  function sales(q) { return (SALES || (SALES = bin(IDX.files.sales))).then(function (s) { return s[(q.sa || '').toUpperCase()] || s[''] || {}; }); }
  function api(p) {
    var u = new URL(p, location.href), q = {}; u.searchParams.forEach(function (v, k) { q[k] = v; });
    var path = u.pathname.replace(/^.*\/api\//, '/api/');
    if (!KEY) { var e = new Error('locked'); e.locked = true; return Promise.reject(e); }
    if (path === '/api/me') return Promise.resolve({ role: 'viewer', static: true });
    if (path === '/api/v9/meta') return Promise.resolve({ kpis: META.kpis, sas: META.sas, dates: IDX.dates, latest: IDX.latest });
    if (path === '/api/v9/entities') return Promise.resolve(entities(q));
    if (path === '/api/v9/board') return board(q);
    if (path === '/api/v9/trend') return trend(q);
    if (path === '/api/v2/sales') return sales(q);
    return Promise.reject(new Error('Available on the board on the Mac.'));
  }
  return { api: api, unlock: unlock, auto: auto, index: index, updatedAt: function () { return IDX && IDX.updatedAt; } };
})();
