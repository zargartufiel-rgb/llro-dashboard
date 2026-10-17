/* LLRO Pace Board — command grammar (works offline, no AI service).
   Turns a typed or spoken command into a view:
     "19 kg sales in Kanpur vs last year"         → KPI 19 kg, sales area Kanpur, month
     "domestic FY Lucknow"                        → KPI domestic, sales area Lucknow, FY to date
     "top 10 distributors for ARB in Jhansi"      → ranking of Jhansi distributors on ARB
     "worst 5 on DAC"                             → bottom 5 distributors on domestic DAC
     "Mamta gas agency"                           → that distributor's page
     "trend of e-KYC"                             → KPI page (daily run)
     "live" / "today so far" · "sources" / "what is missing" · "products" / "item wise"
     "yesterday" / "on 12 October"                → that data date
   Hindi words that commonly come up are understood too (bikri, dikhao, pichhla saal, sabse kam / zyada). */
(function () {
  'use strict';
  var KPI_WORDS = [
    ['p19', ['19 kg', '19kg', 'nineteen kg', '19 kilo', 'commercial 19']],
    ['p47', ['47.5', '47 kg', '475', '47 point 5', 'forty seven']],
    ['p425', ['425', '425 kg', 'four twenty five']],
    ['p14', ['14.2', '14 kg', '142', 'domestic cylinder', 'fourteen point two']],
    ['p5dom', ['5 kg domestic', '5kg domestic', '5 kg dom']],
    ['appu', ['5 kg', '5kg', 'five kg', 'appu', 'ftl', 'chhotu', '5 kg nd', 'free trade']],
    ['p2', ['2 kg', '2kg', 'two kg']],
    ['p10', ['10 kg', '10kg', 'composite', 'fibre']],
    ['navya', ['navya']],
    ['ncNd', ['new connection', 'new connections', 'nc', 'connection release']],
    ['dom', ['domestic', 'dom sales', 'dom']],
    ['nd', ['non domestic', 'non-domestic', 'nd sales', 'nd', 'commercial']],
    ['blk', ['bulk', 'propane']],
    ['tot', ['total', 'overall sales', 'lpg sales', 'all sales', 'sales', 'bikri']],
    ['arb', ['arb', 'orc', 'hose sale', 'appliances']],
    ['hose', ['hose change', 'hose conversion', 'hose']],
    ['miPend', ['mi pending', 'pending inspection', 'pending mi']],
    ['mi', ['mandatory inspection', 'inspection', 'inspections', 'mi']],
    ['ekycPend', ['ekyc pending', 'e-kyc pending', 'kyc pending', 'pending kyc', 'pending ekyc']],
    ['ekycCov', ['ekyc coverage', 'kyc coverage', 'e-kyc coverage']],
    ['ekyc', ['ekyc', 'e-kyc', 'e kyc', 'kyc']],
    ['cashless', ['cashless', 'online payment', 'digital payment', 'paid online']],
    ['hpBook', ['hp pay', 'hppay', 'hp pe']],
    ['dacNd', ['nd dac', 'dac nd']],
    ['dacDom', ['dac', 'delivery authentication']],
    ['bPend', ['pending booking', 'pending bookings', 'backlog bookings']],
    ['backlog', ['backlog', 'days of sale']],
    ['aged7', ['7 days', 'seven days', 'aged']],
    ['snr', ['stock not returned', 'not returned']],
    ['rcCyl', ['recovery', 'cylinder recovery']]
  ];
  var SAS = ['ETAWAH', 'JHANSI', 'KANPUR', 'LUCKNOW', 'SITAPUR'];
  var MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  var NUMW = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20, das: 10, paanch: 5 };

  function clean(s) { return ' ' + String(s || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9.\- ]+/g, ' ').replace(/\s+/g, ' ').trim() + ' '; }
  function has(t, w) { return t.indexOf(' ' + w + ' ') >= 0; }
  function cut(t, w) { return t.replace(' ' + w + ' ', ' __ '); }

  function findKpi(t) {
    for (var i = 0; i < KPI_WORDS.length; i++) {
      var ws = KPI_WORDS[i][1];
      for (var j = 0; j < ws.length; j++) if (has(t, ws[j])) return { k: KPI_WORDS[i][0], w: ws[j] };
    }
    return null;
  }
  /* distributor by name: the entity whose name shares the most distinctive words with the command */
  var STOP = { hp: 1, gas: 1, agency: 1, service: 1, services: 1, sa: 1, lpg: 1, the: 1, of: 1, and: 1, ms: 1, gramin: 1, vitrak: 1, vitran: 1, distributor: 1, distributors: 1, enterprises: 1, show: 1, me: 1, for: 1, in: 1, sales: 1, kanpur: 1, lucknow: 1, etawah: 1, jhansi: 1, sitapur: 1 };
  function findDist(t, ents) {
    var words = t.trim().split(' ').filter(function (w) { return w.length > 2 && !STOP[w]; }), best = null, bs = 0;
    if (!words.length) return null;
    (ents || []).forEach(function (e) {
      if (e.lvl !== 'dist' || !e.name) return;
      var nw = clean(e.name).trim().split(' ').filter(function (w) { return w.length > 2 && !STOP[w]; }); if (!nw.length) return;
      var hit = 0; nw.forEach(function (w) { if (words.indexOf(w) >= 0) hit++; });
      var code = e.ent.slice(2), byCode = t.indexOf(code) >= 0 || t.indexOf(code.replace(/^0+/, '')) >= 0;
      var s = byCode ? 10 : hit / nw.length + hit * 0.25;
      if (hit >= 1 && s > bs && (hit >= Math.min(2, nw.length) || byCode)) { bs = s; best = e; }
      if (byCode && s >= bs) { bs = s; best = e; }
    });
    return best;
  }
  function findDate(t, dates, latest) {
    if (has(t, 'yesterday') || has(t, 'kal')) { var i = dates.indexOf(latest); return dates[i + 1] || null; }
    var m = /\b(\d{1,2})(st|nd|rd|th)? (of )?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/.exec(t) || null, m2 = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* (\d{1,2})(st|nd|rd|th)?\b/.exec(t);
    var dd = null, mm = null;
    if (m) { dd = +m[1]; mm = MONTHS.indexOf(m[4]); } else if (m2) { dd = +m2[2]; mm = MONTHS.indexOf(m2[1]); }
    if (dd == null || mm < 0) return null;
    var want = '-' + String(mm + 1).padStart(2, '0') + '-' + String(dd).padStart(2, '0');
    return (dates || []).filter(function (d) { return d.slice(4) === want; })[0] || null;
  }

  function parse(text, ctx) {
    ctx = ctx || {};
    var t = clean(text), out = { raw: text, kpi: null, ent: null, per: null, view: null, n: null, order: null, date: null, understood: [] };
    if (!t.trim()) return out;
    // where to go
    if (/ (live|today so far|aaj|right now|abhi) /.test(t)) out.view = 'live';
    else if (/ (sources|missing|reports status|which reports|data status|login|sign in|credential) /.test(t)) out.view = 'sources';
    else if (/ (products|product mix|item wise|itemwise|cylinder mix) /.test(t)) out.view = 'products';
    else if (/ (all areas|sales areas|area wise|sa wise|compare areas) /.test(t)) out.view = 'areas';
    else if (/ (pace|overview|home|summary|dashboard|everything) /.test(t)) out.view = 'pace';
    // period
    if (/ (fy|ytd|year to date|financial year|this year|full year|saal) /.test(t)) out.per = 'fy';
    else if (/ (month|mtd|this month|mahina|mahine) /.test(t)) out.per = 'm';
    // ranking
    var top = /\b(top|best|highest|leading|sabse zyada|most)\b/.test(t), bot = /\b(bottom|worst|lowest|weakest|lagging|poor|sabse kam|least)\b/.test(t);
    if (top || bot) {
      out.order = bot ? 'bottom' : 'top';
      var nm = /\b(top|best|bottom|worst|lowest|highest)\s+(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty)\b/.exec(t);
      out.n = nm ? (+nm[2] || NUMW[nm[2]]) : 10;
      out.view = 'rank';
    }
    // KPI
    var k = findKpi(t); if (k) { out.kpi = k.k; out.understood.push(k.w); t = cut(t, k.w); }
    // sales area / RO
    if (/ (lucknow ro|whole ro|region|regional office|ro level|ro) /.test(t)) out.ent = 'RO';
    else SAS.forEach(function (sa) { if (!out.ent && has(t, sa.toLowerCase())) out.ent = sa; });
    // distributor
    if (!out.ent || out.view !== 'rank') { var d = findDist(t, ctx.ents); if (d) { out.ent = d.ent; out.understood.push(d.name); } }
    out.date = findDate(t, ctx.dates || [], ctx.latest);
    if (!out.view) out.view = out.kpi ? 'kpi' : out.ent && out.ent.indexOf('d:') === 0 ? 'dist' : out.ent && out.ent !== 'RO' ? 'sa' : null;
    out.ok = !!(out.view || out.kpi || out.ent || out.date);
    return out;
  }
  window.Grammar = { parse: parse, KPI_WORDS: KPI_WORDS };
})();
