/* LLRO Pace Board — Dashboard v9.
   Layers: Pace (every KPI, RO) → KPI (month and FY, day-by-day run, sales areas, distributors) → sales area → distributor.
   Every figure sits beside last year and AOP pro-rata. The live refreshes have their own tab and never touch the daily data.
   A command bar (typed or spoken) opens any of these views. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var S = { meta: null, date: null, per: 'm', ents: [], entMap: {}, board: {}, speak: false };
  try { S.per = localStorage.getItem('llro.per') || 'm'; S.speak = localStorage.getItem('llro.speak') === '1'; var th = localStorage.getItem('llro.theme'); if (th) document.documentElement.setAttribute('data-theme', th); } catch (e) {}
  var C = { m_a: 0, m_ly: 1, m_p: 2, m_t: 3, fy_a: 4, fy_ly: 5, fy_p: 6, fy_aop: 7 };
  var SAS = ['ETAWAH', 'JHANSI', 'KANPUR', 'LUCKNOW', 'SITAPUR'];
  var GROUP_ORDER = ['Sales', 'Products', 'ARB', 'Safety', 'Customers', 'Digital', 'Delivery', 'Operations'];

  /* ---------- helpers ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(v, dec) { if (v == null || !isFinite(v)) return '—'; var a = Math.abs(v); var d = dec == null ? 1 : dec; if (a >= 1000) d = 0; return Number(v).toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: a >= 1000 ? 0 : Math.min(d, a < 10 ? d : 1) }); }
  function unit(k, v) { var u = k.u; return u === '%' ? fmt(v, k.dec) + '%' : fmt(v, k.dec) + (u ? ' <span class="muted">' + esc(u) + '</span>' : ''); }
  function unitT(k, v) { return k.u === '%' ? fmt(v, k.dec) + '%' : fmt(v, k.dec) + (k.u ? ' ' + k.u : ''); }
  function title(sa) { return sa ? sa.charAt(0) + sa.slice(1).toLowerCase() : ''; }
  function entName(ent) { if (!ent || ent === 'RO') return 'Lucknow RO'; if (ent.indexOf('d:') === 0) { var e = S.entMap[ent]; return e ? e.name : ent.slice(2); } return title(ent) + ' SA'; }
  function dlab(d) { if (!d) return '—'; var x = new Date(d + 'T12:00:00'); return x.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }
  function dshort(d) { var x = new Date(d + 'T12:00:00'); return x.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); }
  function K(k) { return S.meta.kpis.filter(function (x) { return x.k === k; })[0]; }
  /* the four figures of a KPI for one entity in the chosen period */
  function fig(k, row, per) {
    if (!row) return null;
    var p = per || S.per, useFy = (p === 'fy' && k.hasFy) || (p === 'm' && k.hasM === false), o = useFy ? { A: row[C.fy_a], LY: row[C.fy_ly], P: row[C.fy_p], T: row[C.fy_aop] } : { A: row[C.m_a], LY: row[C.m_ly], P: row[C.m_p], T: row[C.m_t] };
    o.per = useFy ? 'fy' : 'm'; o.fell = (useFy ? 'fy' : 'm') !== p;
    o.ach = o.P && o.A != null ? o.A / o.P * 100 : null; if (k.better < 0 && o.ach != null) o.ach = o.A ? o.P / o.A * 100 : null;
    o.vsLY = o.LY ? (o.A - o.LY) / Math.abs(o.LY) * 100 : null;
    if (k.ratio && o.LY != null) o.vsLYpts = o.A - o.LY;
    return o;
  }
  function stClass(ach) { return ach == null ? 'none' : ach >= 100 ? 'good' : ach >= 85 ? 'warn' : 'bad'; }
  function stLabel(ach) { return ach == null ? 'No AOP' : ach >= 100 ? 'On pace' : ach >= 85 ? 'Close' : 'Behind'; }
  function pill(ach) { var c = stClass(ach); return '<span class="st ' + c + '">' + (ach == null ? 'No AOP' : fmt(ach, 0) + '% · ' + stLabel(ach)) + '</span>'; }
  function dl(f, k) {
    if (!f) return '<span class="dl flat">—</span>';
    if (k && k.ratio) { if (f.vsLYpts == null) return '<span class="dl flat">—</span>'; var g0 = f.vsLYpts * (k.better || 1); return '<span class="dl ' + (g0 > 0 ? 'up' : g0 < 0 ? 'dn' : 'flat') + '">' + (f.vsLYpts > 0 ? '▲ +' : f.vsLYpts < 0 ? '▼ −' : '') + fmt(Math.abs(f.vsLYpts), 1) + ' pts</span>'; }
    if (f.vsLY == null) return '<span class="dl flat">—</span>';
    var good = f.vsLY * ((k && k.better) || 1);
    return '<span class="dl ' + (good > 0 ? 'up' : good < 0 ? 'dn' : 'flat') + '">' + (f.vsLY > 0 ? '▲ +' : f.vsLY < 0 ? '▼ −' : '') + fmt(Math.abs(f.vsLY), 1) + '%</span>';
  }
  /* the signature: actual bar · last-year tick · AOP pro-rata needle */
  function gauge(k, f, lg) {
    if (!f || f.A == null) return '<div class="gauge' + (lg ? ' lg' : '') + '"><div class="tr"></div></div>';
    if (f.P == null && f.LY == null) return '<span class="nog">No AOP or last-year figure to compare</span>';
    var mx = Math.max(f.A || 0, f.P || 0, f.LY || 0) * 1.1 || 1, w = function (v) { return Math.max(0, Math.min(100, v / mx * 100)); };
    var c = f.P != null ? stClass(f.ach) : '', tipTxt = encodeURIComponent(JSON.stringify({ k: k.k, A: f.A, P: f.P, LY: f.LY, ach: f.ach }));
    return '<div class="gauge' + (lg ? ' lg' : '') + '" data-tip="' + tipTxt + '"><div class="tr"></div><div class="fl ' + c + '" style="width:' + w(f.A) + '%"></div>' +
      (f.LY != null ? '<div class="ly" style="left:' + w(f.LY) + '%"></div>' : '') + (f.P != null ? '<div class="pr" style="left:' + w(f.P) + '%"></div>' : '') + '</div>';
  }
  var LEGEND = '<div class="legend"><span><i></i>Actual</span><span><i class="pr"></i>AOP pro-rata (today)</span><span><i class="ly"></i>Last year, same days</span></div>';

  /* ---------- api ---------- */
  var ST = window.LLRO_STATIC || null;   // the published copy on GitHub Pages
  function api(p, opt) {
    if (ST) return ST.api(p).catch(function (e) { if (e.locked) showLogin('static'); throw e; });
    return fetch(p, Object.assign({ credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } }, opt || {})).then(function (r) {
      if (r.status === 401) return r.json().catch(function () { return {}; }).then(function (j) { showLogin(j.remote); throw new Error('Sign in to continue'); });
      return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status)); return j; });
    });
  }
  function board(q) {
    var key = JSON.stringify(q);
    if (S.board[key]) return Promise.resolve(S.board[key]);
    var qs = Object.keys(q).filter(function (k) { return q[k] != null; }).map(function (k) { return k + '=' + encodeURIComponent(q[k]); }).join('&');
    return api('/api/v9/board?' + qs).then(function (b) { S.board[key] = b; return b; });
  }
  function showLogin(remote) {
    $('#login').hidden = false;
    if (remote === 'static') { $('label[for=pw]').textContent = 'Dashboard passcode'; $('#loginNote').textContent = 'The same passcode as the LLRO Dashboard.'; setTimeout(function () { $('#pw').focus(); }, 30); return; }
    if (remote) { $('#loginForm').classList.add('phone'); $('#loginErr').textContent = ''; $('#loginNote').textContent = 'Open the link from the latest “Link for the LLRO board on your phone” e-mail, or scan the code on the board on the Mac (Sources › Phone).'; return; }
    setTimeout(function () { $('#pw').focus(); }, 30);
  }
  $('#loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (ST) { $('#loginErr').textContent = 'Opening…'; ST.unlock($('#pw').value).then(function () { $('#login').hidden = true; $('#pw').value = ''; $('#loginErr').textContent = ''; start(); }).catch(function (er) { $('#loginErr').textContent = er.message; }); return; }
    fetch('/api/login', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('#pw').value }) }).then(function (r) {
      if (!r.ok) return r.json().then(function (j) { $('#loginErr').textContent = j.error || 'Wrong password'; });
      $('#login').hidden = true; $('#pw').value = ''; start();
    });
  });

  /* ---------- boot ---------- */
  function boot() {
    api('/api/v9/meta').then(function (m) {
      S.meta = m; S.date = S.date && m.dates.indexOf(S.date) >= 0 ? S.date : m.latest;
      $('#day').innerHTML = m.dates.map(function (d) { return '<option value="' + d + '">' + dlab(d) + '</option>'; }).join('');
      $('#day').value = S.date || '';
      return api('/api/v9/entities');
    }).then(function (ents) {
      S.ents = ents; S.entMap = {}; ents.forEach(function (e) { S.entMap[e.ent] = e; });
      setPer(S.per, true); route();
    }).catch(function (e) { if (!/Sign in/.test(e.message)) $('#view').innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; });
  }
  function setPer(p, quiet) { S.per = p; try { localStorage.setItem('llro.per', p); } catch (e) {} $$('.seg button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.per === p ? 'true' : 'false'); }); if (!quiet) route(); }
  $$('.seg button').forEach(function (b) { b.addEventListener('click', function () { setPer(b.dataset.per); }); });
  $('#day').addEventListener('change', function () { S.date = this.value; route(); });
  $('#dPrev').addEventListener('click', function () { var i = S.meta.dates.indexOf(S.date); if (i < S.meta.dates.length - 1) { S.date = S.meta.dates[i + 1]; $('#day').value = S.date; route(); } });
  $('#dNext').addEventListener('click', function () { var i = S.meta.dates.indexOf(S.date); if (i > 0) { S.date = S.meta.dates[i - 1]; $('#day').value = S.date; route(); } });
  $('#theme').addEventListener('click', function () { var r = document.documentElement, cur = r.getAttribute('data-theme'), dark = cur ? cur === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; r.setAttribute('data-theme', dark ? 'light' : 'dark'); try { localStorage.setItem('llro.theme', r.getAttribute('data-theme')); } catch (e) {} });

  /* ---------- router ---------- */
  function parseHash() { var h = location.hash.replace(/^#\/?/, ''), qi = h.indexOf('?'), q = {}; if (qi >= 0) { h.slice(qi + 1).split('&').forEach(function (p) { var kv = p.split('='); if (kv[0]) q[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || ''); }); h = h.slice(0, qi); } var parts = h.split('/').filter(Boolean); return { v: parts[0] || 'pace', a: parts[1] ? decodeURIComponent(parts[1]) : null, q: q }; }
  window.addEventListener('hashchange', route);
  function route() {
    if (!S.meta) return;
    var r = parseHash(), V = VIEWS[r.v] || VIEWS.pace;
    $$('.rail a[data-nav]').forEach(function (a) { a.setAttribute('aria-current', a.dataset.nav === ({ sa: 'areas', dist: 'dists', rank: 'dists' }[r.v] || r.v) ? 'page' : 'false'); });
    $('#tip').hidden = true;
    $('#view').innerHTML = '<div class="empty"><span class="spin"></span></div>';
    Promise.resolve(V(r)).catch(function (e) { $('#view').innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; });
  }
  function go(h) { if (location.hash === h) route(); else location.hash = h; }

  /* ---------- the board table (shared by Pace, sales area, distributor) ---------- */
  function boardTable(b, ent, opts) {
    opts = opts || {};
    var ks = S.meta.kpis.filter(function (k) { return b.vals[k.k] && b.vals[k.k][ent] && (fig(k, b.vals[k.k][ent]) || {}).A != null; });
    var groups = GROUP_ORDER.filter(function (g) { return ks.some(function (k) { return k.g === g; }); });
    var head = '<tr><th>KPI</th><th class="gcell">' + (S.per === 'fy' ? 'FY to date' : 'Month to date') + '</th><th class="num">Actual</th><th class="num hide-s">AOP pro-rata</th><th>vs pro-rata</th><th class="num hide-s">Last year</th><th class="num">vs last year</th></tr>';
    var body = groups.map(function (g) {
      return '<tr class="grp"><td colspan="7">' + esc(g) + '</td></tr>' + ks.filter(function (k) { return k.g === g; }).map(function (k) {
        var f = fig(k, b.vals[k.k][ent]);
        var href = opts.link ? opts.link(k) : '#/kpi/' + k.k + (ent !== 'RO' && ent.indexOf('d:') < 0 ? '?sa=' + ent : '');
        return '<tr class="row" data-href="' + href + '"><td class="kname">' + esc(k.l) + (f.fell ? '<small>' + (f.per === 'fy' ? 'FY to date (no month figure)' : 'month to date (no FY figure)') + '</small>' : '') + '</td><td class="gcell">' + gauge(k, f) + '</td><td class="num"><b>' + unit(k, f.A) + '</b></td><td class="num hide-s">' + (f.P != null ? unit(k, f.P) : '<span class="muted">—</span>') + '</td><td>' + (f.P != null ? pill(f.ach) : k.plan ? '<span class="st none">No AOP</span>' : '<span class="muted">—</span>') + '</td><td class="num hide-s">' + (f.LY != null ? unit(k, f.LY) : '<span class="muted">—</span>') + '</td><td class="num">' + dl(f, k) + '</td></tr>';
      }).join('');
    }).join('');
    return LEGEND + '<div class="tw" style="max-height:none"><table class="board">' + head + body + '</table></div>';
  }
  function pulse(b, ent) {
    var c = { good: 0, warn: 0, bad: 0 };
    S.meta.kpis.forEach(function (k) { if (!k.plan || !b.vals[k.k] || !b.vals[k.k][ent]) return; var f = fig(k, b.vals[k.k][ent]); if (!f || f.P == null || f.A == null) return; c[stClass(f.ach)]++; });
    return c;
  }
  function strip(b, ent, label) {
    var c = pulse(b, ent), tot = K('tot'), ft = b.vals.tot && b.vals.tot[ent] ? fig(tot, b.vals.tot[ent]) : null;
    return '<div class="strip"><div><div class="k">' + esc(label) + ' · ' + (S.per === 'fy' ? 'FY to date' : 'month to date') + '</div><div class="v">' + (ft ? fmt(ft.A, 0) + ' <small>MT total LPG</small>' : '—') + '</div></div>' +
      '<div><div class="k">Against AOP pro-rata</div><div class="v">' + (ft && ft.ach != null ? fmt(ft.ach, 0) + '%' : '—') + '</div></div>' +
      '<div><div class="k">Against last year</div><div class="v">' + (ft && ft.vsLY != null ? (ft.vsLY >= 0 ? '+' : '−') + fmt(Math.abs(ft.vsLY), 1) + '%' : '—') + '</div></div>' +
      '<div><div class="k">KPIs with an AOP</div><div class="v">' + c.good + ' <small>on pace</small> · ' + c.warn + ' <small>close</small> · ' + c.bad + ' <small>behind</small></div></div>' +
      '<div class="cal"><div class="k">Data to ' + dlab(b.date) + '</div><div class="k">Day ' + b.day + ' of ' + b.dim + ' · FY day ' + b.fyDay + ' of ' + b.fyDays + '</div><div class="daybar" aria-hidden="true"><i style="width:' + (b.day / b.dim * 100) + '%"></i></div></div></div>';
  }
  function bindRows(root) { $$('tr[data-href]', root || document).forEach(function (tr) { tr.addEventListener('click', function () { go(tr.dataset.href); }); }); }

  /* heat map: KPIs × sales areas, against pro-rata (diverging around 100%) or last year (around 0) */
  function heatColor(v, mode) {
    if (v == null) return '';
    var d = mode === 'ly' ? Math.max(-40, Math.min(40, v)) / 40 : Math.max(-30, Math.min(30, v - 100)) / 30;
    var hi = getComputedStyle(document.documentElement).getPropertyValue('--div-hi').trim() || '#256abf', lo = getComputedStyle(document.documentElement).getPropertyValue('--div-lo').trim() || '#d03b3b', mid = getComputedStyle(document.documentElement).getPropertyValue('--div-mid').trim() || '#f0efec';
    var to = d >= 0 ? hi : lo, t = Math.abs(d);
    return 'background:color-mix(in srgb, ' + to + ' ' + Math.round(t * 85) + '%, ' + mid + ');color:' + (t > 0.55 ? '#fff' : 'inherit');
  }
  function heat(b, mode) {
    var ks = S.meta.kpis.filter(function (k) { return mode === 'ly' ? !k.ratio && SAS.some(function (sa) { var f = b.vals[k.k] && fig(k, b.vals[k.k][sa]); return f && f.vsLY != null; }) : k.plan && SAS.some(function (sa) { var f = b.vals[k.k] && fig(k, b.vals[k.k][sa]); return f && f.ach != null; }); });
    if (!ks.length) return '<p class="muted">Nothing to compare yet.</p>';
    return '<div class="tw" style="max-height:none"><table class="heat"><tr><th>KPI</th>' + SAS.map(function (sa) { return '<th class="c">' + title(sa) + '</th>'; }).join('') + '<th class="c">RO</th></tr>' + ks.map(function (k) {
      return '<tr><th>' + esc(k.l) + '</th>' + SAS.concat(['RO']).map(function (sa) {
        var f = b.vals[k.k] && fig(k, b.vals[k.k][sa]), v = f ? (mode === 'ly' ? f.vsLY : f.ach) : null;
        if (v == null) return '<td class="c na">—</td>';
        var lbl = mode === 'ly' ? (v >= 0 ? '+' : '−') + fmt(Math.abs(v), 0) + '%' : fmt(v, 0) + '%';
        return '<td class="c" style="' + heatColor(v, mode) + '" data-href="#/kpi/' + k.k + (sa !== 'RO' ? '?sa=' + sa : '') + '" title="' + esc(k.l + ', ' + entName(sa) + ': ' + unitT(k, f.A) + (mode === 'ly' ? ' vs ' + unitT(k, f.LY) + ' last year' : ' vs ' + unitT(k, f.P) + ' AOP pro-rata')) + '">' + lbl + '</td>';
      }).join('') + '</tr>';
    }).join('') + '</table></div>';
  }

  /* ---------- views ---------- */
  var VIEWS = {};
  VIEWS.pace = function () {
    return board({ date: S.date, lvl: 'top' }).then(function (b) {
      if (b.none) { $('#view').innerHTML = '<div class="empty">No day has been read yet.</div>'; return; }
      $('#view').innerHTML = '<div class="vh"><h1>Lucknow RO pace board</h1><span class="sub">Every KPI against last year and AOP pro-rata' + (ST && ST.updatedAt() ? ' · published ' + new Date(ST.updatedAt()).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '') + '</span></div>' + strip(b, 'RO', 'Lucknow RO') +
        '<div class="grid"><section class="panel"><h2>All KPIs</h2><p class="lede">Select a KPI for its month and FY detail, day-by-day run, sales areas and distributors.</p>' + boardTable(b, 'RO') + '</section>' +
        '<section class="panel"><h2>Sales areas</h2><p class="lede" id="heatLede">Actual as a share of AOP pro-rata. Blue is ahead, red is behind.</p><div class="chips" style="margin-bottom:10px"><button type="button" data-hm="ach" aria-pressed="true">vs AOP pro-rata</button><button type="button" data-hm="ly" aria-pressed="false">vs last year</button></div><div id="heatBox">' + heat(b, 'ach') + '</div></section></div>';
      bindRows(); bindHeat(b);
    });
  };
  function bindHeat(b) {
    $$('[data-hm]').forEach(function (btn) { btn.addEventListener('click', function () { $$('[data-hm]').forEach(function (x) { x.setAttribute('aria-pressed', x === btn ? 'true' : 'false'); }); $('#heatBox').innerHTML = heat(b, btn.dataset.hm); $('#heatLede').textContent = btn.dataset.hm === 'ly' ? 'Change against the same days last year. Blue is up, red is down.' : 'Actual as a share of AOP pro-rata. Blue is ahead, red is behind.'; bindCells(); }); });
    bindCells();
  }
  function bindCells() { $$('td[data-href]').forEach(function (td) { td.addEventListener('click', function () { go(td.dataset.href); }); }); }

  VIEWS.kpi = function (r) {
    var k = K(r.a) || K('tot'), sa = r.q.sa || null, ent = sa || 'RO';
    return Promise.all([board({ date: S.date, lvl: 'top', kpi: k.k }), board({ date: S.date, lvl: 'dist', kpi: k.k, sa: sa }), api('/api/v9/trend?kpi=' + k.k + '&ent=' + encodeURIComponent(ent) + '&to=' + S.date)]).then(function (res) {
      var b = res[0], bd = res[1], tr = res[2], row = b.vals[k.k] && b.vals[k.k][ent];
      var fm = fig(k, row, 'm'), ff = k.hasFy ? fig(k, row, 'fy') : null;
      var opts = S.meta.kpis.map(function (x) { return '<option value="' + x.k + '"' + (x.k === k.k ? ' selected' : '') + '>' + esc(x.l) + '</option>'; }).join('');
      var h = '<div class="vh"><div class="crumb"><a href="#/pace">Pace board</a> › ' + esc(k.g) + (sa ? ' › <a href="#/sa/' + sa + '">' + title(sa) + ' SA</a>' : '') + '</div><h1>' + esc(k.l) + '</h1><span class="sub">' + esc(entName(ent)) + ' · data to ' + dlab(b.date) + '</span>' +
        '<div class="tools" style="margin:0 0 0 auto"><label class="sr" for="kSel">KPI</label><select id="kSel">' + opts + '</select><div class="chips" role="group" aria-label="Scope"><button type="button" data-sa=""' + (!sa ? ' aria-pressed="true"' : '') + '>RO</button>' + SAS.map(function (x) { return '<button type="button" data-sa="' + x + '"' + (sa === x ? ' aria-pressed="true"' : '') + '>' + title(x) + '</button>'; }).join('') + '</div></div></div>';
      h += '<div class="hero">' + heroPanel(k, fm, 'Month to date', b, 'm') + (ff ? heroPanel(k, ff, 'FY to date', b, 'fy') : '<section class="panel"><h2>FY to date</h2><p class="muted">This report gives a month figure only.</p></section>') + '</div>';
      h += '<section class="panel" style="margin-bottom:16px"><h2>Day by day</h2><p class="lede">' + (k.ratio ? 'The month-to-date figure on each day, against the target.' : 'Month-to-date actual on each day, against AOP pro-rata and the same days last year.') + '</p><div id="trend"></div></section>';
      h += '<div class="grid g2"><section class="panel"><h2>Sales areas</h2><p class="lede">' + (S.per === 'fy' ? 'FY to date' : 'Month to date') + ' · select one to see its distributors.</p>' + LEGEND + '<div class="tw" style="max-height:none"><table class="board">' + SAS.concat(['RO']).map(function (x) {
        var f = fig(k, b.vals[k.k] && b.vals[k.k][x]); if (!f || f.A == null) return '';
        return '<tr class="row" data-href="#/kpi/' + k.k + (x !== 'RO' ? '?sa=' + x : '') + '"><td class="kname">' + esc(x === 'RO' ? 'Lucknow RO' : title(x)) + '</td><td class="gcell">' + gauge(k, f) + '</td><td class="num"><b>' + unit(k, f.A) + '</b></td><td>' + (f.P != null ? pill(f.ach) : '') + '</td><td class="num">' + dl(f, k) + '</td></tr>';
      }).join('') + '</table></div></section>';
      h += '<section class="panel"><h2>What moved it</h2><p class="lede">Distributors with the largest change against last year' + (sa ? ' in ' + title(sa) : '') + '.</p><div id="movers"></div></section></div>';
      h += '<section class="panel" style="margin-top:16px"><h2>Distributors' + (sa ? ' in ' + title(sa) + ' SA' : '') + '</h2><p class="lede">Each distributor\'s AOP pro-rata is its share of the sales area\'s, in proportion to its last-year figure.</p><div class="tools"><label class="sr" for="dq">Find a distributor</label><input type="search" id="dq" placeholder="Find a distributor or SAP code"></div><div id="dtab"></div></section>';
      $('#view').innerHTML = h;
      $('#kSel').addEventListener('change', function () { go('#/kpi/' + this.value + (sa ? '?sa=' + sa : '')); });
      $$('[data-sa]').forEach(function (bt) { bt.addEventListener('click', function () { go('#/kpi/' + k.k + (bt.dataset.sa ? '?sa=' + bt.dataset.sa : '')); }); });
      bindRows();
      drawTrend($('#trend'), k, tr, b);
      distTable($('#dtab'), k, bd, $('#dq'));
      movers($('#movers'), k, bd);
    });
  };
  function heroPanel(k, f, label, b, per) {
    if (!f || f.A == null) return '<section class="panel"><h2>' + label + '</h2><p class="muted">No figure for this day.</p></section>';
    var days = per === 'fy' ? b.fyDay : b.day, total = per === 'fy' ? b.fyDays : b.dim;
    var proj = !k.ratio && f.A != null ? f.A / days * total : null, need = !k.ratio && f.T != null && total > days ? Math.max(0, f.T - f.A) / (total - days) : null;
    return '<section class="panel"><h2>' + label + ' ' + (f.P != null ? pill(f.ach) : '<span class="st none">No AOP</span>') + '</h2><div class="fig"><div><div class="big">' + fmt(f.A, k.dec) + (k.u === '%' ? '%' : '') + '</div><div class="lab">' + (k.u === '%' ? '' : esc(k.u) + ' · ') + 'actual</div></div>' +
      (f.P != null ? '<div><div class="val">' + unit(k, f.P) + '</div><div class="lab">' + (k.ratio ? 'target' : 'AOP pro-rata') + '</div></div>' : '') +
      (f.LY != null ? '<div><div class="val">' + unit(k, f.LY) + '</div><div class="lab">last year ' + dl(f, k) + '</div></div>' : '') + '</div>' + gauge(k, f, true) +
      '<div class="facts">' + (f.T != null && !k.ratio ? '<div><span>' + (per === 'fy' ? 'AOP for the year' : 'Target for the month') + '</span><b>' + unitT(k, f.T) + '</b></div>' : '') +
      (f.T != null && !k.ratio ? '<div><span>Achieved of ' + (per === 'fy' ? 'year' : 'month') + '</span><b>' + fmt(f.A / f.T * 100, 1) + '%</b></div>' : '') +
      (proj != null ? '<div><span>At this rate, by ' + (per === 'fy' ? '31 Mar' : 'month end') + '</span><b>' + unitT(k, proj) + '</b></div>' : '') +
      (need != null ? '<div><span>Needed per day from here</span><b>' + unitT(k, need) + '</b></div>' : '') +
      (f.P != null && !k.ratio ? '<div><span>Gap to pro-rata</span><b>' + (f.A - f.P >= 0 ? '+' : '−') + unitT(k, Math.abs(f.A - f.P)) + '</b></div>' : '') + '</div></section>';
  }
  function rowsOf(bd, k) {
    var v = bd.vals[k.k] || {};
    return Object.keys(v).map(function (ent) { var e = bd.ents[ent] || {}; return { ent: ent, name: e.name || ent, sa: e.sa, status: e.status, f: fig(k, v[ent]), fm: fig(k, v[ent], 'm'), ff: fig(k, v[ent], 'fy') }; }).filter(function (r) { return r.f && r.f.A != null; });
  }
  function distTable(box, k, bd, search) {
    var rows = rowsOf(bd, k), sort = { key: 'A', dir: -1 };
    var cols = [['name', 'Distributor', 0], ['A', 'Actual', 1], ['P', 'AOP pro-rata', 1], ['ach', 'vs pro-rata', 0], ['LY', 'Last year', 1], ['vsLY', 'vs last year', 1]];
    function render() {
      var q = (search.value || '').toLowerCase().trim();
      var rs = rows.filter(function (r) { return !q || r.name.toLowerCase().indexOf(q) >= 0 || r.ent.indexOf(q) >= 0; });
      rs.sort(function (a, b) { var x = sort.key === 'name' ? a.name : a.f[sort.key], y = sort.key === 'name' ? b.name : b.f[sort.key]; if (x == null) return 1; if (y == null) return -1; return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; });
      box.innerHTML = '<div class="tw"><table class="tbl"><thead><tr>' + cols.map(function (c) { return '<th data-k="' + c[0] + '"' + (c[2] ? ' class="num"' : '') + (sort.key === c[0] ? ' aria-sort="' + (sort.dir < 0 ? 'descending' : 'ascending') + '"' : '') + '>' + c[1] + '</th>'; }).join('') + '</tr></thead><tbody>' +
        rs.map(function (r) { return '<tr class="click" data-href="#/dist/' + r.ent.slice(2) + '"><td>' + esc(r.name) + '<span class="sm">' + esc(title(r.sa || '')) + ' · ' + r.ent.slice(2) + (r.status && !/^(ACTIVE|REGULAR)$/.test(r.status) ? ' · ' + esc(r.status.toLowerCase()) : '') + '</span></td><td class="num"><b>' + unit(k, r.f.A) + '</b></td><td class="num">' + (r.f.P != null ? unit(k, r.f.P) : '—') + '</td><td>' + (r.f.P != null ? pill(r.f.ach) : '') + '</td><td class="num">' + (r.f.LY != null ? unit(k, r.f.LY) : '—') + '</td><td class="num">' + dl(r.f, k) + '</td></tr>'; }).join('') +
        '</tbody></table></div><p class="note">' + rs.length + ' distributors.</p>';
      $$('th[data-k]', box).forEach(function (th) { th.addEventListener('click', function () { var kk = th.dataset.k; sort.dir = sort.key === kk ? -sort.dir : (kk === 'name' ? 1 : -1); sort.key = kk; render(); }); });
      bindRows(box);
    }
    search.addEventListener('input', render); render();
  }
  function movers(box, k, bd) {
    var rows = rowsOf(bd, k).filter(function (r) { return r.f.LY != null; }).map(function (r) { r.d = r.f.A - r.f.LY; return r; });
    if (!rows.length) { box.innerHTML = '<p class="muted">No last-year figure for this KPI yet.</p>'; return; }
    rows.sort(function (a, b) { return a.d - b.d; });
    var dn = rows.slice(0, 5), up = rows.slice(-5).reverse(), mx = Math.max.apply(null, rows.map(function (r) { return Math.abs(r.d); })) || 1;
    function li(r) { var w = Math.abs(r.d) / mx * 100, good = r.d * (k.better || 1) >= 0; return '<tr class="click" data-href="#/dist/' + r.ent.slice(2) + '"><td>' + esc(r.name) + '<span class="sm">' + title(r.sa || '') + '</span></td><td style="width:38%"><div style="height:8px;border-radius:4px;width:' + w + '%;background:' + (good ? 'var(--good)' : 'var(--bad)') + '" aria-hidden="true"></div></td><td class="num">' + (r.d >= 0 ? '+' : '−') + unitT(k, Math.abs(r.d)) + '</td></tr>'; }
    box.innerHTML = '<table class="tbl"><tbody><tr><td colspan="3" class="muted">Biggest gains on last year</td></tr>' + up.filter(function (r) { return r.d > 0; }).map(li).join('') + '<tr><td colspan="3" class="muted">Biggest falls on last year</td></tr>' + dn.filter(function (r) { return r.d < 0; }).map(li).join('') + '</tbody></table>';
    bindRows(box);
  }

  /* line chart: month-to-date actual vs AOP pro-rata vs last year (one axis, direct labels, crosshair tooltip) */
  function drawTrend(box, k, rows, b) {
    rows = rows.filter(function (r) { return r.m_a != null; });
    if (rows.length < 2) { box.innerHTML = '<p class="muted">The run fills in as more days of this month are read.</p>'; return; }
    var W = 860, H = 260, L = 56, R = 110, T = 14, B = 30, dim = b.dim, mk = b.mk;
    var series = [{ key: 'm_a', name: 'Actual', col: 'var(--s1)', dash: '' }, { key: 'm_p', name: k.ratio ? 'Target' : 'AOP pro-rata', col: 'var(--s2)', dash: '' }, { key: 'm_ly', name: 'Last year', col: 'var(--ly)', dash: '5 4' }].filter(function (s) { return rows.some(function (r) { return r[s.key] != null; }); });
    var dayOf = function (d) { return +d.slice(8, 10); }, xs = function (d) { return L + (dayOf(d) - 1) / Math.max(1, dim - 1) * (W - L - R); };
    var all = []; rows.forEach(function (r) { series.forEach(function (s) { if (r[s.key] != null) all.push(r[s.key]); }); });
    var lo = k.ratio ? Math.min.apply(null, all) * 0.95 : 0, hi = Math.max.apply(null, all) * 1.08 || 1, ys = function (v) { return T + (1 - (v - lo) / (hi - lo)) * (H - T - B); };
    var ticks = []; for (var i = 0; i <= 4; i++) ticks.push(lo + (hi - lo) * i / 4);
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(k.l) + ' day by day">';
    ticks.forEach(function (t) { svg += '<line class="gridl" x1="' + L + '" x2="' + (W - R) + '" y1="' + ys(t) + '" y2="' + ys(t) + '"/><text class="axl" x="' + (L - 8) + '" y="' + (ys(t) + 4) + '" text-anchor="end">' + fmt(t, t < 10 ? 1 : 0) + '</text>'; });
    [1, 8, 15, 22, dim].forEach(function (d) { var x = L + (d - 1) / Math.max(1, dim - 1) * (W - L - R); svg += '<text class="axl" x="' + x + '" y="' + (H - 8) + '" text-anchor="middle">' + d + ' ' + new Date(mk + '-01T12:00:00').toLocaleDateString('en-IN', { month: 'short' }) + '</text>'; });
    var labY = [];
    series.forEach(function (s) {
      var pts = rows.filter(function (r) { return r[s.key] != null; });
      svg += '<path d="' + pts.map(function (r, i) { return (i ? 'L' : 'M') + xs(r.date).toFixed(1) + ' ' + ys(r[s.key]).toFixed(1); }).join(' ') + '" fill="none" stroke="' + s.col + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"' + (s.dash ? ' stroke-dasharray="' + s.dash + '"' : '') + '/>';
      var last = pts[pts.length - 1]; if (last) { var y = ys(last[s.key]); labY.forEach(function (o) { if (Math.abs(o - y) < 14) y = o + 14; }); labY.push(y); svg += '<circle cx="' + xs(last.date) + '" cy="' + ys(last[s.key]) + '" r="4" fill="' + s.col + '" stroke="var(--panel)" stroke-width="2"/><text class="dlab" x="' + (xs(last.date) + 10) + '" y="' + (y + 4) + '">' + esc(s.name) + ' ' + fmt(last[s.key], k.dec) + '</text>'; }
    });
    svg += '<line class="hair" id="hair" x1="0" x2="0" y1="' + T + '" y2="' + (H - B) + '" style="display:none"/><rect x="' + L + '" y="' + T + '" width="' + (W - L - R) + '" height="' + (H - T - B) + '" fill="transparent" id="hit"/></svg>';
    box.innerHTML = '<div class="legend">' + series.map(function (s) { return '<span><i class="line' + (s.dash ? ' dash' : '') + '" style="' + (s.dash ? '' : 'background:' + s.col) + '"></i>' + esc(s.name) + '</span>'; }).join('') + '</div><div class="chart">' + svg + '</div>';
    var svgEl = $('svg', box), hit = $('#hit', box), hair = $('#hair', box), tip = $('#tip');
    hit.addEventListener('mousemove', function (ev) {
      var pt = svgEl.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY; var p = pt.matrixTransform(svgEl.getScreenCTM().inverse());
      var best = rows.reduce(function (a, r) { return Math.abs(xs(r.date) - p.x) < Math.abs(xs(a.date) - p.x) ? r : a; }, rows[0]);
      hair.setAttribute('x1', xs(best.date)); hair.setAttribute('x2', xs(best.date)); hair.style.display = '';
      tip.innerHTML = '<b>' + dshort(best.date) + '</b>' + series.map(function (s) { return '<div class="r"><span><i style="background:' + s.col + '"></i>' + esc(s.name) + '</span><span>' + (best[s.key] != null ? unitT(k, best[s.key]) : '—') + '</span></div>'; }).join('') + (best.m_p ? '<div class="r"><span>vs pro-rata</span><span>' + fmt(best.m_a / best.m_p * 100, 0) + '%</span></div>' : '');
      tip.hidden = false; tip.style.left = Math.min(innerWidth - 240, ev.clientX + 14) + 'px'; tip.style.top = (ev.clientY + 14) + 'px';
    });
    hit.addEventListener('mouseleave', function () { hair.style.display = 'none'; tip.hidden = true; });
  }

  VIEWS.areas = function () {
    return board({ date: S.date, lvl: 'top' }).then(function (b) {
      var ks = S.meta.kpis.filter(function (k) { return k.plan || ['p19', 'p14', 'p47', 'p425'].indexOf(k.k) >= 0; });
      $('#view').innerHTML = '<div class="vh"><h1>Sales areas</h1><span class="sub">' + (S.per === 'fy' ? 'FY to date' : 'Month to date') + ' · data to ' + dlab(b.date) + '</span></div>' + LEGEND + '<div class="grid g3">' + SAS.map(function (sa) {
        var c = pulse(b, sa), ft = fig(K('tot'), b.vals.tot && b.vals.tot[sa]);
        return '<section class="panel"><h2><a href="#/sa/' + sa + '" style="text-decoration:none">' + title(sa) + ' SA</a></h2><p class="lede">' + (ft ? fmt(ft.A, 0) + ' MT total LPG · ' + (ft.ach != null ? fmt(ft.ach, 0) + '% of pro-rata · ' : '') + (ft.vsLY != null ? (ft.vsLY >= 0 ? '+' : '−') + fmt(Math.abs(ft.vsLY), 1) + '% on last year' : '') : '') + '</p><p class="lede">' + c.good + ' on pace · ' + c.warn + ' close · ' + c.bad + ' behind</p><table class="board">' + ks.map(function (k) {
          var f = fig(k, b.vals[k.k] && b.vals[k.k][sa]); if (!f || f.A == null) return '';
          return '<tr class="row" data-href="#/kpi/' + k.k + '?sa=' + sa + '"><td class="kname" style="font-size:13px;min-width:0">' + esc(k.l) + '</td><td class="gcell" style="min-width:90px;width:34%">' + gauge(k, f) + '</td><td class="num" style="font-size:13px;white-space:nowrap">' + (f.P != null ? '<span class="st ' + stClass(f.ach) + '" title="' + stLabel(f.ach) + ' against AOP pro-rata">' + fmt(f.ach, 0) + '%</span>' : dl(f, k)) + '</td></tr>';
        }).join('') + '</table></section>';
      }).join('') + '</div>';
      bindRows();
    });
  };

  VIEWS.sa = function (r) {
    var sa = String(r.a || 'KANPUR').toUpperCase();
    return Promise.all([board({ date: S.date, lvl: 'top' }), board({ date: S.date, lvl: 'dist', sa: sa })]).then(function (res) {
      var b = res[0], bd = res[1];
      var sel = '<label class="sr" for="rk">KPI for the ranking</label><select id="rk">' + S.meta.kpis.filter(function (k) { return bd.vals[k.k]; }).map(function (k) { return '<option value="' + k.k + '">' + esc(k.l) + '</option>'; }).join('') + '</select>';
      $('#view').innerHTML = '<div class="vh"><div class="crumb"><a href="#/pace">Pace board</a> › <a href="#/areas">Sales areas</a></div><h1>' + title(sa) + ' sales area</h1><span class="sub">' + Object.keys(bd.ents).length + ' distributors</span><div class="chips" style="margin-left:auto">' + SAS.map(function (x) { return '<button type="button" data-go="#/sa/' + x + '"' + (x === sa ? ' aria-pressed="true"' : '') + '>' + title(x) + '</button>'; }).join('') + '</div></div>' + strip(b, sa, title(sa) + ' SA') +
        '<div class="grid"><section class="panel"><h2>All KPIs</h2>' + boardTable(b, sa) + '</section><section class="panel"><h2>Distributors</h2><div class="tools">' + sel + '<input type="search" id="dq" placeholder="Find a distributor"></div><div id="dtab"></div></section></div>';
      $$('[data-go]').forEach(function (bt) { bt.addEventListener('click', function () { go(bt.dataset.go); }); });
      bindRows();
      var draw = function () { var k = K($('#rk').value); var q = $('#dq'), nq = q.cloneNode(true); q.parentNode.replaceChild(nq, q); distTable($('#dtab'), k, bd, nq); };
      $('#rk').addEventListener('change', draw); draw();
    });
  };

  VIEWS.dists = function (r) {
    return board({ date: S.date, lvl: 'dist' }).then(function (bd) {
      var ks = ['tot', 'dom', 'appu', 'p19', 'arb', 'mi', 'ekyc', 'dacDom'].map(K).filter(function (k) { return k && bd.vals[k.k]; });
      var ents = Object.keys(bd.ents).sort(function (a, b) { var A = bd.ents[a], B = bd.ents[b]; return (A.sa + A.name).localeCompare(B.sa + B.name); });
      $('#view').innerHTML = '<div class="vh"><div class="crumb"><a href="#/pace">Pace board</a></div><h1>Distributors</h1><span class="sub">' + ents.length + ' distributorships · ' + (S.per === 'fy' ? 'FY to date' : 'month to date') + ', share of AOP pro-rata</span></div><section class="panel"><div class="tools"><input type="search" id="dq" placeholder="Find a distributor or SAP code"><div class="chips">' + ['', 'ETAWAH', 'JHANSI', 'KANPUR', 'LUCKNOW', 'SITAPUR'].map(function (x) { return '<button type="button" data-f="' + x + '"' + (x === (r.q.sa || '') ? ' aria-pressed="true"' : '') + '>' + (x ? title(x) : 'All') + '</button>'; }).join('') + '</div></div><div id="dl"></div></section>';
      var f = r.q.sa || '';
      function render() {
        var q = $('#dq').value.toLowerCase().trim();
        var rs = ents.filter(function (e) { var x = bd.ents[e]; return (!f || x.sa === f) && (!q || x.name.toLowerCase().indexOf(q) >= 0 || e.indexOf(q) >= 0); });
        $('#dl').innerHTML = '<div class="tw"><table class="tbl"><thead><tr><th>Distributor</th>' + ks.map(function (k) { return '<th class="num">' + esc(k.l.replace(/ \(.*\)$/, '')) + '</th>'; }).join('') + '</tr></thead><tbody>' + rs.map(function (e) {
          var x = bd.ents[e];
          return '<tr class="click" data-href="#/dist/' + e.slice(2) + '"><td>' + esc(x.name) + '<span class="sm">' + title(x.sa || '') + ' · ' + e.slice(2) + '</span></td>' + ks.map(function (k) { var fg = fig(k, bd.vals[k.k][e]); if (!fg || fg.A == null) return '<td class="num muted">—</td>'; return '<td class="num">' + unit(k, fg.A) + '<span class="sm">' + (fg.P != null ? '<span class="st ' + stClass(fg.ach) + '" style="padding:0 6px">' + fmt(fg.ach, 0) + '%</span>' : dl(fg, k)) + '</span></td>'; }).join('') + '</tr>';
        }).join('') + '</tbody></table></div><p class="note">' + rs.length + ' shown. The coloured figure is actual against the distributor\'s share of AOP pro-rata.</p>';
        bindRows($('#dl'));
      }
      $('#dq').addEventListener('input', render);
      $$('[data-f]').forEach(function (bt) { bt.addEventListener('click', function () { f = bt.dataset.f; $$('[data-f]').forEach(function (x) { x.setAttribute('aria-pressed', x === bt ? 'true' : 'false'); }); render(); }); });
      render();
    });
  };

  VIEWS.dist = function (r) {
    var code = r.a, ent = 'd:' + code, e = S.entMap[ent] || { name: code, sa: null };
    return Promise.all([board({ date: S.date, ent: ent }), e.sa ? board({ date: S.date, lvl: 'dist', sa: e.sa }) : Promise.resolve(null)]).then(function (res) {
      var b = res[0], bd = res[1];
      if (!Object.keys(b.vals).length) { $('#view').innerHTML = '<div class="empty">No figures for ' + esc(e.name) + ' on ' + dlab(S.date) + '.</div>'; return; }
      // rank within the sales area on each KPI
      var rank = {};
      if (bd) S.meta.kpis.forEach(function (k) { var rs = rowsOf(bd, k).filter(function (x) { return x.f.A != null; }); var key = rs.some(function (x) { return x.f.ach != null; }) ? 'ach' : 'A'; rs.sort(function (a, c) { return ((c.f[key] || 0) - (a.f[key] || 0)) * (k.better || 1); }); rs.forEach(function (x, i) { if (x.ent === ent) rank[k.k] = { r: i + 1, n: rs.length, by: key }; }); });
      $('#view').innerHTML = '<div class="vh"><div class="crumb"><a href="#/pace">Pace board</a> › ' + (e.sa ? '<a href="#/sa/' + e.sa + '">' + title(e.sa) + ' SA</a> › ' : '') + '<a href="#/dists">Distributors</a></div><h1>' + esc(e.name) + '</h1><span class="sub">SAP ' + esc(code) + (e.district ? ' · ' + esc(e.district) : '') + (e.status && !/^(ACTIVE|REGULAR)$/.test(e.status) ? ' · ' + esc(e.status.toLowerCase()) : '') + '</span></div>' +
        '<section class="panel"><h2>All KPIs</h2><p class="lede">AOP pro-rata here is the distributor\'s share of ' + esc(title(e.sa || '')) + ' SA\'s, in proportion to its last-year figure. Rank is within the sales area.</p>' + boardTable(b, ent, { link: function (k) { return '#/kpi/' + k.k + (e.sa ? '?sa=' + e.sa : ''); } }) + '</section>';
      // add the rank column
      $$('.board tr.row', $('#view')).forEach(function (tr, i) { });
      var rows = $$('.board tr.row'), ks = S.meta.kpis.filter(function (k) { return b.vals[k.k] && b.vals[k.k][ent] && (fig(k, b.vals[k.k][ent]) || {}).A != null; });
      var byGroup = GROUP_ORDER.reduce(function (acc, g) { return acc.concat(ks.filter(function (k) { return k.g === g; })); }, []);
      rows.forEach(function (tr, i) { var k = byGroup[i], rk = k && rank[k.k]; var td = document.createElement('td'); td.className = 'num hide-s'; td.innerHTML = rk ? '<span class="tag">' + rk.r + ' of ' + rk.n + '</span>' : ''; tr.appendChild(td); });
      var hr = $('.board tr'); if (hr) { var th = document.createElement('th'); th.className = 'num hide-s'; th.textContent = 'Rank in SA'; hr.appendChild(th); }
      $$('.board tr.grp td').forEach(function (td) { td.colSpan = 8; });
      bindRows();
    });
  };

  VIEWS.rank = function (r) {
    var k = K(r.a) || K('tot'), sa = r.q.sa || null, order = r.q.order || 'top', n = +(r.q.n || 10);
    return board({ date: S.date, lvl: 'dist', kpi: k.k, sa: sa }).then(function (bd) {
      var rs = rowsOf(bd, k), key = rs.some(function (x) { return x.f.ach != null; }) ? 'ach' : rs.some(function (x) { return x.f.vsLY != null; }) ? 'vsLY' : 'A';
      rs = rs.filter(function (x) { return x.f[key] != null; }).sort(function (a, b) { return (b.f[key] - a.f[key]) * (k.better || 1); });
      if (order === 'bottom') rs.reverse();
      rs = rs.slice(0, n);
      var byLbl = key === 'ach' ? 'against their share of AOP pro-rata' : key === 'vsLY' ? 'against last year' : 'by actual';
      $('#view').innerHTML = '<div class="vh"><div class="crumb"><a href="#/pace">Pace board</a> › <a href="#/kpi/' + k.k + (sa ? '?sa=' + sa : '') + '">' + esc(k.l) + '</a></div><h1>' + (order === 'bottom' ? 'Bottom ' : 'Top ') + rs.length + ' distributors' + (sa ? ' in ' + title(sa) : '') + '</h1><span class="sub">' + esc(k.l) + ', ' + (S.per === 'fy' ? 'FY to date' : 'month to date') + ', ' + byLbl + '</span></div>' +
        '<section class="panel">' + LEGEND + '<table class="board"><tr><th>#</th><th>Distributor</th><th class="gcell"></th><th class="num">Actual</th><th>vs pro-rata</th><th class="num">vs last year</th></tr>' + rs.map(function (x, i) {
          return '<tr class="row" data-href="#/dist/' + x.ent.slice(2) + '"><td class="muted">' + (i + 1) + '</td><td class="kname">' + esc(x.name) + '<small>' + title(x.sa || '') + '</small></td><td class="gcell">' + gauge(k, x.f) + '</td><td class="num"><b>' + unit(k, x.f.A) + '</b></td><td>' + (x.f.P != null ? pill(x.f.ach) : '') + '</td><td class="num">' + dl(x.f, k) + '</td></tr>';
        }).join('') + '</table></section>';
      bindRows();
      return rs;
    });
  };

  VIEWS.products = function (r) {
    var sa = r.q.sa || '';
    return api('/api/v2/sales' + (sa ? '?sa=' + sa : '')).then(function (D) {
      if (!D.mtd) { $('#view').innerHTML = '<div class="vh"><h1>Products</h1></div><div class="panel empty">No item-wise sales export has been read yet.</div>'; return; }
      var ORDER = ['5nd', '19', '47', '425', '14', '5dom', '2', '10', '35', 'bulk', 'other'], KG = { '5nd': 5, '5dom': 5, '19': 19, '47': 47.5, '425': 425, '14': 14.2, '35': 35, '2': 2, '10': 10 };
      var keys = ORDER.filter(function (x) { return D.mtd.by[x] || D.ytd.by[x]; });
      var g = function (c, h) { return h ? (c - h) / Math.abs(h) * 100 : null; };
      var dd = function (c, h) { var v = g(c, h); return v == null ? '<span class="dl flat">—</span>' : '<span class="dl ' + (v >= 0 ? 'up' : 'dn') + '">' + (v >= 0 ? '▲ +' : '▼ −') + fmt(Math.abs(v), 1) + '%</span>'; };
      var months = D.months || [];
      $('#view').innerHTML = '<div class="vh"><div class="crumb"><a href="#/pace">Pace board</a></div><h1>Products</h1><span class="sub">Item-wise sales from Spotfire, MT · ' + (sa ? title(sa) + ' SA' : 'Lucknow RO') + ' · data to ' + dlab(D.asOf) + '</span><div class="chips" style="margin-left:auto">' + [''].concat(SAS).map(function (x) { return '<button type="button" data-go="#/products' + (x ? '?sa=' + x : '') + '"' + (x === sa ? ' aria-pressed="true"' : '') + '>' + (x ? title(x) : 'RO') + '</button>'; }).join('') + '</div></div>' +
        '<section class="panel" style="margin-bottom:16px"><h2>Month and FY against last year</h2><div class="tw" style="max-height:none"><table class="tbl"><thead><tr><th>Product</th><th class="num">Month to date</th><th class="num">Last year</th><th class="num">Change</th><th class="num">FY to date</th><th class="num">Last year</th><th class="num">Change</th><th class="num">Cylinders, FY</th></tr></thead><tbody>' + keys.map(function (x) {
          var m = D.mtd.by[x] || { cur: 0, hist: 0 }, y = D.ytd.by[x] || { cur: 0, hist: 0 };
          return '<tr><td><b>' + esc(D.families[x] || x) + '</b></td><td class="num">' + fmt(m.cur, 1) + '</td><td class="num">' + fmt(m.hist, 1) + '</td><td class="num">' + dd(m.cur, m.hist) + '</td><td class="num">' + fmt(y.cur, 1) + '</td><td class="num">' + fmt(y.hist, 1) + '</td><td class="num">' + dd(y.cur, y.hist) + '</td><td class="num">' + (KG[x] ? fmt(y.cur * 1000 / KG[x], 0) : '—') + '</td></tr>';
        }).join('') + '</tbody></table></div></section>' +
        '<section class="panel"><h2>Month by month</h2><p class="lede">Each month against the same month last year. The last column is this month so far.</p><div class="tw" style="max-height:none"><table class="tbl"><thead><tr><th>Product</th>' + months.map(function (m) { return '<th class="num">' + new Date(m.month + '-15').toLocaleString('en-IN', { month: 'short' }) + (m.toDate ? ' (to date)' : '') + '</th>'; }).join('') + '</tr></thead><tbody>' + keys.map(function (x) {
          return '<tr><td><b>' + esc(D.families[x] || x) + '</b></td>' + months.map(function (m) { if (m.missing) return '<td class="num muted">waiting</td>'; var v = m.by[x] || { cur: 0, hist: 0 }; return '<td class="num">' + fmt(v.cur, 1) + '<span class="sm">LY ' + fmt(v.hist, 1) + ' ' + dd(v.cur, v.hist) + '</span></td>'; }).join('') + '</tr>';
        }).join('') + '</tbody></table></div></section>';
      $$('[data-go]').forEach(function (bt) { bt.addEventListener('click', function () { go(bt.dataset.go); }); });
    });
  };

  function onMac(t) { $('#view').innerHTML = '<div class="vh"><h1>' + t + '</h1></div><div class="panel empty">This is on the board on the Mac and through the phone link, not in the published copy.</div>'; }
  VIEWS.live = function (r) {
    if (ST) return onMac('Live');
    return api('/api/live' + (r.q.slot ? '?date=' + r.q.date + '&slot=' + encodeURIComponent(r.q.slot) : '')).then(function (L) {
      if (L.none) { $('#view').innerHTML = '<div class="vh"><h1>Live</h1><span class="sub">Separate from the daily figures</span></div><div class="panel empty">No refresh during the day yet. The fetcher refreshes the reports it can download at 11:00, 13:00, 15:00 and 17:00.</div>'; return; }
      var chg = function (v, dec, u) { return v == null ? '<span class="dl flat">—</span>' : '<span class="dl ' + (v > 0 ? 'up' : v < 0 ? 'dn' : 'flat') + '">' + (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v), dec) + (u === '%' ? ' pts' : '') + '</span>'; };
      var d = function (a, b) { return a == null || b == null ? null : a - b; };
      $('#view').innerHTML = '<div class="vh"><h1>Live</h1><span class="sub">' + dlab(L.date) + ' at ' + esc(L.slot) + ' · against the close of ' + dlab(L.base) + '. These refreshes never change the daily figures.</span><div class="chips" style="margin-left:auto">' + L.slots.map(function (x) { return '<button type="button" data-go="#/live?date=' + L.date + '&slot=' + encodeURIComponent(x) + '"' + (x === L.slot ? ' aria-pressed="true"' : '') + '>' + esc(x) + '</button>'; }).join('') + '</div></div>' +
        '<section class="panel"><div class="tw" style="max-height:none"><table class="tbl"><thead><tr><th>Figure</th><th class="num">Now</th><th class="num">At the close</th><th class="num">Change</th>' + SAS.map(function (x) { return '<th class="num">' + title(x) + '</th>'; }).join('') + '</tr></thead><tbody>' + L.metrics.map(function (m) {
          return '<tr><td>' + esc(m.l) + ' <span class="muted">' + esc(m.u) + '</span></td><td class="num"><b>' + fmt(m.live.RO, m.dec) + '</b></td><td class="num">' + fmt(m.base.RO, m.dec) + '</td><td class="num">' + chg(d(m.live.RO, m.base.RO), m.dec, m.u) + '</td>' + SAS.map(function (x) { return '<td class="num">' + fmt(m.live[x], m.dec) + '<span class="sm">' + chg(d(m.live[x], m.base[x]), m.dec, m.u) + '</span></td>'; }).join('') + '</tr>';
        }).join('') + '</tbody></table></div><p class="note">Reports in this refresh: ' + L.files.filter(function (f) { return f.ok; }).map(function (f) { return esc(f.kind); }).join(', ') + '.</p></section>';
      $$('[data-go]').forEach(function (bt) { bt.addEventListener('click', function () { go(bt.dataset.go); }); });
    });
  };

  VIEWS.sources = function () {
    if (ST) return onMac('Sources');
    var today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
    return Promise.all([api('/api/v2/days/' + today).catch(function () { return null; }), api('/api/v2/plan/' + today).catch(function () { return null; }), api('/api/alerts').catch(function () { return []; })]).then(function (res) {
      var st = res[0], pl = res[1], al = (res[2] || []).filter(function (a) { return !a.resolved; });
      var needs = [];
      al.forEach(function (a) { needs.push({ t: a.title, b: a.body, lvl: a.level }); });
      (pl && pl.jobs || []).filter(function (j) { return /sign/i.test(j.message || '') && j.state !== 'done'; }).forEach(function (j) { needs.push({ t: j.label + ': sign-in needed', b: j.message, lvl: 'warn' }); });
      var stC = function (s) { return s === 'ok' ? 'good' : s === 'late' ? 'bad' : s === 'empty' ? 'warn' : 'none'; };
      var stL = { ok: 'In', late: 'Late', empty: 'Arrived empty', missing: 'Not yet' };
      $('#view').innerHTML = '<div class="vh"><h1>Sources</h1><span class="sub">Today\'s reports, the agent\'s jobs, and anything that needs you</span></div>' +
        '<section class="panel" style="margin-bottom:16px"><h2>Needs you</h2>' + (needs.length ? '<div class="list">' + needs.map(function (n) { return '<div class="it"><span class="st ' + (n.lvl === 'error' ? 'bad' : 'warn') + '">' + (n.lvl === 'error' ? 'Act now' : 'Check') + '</span><div><div class="t">' + esc(n.t) + '</div><div class="muted">' + esc((n.b || '').slice(0, 300)) + '</div></div></div>'; }).join('') + '</div>' : '<p class="lede">Nothing. Sign-ins and failures are also sent to your e-mail and Teams the moment they happen.</p>') + '</section>' +
        (S.role === 'owner' && !S.remote ? '<div class="grid g2" style="margin-bottom:16px"><section class="panel" id="phonePanel"><h2>Phone</h2><div id="phoneBox"><p class="lede">Checking the phone link…</p></div></section><section class="panel" id="pubPanel"><h2>Publishing</h2><div id="pubBox"><p class="lede">Checking…</p></div></section></div>' : '') +
        '<div class="grid g2"><section class="panel"><h2>Reports for ' + dlab(today) + '</h2><p class="lede">' + (st ? st.have + ' of ' + st.need + ' required reports in' : 'No reports yet today') + '</p>' + (st ? '<table class="tbl"><tbody>' + st.reports.map(function (x) { return '<tr><td>' + esc(x.label) + '<span class="sm">' + esc(x.route) + (x.due ? ' · due ' + x.due : '') + (x.required ? '' : ' · optional') + '</span></td><td><span class="st ' + stC(x.status) + '">' + (stL[x.status] || x.status) + (x.lateMin ? ' ' + x.lateMin + ' min' : '') + '</span></td></tr>'; }).join('') + '</tbody></table>' : '') + '</section>' +
        '<section class="panel"><h2>Agent jobs</h2><p class="lede">' + (pl ? (pl.agentMode ? 'Agent mode on' : 'Agent mode off') + ' · ' + (pl.jobs || []).length + ' jobs' : '') + '</p>' + (pl ? '<table class="tbl"><tbody>' + pl.jobs.map(function (j) { return '<tr><td>' + esc(j.label) + '<span class="sm">' + esc((j.message || '').slice(0, 120)) + '</span></td><td><span class="st ' + (j.state === 'done' ? 'good' : /retry|gave_up/.test(j.state) ? 'bad' : j.state === 'skipped' ? 'none' : 'warn') + '">' + esc(j.state.replace('_', ' ')) + '</span></td></tr>'; }).join('') + '</tbody></table>' : '') + '</section></div>';
      phonePanel(); pubPanel();
    });
  };

  /* the Publishing panel (owner, on the Mac): the copy on GitHub Pages for officers, zone and HQ */
  function pubPanel() {
    var box = $('#pubBox'); if (!box) return;
    api('/api/publish').then(function (v) { drawPub(box, v); }).catch(function (e) { box.innerHTML = '<p class="muted">' + esc(e.message) + '</p>'; });
  }
  function when(t) { return t ? new Date(t).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'; }
  function drawPub(box, v, msg) {
    var st = !v.setUp ? '<span class="st warn">Not set up</span>' : v.error ? '<span class="st bad">Failing</span>' : v.published ? '<span class="st good">Publishing</span>' : '<span class="st warn">Waiting</span>';
    var h = '<p class="lede">' + st + ' The board is copied, encrypted with the dashboard passcode, to <a href="' + esc(v.url) + '" target="_blank" rel="noopener">' + esc(v.url.replace('https://', '')) + '</a> after each day\'s data is in. Anyone with the passcode can open it there, on any phone or computer.</p>';
    if (v.setUp) h += '<div class="facts" style="grid-template-columns:repeat(2,minmax(0,1fr))"><div><span>Last published</span><b>' + when(v.published) + '</b></div><div><span>Data to</span><b>' + (v.latest ? dlab(v.latest) : '—') + '</b></div></div>' + (v.error ? '<p class="note" style="color:var(--bad-ink)">' + esc(v.error) + '</p>' : '');
    h += '<form id="pubForm" class="pubform"' + (v.setUp ? ' hidden' : '') + '><p class="sm">One-time set-up. A GitHub fine-grained token for <b>llro-dashboard</b> with <b>Contents: Read and write</b>, and the dashboard passcode. The passcode itself is not stored, only the key made from it.</p><label for="pubTok">GitHub token</label><input id="pubTok" type="password" autocomplete="off" placeholder="' + (v.setUp ? 'Leave empty to keep the current token' : 'github_pat_…') + '"><label for="pubPass">Dashboard passcode</label><input id="pubPass" type="password" autocomplete="off"><div class="tools"><button class="btn" type="submit">Save and publish</button></div></form>';
    h += '<div class="tools" style="margin-top:12px">' + (v.setUp ? '<button type="button" class="btn" id="pubNow">Publish now</button><button type="button" class="btn ghost" id="pubEdit">Change token or passcode</button>' : '') + '</div><p class="note" id="pubMsg">' + esc(msg || '') + '</p>';
    box.innerHTML = h;
    var post = function (u, b) { return api(u, { method: 'POST', body: JSON.stringify(b || {}) }); };
    $('#pubForm').addEventListener('submit', function (e) {
      e.preventDefault(); $('#pubMsg').textContent = 'Checking with GitHub…';
      post('/api/publish/setup', { token: $('#pubTok').value, pass: $('#pubPass').value }).then(function (r) { $('#pubMsg').textContent = 'Saved. Publishing…'; return post('/api/publish/run').then(function (x) { drawPub(box, x.status, x.error ? 'Publishing failed: ' + x.error : 'Published ' + (x.changed || 0) + ' file(s).'); }); })
        .catch(function (er) { $('#pubMsg').textContent = er.message; });
    });
    if ($('#pubNow')) $('#pubNow').addEventListener('click', function () { $('#pubMsg').textContent = 'Publishing…'; post('/api/publish/run').then(function (x) { drawPub(box, x.status, x.error ? 'Publishing failed: ' + x.error : x.skipped ? 'Nothing to do: ' + x.skipped : x.changed ? 'Published ' + x.changed + ' file(s).' : 'Already up to date.'); }).catch(function (er) { $('#pubMsg').textContent = er.message; }); });
    if ($('#pubEdit')) $('#pubEdit').addEventListener('click', function () { $('#pubForm').hidden = false; $('#pubEdit').hidden = true; $('#pubTok').focus(); });
  }

  /* the Phone panel (owner, on the Mac): the tunnel address, a code to scan, a mailed link, unlink */
  function phonePanel() {
    var box = $('#phoneBox'); if (!box) return;
    api('/api/phone').then(function (v) { drawPhone(box, v, null); }).catch(function (e) { box.innerHTML = '<p class="muted">' + esc(e.message) + '</p>'; });
  }
  function drawPhone(box, v, link) {
    if (!v.enabled) { box.innerHTML = '<p class="lede">Phone access is not installed on this Mac.</p>'; return; }
    var st = !v.running ? '<span class="st warn">Starting</span>' : !v.url ? '<span class="st warn">Waiting for an address</span>' : v.reachable === false ? '<span class="st bad">Not answering</span>' : v.reachable ? '<span class="st good">Working</span>' : '<span class="st warn">Checking</span>';
    var h = '<p class="lede">' + st + ' ' + (v.url ? 'Phones reach the board at <b>' + esc(v.url.replace('https://', '')) + '</b>. ' : '') + 'Phones can only read the board; they cannot sign in with a password or change anything.' + (v.mailed ? ' Last link mailed ' + esc(String(v.mailed).slice(0, 16).replace('T', ' ')) + '.' : '') + '</p>';
    if (link) {
      var qr = '';
      try { var q = qrcode(0, 'M'); q.addData(link); q.make(); qr = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); } catch (e) {}
      h += '<div class="pair"><div class="qr" aria-label="Code to scan with the phone camera">' + qr + '</div><div><p><b>Scan this with the phone camera</b>, or open the link on the phone. It works once, for the next 15 minutes.</p><p class="sm" style="word-break:break-all">' + esc(link) + '</p></div></div>';
    }
    h += '<div class="tools" style="margin-top:12px"><button type="button" class="btn" id="phShow"' + (v.url ? '' : ' disabled') + '>Show a code for my phone</button><button type="button" class="btn ghost" id="phMail"' + (v.url ? '' : ' disabled') + '>E-mail me a link</button><button type="button" class="btn ghost" id="phOff">Unlink all phones</button></div><p class="note" id="phMsg"></p>';
    box.innerHTML = h;
    var post = function (u, b) { return api(u, { method: 'POST', body: JSON.stringify(b || {}) }); };
    $('#phShow').addEventListener('click', function () { post('/api/phone/link', {}).then(function (r) { drawPhone(box, r, r.link); }); });
    $('#phMail').addEventListener('click', function () { $('#phMsg').textContent = 'Sending…'; post('/api/phone/link', { mail: true }).then(function (r) { drawPhone(box, r, null); $('#phMsg').textContent = /outlook|mail|webhook/.test(r.mailedNow || '') && !/failed/.test(r.mailedNow || '') ? 'Sent. It works once, within 24 hours.' : 'Could not send: ' + (r.mailedNow || 'no mail channel'); }); });
    $('#phOff').addEventListener('click', function () { post('/api/phone/unlink-all').then(function () { $('#phMsg').textContent = 'Every linked phone is now signed out. Link a phone again with a new code or e-mail.'; }); });
  }

  /* ---------- tooltips on gauges ---------- */
  document.addEventListener('mouseover', function (ev) {
    var g = ev.target.closest && ev.target.closest('[data-tip]'), tip = $('#tip'); if (!g) return;
    try { var d = JSON.parse(decodeURIComponent(g.dataset.tip)), k = K(d.k); tip.innerHTML = '<b>' + esc(k.l) + '</b><div class="r"><span><i style="background:var(--act)"></i>Actual</span><span>' + unitT(k, d.A) + '</span></div>' + (d.P != null ? '<div class="r"><span><i style="background:var(--flame)"></i>AOP pro-rata</span><span>' + unitT(k, d.P) + '</span></div><div class="r"><span>Against pro-rata</span><span>' + fmt(d.ach, 0) + '%</span></div>' : '') + (d.LY != null ? '<div class="r"><span><i style="background:var(--ly)"></i>Last year</span><span>' + unitT(k, d.LY) + '</span></div>' : ''); tip.hidden = false; } catch (e) { return; }
    var move = function (e) { tip.style.left = Math.min(innerWidth - 240, e.clientX + 14) + 'px'; tip.style.top = (e.clientY + 14) + 'px'; };
    move(ev); g.addEventListener('mousemove', move); g.addEventListener('mouseleave', function out() { tip.hidden = true; g.removeEventListener('mousemove', move); g.removeEventListener('mouseleave', out); });
  });

  /* ---------- the command bar ---------- */
  function answer(html, q) {
    var a = $('#answer'); a.hidden = false;
    a.innerHTML = '<div class="q">You asked: “' + esc(q) + '”</div><div>' + html + '</div><button class="x" type="button" aria-label="Close the answer">×</button>';
    $('.x', a).addEventListener('click', function () { a.hidden = true; });
  }
  function say(text) { if (!S.speak || !window.speechSynthesis) return; try { speechSynthesis.cancel(); var u = new SpeechSynthesisUtterance(text); u.lang = 'en-IN'; u.rate = 1.02; speechSynthesis.speak(u); } catch (e) {} }
  function sentence(k, f, ent) {
    var per = f.per === 'fy' ? 'FY to date' : 'month to date';
    var s = k.l + ', ' + entName(ent) + ', ' + per + ': ' + unitT(k, f.A) + '.';
    if (f.P != null) s += ' AOP pro-rata ' + unitT(k, f.P) + ', ' + fmt(f.ach, 0) + '% — ' + stLabel(f.ach).toLowerCase() + '.';
    else if (k.plan) s += ' No AOP pro-rata for this entity.'; else s += ' No AOP set for this KPI.';
    if (f.LY != null) s += ' Last year ' + unitT(k, f.LY) + (f.vsLY != null ? ' (' + (f.vsLY >= 0 ? '+' : '−') + fmt(Math.abs(f.vsLY), 1) + '%)' : '') + '.';
    return s;
  }
  function run(text) {
    var p = Grammar.parse(text, { ents: S.ents, dates: S.meta.dates, latest: S.meta.latest });
    if (!p.ok) { answer('I could not match that to a KPI, a sales area or a distributor. Try “domestic sales in Kanpur”, “top 10 for ARB in Jhansi”, “e-KYC FY” or a distributor\'s name.', text); return; }
    if (p.per) setPer(p.per, true);
    if (p.date) { S.date = p.date; $('#day').value = p.date; }
    var sa = p.ent && SAS.indexOf(p.ent) >= 0 ? p.ent : null;
    if (p.view === 'rank') {
      var k0 = K(p.kpi || 'tot');
      go('#/rank/' + k0.k + '?order=' + p.order + '&n=' + p.n + (sa ? '&sa=' + sa : ''));
      board({ date: S.date, lvl: 'dist', kpi: k0.k, sa: sa }).then(function (bd) { var rs = rowsOf(bd, k0); answer('<b>' + (p.order === 'bottom' ? 'Bottom ' : 'Top ') + Math.min(p.n, rs.length) + '</b> distributors' + (sa ? ' in ' + title(sa) : '') + ' on ' + esc(k0.l) + ', ' + (S.per === 'fy' ? 'FY to date' : 'month to date') + '.', text); say((p.order === 'bottom' ? 'Bottom ' : 'Top ') + p.n + ' distributors on ' + k0.l); });
      return;
    }
    if (['live', 'sources', 'products', 'areas', 'pace'].indexOf(p.view) >= 0 && !p.kpi) { go('#/' + p.view + (p.view === 'products' && sa ? '?sa=' + sa : '')); answer('Opened <b>' + p.view + '</b>.', text); return; }
    if (p.kpi) {
      var k = K(p.kpi), ent = p.ent || 'RO';
      if (ent.indexOf('d:') === 0) go('#/dist/' + ent.slice(2)); else go('#/kpi/' + k.k + (sa ? '?sa=' + sa : ''));
      board({ date: S.date, ent: ent, kpi: k.k }).then(function (b) {
        var f = fig(k, b.vals[k.k] && b.vals[k.k][ent]);
        if (!f || f.A == null) { answer('No figure for ' + esc(k.l) + ' at ' + esc(entName(ent)) + ' on ' + dlab(b.date) + '.', text); return; }
        var s = sentence(k, f, ent); answer(esc(s).replace(/^([^:]+:)/, '<b>$1</b>'), text); say(s);
      });
      return;
    }
    if (p.ent) {
      if (p.ent.indexOf('d:') === 0) { go('#/dist/' + p.ent.slice(2)); answer('Opened <b>' + esc(entName(p.ent)) + '</b>.', text); }
      else if (p.ent === 'RO') { go('#/pace'); answer('Opened the <b>Lucknow RO</b> pace board.', text); }
      else { go('#/sa/' + p.ent); answer('Opened <b>' + title(p.ent) + ' SA</b>.', text); }
      return;
    }
    route(); answer('Showing <b>' + dlab(S.date) + '</b>.', text);
  }
  $('#ask').addEventListener('submit', function (e) { e.preventDefault(); var v = $('#q').value.trim(); if (v) run(v); });
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('#q').focus(); $('#q').select(); }
    if (e.altKey && e.code === 'Space') { e.preventDefault(); listen(); }
  });
  /* voice: the browser's speech recognition (Chrome, Edge, Safari) in Indian English */
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition, rec = null;
  function listen() {
    if (!SR) { answer('This browser has no speech recognition. Chrome, Edge and Safari do.', 'voice'); return; }
    if (rec) { rec.stop(); return; }
    rec = new SR(); rec.lang = 'en-IN'; rec.interimResults = true; rec.maxAlternatives = 1;
    $('#mic').classList.add('on'); $('#mic').setAttribute('aria-label', 'Listening — click to stop');
    rec.onresult = function (ev) { var t = ''; for (var i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript; $('#q').value = t; if (ev.results[ev.results.length - 1].isFinal) { S.speak = true; run(t); } };
    rec.onerror = function (ev) { if (ev.error !== 'no-speech' && ev.error !== 'aborted') answer('Voice input stopped: ' + esc(ev.error) + '. Check that the browser may use the microphone.', 'voice'); };
    rec.onend = function () { rec = null; $('#mic').classList.remove('on'); $('#mic').setAttribute('aria-label', 'Speak a command'); };
    try { rec.start(); } catch (e) { rec = null; $('#mic').classList.remove('on'); }
  }
  $('#mic').addEventListener('click', listen);

  /* expose for tests */
  window.LLRO = { run: run, S: S, fig: fig };
  function start() {
    if (ST) {
      $$('.rail a[data-nav=live], .rail a[data-nav=sources]').forEach(function (a) { a.hidden = true; });
      return ST.auto().then(function (ok) { if (!ok) return showLogin('static'); S.role = 'viewer'; S.static = true; boot(); }).catch(function (e) { $('#view').innerHTML = '<div class="empty">' + esc(e.message) + '</div>'; });
    }
    return api('/api/me').then(function (me) { S.role = me.role; S.remote = me.remote; boot(); }).catch(function () {}); }
  var pm = !ST && /[#&]pair=([A-Za-z0-9_-]{20,})/.exec(location.hash);
  if (pm) {
    history.replaceState(null, '', location.pathname + '#/pace');
    fetch('/api/phone/redeem', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: pm[1] }) }).then(function (r) {
      return r.json().then(function (j) { if (!r.ok) { showLogin(true); $('#loginErr').textContent = j.error || 'This link did not work.'; } else start(); });
    });
  } else start();
})();
