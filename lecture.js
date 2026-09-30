// Lecture d'une étiquette photographiée.
// Ces fonctions ne touchent pas à l'écran : elles reçoivent le texte lu sur la photo
// et retrouvent (1) le colis en attente qui correspond, (2) le n°, le lieu, les options…
(function (racine) {
  "use strict";

  const N = t => String(t || "").toUpperCase().replace(/×/g, "X");
  const DEB = "(?:^|[^\\d])";   // pas de chiffre juste avant
  const FIN = "(?![\\d])";      // pas de chiffre juste après
  const volume = c => (c.epaisseur / 1000) * (c.largeur / 1000) * c.longueur * c.pieces;

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
    const pieces = new RegExp(DEB + c.pieces + "\\s*P(?![A-Z])").test(T);
    const longueur = motifLongueur(c.longueur).test(T);
    const code = new RegExp(DEB + c.pieces + "\\s*/\\s*" + Math.round(c.longueur * 100) + FIN).test(T); // ex. « 80/400 »
    const [ve, vd] = volume(c).toFixed(3).split(".");
    const vol = new RegExp(DEB + ve + "[.,]\\s?" + vd + FIN).test(T);
    let score = (section ? 3 : largeurSeule ? 1 : 0) + (pieces ? 2 : 0) + (longueur ? 2 : 0) + (vol ? 3 : 0) + (code ? 2 : 0);

    // Pièces et longueur inversés dans la note ? (ex. noté « 6 pièces de 48 m » alors que l'étiquette dit 48 P et 6,00 m)
    // Le volume, lui, reste juste dans les deux cas : il ne peut pas révéler l'inversion.
    let inverse = false;
    if (!(pieces || longueur || code) && Number.isInteger(c.longueur) && c.longueur > 0) {
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
    if ((m = T.match(/(?:^|\D)(\d{2})[ \t]*([A-Z]{1,2})[ \t]+([A-Z]\d{1,2})(?![A-Z0-9])/))) {
      choix = m[1]; essenceCode = m[2]; essence = (essenceInverse && essenceInverse[m[2]]) || ""; lieu = m[3];
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
    const sections = nombres(/(?:^|\D)(\d{2,3})\s*[X*]\s*(\d{2,3})(?!\d)/g, m => [+m[1], +m[2]]);
    const codes = nombres(/(?:^|\D)(\d{1,4})\s*\/\s*(\d{3,4})(?!\d)/g, m => [+m[1], +m[2] / 100]);
    const pieces = [...new Set([...codes.map(c => c[0]), ...nombres(/(?:^|\D)(\d{1,4})\s*P(?![A-Z])/g, m => +m[1])])].filter(p => p > 0);
    const longueurs = [...new Set([...codes.map(c => c[1]), ...nombres(/(?:^|\D)(\d{1,2})\s?[.,]\s?(\d{2})\s*M(?![A-Z0-9])/g, m => +(m[1] + "." + m[2]))])].filter(x => x >= 0.5 && x <= 13);
    const ok = (a, b) => Math.abs(a - b) < 0.0015;
    // 1. tout est lu et cohérent
    for (const [epaisseur, largeur] of sections) for (const p of pieces) for (const lo of longueurs) for (const v of vols)
      if (ok(epaisseur / 1000 * largeur / 1000 * p * lo, v)) return { epaisseur, largeur, pieces: p, longueur: lo, volume: v };
    // 2. section illisible : pièces, longueur et volume sont cohérents → on retient l'aire e × l (mm²)
    const dejaCode = codes.filter(c => c[1] >= 0.5 && c[1] <= 13);
    for (const [p, lo] of [...dejaCode, ...pieces.flatMap(p => longueurs.map(lo => [p, lo]))]) for (const v of vols) {
      const aire = v * 1e6 / (p * lo);
      if (p > 0 && aire >= 300 && aire <= 100000 && Math.abs(aire - Math.round(aire)) < aire * 0.004) return { pieces: p, longueur: lo, aire: Math.round(aire), volume: v, partiel: true };
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
      const pl = Math.max((c.pieces === spec.pieces) + (c.longueur === spec.longueur), (c.pieces === spec.longueur && c.longueur === spec.pieces) ? 2 : 0);
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

  function car39(runs, i) { // 9 éléments (barre, espace, …) → caractère, ou null
    if (i + 9 > runs.length) return null;
    const w = runs.slice(i, i + 9), tri = [...w].sort((a, b) => a - b);
    if (tri[6] < tri[5] * 1.3 || tri[8] > tri[0] * 7) return null;
    const seuil = (tri[5] + tri[6]) / 2;
    let code = 0; for (const x of w) code = (code << 1) | (x > seuil ? 1 : 0);
    return CAR39.get(code) || null;
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
        if (!c) break;
        if (c === "*") return txt.length >= 3 ? { t: txt, xs: pos[i], xe: j + 9 < pos.length ? pos[j + 9] : n } : null;
        txt += c; j += 10;
      }
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
      return { code: best, x0: med(xs), x1: med(xe), y0: Math.min(...ys), y1: Math.max(...ys), deg: r[0].deg, retourne: r[0].retourne };
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
        if (Date.now() > fin) return resultat();
      }
    }
    return resultat();
  }
  function codeBarres(gris, L, H, budgetMs) { const r = codeBarresPos(gris, L, H, budgetMs); return r ? r.code : null; }
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

  const API = { motsDepuis, optionsPresDuNumero, verifier, trouver, lireChamps, lireSpec, correspondance, codeBarres, codeBarresPos, numeroDepuisCode };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else racine.Lecture = API;
})(typeof window !== "undefined" ? window : this);
