/* Lettura della giornaliera SIT_GIOR_CAAE (.ods) senza librerie:
   zip via DecompressionStream, content.xml via tokenizer, poi un foglio per linea.
   Gira uguale nel browser e in Node (test.mjs). */
(function (g) {
  "use strict";

  // --- zip: legge un file dal central directory ---
  async function unzip(buf, wanted) {
    var b = new Uint8Array(buf), v = new DataView(b.buffer, b.byteOffset, b.byteLength);
    var e = b.length - 22;
    while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error("Il file non è un .ods valido");
    var n = v.getUint16(e + 10, true), p = v.getUint32(e + 16, true);
    for (var i = 0; i < n; i++) {
      var method = v.getUint16(p + 10, true), size = v.getUint32(p + 20, true);
      var nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true);
      var name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nl));
      if (name === wanted) {
        var lh = v.getUint32(p + 42, true);
        var start = lh + 30 + v.getUint16(lh + 26, true) + v.getUint16(lh + 28, true);
        var data = b.subarray(start, start + size);
        if (method === 0) return new TextDecoder().decode(data);
        var s = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        return await new Response(s).text();
      }
      p += 46 + nl + xl + cl;
    }
    throw new Error("content.xml mancante: serve la giornaliera in formato .ods");
  }

  function unescape(s) {
    return s.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos);/gi, function (_, c) {
      var m = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" }[c.toLowerCase()];
      if (m) return m;
      return String.fromCodePoint(c[1] === "x" || c[1] === "X" ? parseInt(c.slice(2), 16) : parseInt(c.slice(1), 10));
    });
  }

  // --- content.xml → { nomeFoglio: [[testo cella]] } ---
  var MAXC = 64; // ponytail: colonne oltre la 64 ignorate (la giornaliera arriva alla X = 23)
  function sheets(xml) {
    var out = {}, rows, row, cell, inP = false, ann = false, sheet;
    // tag che servono; ogni altro tag (span, stili...) viene consumato e ignorato
    var re = /<(\/?)(table:table|table:table-row|table:table-cell|table:covered-table-cell|text:p|text:s|text:tab|text:line-break)(?=[\s\/>])([^>]*?)(\/?)>|<[^>]*>|([^<]+)/g, m;
    var rep = function (a) { var r = /number-columns-repeated="(\d+)"/.exec(a); return r ? Math.min(+r[1], MAXC) : 1; };
    var close = function () {
      if (!cell) return;
      for (var k = 0; k < cell.n && row.length < MAXC; k++) row.push(cell.t.trim());
      cell = null;
    };
    while ((m = re.exec(xml))) {
      var end = m[1], tag = m[2], attr = m[3], self = m[4];
      if (m[5] !== undefined) { if (cell && inP && !ann) cell.t += unescape(m[5]); continue; }
      if (!tag) { // i commenti alle celle (office:annotation) non sono il valore della cella
        if (/^<office:annotation[\s>]/.test(m[0])) ann = true; else if (m[0] === "</office:annotation>") ann = false;
        continue;
      }
      if (tag === "table:table") {
        if (end) { out[sheet] = rows; } else { sheet = (/table:name="([^"]*)"/.exec(attr) || [])[1]; rows = []; }
      } else if (tag === "table:table-row") {
        if (end || self) { if (!self) { close(); while (row.length && !row[row.length - 1]) row.pop(); rows.push(row); } }
        else row = [];
      } else if (tag === "table:table-cell" || tag === "table:covered-table-cell") {
        if (end) close();
        else { close(); cell = { n: rep(attr), t: "" }; if (self) close(); }
      } else if (tag === "text:p") {
        if (end) inP = false; else { if (cell && cell.t) cell.t += " "; inP = !self; }
      } else if (cell && inP && !ann) {
        cell.t += tag === "text:s" ? " ".repeat(+((/text:c="(\d+)"/.exec(attr) || [0, 1])[1])) : " ";
      }
    }
    return out;
  }

  // --- valori ---
  function minuti(s) {
    var m = /^(-?)(\d+):(\d{2})$/.exec(String(s || "").trim());
    return m ? (m[1] ? -1 : 1) * (+m[2] * 60 + +m[3]) : null;
  }
  function iso(s) {
    var m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(String(s || "").trim());
    if (!m) return null;
    var y = m[3].length === 2 ? "20" + m[3] : m[3];
    return y + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
  }

  function parseSheet(rows) {
    var tipo = (rows[0] || []).find(Boolean) || "";
    var L = {}, li = rows.findIndex(function (r) { return (r[0] || "") === "A" && (r[1] || "") === "B"; });
    if (li < 0) return null;
    rows[li].forEach(function (v, i) { if (v) L[v] = i; });
    if (L.T - L.S === 2) L.S2 = L.S + 1; // UH-169: terza scadenza senza lettera (ISP. 2400 H.)
    var head = rows.find(function (r) { return r[1] === "SIGLA"; }) || [];
    var twin = (head[L.T] || "") !== "TIPO"; // UH-169: due turbomotori nelle colonne T e U
    var dataRow = rows.find(function (r) { return /^Situazione/.test(r[0] || ""); }) || [];
    var data = iso(dataRow.find(iso) || "");
    var aerei = [], totMese = null, blk = null;
    var c = function (r, k) { return (r[L[k]] || "").trim(); };
    var dopo = function (k) { // primo valore nella colonna k nelle righe sotto la prima del blocco
      for (var i = 1; i < blk.length; i++) { var x = c(blk[i], k); if (x) return x; }
      return "";
    };
    var chiudi = function () {
      if (!blk) return;
      var r = blk[0], a = {
        sigla: c(r, "B"), mm: c(r, "C"), config: c(r, "D"), verr: c(r, "E"), gancio: c(r, "F"), nvg: c(r, "G"),
        oreMese: minuti(c(r, "H")), oreTot: minuti(c(r, "I")), stato: c(r, "L"),
        ggLinea: c(r, "M"), ggPres: c(r, "N"), attivita: c(r, "O"), inizio: iso(c(r, "P")),
        perc: c(r, "Q"), fine: dopo("Q"), scadenze: [], motori: [], cessione: null
      };
      ["R", "S", "S2"].forEach(function (k) {
        if (L[k] === undefined || !c(r, k)) return;
        var raw = dopo(k), s = { tipo: c(r, k), raw: raw };
        if (iso(raw)) s.data = iso(raw); else if (minuti(raw) !== null) s.ore = minuti(raw);
        a.scadenze.push(s);
      });
      if (twin) ["T", "U"].forEach(function (k) { if (c(r, k)) a.motori.push({ sn: c(r, k), fh: minuti(dopo(k)) }); });
      else if (c(r, "U")) a.motori.push({ tipo: c(r, "T"), sn: c(r, "U"), fh: minuti(c(r, "V")) });
      if (c(r, "Z") || c(r, "X")) a.cessione = { da: c(r, "Z"), a: c(r, "X"), dal: iso(dopo("Z")) };
      aerei.push(a);
      blk = null;
    };
    for (var i = li + 1; i < rows.length; i++) {
      var r = rows[i];
      if (/^TOTALE/.test(r[0] || "")) { chiudi(); totMese = minuti(c(r, "H")); break; }
      if (/^\d+$/.test(c(r, "B"))) { chiudi(); blk = [r]; } else if (blk) blk.push(r);
    }
    chiudi();
    return { tipo: tipo, data: data, aerei: aerei, totMese: totMese };
  }

  async function leggiGiornaliera(buf) {
    var sh = sheets(await unzip(buf, "content.xml"));
    var linee = Object.keys(sh).map(function (k) { return parseSheet(sh[k]); })
      .filter(function (l) { return l && l.aerei.length; });
    if (!linee.length) throw new Error("Nessun foglio riconosciuto: è la SIT_GIOR_CAAE?");
    var data = linee.map(function (l) { return l.data; }).filter(Boolean).sort().pop() || null;
    return { data: data, importata: new Date().toISOString(), linee: linee };
  }

  var api = { leggiGiornaliera: leggiGiornaliera, minuti: minuti, iso: iso };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else g.Giornaliera = api;
})(typeof window !== "undefined" ? window : globalThis);
