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
  function htmlMarcia(s, edit) {
    if (!s.r.length) return '<p class="sub" style="padding:0 12px">Nessun fermo in programma.</p>';
    var mm = [];
    s.r.forEach(function (r) { r.mesi.forEach(function (x) { if (mm.indexOf(x[0]) < 0) mm.push(x[0]); }); });
    mm.sort();
    return '<div class="gw"><table class="gantt mt"><thead><tr><th>Elicottero</th><th>Ispezione</th><th>Ingresso</th><th>Rientro</th><th>FH residue</th>' +
      mm.map(function (m) { return "<th>" + MESI[+m.slice(5) - 1] + "<small>" + m.slice(0, 4) + "</small></th>"; }).join("") +
      "<th>Restano</th>" + (edit ? "<th>Tetto FH/mese</th>" : "") + "</tr></thead><tbody>" +
      s.r.map(function (r) {
        var v = {}; r.mesi.forEach(function (x) { v[x[0]] = x[1]; });
        return "<tr><th>" + esc(r.s) + " <small>" + esc(r.tipo) + "</small></th><td>" + esc(r.isp) + "</td><td>" + fd(r.in) + "</td><td>" + fd(r.out) +
          "</td><td>" + hm(r.res) + (r.sc ? "<small>" + esc(r.sc) + "</small>" : "") + "</td>" +
          mm.map(function (m) { return "<td>" + (m in v ? v[m] / 60 : "") + "</td>"; }).join("") +
          "<td>" + (r.res == null ? "–" : hm(r.resto)) + "</td>" +
          (edit ? '<td><input type="number" min="0" step="1" data-tetto="' + esc(r.s) + '" value="' + (r.tetto || "") + '" placeholder="–"></td>' : "") + "</tr>";
      }).join("") + "</tbody></table></div>";
  }

  var api = { lunedi: lunedi, settimana: settimana, addG: addG, diffG: diffG, ripartisci: ripartisci, marcia: marcia,
    codifica: codifica, decodifica: decodifica, htmlMarcia: htmlMarcia, fd: fd };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else g.Piano = api;
})(typeof window !== "undefined" ? window : globalThis);
