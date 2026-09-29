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

    const options = /\bTR\s*CR\b|\bTRCR\b/.test(T) ? ["TR", "CR"]
      : [/\bTR\b/.test(T) && "TR", /\bCR\b/.test(T) && "CR"].filter(Boolean);

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
    return null;
  }

  const API = { verifier, trouver, lireChamps, lireSpec };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else racine.Lecture = API;
})(typeof window !== "undefined" ? window : this);
