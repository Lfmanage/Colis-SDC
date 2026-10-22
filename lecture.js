// Lecture d'une étiquette photographiée.
// Ces fonctions ne touchent pas à l'écran : elles reçoivent le texte lu sur la photo
// et retrouvent (1) le colis en attente qui correspond, (2) le n°, le lieu, les options…
(function (racine) {
  "use strict";

  const N = t => String(t || "").toUpperCase().replace(/×/g, "X");
  const DEB = "(?:^|[^\\d])";   // pas de chiffre juste avant
  const FIN = "(?![\\d])";      // pas de chiffre juste après
  // un colis = 1re longueur (pieces/longueur) + éventuelles autres longueurs (autres : [{ pieces, longueur }])
  const lotsDe = c => [{ pieces: c.pieces, longueur: c.longueur }, ...(Array.isArray(c.autres) ? c.autres : []).filter(l => l && l.pieces && l.longueur)];
  const volume = c => (c.epaisseur / 1000) * (c.largeur / 1000) * lotsDe(c).reduce((s, l) => s + l.pieces * l.longueur, 0);
  const memesLots = (a, b) => { const k = l => l.pieces + "/" + Math.round(l.longueur * 100); const x = a.map(k).sort(), y = b.map(k).sort(); return x.length === y.length && x.every((v, i) => v === y[i]); };

  // 4,00  4.00  4 00  4,0  et aussi 3,50 / 3,5
  function motifLongueur(l) {
    const [ent, dec] = Number(l).toFixed(2).split(".");
    return new RegExp(DEB + ent + "\\s?[.,]?\\s?" + dec[0] + (dec[1] === "0" ? "0?" : dec[1]) + FIN);
  }

  // Ce que la photo confirme, pour un colis donné
  function verifier(c, texte) {
    const T = N(texte);
    const ep = c.epaisseur, lar = c.largeur;
    const section = new RegExp(DEB + ep + "\\s*[X*]\\s*" + lar + FIN).test(T);
    const largeurSeule = new RegExp(DEB + lar + FIN).test(T);
    const lots = lotsDe(c), multi = lots.length > 1;
    const codeDe = l => new RegExp(DEB + l.pieces + "\\s*/\\s*" + Math.round(l.longueur * 100) + FIN).test(T); // ex. « 80/400 »
    const pieces = lots.some(l => new RegExp(DEB + l.pieces + "\\s*P(?![A-Z])").test(T));
    const longueur = lots.some(l => motifLongueur(l.longueur).test(T));
    const code = lots.some(codeDe);
    const [ve, vd] = volume(c).toFixed(3).split(".");
    const vol = new RegExp(DEB + ve + "[.,]\\s?" + vd + FIN).test(T);
    let score = (section ? 3 : largeurSeule ? 1 : 0) + (pieces ? 2 : 0) + (longueur ? 2 : 0) + (vol ? 3 : 0) + (code ? 2 : 0) + (multi && lots.every(codeDe) ? 2 : 0);

    // Pièces et longueur inversés dans la note ? (ex. noté « 6 pièces de 48 m » alors que l'étiquette dit 48 P et 6,00 m)
    // Le volume, lui, reste juste dans les deux cas : il ne peut pas révéler l'inversion.
    let inverse = false;
    if (!multi && !(pieces || longueur || code) && Number.isInteger(c.longueur) && c.longueur > 0) {
      const pInv = new RegExp(DEB + c.longueur + "\\s*P(?![A-Z])").test(T);
      const lInv = motifLongueur(c.pieces).test(T);
      const cInv = new RegExp(DEB + c.longueur + "\\s*/\\s*" + Math.round(c.pieces * 100) + FIN).test(T);
      if ((pInv || cInv) && (lInv || cInv)) { inverse = true; score += (pInv ? 2 : 0) + (lInv ? 2 : 0) + (cInv ? 2 : 0); }
    }
    return { section, pieces: pieces || code, longueur: longueur || code, volume: vol, score, inverse };
  }

  // Le colis en attente qui correspond le mieux à la photo (ou null)
  function trouver(texte, colis) {
    let meilleur = null;
    for (const c of colis) {
      const v = verifier(c, texte);
      if (!(v.section || v.volume) || v.score < 6) continue;   // il faut au moins la section ou le volume
      if (!meilleur || v.score > meilleur.verifs.score) meilleur = { colis: c, verifs: v };
    }
    return meilleur;
  }

  // Champs imprimés sur l'étiquette
  function lireChamps(texte, essenceInverse) {
    const T = N(texte);
    let m, numero = "";
    if ((m = T.match(/(?:^|\D)(\d{3})\s*-\s*(\d{3})\s*-\s*(\d{1,2})(?!\d)/))) numero = m[1] + m[2] + m[3];
    else if ((m = T.match(/(?:^|\D)(\d{6})[ \t]+(\d{1,2})(?!\d)/))) numero = m[1] + m[2];
    else if ((m = T.match(/(?:^|\D)(\d{6})(\d{1,2})(?!\d)/))) numero = m[1] + m[2];
    else if ((m = T.match(/(?:^|\D)(\d{6})(?!\d)/))) numero = m[1]; // 6 chiffres lus, suffixe non lu

    let choix = "", essence = "", essenceCode = "", lieu = "";
    if ((m = T.match(/(?:^|\D)(\d{2})[ \t]*([A-Z0]{1,2})[ \t]+([A-Z][0-9TIL|OB]{1,2})(?![A-Z0-9])/))) {
      m[2] = m[2].replace(/0/g, "D"); // « D » lu « 0 » : l'essence est toujours une lettre
      choix = /^[0-4]\d$/.test(m[1]) ? m[1] : ""; essenceCode = m[2] === "ZZ" ? "" : m[2];
      essence = m[2] === "ZZ" ? "" : (essenceInverse && essenceInverse[m[2]]) || (m[2].length === 1 ? m[2] : "");
      lieu = m[3][0] + m[3].slice(1).replace(/[TIL|]/g, "1").replace(/O/g, "0").replace(/B/g, "8");
    }

    const options = null; // les options se lisent avec la position des mots (optionsPresDuNumero) : le texte seul se trompe trop (bois, écran, logo…)

    let date = null;
    if ((m = T.match(/(?:^|\D)(\d{2})\.(\d{2})\.(\d{2})\s+(\d{2})[:H]?(\d{2})(?!\d)/)))
      date = { jour: +m[1], mois: +m[2], an: 2000 + +m[3], h: +m[4], min: +m[5] };

    return { numero, choix, essence, essenceCode, lieu, options, date };
  }

  // Section, pièces et longueur imprimées sur l'étiquette.
  // Une valeur n'est retenue que si le calcul épaisseur × largeur × pièces × longueur retombe sur le volume imprimé.
  // Si la lecture a raté une des valeurs, on la déduit du volume (ex. section illisible : on garde l'aire e × l).
  function lireSpec(texte) {
    const T = N(texte);
    const nombres = (re, f) => [...T.matchAll(re)].map(f).filter(Boolean);
    const vols = nombres(/(?:^|\D)(\d{1,3})[.,]\s?(\d{3})(?!\d)/g, m => +(m[1] + "." + m[2]));
    const sections = nombres(/(?:^|\D)(\d{2,3})\s*[X*]\s*(\d{2,4})(?!\d)/g, m => +m[1] <= +m[2] ? [+m[1], +m[2]] : null);
    const codes = nombres(/(?:^|\D)(\d{1,4})\s*\/\s*(\d{3,4})(?!\d)/g, m => [+m[1], +m[2] / 100]);
    const pieces = [...new Set([...codes.map(c => c[0]), ...nombres(/(?:^|\D)(\d{1,4})\s*P(?![A-Z])/g, m => +m[1])])].filter(p => p > 0);
    const longueurs = [...new Set([...codes.map(c => c[1]), ...nombres(/(?:^|\D)(\d{1,2})\s?[.,]\s?(\d{2})\s*M(?![A-Z0-9])/g, m => +(m[1] + "." + m[2]))])].filter(x => x >= 0.5 && x <= 13);
    const ok = (a, b) => Math.abs(a - b) < 0.0015;
    // 0. plusieurs longueurs : la ligne « 3/450 28/400 » donne chaque lot (pièces / longueur en cm) ; le volume imprimé est celui de l'ensemble
    const lotsLus = [];
    for (const [p, lo] of codes) if (lo >= 0.5 && lo <= 13 && p > 0 && !lotsLus.some(l => l.pieces === p && l.longueur === lo)) lotsLus.push({ pieces: p, longueur: lo });
    if (lotsLus.length > 1) {
      const total = lotsLus.reduce((s, l) => s + l.pieces * l.longueur, 0);
      for (const [epaisseur, largeur] of sections) for (const v of vols)
        if (ok(epaisseur / 1000 * largeur / 1000 * total, v)) return { epaisseur, largeur, pieces: lotsLus[0].pieces, longueur: lotsLus[0].longueur, lots: lotsLus, volume: v };
      for (const v of vols) { // section illisible : l'aire e × l se déduit du volume
        const aire = v * 1e6 / total;
        if (!(aire >= 300 && aire <= 200000 && Math.abs(aire - Math.round(aire)) < 0.6 + aire * 0.0004)) continue;
        const A = Math.round(aire), largeurs = nombres(/[X*]\s*(\d{2,3})(?!\d)/g, m => +m[1]), epaisseurs = nombres(/(?:^|\D)(\d{2,3})\s*[X*]/g, m => +m[1]);
        for (const la of largeurs) { const e = A / la; if (e >= 10 && e <= la && Math.abs(e - Math.round(e)) < 0.01) return { epaisseur: Math.round(e), largeur: la, pieces: lotsLus[0].pieces, longueur: lotsLus[0].longueur, lots: lotsLus, volume: v }; }
        for (const e of epaisseurs) { const la = A / e; if (la >= e && la <= 1500 && Math.abs(la - Math.round(la)) < 0.01) return { epaisseur: e, largeur: Math.round(la), pieces: lotsLus[0].pieces, longueur: lotsLus[0].longueur, lots: lotsLus, volume: v }; }
        return { pieces: lotsLus[0].pieces, longueur: lotsLus[0].longueur, lots: lotsLus, aire: A, volume: v, partiel: true };
      }
    }
    // 1. tout est lu et cohérent
    for (const [epaisseur, largeur] of sections) for (const p of pieces) for (const lo of longueurs) for (const v of vols)
      if (ok(epaisseur / 1000 * largeur / 1000 * p * lo, v)) return { epaisseur, largeur, pieces: p, longueur: lo, volume: v };
    // 2. section illisible : pièces, longueur et volume sont cohérents → on retient l'aire e × l (mm²)
    const dejaCode = codes.filter(c => c[1] >= 0.5 && c[1] <= 13);
    for (const [p, lo] of [...dejaCode, ...pieces.flatMap(p => longueurs.map(lo => [p, lo]))]) for (const v of vols) {
      const aire = v * 1e6 / (p * lo);
      if (!(p > 0 && aire >= 300 && aire <= 200000 && Math.abs(aire - Math.round(aire)) < 0.6 + aire * 0.0004)) continue;
      const A = Math.round(aire);
      const largeurs = nombres(/[X*]\s*(\d{2,4})(?!\d)/g, m => +m[1]), epaisseurs = nombres(/(?:^|\D)(\d{2,3})\s*[X*]/g, m => +m[1]);
      for (const la of largeurs) { const e = A / la; if (e >= 10 && e <= la && Math.abs(e - Math.round(e)) < 0.01) return { epaisseur: Math.round(e), largeur: la, pieces: p, longueur: lo, volume: v }; }
      for (const e of epaisseurs) { const la = A / e; if (la >= e && la <= 1500 && Math.abs(la - Math.round(la)) < 0.01) return { epaisseur: e, largeur: Math.round(la), pieces: p, longueur: lo, volume: v }; }
      return { pieces: p, longueur: lo, aire: A, volume: v, partiel: true };
    }
    // 3. une valeur manque : on la calcule avec la section lue et le volume
    for (const [epaisseur, largeur] of sections) for (const v of vols) {
      const aire = epaisseur * largeur / 1e6;
      for (const p of pieces) { const lo = v / (aire * p); if (lo >= 0.5 && lo <= 13 && Math.abs(lo * 10 - Math.round(lo * 10)) < 0.06) return { epaisseur, largeur, pieces: p, longueur: Math.round(lo * 100) / 100, volume: v }; }
      for (const lo of longueurs) { const p = v / (aire * lo); if (p >= 1 && Math.abs(p - Math.round(p)) < 0.03) return { epaisseur, largeur, pieces: Math.round(p), longueur: lo, volume: v }; }
    }
    return null;
  }

  // Retrouve le colis en attente qui correspond à l'étiquette, même si la note contient une faute.
  function correspondance(spec, colis) {
    const aire = c => c.epaisseur * c.largeur;
    const scores = [];
    for (const c of colis) {
      let sec = 0;
      if (spec.epaisseur != null) sec = (c.epaisseur === spec.epaisseur && c.largeur === spec.largeur) ? 3 : (c.epaisseur === spec.epaisseur || c.largeur === spec.largeur) ? 1 : 0;
      else if (spec.aire != null) sec = Math.abs(aire(c) - spec.aire) <= spec.aire * 0.005 ? 3 : 0;   // même surface : très probablement le même colis
      let pl = Math.max((c.pieces === spec.pieces) + (c.longueur === spec.longueur), (c.pieces === spec.longueur && c.longueur === spec.pieces) ? 2 : 0);
      if ((spec.lots && spec.lots.length > 1) || (c.autres && c.autres.length)) { // plusieurs longueurs : chaque lot de l'étiquette retrouvé dans la note compte
        const lc = lotsDe(c), ls = spec.lots || [{ pieces: spec.pieces, longueur: spec.longueur }];
        const trouves = ls.filter(l => lc.some(x => x.pieces === l.pieces && x.longueur === l.longueur)).length;
        pl = Math.max(pl, memesLots(lc, ls) ? 2 : Math.min(2, trouves));
      }
      if (sec + pl >= 3) scores.push({ c, sec, score: sec + pl });
    }
    if (!scores.length) return null;
    const max = Math.max(...scores.map(s => s.score));
    const egaux = scores.filter(s => s.score === max);
    return { colis: egaux[0].c, exact: max === 5, auto: egaux[0].sec === 3 };
  }

  // ───── Code-barres (Code 39) : le n° d'étiquette y est codé en entier, ex. « 203458001 » = 203-458-1 ─────
  const ALPHABET39 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%";
  const CODES39 = [0x034, 0x121, 0x061, 0x160, 0x031, 0x130, 0x070, 0x025, 0x124, 0x064,
    0x109, 0x049, 0x148, 0x019, 0x118, 0x058, 0x00D, 0x10C, 0x04C, 0x01C,
    0x103, 0x043, 0x142, 0x013, 0x112, 0x052, 0x007, 0x106, 0x046, 0x016,
    0x181, 0x0C1, 0x1C0, 0x091, 0x190, 0x0D0, 0x085, 0x184, 0x0C4, 0x0A8, 0x0A2, 0x08A, 0x02A];
  const ETOILE39 = 0x094;
  const CAR39 = new Map(CODES39.map((c, i) => [c, ALPHABET39[i]])); CAR39.set(ETOILE39, "*");
  const inverse9 = c => { let r = 0; for (let i = 0; i < 9; i++) r = (r << 1) | ((c >> i) & 1); return r; };
  const CAR39R = new Map([...CAR39].map(([c, ch]) => [inverse9(c), ch])); // un caractère lu de droite à gauche

  function car39(runs, i, table) { // 9 éléments (barre, espace, …) → caractère, ou null
    if (i + 9 > runs.length) return null;
    const w = runs.slice(i, i + 9), tri = [...w].sort((a, b) => a - b);
    if (tri[6] < tri[5] * 1.3 || tri[8] > tri[0] * 7) return null;
    const seuil = (tri[5] + tri[6]) / 2;
    let code = 0; for (const x of w) code = (code << 1) | (x > seuil ? 1 : 0);
    return (table || CAR39).get(code) || null;
  }
  function ligne39(px, n, fac, div) { // une ligne de pixels gris → texte du code-barres, ou null
    const R = Math.max(8, Math.floor(n / div)), cum = new Float64Array(n + 1);
    for (let x = 0; x < n; x++) cum[x + 1] = cum[x] + px[x];
    const runs = [], noir = [], pos = [];
    let prec = null, lg = 0;
    for (let x = 0; x < n; x++) {
      const a = Math.max(0, x - R), b = Math.min(n, x + R + 1), moy = (cum[b] - cum[a]) / (b - a);
      const d = px[x] < moy * fac;
      if (d === prec) lg++; else { if (prec !== null) { runs.push(lg); noir.push(prec); } prec = d; lg = 1; pos.push(x); }
    }
    runs.push(lg); noir.push(prec);
    for (let i = 0; i + 9 <= runs.length; i++) {
      if (!noir[i] || car39(runs, i) !== "*") continue;
      const larg = runs.slice(i, i + 9).reduce((s, x) => s + x, 0);
      if (i > 0 && runs[i - 1] < larg * 0.5) continue;          // zone calme avant le code
      let j = i + 10, txt = "";
      while (j + 9 <= runs.length) {
        const c = car39(runs, j);
        if (c === "*") return txt.length >= 3 ? { t: txt, xs: pos[i], xe: j + 9 < pos.length ? pos[j + 9] : n } : null;
        if (!c || txt.length >= 9) break;
        txt += c; j += 10;
      }
      // fin floue (dernier caractère illisible) : nos codes ont toujours 9 chiffres, cela suffit ; la longueur est complétée
      if (/^\d{9}/.test(txt)) { const f = pos[i + 100] !== undefined ? pos[i + 100] : pos[Math.min(j, pos.length - 1)]; return { t: txt.slice(0, 9), xs: pos[i], xe: pos[i] + (f - pos[i]) * 11 / 10 }; }
    }
    return null;
  }
  // gris : tableau d'octets (L × H). On lit de gauche à droite et à l'envers, d'abord à plat,
  // puis en penchant les lignes de lecture de quelques degrés (photo prise de travers).
  function codeBarresPos(gris, L, H, budgetMs) {
    const fin = Date.now() + (budgetMs || 5000), votes = new Map(), lus = new Map();
    let best = null, n = 0;
    const essais = [[0.85, 16], [0.92, 32], [0.97, 16]];
    const angles = [0, -5, 5, -8, 8, -3, 3, -11, 11, -14, 14];
    const row = new Uint8Array(L), inv = new Uint8Array(L);
    const resultat = () => {
      if (!(best && n >= 2)) return null;
      const r = lus.get(best), xs = r.map(o => o.xs).sort((a, b) => a - b), xe = r.map(o => o.xe).sort((a, b) => a - b);
      const med = a => a[a.length >> 1], ys = r.map(o => o.y);
      const x0 = med(xs), x1 = med(xe), y0 = Math.min(...ys), y1 = Math.max(...ys), deg = r[0].deg, retourne = r[0].retourne;
      const th = deg * Math.PI / 180, c = Math.cos(th), s = Math.sin(th), long = (x1 - x0) / c, ym = (y0 + y1) / 2;
      const rep = retourne ? { ox: x1, oy: ym + (x1 - x0) * Math.tan(th), ux: -c, uy: -s } : { ox: x0, oy: ym, ux: c, uy: s };
      return { code: best, x0, x1, y0, y1, deg, retourne, long, ...rep };
    };
    for (const deg of angles) {
      const pente = Math.tan(deg * Math.PI / 180);
      const pas = deg === 0 ? 1 : 3;
      for (const [fac, div] of essais) {
        for (let y0 = 0; y0 < H; y0 += pas) {
          const yFin = y0 + (L - 1) * pente;
          if (yFin < 0 || yFin >= H) continue;
          for (let x = 0; x < L; x++) { const v = gris[Math.round(y0 + x * pente) * L + x]; row[x] = v; inv[L - 1 - x] = v; }
          [[row, false], [inv, true]].forEach(([r, retourne]) => {
            const o = ligne39(r, L, fac, div);
            if (!o) return;
            const v = (votes.get(o.t) || 0) + 1; votes.set(o.t, v); if (v > n) { best = o.t; n = v; }
            // position dans l'image d'origine (la lecture « à l'envers » est retournée)
            const xs = retourne ? L - 1 - o.xe : o.xs, xe = retourne ? L - 1 - o.xs : o.xe;
            if (!lus.has(o.t)) lus.set(o.t, []);
            lus.get(o.t).push({ xs, xe, y: y0 + xs * pente, deg, retourne });
          });
        }
        if (n >= 3) return resultat();
        if (Date.now() > fin) return resultat() || codeBarresLocalise(gris, L, H, 2500);
      }
    }
    return resultat() || codeBarresLocalise(gris, L, H, Math.max(1500, fin - Date.now() + 2500));
  }
  // Repérage : les barres donnent des contours forts et tous parallèles. On découpe l'image en blocs, on garde ceux
  // dont les contours vont tous dans le même sens, on les regroupe, puis on lit chaque groupe à la loupe
  // (échantillons tous les 1/3 de pixel, moyennés le long des barres) : marche penché à n'importe quel angle et sur un petit code.
  function codeBarresLocalise(gris, L, H, budgetMs) {
    const fin = Date.now() + (budgetMs || 3000);
    const lh = L >> 1, hh = H >> 1, d = new Float32Array(lh * hh);
    for (let y = 0; y < hh; y++) for (let x = 0; x < lh; x++) { const i = 2 * y * L + 2 * x; d[y * lh + x] = (gris[i] + gris[i + 1] + gris[i + L] + gris[i + L + 1]) / 4; }
    const B = 8, bl = Math.floor(lh / B), bh = Math.floor(hh / B), nb = bl * bh;
    const Sxx = new Float32Array(nb), Syy = new Float32Array(nb), Sxy = new Float32Array(nb);
    for (let y = 1; y < bh * B - 1; y++) for (let x = 1; x < bl * B - 1; x++) {
      const i = y * lh + x;
      const gx = d[i - lh + 1] + 2 * d[i + 1] + d[i + lh + 1] - d[i - lh - 1] - 2 * d[i - 1] - d[i + lh - 1];
      const gy = d[i + lh - 1] + 2 * d[i + lh] + d[i + lh + 1] - d[i - lh - 1] - 2 * d[i - lh] - d[i - lh + 1];
      const b = Math.floor(y / B) * bl + Math.floor(x / B);
      Sxx[b] += gx * gx; Syy[b] += gy * gy; Sxy[b] += gx * gy;
    }
    const E = new Float32Array(nb), coh = new Float32Array(nb), ang = new Float32Array(nb);
    for (let b = 0; b < nb; b++) {
      E[b] = Sxx[b] + Syy[b];
      coh[b] = E[b] > 0 ? Math.sqrt((Sxx[b] - Syy[b]) ** 2 + 4 * Sxy[b] ** 2) / E[b] : 0;
      ang[b] = 0.5 * Math.atan2(2 * Sxy[b], Sxx[b] - Syy[b]); // direction des contours = perpendiculaire aux barres
    }
    const tri = Array.from(E).sort((a, b) => a - b), seuilE = tri[Math.floor(nb * 0.97)] * 0.12;
    const cand = new Uint8Array(nb); for (let b = 0; b < nb; b++) cand[b] = E[b] > seuilE && coh[b] > 0.72 ? 1 : 0;
    // regroupement des blocs voisins de même direction
    const vu = new Int32Array(nb).fill(-1), groupes = [];
    const ecart = (a, b) => { let x = Math.abs(a - b) % Math.PI; return Math.min(x, Math.PI - x); };
    for (let b0 = 0; b0 < nb; b0++) {
      if (!cand[b0] || vu[b0] >= 0) continue;
      const pile = [b0], membres = []; vu[b0] = groupes.length;
      while (pile.length) {
        const b = pile.pop(); membres.push(b);
        const bx = b % bl, by = (b / bl) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const x = bx + dx, y = by + dy; if (x < 0 || y < 0 || x >= bl || y >= bh) continue;
          const v = y * bl + x; if (cand[v] && vu[v] < 0 && ecart(ang[v], ang[b0]) < 0.25) { vu[v] = groupes.length; pile.push(v); }
        }
      }
      if (membres.length >= 5) groupes.push(membres);
    }
    const lit = (x, y) => {
      if (x < 0 || y < 0 || x >= L - 1 || y >= H - 1) return 255;
      const xi = x | 0, yi = y | 0, fx = x - xi, fy = y - yi, i = yi * L + xi;
      return (gris[i] * (1 - fx) + gris[i + 1] * fx) * (1 - fy) + (gris[i + L] * (1 - fx) + gris[i + L + 1] * fx) * fy;
    };
    const infos = groupes.map(m => {
      let c2 = 0, s2 = 0, cx = 0, cy = 0, poids = 0;
      for (const b of m) { c2 += Math.cos(2 * ang[b]) * E[b]; s2 += Math.sin(2 * ang[b]) * E[b]; cx += (b % bl + 0.5) * E[b]; cy += (((b / bl) | 0) + 0.5) * E[b]; poids += E[b]; }
      const a = 0.5 * Math.atan2(s2, c2), ux = Math.cos(a), uy = Math.sin(a);
      cx = cx / poids * B * 2; cy = cy / poids * B * 2;
      let t0 = Infinity, t1 = -Infinity, s0 = Infinity, s1 = -Infinity;
      for (const b of m) { const x = (b % bl + 0.5) * B * 2 - cx, y = (((b / bl) | 0) + 0.5) * B * 2 - cy, t = x * ux + y * uy, s = -x * uy + y * ux; t0 = Math.min(t0, t); t1 = Math.max(t1, t); s0 = Math.min(s0, s); s1 = Math.max(s1, s); }
      const score = m.reduce((z, b) => z + coh[b], 0) * Math.min(4, (t1 - t0 + 2 * B) / (s1 - s0 + 2 * B));
      return { ux, uy, cx, cy, t0: t0 - B * 2, t1: t1 + B * 2, s0: s0 - B, s1: s1 + B, score };
    }).sort((a, b) => b.score - a.score).slice(0, 6);
    for (const g of infos) {
      const r = lireGroupe(g, lit, fin);
      if (r) return r;
      if (Date.now() > fin) break;
    }
    return null;
  }
  // ───── Lecture d'un groupe repéré : chaque caractère est voté sur de nombreuses lignes ─────
  // Une ligne peut casser au milieu (barre floue) : on garde les caractères lus depuis le début ET ceux lus depuis la fin,
  // et chaque position des 9 chiffres est décidée à la majorité.
  function runsSeuil(px, n, fac, div) {
    const R = Math.max(8, Math.floor(n / div)), cum = new Float64Array(n + 1);
    for (let x = 0; x < n; x++) cum[x + 1] = cum[x] + px[x];
    const runs = [], noir = [], pos = []; let prec = null, lg = 0;
    for (let x = 0; x < n; x++) {
      const a = Math.max(0, x - R), b = Math.min(n, x + R + 1), d = px[x] < (cum[b] - cum[a]) / (b - a) * fac;
      if (d === prec) lg++; else { if (prec !== null) { runs.push(lg); noir.push(prec); } prec = d; lg = 1; pos.push(x); }
    }
    runs.push(lg); noir.push(prec);
    return { runs, noir, pos };
  }
  function runsExtremes(px, n) {
    let lo = 255, hi = 0; for (let k = 0; k < n; k++) { if (px[k] < lo) lo = px[k]; if (px[k] > hi) hi = px[k]; }
    const delta = Math.max(6, (hi - lo) * 0.1), ext = [];
    let dir = 0, ki = 0, vi = px[0];
    for (let k = 1; k < n; k++) {
      const v = px[k];
      if (dir >= 0) { if (v > vi) { vi = v; ki = k; } else if (vi - v > delta) { ext.push([ki, vi, false]); dir = -1; vi = v; ki = k; } }
      if (dir < 0) { if (v < vi) { vi = v; ki = k; } else if (v - vi > delta) { ext.push([ki, vi, true]); dir = 1; vi = v; ki = k; } }
    }
    if (ext.length < 12) return null;
    const bords = [];
    for (let e = 0; e + 1 < ext.length; e++) {
      const [ka, va] = ext[e], [kb, vb] = ext[e + 1], mi = (va + vb) / 2; let p = (ka + kb) / 2;
      for (let k = ka; k < kb; k++) { const a = px[k], b = px[k + 1]; if ((a - mi) * (b - mi) <= 0 && a !== b) { p = k + (mi - a) / (b - a); break; } }
      bords.push(p);
    }
    const runs = [bords[0]], noir = [ext[0][2]], pos = [0];
    for (let e = 0; e + 1 < bords.length; e++) { runs.push(bords[e + 1] - bords[e]); noir.push(ext[e + 1][2]); pos.push(bords[e]); }
    runs.push(n - bords[bords.length - 1]); noir.push(ext[ext.length - 1][2]); pos.push(bords[bords.length - 1]);
    return { runs, noir, pos };
  }
  function partiel(R, table) { // départ « * » puis jusqu'à 9 chiffres (ou moins si la ligne casse)
    if (!R) return null;
    const { runs, noir, pos } = R;
    for (let i = 0; i + 9 <= runs.length; i++) {
      if (!noir[i] || car39(runs, i, table) !== "*") continue;
      const larg = runs.slice(i, i + 9).reduce((s, x) => s + x, 0);
      if (i > 0 && runs[i - 1] < larg * 0.5) continue;
      const car = []; let j = i + 10;
      while (j + 9 <= runs.length && car.length < 9) { const c = car39(runs, j, table); if (!c || c === "*") break; car.push(c); j += 10; }
      if (car.length >= 2 && car.every(c => /\d/.test(c))) return { car, debut: pos[i], pasCar: i + 10 < pos.length ? pos[i + 10] - pos[i] : larg * 16 / 15 };
    }
    return null;
  }
  function lireGroupe(g, lit, fin) {
    const PAS = 1 / 3, marge = (g.t1 - g.t0) * 0.25 + 24, ta = g.t0 - marge, n = Math.min(6000, Math.floor((g.t1 + marge - ta) / PAS));
    const hs = []; for (let s = g.s0 + 4; s <= g.s1 - 4; s += 1) hs.push(s);
    if (hs.length < 3) return null;
    // angle affiné : le profil moyen le plus net (barres bien alignées)
    let ux = g.ux, uy = g.uy, net0 = -1;
    const a0 = Math.atan2(g.uy, g.ux);
    for (const dDeg of [0, -0.6, 0.6, -1.2, 1.2, -1.8, 1.8, -2.5, 2.5, -3.5, 3.5]) {
      const a = a0 + dDeg * Math.PI / 180, cx = Math.cos(a), cy = Math.sin(a), p = new Float32Array(n);
      for (let k = 0; k < n; k++) { const t = ta + k * PAS; let v = 0; for (let h = 0; h < hs.length; h += 2) v += lit(g.cx + t * cx - hs[h] * cy, g.cy + t * cy + hs[h] * cx); p[k] = v; }
      let net = 0; for (let k = 3; k < n; k++) net += (p[k] - p[k - 3]) ** 2;
      if (net > net0) { net0 = net; ux = cx; uy = cy; }
    }
    const profil = (sa, sb) => {
      const p = new Float32Array(n), inv = new Float32Array(n);
      for (let k = 0; k < n; k++) { const t = ta + k * PAS; let v = 0, m = 0; for (let s = sa; s <= sb; s += 1) { v += lit(g.cx + t * ux - s * uy, g.cy + t * uy + s * ux); m++; } p[k] = v / m; inv[n - 1 - k] = p[k]; }
      return [p, inv];
    };
    const vote = () => ({ pos: Array.from({ length: 9 }, () => new Map()), debuts: [], fins: [], pasCar: [] });
    const V = [vote(), vote()]; // 0 : étiquette à l'endroit ; 1 : à l'envers
    const ajouter = (v, r, cote, versT) => {
      if (!r) return;
      r.car.forEach((c, q) => { const k = cote === "debut" ? q : 8 - q; v.pos[k].set(c, (v.pos[k].get(c) || 0) + 1); });
      (cote === "debut" ? v.debuts : v.fins).push(versT(r.debut)); v.pasCar.push(r.pasCar * PAS);
    };
    const complet = v => {
      let code = "";
      for (const m of v.pos) {
        const t = [...m].sort((a, b) => b[1] - a[1]);
        if (!t.length || t[0][1] < 2 || (t[1] && t[0][1] < 2 * t[1][1])) return null;
        code += t[0][0];
      }
      return code;
    };
    const med = a => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
    const h = hs.length, bandes = [[hs[0], hs[h - 1]], [hs[0], hs[h >> 1]], [hs[h >> 1], hs[h - 1]], [hs[h >> 2], hs[(3 * h) >> 2]]];
    for (let s = g.s0 + 2; s <= g.s1 - 2; s += 1.5) bandes.push([s - 2, s + 2]);
    for (const [sa, sb] of bandes) {
      const [p, inv] = profil(sa, sb), dir = k => ta + k * PAS, rev = k => ta + (n - 1 - k) * PAS;
      for (const meth of [q => runsExtremes(q, n), q => runsSeuil(q, n, 0.9, 12), q => runsSeuil(q, n, 0.85, 20)]) {
        const R = meth(p), Ri = meth(inv);
        ajouter(V[0], partiel(R, CAR39), "debut", dir); ajouter(V[0], partiel(Ri, CAR39R), "fin", rev);
        ajouter(V[1], partiel(Ri, CAR39), "debut", rev); ajouter(V[1], partiel(R, CAR39R), "fin", dir);
      }
      for (const envers of [0, 1]) {
        const code = complet(V[envers]); if (!code) continue;
        const v = V[envers], L = med(v.pasCar) * 11 - med(v.pasCar) / 16, sens = envers ? -1 : 1;
        const ts = v.debuts.length ? med(v.debuts) : med(v.fins) - sens * L, te = v.fins.length ? med(v.fins) : ts + sens * L;
        const sm = (g.s0 + g.s1) / 2, pt = t => [g.cx + t * ux - sm * uy, g.cy + t * uy + sm * ux];
        const [ox, oy] = pt(ts), [ex, ey] = pt(te), dx = envers ? -ux : ux, dy = envers ? -uy : uy;
        const deg = Math.round(Math.atan2(dy, dx) * 180 / Math.PI);
        return { code, ox, oy, ux: dx, uy: dy, long: Math.abs(te - ts), deg, retourne: Math.abs(deg) > 90,
          x0: Math.min(ox, ex), x1: Math.max(ox, ex), y0: Math.min(oy, ey), y1: Math.max(oy, ey), localise: true };
      }
      if (Date.now() > fin) break;
    }
    return null;
  }
  // L'angle estimé à la lecture est approximatif (jusqu'à 4° d'écart) et la perspective déforme la hauteur de l'étiquette.
  // On regarde les barres : elles sont les plus nettes quand la ligne de lecture leur est bien perpendiculaire ;
  // leur hauteur mesurée (0,20 × la longueur du code) donne l'échelle verticale ; leur milieu donne le vrai centre.
  function affinerRepere(gris, L, H, pos) {
    if (!pos) return pos;
    const bw = pos.long, a0 = Math.atan2(pos.uy, pos.ux);
    const profil = (a, s, n) => {
      const ux = Math.cos(a), uy = Math.sin(a), px = -uy, py = ux, out = new Float32Array(n);
      for (let k = 0; k < n; k++) {
        const t = (0.05 + 0.9 * k / (n - 1)) * bw, x = Math.round(pos.ox + t * ux + s * px), y = Math.round(pos.oy + t * uy + s * py);
        out[k] = gris[Math.min(H - 1, Math.max(0, y)) * L + Math.min(L - 1, Math.max(0, x))];
      }
      return out;
    };
    const energie = p => { let e = 0; for (let k = 1; k < p.length; k++) e += Math.abs(p[k] - p[k - 1]); return e / (p.length - 1); };
    let meilleur = -1, a = a0;
    for (let d = -4; d <= 4.001; d += 0.5) {
      const ar = a0 + d * Math.PI / 180;
      const e = energie(profil(ar, -0.06 * bw, 300)) + energie(profil(ar, 0, 300)) + energie(profil(ar, 0.06 * bw, 300));
      if (e > meilleur) { meilleur = e; a = ar; }
    }
    const pas = Math.max(1, bw / 200), n = Math.floor(0.9 * bw / pas), es = [], ss = [];
    for (let k = 0; k < n; k++) { const s = -0.45 * bw + k * pas; ss.push(s); es.push(energie(profil(a, s, 300))); }
    let k0 = 0; for (let k = 1; k < n; k++) if (es[k] > es[k0]) k0 = k;
    const seuil = 0.45 * es[k0]; let i = k0, j = k0;
    while (i > 0 && es[i - 1] > seuil) i--;
    while (j < n - 1 && es[j + 1] > seuil) j++;
    const h = (ss[j] - ss[i]) / bw, c = (ss[i] + ss[j]) / 2, ux = Math.cos(a), uy = Math.sin(a);
    return { ...pos, ox: pos.ox - c * uy, oy: pos.oy + c * ux, ux, uy, fy: Math.min(1.15, Math.max(0.75, h / 0.2)) };
  }
  // Fabrication d'un code-barres Code 39 (pour la copie imprimée) : liste de barres [position, largeur] en « modules »
  function encoder39(texte) {
    const barres = []; let x = 0;
    for (const ch of "*" + String(texte) + "*") {
      const code = ch === "*" ? ETOILE39 : CODES39[ALPHABET39.indexOf(ch)];
      if (code === undefined) continue;
      for (let i = 0; i < 9; i++) { const w = (code >> (8 - i)) & 1 ? 3 : 1; if (i % 2 === 0) barres.push([x, w]); x += w; }
      x += 1; // espace entre deux caractères
    }
    return { barres, total: x - 1 };
  }
  // n° d'étiquette → texte du code-barres : 203-458-1 devient « 203458001 » (6 chiffres + suffixe sur 3 chiffres)
  function texteCodeBarres(numero) {
    const d = String(numero || "").replace(/\D/g, "");
    return d.length >= 7 ? d.slice(0, 6) + d.slice(6).padStart(3, "0") : d;
  }
  // « 203458001 » → n° 2034581 (6 chiffres + suffixe sans les zéros)
  function numeroDepuisCode(code) {
    const m = /^(\d{6})(\d{1,3})$/.exec(code || "");
    return m ? m[1] + String(+m[2]) : "";
  }

  // ───── Options : elles sont imprimées en petit, juste AU-DESSUS du n° d'étiquette ─────
  const OPTIONS_OK = ["TR", "TA", "TI", "PR", "CR", "S", "MI-BOIS"];
  // data = résultat de Tesseract : liste de mots avec position, ou tableau « tsv »
  function motsDepuis(data) {
    if (!data) return [];
    if (Array.isArray(data.words) && data.words.length)
      return data.words.filter(w => w && w.bbox).map(w => ({ text: String(w.text || ""), conf: w.confidence ?? w.conf ?? 0, x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 }));
    if (typeof data.tsv === "string") {
      const mots = [];
      for (const ligne of data.tsv.split("\n")) {
        const c = ligne.split("\t");
        if (c.length >= 12 && c[0] === "5" && c[11].trim()) mots.push({ text: c[11], conf: +c[10], x0: +c[6], y0: +c[7], x1: +c[6] + +c[8], y1: +c[7] + +c[9] });
      }
      return mots;
    }
    return [];
  }
  // passes = une liste de mots par lecture (même image, mêmes coordonnées).
  // Renvoie les options imprimées (tableau, vide = aucune option) ou null si le n° n'a pas pu être localisé.
  function optionsPresDuNumero(passes) {
    const tous = passes.flat();
    const numeros = tous.filter(m => /^\d{6,8}$/.test(String(m.text).replace(/[^\d]/g, "")) && String(m.text).replace(/[^\d]/g, "").length === String(m.text).trim().length && m.conf >= 40);
    if (!numeros.length) return null;
    const n = numeros.sort((a, b) => b.conf - a.conf)[0];
    const w = n.x1 - n.x0, h = n.y1 - n.y0;
    const dans = m => m.x0 >= n.x0 - 0.5 * w && m.x1 <= n.x1 + 0.5 * w && m.y0 >= n.y0 - 1.2 * h && m.y1 <= n.y0 + 0.35 * h;
    const trouvees = new Set(), mots = tous.filter(dans);
    for (const m of mots) {
      const t = String(m.text).toUpperCase().replace(/[^A-Z-]/g, "");
      const codes = t === "MIBOIS" ? ["MI-BOIS"] : /^(TR|TA|TI|PR|CR)+$/.test(t) ? t.match(/../g) : OPTIONS_OK.includes(t) ? [t] : [];
      for (const c of codes) if (m.conf >= (c === "S" ? 85 : 60)) trouvees.add(c);
    }
    if (mots.some(m => /^MI-?$/i.test(m.text) && m.conf >= 60) && mots.some(m => /^BOIS$/i.test(m.text) && m.conf >= 60)) trouvees.add("MI-BOIS");
    return OPTIONS_OK.filter(x => trouvees.has(x));
  }

  // ───── Lecture zone par zone : chaque info est lue à sa place, calée sur le code-barres ─────
  // u, v en « largeurs de code-barres » : origine = bord gauche du code-barres, à mi-hauteur.
  const ZONES = [
    { nom: "section",  ech: 200, u0: -0.30, u1: 1.20, v0: -1.25, v1: -0.80, liste: "0123456789xX ", motif: /^\d{2,3}\s*[xX]\s*\d{2,4}$/ },
    { nom: "pieces",   ech: 330, u0: -0.65, u1: 0.08, v0: -0.90, v1: -0.62, liste: "0123456789P ", motif: /^\d{1,4}\s*P?$/ },
    { nom: "longueur", ech: 200, u0: 0.05,  u1: 0.82, v0: -1.00, v1: -0.60, liste: "0123456789,.", motif: /^\d{1,2}[,.]\d{2}$/ },
    { nom: "lieu",     ech: 260, u0: -0.85, u1: 0.40, v0: -0.64, v1: -0.32, liste: "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ ", motif: /^\d{0,2}\s*[A-Z0]{1,2}\s+[A-Z][0-9TIL]{1,2}$/ },
    { nom: "volume",   ech: 400, u0: 0.50,  u1: 1.30, v0: -0.58, v1: -0.28, liste: "0123456789,.m ", motif: /^\d{1,3}[,.]\d{3}/ },
    { nom: "options",  ech: 560, u0: -0.80, u1: 0.02, v0: -0.33, v1: -0.13, liste: "ABCDEFGHIJKLMNOPQRSTUVWXYZ- ", motif: /^[A-Z -]*$/ },
    { nom: "code",     ech: 520, u0: -1.15, u1: -0.06, v0: 0.05, v1: 0.28, liste: "0123456789/ ", motif: /^\d{1,4}\/\d{3,4}(?:\s+\d{1,4}\/\d{3,4})*$/ },
    { nom: "date",     ech: 500, u0: -0.65, u1: 0.45, v0: 0.20, v1: 0.44, liste: "0123456789. ", motif: /^\d{1,2}\.\d{2}\.\d{2}\s*\d{4}$/ }
  ];
  function texteDepuisZones(z) { // assemble ce qui a été lu dans chaque zone, avec les repères attendus par lireSpec/lireChamps
    const L = [];
    if (z.section) L.push(z.section);
    if (z.pieces) L.push(z.pieces.replace(/\s*P?$/, "") + " P");
    if (z.longueur) L.push(z.longueur + " m");
    if (z.lieu) { // choix lu en entier → tel quel ; sinon le lieu est gardé, avec un choix et une essence « inconnus »
      const m = /^(\d{2})\s*[A-Z0]{1,2}\s+\S+$/.exec(z.lieu);
      L.push(m ? z.lieu : "99 ZZ " + z.lieu.split(/\s+/).pop());
    }
    if (z.volume) L.push(z.volume.replace(/\s*m.*$/i, "") + " m3");
    if (z.code) L.push(z.code);
    if (z.date) L.push(z.date.replace(/(\d{2}\.\d{2}\.\d{2})\s*(\d{4})/, "$1 $2"));
    return L.join("\n");
  }
  // Options lues dans leur zone : tableau (vide = aucune option) ou null si la lecture n'a rien de sûr
  function optionsDepuisZone(t) {
    if (t == null) return null;
    const toks = String(t).toUpperCase().replace(/MI\s*-?\s*BOIS/g, "MI-BOIS").split(/[^A-Z-]+/).filter(x => /[A-Z]/.test(x));
    if (!toks.length) return [];
    const codes = [];
    for (const tok of toks) {
      if (OPTIONS_OK.includes(tok)) codes.push(tok);
      else if (/^(TR|TA|TI|PR|CR)+$/.test(tok)) codes.push(...tok.match(/../g));
      else return null; // lettres inattendues : on ne devine pas
    }
    return OPTIONS_OK.filter(x => codes.includes(x));
  }

  // ───── Lectures répétées : on garde la combinaison que le volume imprimé confirme ─────
  // c = { section: [textes lus], pieces: [...], longueur: [...], volume: [...], code: [...] } (une entrée par lecture)
  // Plusieurs décalages de la zone donnent des lectures parfois fausses (« 25 » lu « 98 ») : seule la bonne
  // combinaison section × pièces × longueur retombe sur le volume, et c'est elle qui est retenue.
  function fusionner(c) {
    const tas = (liste, f) => { const m = new Map(); for (const t of liste || []) { const k = f(String(t)); if (k != null) m.set(k, (m.get(k) || 0) + 1); } return m; };
    const secs = tas(c.section, t => { const m = /(\d{2,3})\s*[xX*×]\s*(\d{2,4})/.exec(t); return m ? m[1] + "x" + m[2] : null; });
    const vols = tas(c.volume, t => { const m = /(\d{1,3})[,.](\d{3})(?!\d)/.exec(t); return m ? +(m[1] + "." + m[2]) : null; });
    const pcs = tas(c.pieces, t => { const m = /^\s*(\d{1,4})\s*P?\s*$/i.exec(t); return m ? +m[1] : null; });
    const los = tas(c.longueur, t => { const m = /(\d{1,2})[,.](\d{2})(?!\d)/.exec(t); return m ? +(m[1] + "." + m[2]) : null; });
    const codes = tas(c.code, t => { const m = /(\d{1,4})\s*\/\s*(\d{3,4})/.exec(t); return m ? m[1] + "/" + m[2] : null; });
    codes.forEach((n, k) => { const [p, l] = k.split("/"); pcs.set(+p, (pcs.get(+p) || 0) + n); los.set(+l / 100, (los.get(+l / 100) || 0) + n); });
    // plusieurs longueurs : « 3/450 28/400 » lu dans la zone du code ; seule la liste dont le total retombe sur le volume imprimé est retenue
    const multi = new Map();
    for (const t of c.code || []) {
      const ms = [...String(t).matchAll(/(\d{1,4})\s*\/\s*(\d{3,4})/g)].map(m => ({ pieces: +m[1], longueur: +m[2] / 100 })).filter(l => l.pieces > 0 && l.longueur >= 0.5 && l.longueur <= 13);
      if (ms.length > 1) { const k = ms.map(l => l.pieces + "/" + Math.round(l.longueur * 100)).join(" "); multi.set(k, (multi.get(k) || 0) + 1); }
    }
    let meilleurMulti = null;
    for (const [k, nk] of multi) {
      const lots = k.split(" ").map(x => { const [p, l] = x.split("/"); return { pieces: +p, longueur: +l / 100 }; });
      const total = lots.reduce((s, l) => s + l.pieces * l.longueur, 0);
      for (const [s, ns] of secs) for (const [v, nv] of vols) {
        const [e, la] = s.split("x").map(Number);
        if (Math.abs(e / 1000 * la / 1000 * total - v) >= 0.0015) continue;
        const appui = ns + nv + nk * 3;
        if (!meilleurMulti || appui > meilleurMulti.appui) meilleurMulti = { epaisseur: e, largeur: la, pieces: lots[0].pieces, longueur: lots[0].longueur, lots, volume: v, appui };
      }
    }
    if (meilleurMulti) return meilleurMulti;
    let meilleur = null;
    for (const [s, ns] of secs) for (const [p, np] of pcs) for (const [lo, nl] of los) for (const [v, nv] of vols) {
      const [e, la] = s.split("x").map(Number);
      if (e > la || lo < 0.5 || lo > 13 || Math.abs(e / 1000 * la / 1000 * p * lo - v) >= 0.0015) continue;
      const appui = ns + np + nl + nv + (codes.get(p + "/" + Math.round(lo * 100)) || 0) * 2;
      if (!meilleur || appui > meilleur.appui) meilleur = { epaisseur: e, largeur: la, pieces: p, longueur: lo, volume: v, appui };
    }
    return meilleur;
  }
  // Lecture « en vrac » d'une étiquette : chaque morceau de texte est rangé selon sa forme
  // (section, pièces, longueur, volume, code pièces/longueur, lieu). Marche quelle que soit la disposition de l'étiquette.
  function candidatsDepuisTexte(texte) {
    const T = String(texte || "").toUpperCase().replace(/[|]/g, "1").replace(/(\d)\s+([,.])\s*(\d)/g, "$1$2$3");
    const c = { section: [], pieces: [], longueur: [], volume: [], code: [], lieu: [] };
    const tous = (re, f) => { let m; re.lastIndex = 0; while ((m = re.exec(T))) f(m); };
    tous(/(?:^|[^\d])(\d{2,3})\s*[X×*]\s*(\d{2,4})(?!\d)/g, m => c.section.push(m[1] + " x " + m[2]));
    tous(/(?:^|[^\d,.])(\d{1,4})\s*P\b/g, m => c.pieces.push(m[1] + " P"));
    tous(/(?:^|[^\d,.])(\d{1,2})[,.](\d{2})(?![\d])/g, m => c.longueur.push(m[1] + "," + m[2]));
    tous(/(?:^|[^\d,.])(\d{1,3})[,.](\d{3})(?![\d])/g, m => c.volume.push(m[1] + "," + m[2] + " m3"));
    tous(/(?:^|[^\d])(\d{1,4})\s*\/\s*(\d{3,4})(?!\d)/g, m => c.code.push(m[1] + "/" + m[2]));
    tous(/(?:^|[^\d])(\d{2})\s*([A-Z0]{1,2})\s+([A-Z][0-9TIL]{1,2})(?![A-Z0-9])/g, m => c.lieu.push(`${m[1]} ${m[2].replace(/0/g, "D")} ${m[3]}`));
    return c;
  }
  // Valeur la plus souvent lue parmi des lectures qui ont la bonne forme (ex. le lieu « 20 SE D16 »)
  function majoritaire(liste) {
    const m = new Map(); for (const t of liste || []) m.set(t, (m.get(t) || 0) + 1);
    let best = null, n = 0; for (const [t, k] of m) if (k > n) { best = t; n = k; }
    return best;
  }

  const API = { affinerRepere, candidatsDepuisTexte, lotsDe, memesLots, fusionner, majoritaire, encoder39, texteCodeBarres, ZONES, texteDepuisZones, optionsDepuisZone, motsDepuis, optionsPresDuNumero, verifier, trouver, lireChamps, lireSpec, correspondance,  codeBarresPos, numeroDepuisCode };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else racine.Lecture = API;
})(typeof window !== "undefined" ? window : this);
