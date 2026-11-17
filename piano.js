/* Piano dalla PPL per il Briefing di index.html.
   Date come stringhe AAAA-MM-GG, mesi AAAA-MM, ore in minuti. Gira anche in Node (test.mjs). */
(function (g) {
  "use strict";
  var G = 864e5;
  var ms = function (d) { return Date.parse(d + "T00:00:00Z"); };
  var iso = function (t) { return new Date(t).toISOString().slice(0, 10); };
  var addG = function (d, n) { return iso(ms(d) + n * G); };

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
  // Modifica del Briefing: riga PPL di una macchina <-> { ore: { "AAAA-MM": minuti }, lav: [{ t, da: "AAAA-MM-GG", al: ultimo mese "AAAA-MM" o "" se senza fine }] }
  function modello(mesi) {
    var ore = {};
    mesi.forEach(function (x) { var v = x[1]; if (typeof v === "number" || (Array.isArray(v) && v[2])) ore[x[0]] = pm(v); });
    return { ore: ore, lav: fermiPpl(mesi).map(function (f) { return { t: f.testo, da: f.in, al: f.aperto ? "" : addG(f.out, -1).slice(0, 7) }; }) };
  }
  // -> [["AAAA-MM", valore]] sui mesi mm: la lavorazione nel mese in cui inizia, null nei mesi dentro, e il mese dopo la fine mai vuoto (la chiude)
  function riga(mod, mm) {
    var lav = mod.lav.filter(function (x) { return /^\d{4}-\d\d-\d\d$/.test(x.da); }).sort(function (a, b) { return a.da < b.da ? -1 : 1; }), dopo = false;
    return mm.map(function (m) {
      var l = lav.find(function (x) { return x.da.slice(0, 7) === m; }), h = mod.ore[m], g = l && +l.da.slice(8);
      var p = lav.filter(function (x) { return x.da.slice(0, 7) < m; }).pop(), dentro = !!p && (!p.al || m <= p.al); // la lavorazione dopo chiude quella prima
      var v = l ? (g > 1 && h ? [l.t, g, h] : [l.t, g]) : dentro ? null : h != null ? h : dopo ? 0 : null;
      dopo = !!l || dentro;
      return [m, v];
    });
  }
  function piuMesi(m, k) { return new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1 + k, 1)).toISOString().slice(0, 7); }
  // celle dei mesi mm come nella PPL: ore del mese, oppure la lavorazione unita sui mesi in cui continua;
  // nel mese in cui inizia da un giorno > 1 la cella ha anche le ore volate prima -> [{ m, n, ore, lav, dal: "AAAA-MM-GG" }]
  function celleMesi(mesi, mm) {
    var val = {}, fe = fermiPpl(mesi), out = [];
    mesi.forEach(function (x) { val[x[0]] = x[1]; });
    mm.forEach(function (m) {
      var fs = fe.filter(function (f) { return f.in < primoDopo(m) && f.out > m + "-01"; }), u = out[out.length - 1];
      var f = fs.find(function (f) { return f.in.slice(0, 7) === m; }) || fs[0], v = val[m];
      if (f && u && u.f === f && u.ore == null) { u.n++; return; }
      out.push(!f ? { m: m, n: 1, ore: typeof v === "number" ? v : null }
        : f.in.slice(0, 7) === m ? { m: m, n: 1, lav: f.testo, dal: f.in, ore: pm(v) || null, f: f } : { m: m, n: 1, lav: f.testo, ore: null, f: f });
    });
    return out;
  }
  // la giornaliera dice che oggi la macchina è ferma per una lavorazione che la PPL nel mese m non segna (640/641 in intermedia):
  // il testo va nella cella di m, ore della PPL comprese, e come nella PPL dura fino alla prossima cella piena.
  // ponytail: solo il mese della giornaliera; i mesi passati tornano alla PPL (servirebbero le giornaliere vecchie intere)
  function conGiornaliera(mesi, m, testo) {
    if (fermiPpl(mesi).some(function (f) { return f.in < primoDopo(m) && f.out > m + "-01"; })) return mesi;
    var v = (mesi.find(function (x) { return x[0] === m; }) || [])[1];
    return mesi.filter(function (x) { return x[0] !== m; }).concat([[m, typeof v === "number" && v ? [testo, 1, v] : [testo, 1]]])
      .sort(function (a, b) { return a[0] < b[0] ? -1 : 1; });
  }

  // ore residue mese per mese: ogni mese chiuso (m < m0, con volato noto) riporta il residuo col suo segno nel mese successivo;
  // una lavorazione senza ore programmate (o mese null) azzera il riporto.
  // vol: { "AAAA-MM": minuti } o fn(m) -> minuti|null. Ritorna { "AAAA-MM": { pr, carry, eff, vol, res, chiuso, vuoto } }
  function residui(mesi, m0, vol, fin) {
    if (!mesi.length) return {};
    var val = {}, fe = fermiPpl(mesi), out = {}, carry = 0, getV = typeof vol === "function" ? vol : function (m) { return vol && vol[m] != null ? vol[m] : null; };
    mesi.forEach(function (x) { val[x[0]] = x[1]; });
    var last = mesi[mesi.length - 1][0], stop = fin && fin < last ? fin : last;
    for (var m = mesi[0][0]; m <= stop; m = piuMesi(m, 1)) {
      var raw = val[m], pr = pm(raw);
      var f = fe.some(function (x) { return x.in < primoDopo(m) && x.out > m + "-01"; });
      if (raw == null || (f && !pr)) { carry = 0; continue; }
      var v = m > m0 ? null : getV(m), chiuso = m < m0;
      if (chiuso && v == null) {
        out[m] = { pr: pr, carry: carry, eff: pr + carry, vol: null, res: null, chiuso: true, vuoto: !pr && !carry };
        carry = 0; continue;
      }
      var eff = pr + carry, vuoto = !pr && !carry && !(v > 0), res = eff - (v || 0);
      out[m] = { pr: pr, carry: carry, eff: eff, vol: v, res: res, chiuso: chiuso, vuoto: vuoto };
      carry = chiuso ? res : 0;
    }
    return out;
  }

  var api = { addG: addG, pplMesi: pplMesi, fermiPpl: fermiPpl, celleMesi: celleMesi, piuMesi: piuMesi, pm: pm, modello: modello, riga: riga, primoDopo: primoDopo, conGiornaliera: conGiornaliera, residui: residui };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else g.Piano = api;
})(typeof window !== "undefined" ? window : globalThis);
