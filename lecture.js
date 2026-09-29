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

    // Options possibles : TR, TA, TI, PR, CR, S, MI-BOIS (plusieurs possibles, aucune = pas d'option)
    const DEUX = ["TR", "TA", "TI", "PR", "CR"], trouvees = new Set();
    const eclater = tok => tok === "MI-BOIS" || tok === "S" || DEUX.includes(tok) ? [tok]
      : /^(TR|TA|TI|PR|CR)+$/.test(tok) ? tok.match(/../g) : null;           // « TRCR » collé
    for (const ligne of T.split(/\n/)) {
      const propre = ligne.replace(/MI\s*[-–]?\s*BOIS/g, "MI-BOIS").trim();
      if (!propre || propre.length > 24) continue;
      const toks = propre.split(/[^A-Z-]+/).filter(x => x && x !== "-");
      const codes = toks.map(eclater);
      if (!toks.length || codes.some(x => !x)) continue;                     // la ligne ne contient que des options
      const liste = codes.flat();
      if (liste.length === 1 && liste[0] === "S") continue;                   // un « S » seul : trop souvent un bruit de lecture
      liste.forEach(x => trouvees.add(x));
    }
    for (const x of DEUX) if (new RegExp("(?:^|[^A-Z])" + x + "(?![A-Z])").test(T)) trouvees.add(x);
    if (/MI\s*[-–]?\s*BOIS/.test(T)) trouvees.add("MI-BOIS");
    const options = ["TR", "TA", "TI", "PR", "CR", "S", "MI-BOIS"].filter(x => trouvees.has(x));

    let date = null;
    if ((m = T.match(/(?:^|\D)(\d{2})\.(\d{2})\.(\d{2})\s+(\d{2})[:H]?(\d{2})(?!\d)/)))
      date = { jour: +m[1], mois: +m[2], an: 2000 + +m[3], h: +m[4], min: +m[5] };

    return { numero, choix, essence, essenceCode, lieu, options, date };
  }

  // Section, pièces et longueur imprimées sur l'étiquette. Elles ne sont gardées que si le calcul
  // épaisseur × largeur × pièces × longueur retombe sur le volume imprimé : sinon la lecture n'est pas fiable.
  function lireSpec(texte) {
    const T = N(texte);
    const vols = [...T.matchAll(/(?:^|\D)(\d{1,3})[.,]\s?(\d{3})(?!\d)/g)].map(m => +(m[1] + "." + m[2]));
    const sections = [...T.matchAll(/(?:^|\D)(\d{2,3})\s*[X*]\s*(\d{2,3})(?!\d)/g)].map(m => [+m[1], +m[2]]);
    const codes = [...T.matchAll(/(?:^|\D)(\d{1,4})\s*\/\s*(\d{3,4})(?!\d)/g)].map(m => [+m[1], +m[2] / 100]);
    for (const [epaisseur, largeur] of sections) for (const [pieces, longueur] of codes) for (const v of vols)
      if (pieces > 0 && longueur >= 0.5 && longueur <= 13 && Math.abs(epaisseur / 1000 * largeur / 1000 * pieces * longueur - v) < 0.0015)
        return { epaisseur, largeur, pieces, longueur, volume: v };
    // Volume illisible : on garde quand même pièces et longueur si le code « 150/400 » est confirmé
    // par « 150 P » ou par la longueur « 4,00 » imprimée à côté.
    for (const [pieces, longueur] of codes) {
      if (!(pieces > 0 && longueur >= 0.5 && longueur <= 13)) continue;
      const pOk = new RegExp("(?:^|\\D)" + pieces + "\\s*P(?![A-Z])").test(T);
      const [e, d] = longueur.toFixed(2).split(".");
      const lOk = new RegExp("(?:^|\\D)" + e + "\\s?[.,]\\s?" + d + "(?!\\d)").test(T);
      if (pOk || lOk) return { pieces, longueur, partiel: true };
    }
    return null;
  }

  // Retrouve le colis en attente qui correspond à l'étiquette, même si la note contient une faute.
  // « auto » = la section est identique (donc c'est bien le même colis : seules les pièces ou la longueur sont fausses)
  // et un seul colis convient : on peut corriger sans demander.
  function correspondance(spec, colis) {
    const meme = (x, y) => x.epaisseur === y.epaisseur && x.largeur === y.largeur && x.pieces === y.pieces && x.longueur === y.longueur;
    const scores = [];
    for (const c of colis) {
      const sec = (c.epaisseur === spec.epaisseur && c.largeur === spec.largeur) ? 3 : (c.epaisseur === spec.epaisseur || c.largeur === spec.largeur) ? 1 : 0;
      const pl = Math.max((c.pieces === spec.pieces) + (c.longueur === spec.longueur), (c.pieces === spec.longueur && c.longueur === spec.pieces) ? 2 : 0);
      if (sec + pl >= 3) scores.push({ c, sec, score: sec + pl });
    }
    if (!scores.length) return null;
    const max = Math.max(...scores.map(s => s.score));
    const egaux = scores.filter(s => s.score === max);
    const identiques = egaux.every(s => meme(s.c, egaux[0].c));
    return { colis: egaux[0].c, exact: max === 5, auto: egaux[0].sec === 3 && identiques };
  }

  const API = { verifier, trouver, lireChamps, lireSpec, correspondance };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else racine.Lecture = API;
})(typeof window !== "undefined" ? window : this);
