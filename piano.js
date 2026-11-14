/* Piano fermi: calcoli condivisi da index.html (pagina Piano) e marcia.html (link per i piloti).
   Date come stringhe AAAA-MM-GG, settimane ISO "AAAA-Www", ore in minuti. Gira anche in Node (test.mjs). */
(function (g) {
  "use strict";
  var G = 864e5, MESI = ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUG", "AGO", "SET", "OTT", "NOV", "DIC"];
  var ms = function (d) { return Date.parse(d + "T00:00:00Z"); };
  var iso = function (t) { return new Date(t).toISOString().slice(0, 10); };
  var addG = function (d, n) { return iso(ms(d) + n * G); };
  var diffG = function (a, b) { return Math.round((ms(b) - ms(a)) / G); }; // giorni da a a b
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var fd = function (d) { return d ? d.slice(8, 10) + "/" + d.slice(5, 7) + "/" + d.slice(0, 4) : "–"; };
  var hm = function (m) { return m == null ? "–" : Math.floor(m / 60) + ":" + String(m % 60).padStart(2, "0"); };

  function lunedi(wk) { // lunedì della settimana ISO
    var m = /^(\d{4})-W(\d{1,2})$/.exec(wk || "");
    if (!m) return null;
    var j4 = Date.UTC(+m[1], 0, 4), dow = new Date(j4).getUTCDay() || 7;
    return iso(j4 + ((+m[2] - 1) * 7 - (dow - 1)) * G);
  }
  function settimana(d) {
    var x = new Date(ms(d)), dow = x.getUTCDay() || 7;
    x.setUTCDate(x.getUTCDate() + 4 - dow); // il giovedì decide l'anno ISO
    var y = x.getUTCFullYear(), n = Math.floor((x - Date.UTC(y, 0, 1)) / G / 7) + 1;
    return y + "-W" + String(n).padStart(2, "0");
  }

  // res ripartito sui mesi in proporzione ai giorni, senza superare il tetto di ciascuno (riempimento a livelli)
  function ripartisci(res, giorni, tetti) {
    var out = giorni.map(function () { return 0; }), liberi = [], resto = Math.max(res, 0);
    giorni.forEach(function (n, i) { if (n > 0) liberi.push(i); });
    while (liberi.length && resto > 0) {
      var tot = liberi.reduce(function (s, i) { return s + giorni[i]; }, 0);
      var pieni = liberi.filter(function (i) { return resto * giorni[i] / tot >= tetti[i]; });
      if (!pieni.length) { liberi.forEach(function (i) { out[i] = resto * giorni[i] / tot; }); break; }
      pieni.forEach(function (i) { out[i] = tetti[i]; resto -= tetti[i]; });
      liberi = liberi.filter(function (i) { return pieni.indexOf(i) < 0; });
    }
    return out;
  }

  // Tabella di marcia di una macchina: ore residue alla data della giornaliera `da`, volabili fino al giorno prima
  // dell'ingresso `a`; tetto in ore/mese (0 = nessuno), ridotto in proporzione nei mesi a metà. Ore intere per difetto.
  function marcia(da, a, res, tettoOre) {
    var mesi = [], giorni = [], tetti = [];
    for (var d = addG(da, 1); d < a;) {
      var m = d.slice(0, 7), dopo = iso(Date.UTC(+m.slice(0, 4), +m.slice(5), 1)), lim = dopo < a ? dopo : a, n = diffG(d, lim);
      mesi.push(m); giorni.push(n); tetti.push(tettoOre ? tettoOre * 60 * n / diffG(m + "-01", dopo) : Infinity);
      d = lim;
    }
    var cum = 0, prec = 0;
    var fh = ripartisci(res, giorni, tetti).map(function (x) { // arrotonda il cumulato: la somma non supera mai il residuo
      cum += x; var c = Math.floor(cum / 60 + 1e-9) * 60, v = c - prec; prec = c; return v;
    });
    return { mesi: mesi.map(function (m, i) { return [m, fh[i]]; }), resto: Math.max(res, 0) - prec };
  }

  // --- PPL: { "tipo|anno": { righe: { sigla: { "MM": minuti | [testo, giorno, minuti?] | null } } } } ---
  var pm = function (v) { return typeof v === "number" ? v : Array.isArray(v) ? v[2] || 0 : 0; }; // FH programmate nel mese
  var primoDopo = function (m) { return iso(Date.UTC(+m.slice(0, 4), +m.slice(5), 1)); }; // "AAAA-MM" → primo del mese dopo
  function pplMesi(ppl) { // → { sigla: [["AAAA-MM", valore], ...] } in ordine, unendo gli anni
    var out = {};
    Object.keys(ppl || {}).forEach(function (k) {
      var y = k.split("|")[1], r = ppl[k].righe;
      Object.keys(r).forEach(function (s) { Object.keys(r[s]).forEach(function (mm) { (out[s] = out[s] || []).push([y + "-" + mm, r[s][mm]]); }); });
    });
    Object.keys(out).forEach(function (s) { out[s].sort(function (a, b) { return a[0] < b[0] ? -1 : 1; }); });
    return out;
  }
  // fermi di una macchina: una cella di testo apre un fermo che dura per i mesi vuoti fino alla prossima cella piena;
  // lo stesso testo di seguito (anche a cavallo d'anno) lo continua; senza fine nei dati resta aperto fino all'ultimo mese
  function fermiPpl(mesi) {
    var out = [], cur = null, fine = null;
    mesi.forEach(function (x) {
      var v = x[1], t = Array.isArray(v) ? v[0] : null;
      fine = primoDopo(x[0]);
      if (v == null || (cur && t === cur.testo)) return;
      var d = x[0] + "-" + String(t ? v[1] : 1).padStart(2, "0");
      if (cur) { cur.out = d; out.push(cur); cur = null; }
      if (t) cur = { testo: t, in: d, tbd: /^TBD$/i.test(t) };
    });
    if (cur) { cur.out = fine; cur.aperto = true; out.push(cur); }
    return out;
  }
  // marcia dalla PPL dal mese della giornaliera `da` (il mese in corso vale le FH ancora da volare);
  // resto = residuo meno le FH programmate fino al prossimo fermo, null se la macchina è già in un fermo
  function marciaPpl(mesi, da, oreMese, res) {
    var m0 = da.slice(0, 7), fe = fermiPpl(mesi), out = [], usate = 0;
    var ora = fe.some(function (f) { return f.in <= da && da < f.out; }), stop = ora;
    mesi.forEach(function (x) {
      if (x[0] < m0) return;
      var v = x[1], h = x[0] === m0 ? Math.max(pm(v) - oreMese, 0) : pm(v);
      var dentro = fe.some(function (f) { return f.in < primoDopo(x[0]) && f.out > x[0] + "-01"; });
      if (Array.isArray(v)) out.push([x[0], v[0]]); else if (v != null) out.push([x[0], h]); else if (dentro) out.push([x[0], ""]);
      if (!stop) { usate += h; stop = Array.isArray(v); }
    });
    return { mesi: out, resto: ora || res == null ? null : res - usate, prossimo: fe.find(function (f) { return f.out > da; }) || null };
  }
  function piuMesi(m, k) { return new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1 + k, 1)).toISOString().slice(0, 7); }
  // riga programmata dei 12 mesi da "AAAA-MM" come nella PPL: 36 decadi (3 per mese), le lavorazioni unite su più decadi/mesi →
  // [{ i decade iniziale, n decadi, testo } | { i, n, min: minuti del mese o null }]
  function celle(mesi, da) {
    var dec = function (g) { return g < 11 ? 0 : g < 21 ? 1 : 2; };
    var ix = function (d) { var n = (d.slice(0, 4) - da.slice(0, 4)) * 12 + (d.slice(5, 7) - da.slice(5, 7)); return n < 0 ? 0 : n > 11 ? 36 : n * 3 + dec(+d.slice(8, 10)); };
    var bl = fermiPpl(mesi).map(function (f) {
      return { a: ix(f.in), z: ix(f.out), t: f.testo + (f.in >= da && f.in.slice(8) !== "01" ? " dal " + fd(f.in).slice(0, 5) : "") };
    });
    var val = {}, out = [];
    mesi.forEach(function (x) { val[x[0]] = x[1]; });
    for (var i = 0; i < 36; i++) {
      var b = bl.find(function (x) { return x.a <= i && i < x.z; }), m = piuMesi(da, Math.floor(i / 3)), u = out[out.length - 1], v = val[m];
      if (u && (b ? u.b === b : !u.b && u.m === m)) { u.n++; continue; }
      out.push(b ? { i: i, n: 1, b: b, testo: b.t } : { i: i, n: 1, m: m, min: v == null || (Array.isArray(v) && !v[2]) ? null : pm(v) });
    }
    return out;
  }
  // volato (oreMese dell'ultima giornaliera di ogni mese, vol = { "AAAA-MM": { d, o: { sigla: minuti } } }) contro la PPL
  // degli stessi mesi, ciascuno in proporzione al giorno di quella giornaliera; i mesi senza PPL non contano
  function scostamento(mesi, vol, sigla) {
    var v = 0, p = 0, n = 0;
    mesi.forEach(function (x) {
      var g = vol[x[0]];
      if (x[1] == null || !g || g.o[sigla] == null) return;
      v += g.o[sigla]; p += pm(x[1]) * Math.min(+g.d.slice(8) / diffG(x[0] + "-01", primoDopo(x[0])), 1); n++;
    });
    return n ? { vol: v, pv: Math.round(p) } : null;
  }

  // link di sola lettura: i dati stanno nel frammento (#), compressi; niente sul server
  async function codifica(obj) {
    var s = new Blob([JSON.stringify(obj)]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    var b = new Uint8Array(await new Response(s).arrayBuffer()), x = "";
    for (var i = 0; i < b.length; i++) x += String.fromCharCode(b[i]);
    return btoa(x).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  async function decodifica(str) {
    var b = Uint8Array.from(atob(str.replace(/-/g, "+").replace(/_/g, "/")), function (c) { return c.charCodeAt(0); });
    var s = new Blob([b]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return JSON.parse(await new Response(s).text());
  }

  // s = { d: data giornaliera, t: data del piano, r: [{ s, tipo, isp, in, out, res, sc, mesi, resto, tetto }] }
  var sh = function (m) { m = Math.round(m); return m < 0 ? "−" + hm(-m) : hm(m); };
  var corto = function (t) { // testo del fermo nella cella del mese
    return t.replace(/ISPEZIONE|ISP\.?/gi, "").replace(/INTERMEDIA|INT\./gi, "INT").replace(/MAGGIORE/gi, "MAGG").replace(/ATTESA/gi, "ATT.").replace(/\s+/g, " ").trim() || t;
  };
  // r.mesi: [mese, minuti] oppure [mese, testo del fermo] ("" = mese dentro un fermo); r.ppl = riga dalla PPL (vol/pv = scostamento)
  function htmlMarcia(s, edit) {
    if (!s.r.length) return '<p class="sub" style="padding:0 12px">Nessun fermo in programma.</p>';
    var mm = [], sc = s.r.some(function (r) { return r.vol != null; });
    s.r.forEach(function (r) { r.mesi.forEach(function (x) { if (mm.indexOf(x[0]) < 0) mm.push(x[0]); }); });
    mm.sort();
    return '<div class="gw"><table class="gantt mt"><thead><tr><th>Elicottero</th><th>Ispezione</th><th>Ingresso</th><th>Rientro</th><th>FH residue</th>' +
      (sc ? "<th>Volato</th><th>PPL<small>al periodo</small></th><th>Scost.</th>" : "") +
      mm.map(function (m) { return "<th>" + MESI[+m.slice(5) - 1] + "<small>" + m.slice(0, 4) + "</small></th>"; }).join("") +
      "<th>Restano</th>" + (edit ? "<th>Tetto FH/mese</th>" : "") + "</tr></thead><tbody>" +
      s.r.map(function (r) {
        var v = {}; r.mesi.forEach(function (x) { v[x[0]] = x[1]; });
        return "<tr><th>" + esc(r.s) + " <small>" + esc(r.tipo) + (r.ppl ? " · PPL" : "") + "</small></th><td>" + esc(r.isp) + "</td><td>" + fd(r.in) + "</td><td>" + fd(r.out) +
          "</td><td>" + hm(r.res) + (r.sc ? "<small>" + esc(r.sc) + "</small>" : "") + "</td>" +
          (sc ? r.vol != null ? "<td>" + hm(r.vol) + "</td><td>" + hm(r.pv) + "</td><td>" + sh(r.vol - r.pv) + "</td>" : "<td></td><td></td><td></td>" : "") +
          mm.map(function (m) {
            var x = v[m];
            return typeof x === "string" ? '<td class="fe" title="' + esc(x) + '">' + esc(corto(x)) + "</td>" : "<td>" + (x == null ? "" : x % 60 ? hm(x) : x / 60) + "</td>";
          }).join("") +
          (r.res == null || r.resto == null ? "<td>–</td>" : r.resto < 0 ? '<td class="ko">' + sh(r.resto) + "</td>" : "<td>" + hm(r.resto) + "</td>") +
          (edit ? r.ppl ? "<td></td>" : '<td><input type="number" min="0" step="1" data-tetto="' + esc(r.s) + '" value="' + (r.tetto || "") + '" placeholder="–"></td>' : "") + "</tr>";
      }).join("") + "</tbody></table></div>";
  }

  var api = { lunedi: lunedi, settimana: settimana, addG: addG, diffG: diffG, ripartisci: ripartisci, marcia: marcia,
    pplMesi: pplMesi, fermiPpl: fermiPpl, marciaPpl: marciaPpl, scostamento: scostamento, celle: celle, piuMesi: piuMesi, pm: pm, primoDopo: primoDopo,
    codifica: codifica, decodifica: decodifica, htmlMarcia: htmlMarcia, fd: fd };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else g.Piano = api;
})(typeof window !== "undefined" ? window : globalThis);
