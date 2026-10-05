(() => {
"use strict";

const CFG = window.COLIS_CONFIG || {};
const DEF = Object.assign({ essence: "", choix: "20", nature: "G", options: [] }, CFG.DEFAUTS || {});
const OPTIONS = CFG.OPTIONS || { TR: "Fongi. coloré", CR: "Cœur refendu" };
const K = { reglages: "colis.reglages.v1", data: "colis.donnees.v1", attente: "colis.attente.v1", tire: "colis.tire.v1", suppr: "colis.suppressions.v1", projet: "colis.projet.v1", sauvegarde: "colis.sauvegarde.v1", synchro: "colis.synchroOk.v1" };
const STOCK = "STOCK"; // un colis « du stock » n'a pas de commande : sa commande vaut STOCK
const cdeTxt = c => c.commande === STOCK ? "Stock" : "Cde " + (c.commande || "–");
const STATUTS = { a_etiqueter: "En attente de pointage", a_sortir: "Pointé ✅" }; // « a_sortir » = pointé (nom interne)
const STATUT_COURT = { a_etiqueter: "En attente", a_sortir: "Pointé ✅" };
const COLONNES = ["id","numero","commande","lieu","epaisseur","largeur","longueur","pieces","autres","choix","essence","nature",
  "options","ref_client","observation","statut","cree_le","etiquete_le","maj_le","supprime"];

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ═════════════ Stockage local ═════════════ */
function lire(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }
function ecrire(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { toast("Mémoire de l'appareil pleine : exporte puis synchronise."); } }

let liste = lire(K.data, []);
let attente = new Set(lire(K.attente, []));
let suppressions = new Set(lire(K.suppr, [])); // colis supprimés ici : à effacer aussi en ligne
function sauverLocal() { ecrire(K.data, liste); ecrire(K.attente, [...attente]); ecrire(K.suppr, [...suppressions]); }
// Anciennes données : un colis « sorti » compte comme pointé ; un colis « supprimé » est maintenant effacé pour de bon.
const migrer = () => {
  liste.forEach(c => { if (c.statut === "sorti") c.statut = "a_sortir"; delete c.sorti_le; });
  const morts = liste.filter(c => c.supprime);
  if (morts.length) { morts.forEach(c => { suppressions.add(c.id); attente.delete(c.id); }); liste = liste.filter(c => !c.supprime); }
  try { localStorage.removeItem("colis.memo.v1"); } catch {}
};
migrer();
const actifs = () => liste.filter(c => !c.supprime);
const parId = id => liste.find(c => c.id === id);
const maintenant = () => new Date().toISOString();
const t = iso => (iso ? Date.parse(iso) : 0);
function nouvelId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, ch => {
    const r = (Math.random() * 16) | 0; return (ch === "x" ? r : (r & 3) | 8).toString(16);
  });
}

function enregistrer(c) {
  c.maj_le = maintenant();
  const i = liste.findIndex(x => x.id === c.id);
  if (i < 0) liste.push(c); else liste[i] = c;
  attente.add(c.id);
  sauverLocal();
  rafraichir();
  synchroniser();
}

// Supprime définitivement : plus rien ni ici ni (après synchro) en ligne. Renvoie le colis pour pouvoir annuler quelques secondes.
function supprimerDefinitivement(id) {
  const c = parId(id); if (!c) return null;
  liste = liste.filter(x => x.id !== id); attente.delete(id); suppressions.add(id);
  sauverLocal(); rafraichir(); synchroniser();
  return c;
}
function restaurerColis(c) { suppressions.delete(c.id); enregistrer(c); }
function doublon(numero, sauf) {
  if (!numero) return null;
  const n = formatNumero(numero);
  return actifs().find(c => c.numero && formatNumero(c.numero) === n && c.id !== sauf) || null;
}

/* ═════════════ Formats ═════════════ */
const nf = (n, d) => (n == null || isNaN(n)) ? "" :
  Number(n).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
function num(s) {
  if (s == null) return null;
  s = String(s).replace(/\s/g, "").replace(",", ".");
  if (s === "") return null;
  const n = Number(s); return isNaN(n) ? null : n;
}
/* Un colis peut mélanger plusieurs longueurs : la 1re est dans pieces/longueur, les suivantes dans « autres » [{ pieces, longueur }] */
const lotsDe = c => [{ pieces: c.pieces, longueur: c.longueur }, ...(Array.isArray(c.autres) ? c.autres : []).filter(l => l && l.pieces && l.longueur)];
const plusieursLongueurs = c => lotsDe(c).length > 1;
const totalPieces = c => lotsDe(c).reduce((s, l) => s + (l.pieces || 0), 0);
function volume(c) {
  if (!c.epaisseur || !c.largeur) return null;
  const lots = lotsDe(c);
  if (lots.some(l => !l.longueur || !l.pieces)) return null;
  return (c.epaisseur / 1000) * (c.largeur / 1000) * lots.reduce((s, l) => s + l.longueur * l.pieces, 0);
}
const lotsTxt = c => lotsDe(c).map(l => `${np(l.pieces)} × ${nf(l.longueur, 2)}`).join(" + ");
const resumeLots = c => plusieursLongueurs(c) ? `${lotsTxt(c)} m · ${np(totalPieces(c))} p` : `${nf(c.longueur, 2)} m · ${np(c.pieces)} p`;
const phraseLots = c => plusieursLongueurs(c) ? `${np(totalPieces(c))} pièces : ${lotsTxt(c)} m` : `${np(c.pieces)} pièces de ${nf(c.longueur, 2)} m`;
const section = c => `${c.epaisseur ?? "?"} × ${c.largeur ?? "?"}`;
const longueurCourte = v => (v == null ? "" : String(v).replace(".", ","));
function quand(iso) {
  if (!iso) return "";
  const d = new Date(iso), auj = new Date();
  const h = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const hier = new Date(auj); hier.setDate(auj.getDate() - 1);
  if (d.toDateString() === auj.toDateString()) return "aujourd'hui " + h;
  if (d.toDateString() === hier.toDateString()) return "hier " + h;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" }) + " " + h;
}
function dateLongue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }) + " à " +
    d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}
const np = n => nf(n, 0);
// N° d'étiquette : 2000001 devient 200-000-1 (3 chiffres, 3 chiffres, puis le suffixe)
function formatNumero(v) {
  const d = String(v ?? "").replace(/\D/g, "");
  return d.length <= 3 ? d : d.length <= 6 ? d.slice(0, 3) + "-" + d.slice(3) : d.slice(0, 3) + "-" + d.slice(3, 6) + "-" + d.slice(6);
}
// ── Lieu de stock : seulement des chiffres et les lettres de config (C, D, G, H) ──
const LETTRES_LIEU = (CFG.LETTRES_LIEU || ["C", "D", "G", "H"]).map(x => String(x).toUpperCase());
let inputClavier = null;
function fermerClavierLieu() { $$(".clavier-lieu").forEach(k => k.remove()); inputClavier = null; }
function ouvrirClavierLieu(inp) {
  fermerClavierLieu();
  if (!matchMedia("(pointer: coarse)").matches || inp.dataset.complet) return; // ordinateur : on tape au clavier ; « clavier complet » : clavier normal
  inputClavier = inp;
  const k = document.createElement("div"); k.className = "clavier-lieu";
  const touche = (x, cl = "") => `<button type="button" data-k="${x}"${cl ? ` class="${cl}"` : ""}>${x}</button>`;
  k.innerHTML = `<div class="kl-lettres">${LETTRES_LIEU.map(x => touche(x)).join("")}</div>
    <div class="kl-chiffres">${"1234567890".split("").map(x => touche(x)).join("")}</div>
    <div class="kl-bas"><button type="button" data-k="effacer" class="kl-eff" aria-label="Effacer">⌫</button><button type="button" data-k="ok" class="kl-ok">Terminé</button></div>
    <button type="button" class="lien kl-autre" data-k="complet">Autre lettre ? Clavier complet</button>`;
  inp.closest("label").after(k);
  k.scrollIntoView({ block: "nearest", behavior: "smooth" });
}
document.addEventListener("focusin", e => {
  const el = e.target;
  if (el.id === "pc-lieu" || el.id === "f-lieu" || el.id === "intro-lieu") ouvrirClavierLieu(el);
  else if (!el.closest || !el.closest(".clavier-lieu")) fermerClavierLieu();
});
document.addEventListener("click", e => {
  const b = e.target.closest && e.target.closest(".clavier-lieu [data-k]"); if (!b || !inputClavier) return;
  const inp = inputClavier, k = b.dataset.k;
  if (k === "ok") { inp.blur(); fermerClavierLieu(); return; }
  if (k === "complet") { fermerClavierLieu(); inp.dataset.complet = "1"; inp.blur(); inp.inputMode = "text"; setTimeout(() => inp.focus(), 60); return; }
  if (k === "effacer") inp.value = inp.value.slice(0, -1);
  else if (inp.value.length < 5) inp.value += k;
  inp.dispatchEvent(new Event("input", { bubbles: true }));
});
document.addEventListener("input", e => {
  const el = e.target;
  if (el.id === "pc-lieu" || el.id === "f-lieu" || el.id === "intro-lieu") { // tout ce qui n'est pas autorisé disparaît, même au clavier d'un ordinateur
    const interdit = el.dataset.complet ? /[^0-9A-Z]/g : new RegExp(`[^0-9${LETTRES_LIEU.join("")}]`, "g");
    const v = el.value.toUpperCase().replace(interdit, ""); if (v !== el.value) el.value = v;
  }
  if (el.id === "f-numero" || el.id === "pc-numero" || el.id === "fiche-numero" || el.id === "intro-numero") { const f = formatNumero(el.value); if (f !== el.value) el.value = f; }
}, true);
const dh = iso => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" }) + " à " +
    d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
};
const jour = iso => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

/* ═════════════ Toast ═════════════ */
let toastMinuteur;
function toast(msg, actionTxt, action) {
  const el = $("#toast"), b = $("#toast-action");
  $("#toast-txt").textContent = msg;
  b.hidden = !actionTxt;
  b.textContent = actionTxt || "";
  b.onclick = () => { el.hidden = true; action && action(); };
  el.hidden = false;
  clearTimeout(toastMinuteur);
  toastMinuteur = setTimeout(() => (el.hidden = true), actionTxt ? 6000 : 3000);
}

/* ═════════════ Navigation ═════════════ */
let vueActive = "nouveau";
/* Accueil : tout tient sur un seul écran, sans défiler (le gros bouton photo prend la place qui reste) */
function ajusterAccueil() {
  const v = $("#vue-accueil"), nav = $(".onglets");
  if (!v || v.hidden || !nav) return;
  v.style.height = "";
  const dispo = nav.getBoundingClientRect().top - v.getBoundingClientRect().top - 10;
  if (dispo > 300) v.style.height = Math.round(dispo) + "px";
}
addEventListener("resize", ajusterAccueil);
addEventListener("orientationchange", () => setTimeout(ajusterAccueil, 250));
function allerA(vue) {
  vueActive = vue;
  document.body.classList.toggle("sur-accueil", vue === "accueil");
  $$(".vue").forEach(s => (s.hidden = s.id !== "vue-" + vue));
  $$(".onglets button").forEach(b => b.classList.toggle("actif", b.dataset.vue === vue));
  majTitre();
  if (vue === "colis") rendreListe();
  if (vue === "reglages") { majEtat(); majUIapparence(); }
  if (vue === "stats") rendreStats();
  if (vue === "accueil") rendreAccueil();
  window.scrollTo(0, 0);
  if (vue === "accueil") ajusterAccueil();
}
function majTitre() {
  $("#entete-titre").textContent = { accueil: "Accueil", nouveau: editionId ? "Modifier le colis" : "Calepin", colis: "Colis", stats: "Statistiques", reglages: "Réglages" }[vueActive];
}
$$(".onglets button").forEach(b => b.addEventListener("click", () => allerA(b.dataset.vue)));

/* Feuilles */
let ficheId = null;
function montrer(sel) { $(sel).hidden = false; document.body.style.overflow = "hidden"; }
function cacher(sel) {
  $(sel).hidden = true;
  if ($("#fiche").hidden && $("#pc").hidden && $("#etq").hidden && $("#introuvable").hidden) document.body.style.overflow = "";
  if (sel === "#fiche") ficheId = null;
}
$$(".feuille").forEach(f => f.addEventListener("click", e => { if (e.target.closest("[data-fermer]")) cacher("#" + f.id); }));
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if (!$("#introuvable").hidden) cacher("#introuvable"); else if (!$("#etq").hidden) cacher("#etq"); else if (!$("#pc").hidden) cacher("#pc"); else if (!$("#fiche").hidden) cacher("#fiche");
});

/* ═════════════ Formulaire « Nouveau colis » ═════════════ */
const F = id => $("#f-" + id);
let editionId = null;
let optionsChoisies = new Set();

function rendrePuces() {
  $("#f-options").innerHTML = Object.entries(OPTIONS).map(([k, lib]) =>
    `<button type="button" class="puce" data-opt="${esc(k)}" aria-pressed="${optionsChoisies.has(k)}">${esc(k)} <small>${esc(lib)}</small></button>`
  ).join("");
}
$("#f-options").addEventListener("click", e => {
  const b = e.target.closest("[data-opt]"); if (!b) return;
  const k = b.dataset.opt;
  optionsChoisies.has(k) ? optionsChoisies.delete(k) : optionsChoisies.add(k);
  b.setAttribute("aria-pressed", optionsChoisies.has(k));
});

/* Choix du bois et essence : boutons à appuyer au calepin (ils remplissent les champs « Plus de détails ») */
const CHOIX_BOUTONS = CFG.CHOIX || [["10", "1.0"], ["20", "2.0"], ["21", "2.1"], ["30", "3.0"], ["40", "4.0"]];
const ESSENCE_BOUTONS = ["S", "D"];
function rendrePucesChoixEssence() {
  const ch = F("choix").value.trim(), es = F("essence").value.trim().toUpperCase();
  $("#f-choix-puces").innerHTML = CHOIX_BOUTONS.map(([val, lib]) =>
    `<button type="button" class="puce" data-choix="${esc(val)}" aria-pressed="${val === ch}">${esc(lib)}</button>`).join("");
  $("#f-essence-puces").innerHTML = ESSENCE_BOUTONS.map(x =>
    `<button type="button" class="puce" data-essence="${esc(x)}" aria-pressed="${x === es}">${esc(x)}</button>`).join("");
}
$("#f-choix-puces").addEventListener("click", e => {
  const b = e.target.closest("[data-choix]"); if (!b) return;
  F("choix").value = F("choix").value.trim() === b.dataset.choix ? "" : b.dataset.choix;
  rendrePucesChoixEssence(); majLive();
});
$("#f-essence-puces").addEventListener("click", e => {
  const b = e.target.closest("[data-essence]"); if (!b) return;
  F("essence").value = F("essence").value.trim().toUpperCase() === b.dataset.essence ? "" : b.dataset.essence;
  rendrePucesChoixEssence(); majLive();
});

function ajouterLigneSup(p = "", l = "", focus = false) {
  const d = document.createElement("div"); d.className = "ligne-2 ligne-supp";
  d.innerHTML = `<label class="champ"><span>Pièces</span><input class="sup-pieces" inputmode="numeric" placeholder="20"></label>
    <label class="champ"><span>Longueur (m)</span><input class="sup-longueur" inputmode="decimal" placeholder="4,50"></label>
    <button type="button" class="retirer-ligne" aria-label="Retirer cette longueur">×</button>`;
  d.querySelector(".sup-pieces").value = p; d.querySelector(".sup-longueur").value = l;
  $("#f-autres").appendChild(d);
  if (focus) d.querySelector(".sup-pieces").focus();
}
const lireAutres = () => $$("#f-autres .ligne-supp").map(d => {
  const p = num(d.querySelector(".sup-pieces").value);
  return { pieces: p == null ? null : Math.round(p), longueur: num(d.querySelector(".sup-longueur").value) };
}).filter(l => l.pieces || l.longueur);
$("#btn-ajout-longueur").addEventListener("click", () => ajouterLigneSup("", "", true));
$("#f-autres").addEventListener("click", e => { const b = e.target.closest(".retirer-ligne"); if (b) { b.closest(".ligne-supp").remove(); majLive(); } });

function remplirForm(c) {
  $("#f-autres").innerHTML = "";
  (c.autres || []).forEach(l => ajouterLigneSup(l.pieces ?? "", l.longueur != null ? nf(l.longueur, 2) : ""));
  F("commande").value = c.commande || "";
  F("lieu").value = c.lieu || "";
  F("epaisseur").value = c.epaisseur ?? "";
  F("largeur").value = c.largeur ?? "";
  F("longueur").value = c.longueur != null ? nf(c.longueur, 2) : "";
  F("pieces").value = c.pieces ?? "";
  F("essence").value = c.essence ?? "";
  F("choix").value = c.choix ?? "";
  F("nature").value = c.nature ?? "";
  const opts = c.options || [];
  optionsChoisies = new Set(opts.filter(o => o in OPTIONS));
  F("options-libres").value = opts.filter(o => !(o in OPTIONS)).join(" ");
  F("ref").value = c.ref_client || "";
  F("observation").value = c.observation || "";
  F("numero").value = c.numero || "";
  rendrePuces(); rendrePucesChoixEssence(); majLive();
}

function formVierge() {
  // au calepin on ne note que section, longueur et pièces : commande, lieu et options se complètent au PC
  remplirForm({ commande: "", lieu: "", ref_client: "", essence: "", choix: DEF.choix, nature: DEF.nature, options: [] });
}

function lireForm() {
  const libres = F("options-libres").value.toUpperCase().split(/[\s,;]+/).filter(Boolean);
  const p = num(F("pieces").value);
  return {
    commande: (v => (/^stock$/i.test(v) ? STOCK : v))(F("commande").value.trim()),
    lieu: F("lieu").value.trim().toUpperCase(),
    epaisseur: num(F("epaisseur").value),
    largeur: num(F("largeur").value),
    longueur: num(F("longueur").value),
    pieces: p == null ? null : Math.round(p),
    autres: lireAutres(),
    essence: F("essence").value.trim().toUpperCase(),
    choix: F("choix").value.trim(),
    nature: F("nature").value.trim().toUpperCase(),
    options: [...new Set([...optionsChoisies, ...libres])],
    ref_client: F("ref").value.trim(),
    observation: F("observation").value.trim(),
    numero: formatNumero(F("numero").value) || null
  };
}

let avertiLongueur = "";
function valider(v) {
  const manque = [];
  if (!v.epaisseur) manque.push("l'épaisseur");
  if (!v.largeur) manque.push("la largeur");
  if (!v.longueur) manque.push("la longueur");
  if (!v.pieces) manque.push("le nombre de pièces");
  if (manque.length) return "Il manque " + manque.join(", ").replace(/, ([^,]*)$/, " et $1") + ".";
  if (v.longueur > 13 && avertiLongueur !== v.longueur + "|" + v.pieces) {
    avertiLongueur = v.longueur + "|" + v.pieces;
    return `Longueur de ${nf(v.longueur, 2)} m : tu as peut-être inversé pièces et longueur. Corrige, ou appuie encore pour confirmer.`;
  }
  if (v.autres.some(l => !l.pieces || !l.longueur)) return "Complète ou retire la ligne « autre longueur » (il faut les pièces et la longueur).";
  const d = doublon(v.numero, editionId);
  if (d) return `Le n° ${v.numero} est déjà utilisé (commande ${d.commande || "–"}, ${section(d)}).`;
  return null;
}

function majLive() {
  const v = lireForm(), vol = volume(v);
  $("#volume-live").innerHTML = vol ? `Volume : <b>${nf(vol, 3)} m³</b>` : "Volume : –";
  const r = [v.essence && "essence " + v.essence, v.choix && "choix " + v.choix, v.nature && "nature " + v.nature].filter(Boolean);
  $("#resume-details").textContent = r.join(", ");
  const d = doublon(v.numero, editionId), al = $("#alerte-numero");
  if (d) {
    al.innerHTML = `Ce n° existe déjà : ${esc(section(d))}, commande ${esc(d.commande || "–")}. <button type="button" class="lien" data-ouvrir="${d.id}">Voir le colis</button>`;
    al.hidden = false;
  } else al.hidden = true;
  $("#form-erreur").hidden = true;
}
$("#form-colis").addEventListener("input", e => { majLive(); if (e.target.id === "f-choix" || e.target.id === "f-essence") rendrePucesChoixEssence(); });
$("#alerte-numero").addEventListener("click", e => { const b = e.target.closest("[data-ouvrir]"); if (b) ouvrirFiche(b.dataset.ouvrir); });

function sauverForm() {
  const v = lireForm(), err = valider(v);
  if (err) { const e = $("#form-erreur"); e.textContent = err; e.hidden = false; e.scrollIntoView({ block: "center", behavior: "smooth" }); return null; }
  let c;
  if (editionId) {
    c = { ...parId(editionId), ...v };
    if (c.numero && c.statut === "a_etiqueter") { c.statut = "a_sortir"; c.etiquete_le = maintenant(); }
    if (!c.numero && c.statut === "a_sortir") { c.statut = "a_etiqueter"; c.etiquete_le = null; }
  } else {
    c = { id: nouvelId(), ...v, statut: v.numero ? "a_sortir" : "a_etiqueter", cree_le: maintenant(),
      etiquete_le: v.numero ? maintenant() : null, supprime: false };
  }
  enregistrer(c);
  return c;
}

function apresSauvegarde() {
  if (editionId) { finEdition(); return; }
  // le colis suivant repart de zéro : section, pièces, longueur, options
  ["epaisseur", "largeur", "longueur", "pieces", "numero", "observation"].forEach(k => (F(k).value = ""));
  $("#f-autres").innerHTML = "";
  optionsChoisies = new Set(); rendrePuces();
  majLive(); window.scrollTo({ top: 0, behavior: "smooth" });
  if (matchMedia("(pointer: fine)").matches) F("epaisseur").focus();
}

$("#form-colis").addEventListener("submit", e => {
  e.preventDefault();
  const etaitEdition = !!editionId;
  const c = sauverForm(); if (!c) return;
  apresSauvegarde();
  if (etaitEdition) { allerA("colis"); ouvrirFiche(c.id); return; }
  toast(`Dans le calepin : ${section(c)}, ${np(totalPieces(c))} p`, "Annuler", () => supprimerDefinitivement(c.id));
});

function commencerEdition(id) {
  const c = parId(id); if (!c) return;
  editionId = id; remplirForm(c);
  $("#edition-ref").textContent = c.numero ? "n° " + c.numero : section(c);
  $("#bandeau-edition").hidden = false;
  $("#btn-generer").textContent = "Enregistrer les modifications";
  $("#carte-numero").hidden = false; $("#carte-commande").hidden = false; $("#bloc-plus").hidden = false;
  cacher("#fiche"); allerA("nouveau");
}
function finEdition() {
  editionId = null;
  $("#bandeau-edition").hidden = true;
  $("#btn-generer").textContent = "Ajouter au calepin";
  $("#carte-numero").hidden = true; $("#carte-commande").hidden = true; $("#bloc-plus").hidden = true;
  formVierge(); majTitre();
}
$("#btn-annuler-edition").addEventListener("click", () => { finEdition(); allerA("colis"); });

/* ═════════════ Liste, recherche, filtres ═════════════ */
let filtre = "a_etiqueter", filtreDate = "";
function ouvrirListe(f, date = "") { filtre = f; filtreDate = date; $("#recherche").value = ""; allerA("colis"); }
const normaliser = s => String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/(\d)\s*[x×*]\s*(\d)/g, "$1x$2").trim();
function cle(c) {
  return normaliser([c.numero, (c.numero || "").replace(/\D/g, ""), c.commande, c.lieu, `${c.epaisseur}x${c.largeur}`, lotsDe(c).map(l => `${longueurCourte(l.longueur)} ${nf(l.longueur, 2)} ${l.pieces}`).join(" "), totalPieces(c), c.ref_client, c.observation, (c.options || []).join(" "),
    dh(c.cree_le), dh(c.etiquete_le), STATUTS[c.statut]].join(" | "));
}

const ouverts = new Set(); // cartes dépliées (elles le restent quand la liste se redessine)
const dcourt = iso => { if (!iso) return ""; const d = new Date(iso), p = n => String(n).padStart(2, "0"); return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`; };
function detailHtml(c) {
  const attente = c.statut === "a_etiqueter";
  const info = (lab, val, large) => val ? `<div class="info${large ? " large" : ""}"><span>${lab}</span><b>${esc(val)}</b></div>` : "";
  const btn = (act, txt, cl = "") => `<button type="button" class="mini-btn${cl ? " " + cl : ""}" data-action="${act}">${txt}</button>`;
  const cde = c.commande === STOCK ? info("Type", "Stock") : info("Commande", c.commande || (attente ? "" : "–"));
  return `<div class="detail">
    <div class="grille-infos">
      ${cde}${info("Lieu", c.lieu || (attente ? "" : "–"))}${info("Essence", c.essence)}${info("Choix", c.choix)}${info("Nature", c.nature)}${info("Options", (c.options || []).join(" "))}
      ${info("Référence client", c.ref_client, true)}${info("Observation", c.observation, true)}
    </div>
    <ul class="chrono">
      <li><span>Saisi</span><span>${dateLongue(c.cree_le)}</span></li>
      <li class="${c.etiquete_le ? "" : "futur"}"><span>Pointé</span><span>${c.etiquete_le ? dateLongue(c.etiquete_le) : "pas encore"}</span></li>
    </ul>
    <div class="detail-actions">
      ${attente ? btn("pointer", "Pointer", "mini-principal") : btn("pc", "À taper sur le PC") + btn("imprimer", "Copie de l'étiquette")}
      ${btn("modifier", "Modifier")}${btn("dupliquer", "Dupliquer")}${btn("supprimer", "Supprimer", "mini-danger")}
    </div>
  </div>`;
}
function ligne(c) {
  const vol = volume(c), attente = c.statut === "a_etiqueter";
  const meta = attente ? "À pointer au PC" : `${esc(cdeTxt(c))}${c.lieu ? " · " + esc(c.lieu) : ""}`;
  return `<div class="swipe" data-id="${c.id}" data-statut="${c.statut}"><div class="swipe-fond" aria-hidden="true"><span class="sw-pointer">✅ Pointer</span><span class="sw-suppr">Supprimer 🗑</span></div>
  <article class="colis st-${c.statut}${ouverts.has(c.id) ? " ouvert" : ""}" data-id="${c.id}" tabindex="0">
    <div class="colis-haut">
      ${c.numero ? `<span class="num">${esc(c.numero)}</span>` : `<span class="num vide">En attente du n°</span>`}
      <span class="colis-droite"><span class="statut ${c.statut}">${STATUT_COURT[c.statut]}</span>${attente ? `<button type="button" class="action-rapide" data-action="pointer">Pointer</button>` : ""}<i class="caret"></i></span>
    </div>
    <div class="colis-ligne"><span><b>${esc(section(c))}</b> &nbsp;${esc(resumeLots(c))}</span>${vol ? `<span class="vol">${nf(vol, 3)} m³</span>` : ""}</div>
    <div class="colis-meta"><span>${meta}</span><span>${attente ? "noté " + dcourt(c.cree_le) : "pointé " + dcourt(c.etiquete_le || c.cree_le)}</span></div>
    ${detailHtml(c)}
  </article></div>`;
}
function totaux(arr) {
  const p = arr.reduce((s, c) => s + totalPieces(c), 0);
  const v = arr.reduce((s, c) => s + (volume(c) || 0), 0);
  const as = arr.filter(c => c.statut === "a_sortir").length;
  const ae = arr.filter(c => c.statut === "a_etiqueter").length;
  const st = [ae && `${ae} en attente`, as && `${as} pointé${as > 1 ? "s" : ""}`].filter(Boolean).join(", ");
  return `${arr.length} colis, ${np(p)} pièces, ${nf(v, 3)} m³${st ? " — " + st : ""}`;
}

function rendreListe() {
  const tous = actifs();
  $$("#filtres [data-filtre]").forEach(b => {
    b.classList.toggle("actif", b.dataset.filtre === filtre);
    const n = b.querySelector("b"); if (n) { const k = tous.filter(c => c.statut === b.dataset.filtre).length; n.textContent = k || ""; }
  });
  const aEtiq = tous.filter(c => c.statut === "a_etiqueter");
  const bpc = $("#btn-file-pc");
  bpc.hidden = !aEtiq.length;
  $("#btn-photo").hidden = !aEtiq.length || filtre !== "a_etiqueter"; // dans « Pointés » : le bouton devient « Retrouver une étiquette »
  $("#btn-retrouver").hidden = filtre !== "a_sortir";
  bpc.textContent = `Pointer au PC : ${aEtiq.length} en attente`;

  const q = normaliser($("#recherche").value);
  const mots = q.split(/\s+/).filter(Boolean);
  let res0 = [];
  let res = tous.filter(c =>
    (mots.length || filtre === "tous" || c.statut === filtre) &&
    (!filtreDate || [c.cree_le, c.etiquete_le].some(x => x && jour(x) === filtreDate)) &&
    (!mots.length || (k => mots.every(m => k.includes(m)))(cle(c))));
  res.sort((a, b) => t(b.etiquete_le || b.cree_le) - t(a.etiquete_le || a.cree_le)); // derniers pointés (ou notés) en haut
  res0 = res;
  const ib = $("#info-filtre"), titreFiltre = filtreDate ? (filtreDate === jour(maintenant()) ? "Pointés aujourd'hui" : "Le " + filtreDate) : filtre === "tous" ? "Tous les colis" : "";
  ib.hidden = !titreFiltre;
  if (titreFiltre) ib.innerHTML = `<span><b>${esc(titreFiltre)}</b> · ${totaux(res0)}</span><button type="button" data-fin-filtre aria-label="Fermer">✕</button>`;

  const el = $("#liste");
  if (!res.length) {
    el.innerHTML = tous.length && filtre === "a_etiqueter" && !mots.length && !filtreDate
      ? `<div class="vide-liste">Rien en attente de pointage ✅<br><button type="button" class="btn btn-secondaire" data-voir="tous">Voir les colis pointés</button></div>`
      : tous.length
      ? `<div class="vide-liste">${mots.length ? "Aucun colis ne correspond à ta recherche." : "Aucun colis dans cette liste."}</div>`
      : `<div class="vide-liste">Aucun colis pour l'instant.<br><button type="button" class="btn btn-principal" data-aller="nouveau">Saisir un colis</button></div>`;
    return;
  }

  const brut = $("#recherche").value.trim();
  const bd = brut.replace(/\D/g, ""), exact = bd.length >= 7 ? res.filter(c => c.numero && c.numero.replace(/\D/g, "") === bd) : [];
  const cde = res.filter(c => c.commande && c.commande.toLowerCase() === brut.toLowerCase());
  let html = "";
  if (exact.length) {
    html += exact.map(ligne).join("");
    res = res.filter(c => !exact.includes(c));
    if (res.length) html += `<div class="groupe"><h3>Autres résultats</h3></div>`;
  } else if (cde.length) {
    html += `<div class="groupe"><h3>${cde[0].commande === STOCK ? "Stock" : "Commande " + esc(brut) + (cde[0].lieu ? ", lieu " + esc(cde[0].lieu) : "")}</h3><span>${totaux(cde)}</span></div>`;
    html += cde.map(ligne).join("");
    res = res.filter(c => !cde.includes(c));
    if (res.length) html += `<div class="groupe"><h3>Autres résultats</h3></div>`;
  }
  html += res.map(ligne).join("");
  el.innerHTML = res0.length ? `<p class="note-stats indice-glisse">Glisse un colis vers la droite pour le pointer, vers la gauche pour le supprimer.</p>` + html : html;
}

$("#recherche").addEventListener("input", rendreListe);
$("#info-filtre").addEventListener("click", e => { if (e.target.closest("[data-fin-filtre]")) { filtre = "a_etiqueter"; filtreDate = ""; rendreListe(); } });
$("#filtres").addEventListener("click", e => {
  const b = e.target.closest("[data-filtre]"); if (!b) return;
  filtre = b.dataset.filtre; filtreDate = ""; rendreListe();
});
$("#btn-file-pc").addEventListener("click", () => ouvrirPC(filePCTous()));
let ignorerClic = 0;
function supprimerColis(id) {
  const c = supprimerDefinitivement(id); if (!c) return;
  toast(`Colis ${c.numero || section(c)} supprimé`, "Annuler", () => restaurerColis(c));
}
// Glisser une carte : à droite = pointer (colis en attente), à gauche = supprimer
function brancherGlisse(zone) {
  let d = null;
  zone.addEventListener("pointerdown", e => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (e.target.closest("button, a, input")) return;
    const sw = e.target.closest(".swipe"); if (!sw) return;
    d = { sw, carte: sw.querySelector(".colis"), x0: e.clientX, y0: e.clientY, dx: 0, actif: false, id: sw.dataset.id, pointe: sw.dataset.statut !== "a_etiqueter", pid: e.pointerId };
  });
  zone.addEventListener("pointermove", e => {
    if (!d || e.pointerId !== d.pid) return;
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0;
    if (!d.actif) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      if (Math.abs(dy) > Math.abs(dx) * 0.7) { d = null; return; } // plutôt vertical : c'est un défilement
      d.actif = true; d.sw.classList.add("glisse");
      try { d.carte.setPointerCapture(e.pointerId); } catch {}
    }
    let x = d.pointe && dx > 0 ? 0 : dx;   // un colis déjà pointé ne se glisse pas vers la droite
    x = Math.max(-170, Math.min(170, x));
    d.dx = x; d.carte.style.transform = `translateX(${x}px)`;
    d.sw.classList.toggle("droite", x > 0); d.sw.classList.toggle("gauche", x < 0);
  });
  const fin = e => {
    if (!d || e.pointerId !== d.pid) return;
    const { sw, carte, dx, actif, id } = d; d = null;
    if (!actif) return;
    ignorerClic = Date.now() + 400;
    sw.classList.remove("glisse");
    if (e.type === "pointerup" && dx > 110) { carte.style.transform = ""; setTimeout(() => sw.classList.remove("droite"), 220); ouvrirPCsur(id); }
    else if (e.type === "pointerup" && dx < -110) { carte.style.transform = "translateX(-110%)"; setTimeout(() => supprimerColis(id), 200); }
    else { carte.style.transform = ""; setTimeout(() => sw.classList.remove("droite", "gauche"), 220); }
  };
  zone.addEventListener("pointerup", fin);
  zone.addEventListener("pointercancel", fin);
}
["#liste", "#calepin-liste"].forEach(sel => brancherGlisse($(sel)));
["#liste", "#calepin-liste"].forEach(sel => $(sel).addEventListener("click", e => {
  if (Date.now() < ignorerClic) return;
  const aller = e.target.closest("[data-aller]"); if (aller) { allerA(aller.dataset.aller); return; }
  if (e.target.closest("[data-voir]")) { filtre = "a_sortir"; rendreListe(); return; }
  const art = e.target.closest(".colis"); if (!art) return;
  const act = e.target.closest("[data-action]");
  if (act) { actionColis(act.dataset.action, art.dataset.id); return; } // boutons du détail et « Pointer »
  if (e.target.closest(".detail")) return;                              // toucher le détail ne le replie pas
  art.classList.toggle("ouvert") ? ouverts.add(art.dataset.id) : ouverts.delete(art.dataset.id);
}));
["#liste", "#calepin-liste"].forEach(sel => $(sel).addEventListener("keydown", e => {
  if (e.key !== "Enter" || !e.target.classList.contains("colis")) return;
  e.target.classList.toggle("ouvert") ? ouverts.add(e.target.dataset.id) : ouverts.delete(e.target.dataset.id);
}));
$("#btn-pointer").addEventListener("click", () => ouvrirPC(filePCTous()));
function rendreCalepin() {
  const ids = filePCTous(), arr = ids.map(parId).reverse();
  $("#btn-pointer").hidden = !ids.length;
  $("#btn-pointer").textContent = `Pointer au PC : ${ids.length} en attente`;
  $("#calepin").hidden = !ids.length;
  $("#calepin-total").textContent = ids.length ? `${ids.length} colis, ${np(arr.reduce((s, c) => s + totalPieces(c), 0))} pièces` : "";
  $("#calepin-liste").innerHTML = arr.map(ligne).join("");
}

/* ═════════════ Statuts ═════════════ */
function assignerNumero(id, val) {
  val = formatNumero(val);
  if (!val) return "Tape le n° imprimé sur l'étiquette.";
  const d = doublon(val, id);
  if (d) return `Le n° ${val} est déjà utilisé (commande ${d.commande || "–"}, ${section(d)}).`;
  const c = { ...parId(id), numero: val };
  if (c.statut === "a_etiqueter") { c.statut = "a_sortir"; c.etiquete_le = maintenant(); }
  enregistrer(c);
  return null;
}

/* ═════════════ Fiche colis ═════════════ */
function ouvrirFiche(id) {
  const c = parId(id); if (!c) return;
  ficheId = id; rendreFiche(); montrer("#fiche");
}
function rendreFiche() {
  const c = parId(ficheId); if (!c) return;
  const vol = volume(c);
  $("#fiche-titre").textContent = c.numero ? "N° " + c.numero : "Colis sans n°";
  const info = (lab, val, large) => val ? `<div class="info${large ? " large" : ""}"><span>${lab}</span><b>${esc(val)}</b></div>` : "";
  let actions = "";
  if (c.statut === "a_etiqueter") actions = `
    <div class="saisie-numero">
      <label class="champ"><span>N° d'étiquette imprimé par le PC</span><input id="fiche-numero" inputmode="numeric" class="gros-chiffre" placeholder="203458"></label>
      <button type="button" class="btn btn-principal" data-f="numero" style="margin-top:28px">Pointer</button>
    </div><p class="alerte" id="fiche-alerte" hidden></p>`;


  $("#fiche-corps").innerHTML = `
    <span class="statut ${c.statut}">${STATUTS[c.statut]}</span>
    <p class="fiche-section" style="margin-top:8px">${esc(section(c))}</p>
    <p class="fiche-sous">${esc(phraseLots(c))}${vol ? `, ${nf(vol, 3)} m³` : ""}</p>
    <div class="grille-infos">
      ${info(c.commande === STOCK ? "Type" : "Commande", c.commande === STOCK ? "Stock" : (c.commande || "–"))}${info("Lieu de stock", c.lieu || "–")}
      ${info("Essence", c.essence)}${info("Choix", c.choix)}${info("Nature", c.nature)}
      ${info("Options", (c.options || []).join(" "))}
      ${info("Référence client", c.ref_client, true)}${info("Observation", c.observation, true)}
    </div>
    <ul class="chrono">
      <li><span>Saisi</span><span>${dateLongue(c.cree_le)}</span></li>
      <li class="${c.etiquete_le ? "" : "futur"}"><span>Pointé</span><span>${c.etiquete_le ? dateLongue(c.etiquete_le) : "pas encore"}</span></li>
    </ul>
    <div class="actions">
      ${actions}
      <div class="boutons-2">
        <button type="button" class="btn btn-secondaire" data-f="pc">À taper sur le PC</button>
        <button type="button" class="btn btn-secondaire" data-f="imprimer">Copie de l'étiquette</button>
        <button type="button" class="btn btn-secondaire" data-f="modifier">Modifier</button>
        <button type="button" class="btn btn-secondaire" data-f="dupliquer">Dupliquer</button>
      </div>
      <button type="button" class="btn btn-discret" data-f="supprimer">Supprimer ce colis</button>
    </div>`;
  const inp = $("#fiche-numero");
  if (inp) inp.addEventListener("keydown", e => { if (e.key === "Enter") validerNumeroFiche(); });
}
function validerNumeroFiche() {
  const err = assignerNumero(ficheId, $("#fiche-numero").value);
  if (err) { const a = $("#fiche-alerte"); a.textContent = err; a.hidden = false; return; }
  toast("N° d'étiquette enregistré");
}
function actionColis(action, id) {
  const c = parId(id); if (!c) return;
  switch (action) {
    case "pointer": ouvrirPCsur(id); break;
    case "pc": ouvrirPC([id]); break;
    case "imprimer": imprimer(id); break;
    case "modifier": commencerEdition(id); break;
    case "dupliquer":
      finEdition(); remplirForm({ ...c, numero: "", observation: "" });
      cacher("#fiche"); allerA("nouveau"); toast("Copie prête : vérifie puis enregistre"); break;
    case "supprimer": {
      if (!confirm(`Supprimer définitivement le colis ${c.numero || section(c)} ? Il sera aussi effacé en ligne.`)) return;
      const eff = supprimerDefinitivement(id); cacher("#fiche"); toast("Colis supprimé", "Annuler", () => restaurerColis(eff)); break;
    }
  }
}
$("#fiche-corps").addEventListener("click", e => {
  const b = e.target.closest("[data-f]"); if (!b) return;
  if (b.dataset.f === "numero") validerNumeroFiche(); else actionColis(b.dataset.f, ficheId);
});

/* ═════════════ Pointage au PC : commande, lieu, options, n° ═════════════ */
let filePC = [], posPC = 0, pcOptions = new Set(), pcType = "cde";
const lectures = {}; // ce que la photo de l'étiquette a lu, par colis
const filePCTous = () => actifs().filter(c => c.statut === "a_etiqueter").sort((a, b) => t(a.cree_le) - t(b.cree_le)).map(c => c.id);
const PC = id => $("#pc-" + id);
function ouvrirPCsur(id) { // écran de pointage, positionné sur ce colis
  const ids = filePCTous(); filePC = ids; posPC = Math.max(0, ids.indexOf(id)); rendrePC(); montrer("#pc");
}
function rendreAccueil() {
  const n = filePCTous().length, auj = jour(maintenant());
  $("#acc-attente").textContent = np(n);
  $("#acc-auj").textContent = np(actifs().filter(c => c.etiquete_le && jour(c.etiquete_le) === auj).length);
  const b = $("#acc-pointer"); b.hidden = !n; $("#acc-pointer-t").textContent = "Pointer"; $("#acc-pointer-s").textContent = `${n} en attente`;
  const tous = actifs(), pointes = tous.filter(c => c.statut === "a_sortir");
  $("#acc-pointes").textContent = np(pointes.length);
  $("#acc-vol").textContent = nf(pointes.filter(c => c.etiquete_le && jour(c.etiquete_le) === auj).reduce((s, c) => s + (volume(c) || 0), 0), 1);
  $("#acc-colis-s").textContent = `${np(tous.length)} colis en tout`;
  let msg = "";
  if (!configure) msg = ""; // Supabase viendra plus tard : on n'affiche rien tant qu'il n'est pas relié
  else if (!session) msg = "Connecte-toi pour sauvegarder tes colis en ligne.";
  else if (derniereErreur) msg = "⚠️ Sauvegarde en ligne impossible : " + derniereErreur;
  const al = $("#acc-alerte"); al.hidden = !msg; al.textContent = msg;
}
$("#acc-alerte").addEventListener("click", () => { allerA("reglages"); $("#pli-supabase").open = true; });
$("#acc-plus").addEventListener("click", () => allerA("nouveau"));
$("#acc-pointer").addEventListener("click", () => ouvrirPC(filePCTous()));
$("#acc-photo").addEventListener("click", () => ouvrirPhoto("retrouver"));
$("#acc-colis").addEventListener("click", () => ouvrirListe("tous"));
$$("[data-ouvre]").forEach(b => b.addEventListener("click", () => {
  const k = b.dataset.ouvre;
  if (k === "attente") { // « En attente de pointage » → directement l'écran de pointage
    const ids = filePCTous();
    if (ids.length) ouvrirPC(ids); else { ouvrirListe("a_etiqueter"); toast("Rien en attente de pointage ✅"); }
  } else if (k === "pointes") ouvrirListe("a_sortir");
  else if (k === "auj") ouvrirListe("a_sortir", jour(maintenant()));
  else if (k === "m3") { // « m³ du jour » → les stats, section « Par jour », en m³ et pour aujourd'hui
    periode = "1"; statSerie = "pointes"; statMetrique = "v"; statsOuverts.add("jour");
    allerA("stats");
    const d = $('[data-pli="jour"]'); if (d) d.scrollIntoView({ block: "start" });
  }
}));
function ouvrirPC(ids) { filePC = ids; posPC = 0; rendrePC(); montrer("#pc"); }

function rendrePC() {
  prechauffer();
  const c = parId(filePC[posPC]); if (!c) { cacher("#pc"); return; }
  const lec = lectures[c.id];
  pcOptions = new Set(c.options || []);
  const brut = c.commande || "", lieu = c.lieu || (lec && lec.lieu) || "", ref = c.ref_client || "";
  pcType = brut === STOCK ? "stock" : "cde";
  const commande = brut === STOCK ? "" : brut;
  const essenceVal = c.essence || (lec && lec.essence) || "";
  const essencesHtml = essencesConnues().map(x => `<button type="button" class="puce" data-ess="${esc(x)}" aria-pressed="${x === essenceVal.toUpperCase()}">${esc(x)}</button>`).join("");
  const plusieurs = filePC.length > 1;
  const cell = (lab, id, cls = "") => `<div class="${cls}"><span>${lab}</span><b id="t-${id}" class="vide">—</b></div>`;
  $("#pc-corps").innerHTML = `
    ${plusieurs ? `<div class="file-pc"><span>Colis ${posPC + 1} sur ${filePC.length}</span>
      <span><button type="button" class="lien" data-p="prec" ${posPC ? "" : "hidden"}>Précédent</button>
      <button type="button" class="lien" data-p="suiv" ${posPC < filePC.length - 1 ? "" : "hidden"}>Passer</button></span></div>` : ""}
    <button type="button" class="btn btn-principal btn-photo btn-photo-haut" data-p="photo">📷 Photo de l'étiquette</button>
    ${bandeauLecture(lec, c)}
    <div class="pc-titre">
      <div>
        <p class="fiche-section" style="font-size:34px">${esc(section(c))}</p>
        <p class="fiche-sous">${esc(phraseLots(c))}</p>
      </div>
      <button type="button" class="btn btn-principal btn-pointer-haut" data-p="valider">${c.numero ? "Enregistrer" : "Pointer"}</button>
    </div>
    <div class="carte carte-or">
      <div class="segment" id="pc-type">
        <button type="button" data-type="cde" aria-pressed="true">Commande</button>
        <button type="button" data-type="stock" aria-pressed="false">Stock</button>
      </div>
      <div class="ligne-2" id="pc-ligne">
        <label class="champ" id="pc-champ-commande"><span>N° commande</span><input id="pc-commande" inputmode="numeric" placeholder="34114" value="${esc(commande)}"></label>
        <label class="champ"><span id="pc-lieu-lab">Lieu de stock</span><input id="pc-lieu" class="majuscules" inputmode="none" placeholder="G7" autocapitalize="characters" value="${esc(lieu)}"></label>
      </div>
      <label class="champ"><span>Essence</span><input id="pc-essence" class="majuscules" autocapitalize="characters" placeholder="S" value="${esc(essenceVal)}"></label>
      ${essencesHtml ? `<div class="puces" id="pc-essences">${essencesHtml}</div>` : ""}
      <span class="etiquette-champ">Options</span>
      <div class="puces" id="pc-options">${Object.entries(OPTIONS).map(([k, lib]) =>
        `<button type="button" class="puce" data-popt="${esc(k)}" aria-pressed="${pcOptions.has(k)}">${esc(k)} <small>${esc(lib)}</small></button>`).join("")}</div>
      <details class="details">
        <summary><span>Plus de détails</span></summary>
        <div class="ligne-2">
          <label class="champ"><span>Choix</span><input id="pc-choix" inputmode="numeric" value="${esc(c.choix || (lec && lec.choix) || DEF.choix)}"></label>
          <label class="champ"><span>Nature</span><input id="pc-nature" class="majuscules" autocapitalize="characters" value="${esc(c.nature || DEF.nature)}"></label>
        </div>
        <label class="champ"><span>Référence client <i>facultatif</i></span><input id="pc-ref" value="${esc(ref)}"></label>
      </details>
    </div>
    <div class="terminal">
      ${cell("Épaisseur", "epaisseur")}${cell("Largeur", "largeur")}
      ${cell("Nb pièces/charge", "pieces")}${cell("Longueur", "longueur")}
      ${cell("Essence", "essence")}${cell("Choix", "choix")}
      ${cell("Nature", "nature")}${cell("Lieu de stock", "lieu")}
      ${cell("Options", "options", "plein")}${cell("Référence client", "ref", "plein")}
    </div>
    <div class="saisie-numero">
      <label class="champ"><span>N° imprimé par le PC</span><input id="pc-numero" inputmode="numeric" class="gros-chiffre" placeholder="200-000-1" enterkeyhint="done" value="${esc(c.numero || (lec && lec.numero) || "")}"></label>
      <button type="button" class="btn btn-principal" data-p="valider" style="margin-top:28px">${c.numero ? "Enregistrer" : "Pointer"}</button>
    </div>
    <p class="alerte" id="pc-alerte" hidden></p>
    <div class="actions" style="margin-top:6px">
      <button type="button" class="btn btn-principal btn-photo" data-p="photo">📷 Photo de l'étiquette</button>
      <button type="button" class="btn btn-secondaire" data-p="modifier">✏️ Corriger la note (section, pièces, longueur)</button>
      <button type="button" class="btn btn-secondaire" data-p="imprimer">Copie de l'étiquette (imprimer)</button>
    </div>`;
  appliquerTypePC(); majTerminal();
  if (matchMedia("(pointer: fine)").matches) PC(pcType === "stock" ? (lieu ? "numero" : "lieu") : (commande && lieu ? "numero" : commande ? "lieu" : "commande")).focus();
}
function essencesConnues() {
  const n = {};
  actifs().forEach(c => { if (c.essence) n[c.essence] = (n[c.essence] || 0) + 1; });
  const frequentes = Object.entries(n).sort((x, y) => y[1] - x[1]).map(x => x[0]);
  return [...new Set([...(CFG.ESSENCES || []), ...frequentes])].slice(0, 8);
}
function majChipsEssence() {
  const v = PC("essence").value.trim().toUpperCase();
  $$("#pc-essences [data-ess]").forEach(b => b.setAttribute("aria-pressed", b.dataset.ess === v));
}
function appliquerTypePC() {
  const stock = pcType === "stock";
  $$("#pc-type [data-type]").forEach(b => b.setAttribute("aria-pressed", b.dataset.type === pcType));
  $("#pc-champ-commande").hidden = stock;
  $("#pc-ligne").classList.toggle("une-colonne", stock);
}
function champsPC() {
  return { commande: pcType === "stock" ? STOCK : PC("commande").value.trim(), lieu: PC("lieu").value.trim().toUpperCase(), options: [...pcOptions],
    ref_client: PC("ref").value.trim(), essence: PC("essence").value.trim().toUpperCase(),
    choix: PC("choix").value.trim(), nature: PC("nature").value.trim().toUpperCase() };
}
function majTerminal() {
  const c = parId(filePC[posPC]); if (!c || !PC("commande")) return;
  const ch = champsPC();
  const set = (id, v) => { const el = $("#t-" + id); if (!el) return; const ok = v !== "" && v != null; el.textContent = ok ? v : "—"; el.classList.toggle("vide", !ok); };
  set("epaisseur", c.epaisseur); set("largeur", c.largeur); set("pieces", lotsDe(c).map(l => np(l.pieces)).join(" + ")); set("longueur", lotsDe(c).map(l => longueurCourte(l.longueur)).join(" + "));
  set("essence", ch.essence); set("choix", ch.choix); set("nature", ch.nature); set("lieu", ch.lieu);
  set("options", ch.options.join("  ")); set("ref", ch.ref_client);
}
function sauverChampsPC(extra = {}) {
  const c = { ...parId(filePC[posPC]), ...champsPC(), ...extra };
  enregistrer(c);
  return c;
}
let avertiNumero = "";
function validerNumeroPC() {
  const a = $("#pc-alerte"), erreur = m => { a.textContent = m; a.hidden = false; a.scrollIntoView({ block: "center", behavior: "smooth" }); };
  const ch = champsPC();
  if (pcType === "stock" ? !ch.lieu : (!ch.commande || !ch.lieu)) return erreur(pcType === "stock" ? "Choisis le lieu de stockage." : "Renseigne la commande et le lieu de stock (feuille de commande).");
  if (!ch.essence) return erreur("Choisis l'essence du bois (S, D…).");
  const numero = formatNumero(PC("numero").value);
  if (numero.replace(/\D/g, "").length < 7 && avertiNumero !== numero) {
    avertiNumero = numero;
    return erreur(`N° incomplet : il manque le chiffre après le dernier tiret (ex. ${numero || "203-482"}-1). Complète-le, ou appuie encore pour confirmer.`);
  }
  if (!numero) return erreur("Tape le n° imprimé sur l'étiquette.");
  const id = filePC[posPC], dbl = doublon(numero, id);
  if (dbl) return erreur(`Le n° ${numero} est déjà utilisé (commande ${dbl.commande || "–"}, ${section(dbl)}).`);
  const lec = lectures[id], extra = { numero };
  if (parId(id).statut === "a_etiqueter") { extra.statut = "a_sortir"; extra.etiquete_le = (lec && lec.dateIso) || maintenant(); }
  sauverChampsPC(extra);
  delete lectures[id];
  if (posPC < filePC.length - 1) { posPC++; rendrePC(); toast("Pointé, colis suivant"); }
  else if (filePC.length > 1) { cacher("#pc"); toast("Tous les colis du calepin sont pointés"); }
  else { cacher("#pc"); toast("Colis pointé"); }
}
const garderPC = () => { if (PC("lieu") && (PC("lieu").value.trim() || (pcType !== "stock" && PC("commande").value.trim()))) sauverChampsPC(); };
$("#pc-corps").addEventListener("click", e => {
  const ty = e.target.closest("[data-type]");
  if (ty) { pcType = ty.dataset.type; appliquerTypePC(); majTerminal(); return; }
  const es = e.target.closest("[data-ess]");
  if (es) { PC("essence").value = es.dataset.ess; majChipsEssence(); majTerminal(); return; }
  const o = e.target.closest("[data-popt]");
  if (o) {
    const k = o.dataset.popt; pcOptions.has(k) ? pcOptions.delete(k) : pcOptions.add(k);
    o.setAttribute("aria-pressed", pcOptions.has(k)); majTerminal(); return;
  }
  const b = e.target.closest("[data-p]"); if (!b) return;
  const p = b.dataset.p;
  if (p === "valider") validerNumeroPC();
  if (p === "imprimer") { const c = sauverChampsPC(); imprimer(c.id); }
  if (p === "photo") ouvrirPhoto("pointage", filePC[posPC]);
  if (p === "modifier") { garderPC(); const id = filePC[posPC]; cacher("#pc"); commencerEdition(id); }
  if (p === "prendre") { garderPC(); const id = filePC[posPC], l = lectures[id]; if (l && l.spec) appliquerSpec(id, l.spec); rendrePC(); }
  if (p === "desinverser") { // annuler la correction faite d'après l'étiquette
    garderPC(); const id = filePC[posPC], l = lectures[id];
    if (l && l.avant) { enregistrer({ ...parId(id), ...l.avant }); l.corrige = false; l.avant = null; l.verifs = calculerVerifs(l, parId(id)); }
    rendrePC();
  }
  if (p === "suiv") { garderPC(); posPC++; rendrePC(); }
  if (p === "prec") { garderPC(); posPC--; rendrePC(); }
});
$("#pc-corps").addEventListener("input", e => {
  majTerminal();
  if (e.target.id === "pc-essence") majChipsEssence();
  if (e.target.id === "pc-numero") {
    const d = doublon(e.target.value.replace(/\s/g, ""), filePC[posPC]), al = $("#pc-alerte");
    al.hidden = !d; if (d) al.textContent = `Ce n° existe déjà : ${section(d)}, commande ${d.commande || "–"}.`;
  }
});
$("#pc-corps").addEventListener("keydown", e => { if (e.key === "Enter" && e.target.id === "pc-numero") validerNumeroPC(); });

/* ═════════════ Photo de l'étiquette ═════════════ */
const ESSENCE_INVERSE = Object.fromEntries(Object.entries(CFG.ESSENCE_ETIQUETTE || {}).map(([k, v]) => [v, k]));
let tessPromesse = null;
function chargerTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  return (tessPromesse ||= new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
    s.onload = () => res(window.Tesseract);
    s.onerror = () => { tessPromesse = null; rej(new Error("Moteur de lecture indisponible : connecte-toi à internet la première fois.")); };
    document.head.appendChild(s);
  }));
}
function etatLecture(msg) {
  $("#lecture-etat").hidden = !msg;
  if (msg) $("#lecture-txt").textContent = msg;
}
// ── Préparation de la photo : code-barres sur l'image entière, puis étiquette recadrée, agrandie, en noir et blanc ──
async function ouvrirImage(fichier) {
  try { return await createImageBitmap(fichier, { imageOrientation: "from-image" }); }
  catch { return await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = URL.createObjectURL(fichier); }); }
}
function dessiner(img, L, H, sx = 0, sy = 0, sw, sh) {
  const cv = document.createElement("canvas"); cv.width = L; cv.height = H;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sw ?? (img.width || img.naturalWidth), sh ?? (img.height || img.naturalHeight), 0, 0, L, H);
  return [cv, ctx];
}
function gris(ctx, L, H) {
  const p = ctx.getImageData(0, 0, L, H).data, g = new Uint8Array(L * H);
  for (let i = 0, k = 0; k < g.length; i += 4, k++) g[k] = (p[i] * 299 + p[i + 1] * 587 + p[i + 2] * 114) / 1000;
  return g;
}
function otsu(g) {
  const h = new Float64Array(256); for (const v of g) h[v]++;
  let tot = 0, sum = 0; for (let t = 0; t < 256; t++) { tot += h[t]; sum += t * h[t]; }
  let w0 = 0, m0 = 0, best = 0, seuil = 128;
  for (let t = 0; t < 256; t++) {
    w0 += h[t]; m0 += t * h[t]; if (!w0 || w0 === tot) continue;
    const a = m0 / w0, b = (sum - m0) / (tot - w0), s = w0 * (tot - w0) * (a - b) * (a - b);
    if (s > best) { best = s; seuil = t; }
  }
  return seuil;
}
function zoneEtiquette(img, W, H) { // la plus grande zone blanche et peu colorée = l'étiquette
  const k = 400 / Math.max(W, H), l = Math.round(W * k), h = Math.round(H * k);
  const [, ctx] = dessiner(img, l, h), p = ctx.getImageData(0, 0, l, h).data;
  const score = new Uint8Array(l * h);
  for (let i = 0, j = 0; j < score.length; i += 4, j++) {
    const mn = Math.min(p[i], p[i + 1], p[i + 2]), mx = Math.max(p[i], p[i + 1], p[i + 2]);
    score[j] = Math.max(0, Math.min(255, mn - 2 * (mx - mn)));
  }
  const s = Math.max(otsu(score), 120);
  let m = score.map(v => (v > s ? 1 : 0));
  const filtre = (src, max) => { // fermeture 7×7 : bouche les lettres noires dans le blanc
    const out = new Uint8Array(src.length), tmp = new Uint8Array(src.length), r = 3;
    for (let y = 0; y < h; y++) for (let x = 0; x < l; x++) {
      let v = max ? 0 : 1; for (let d = -r; d <= r; d++) { const xx = x + d; if (xx < 0 || xx >= l) continue; const q = src[y * l + xx]; v = max ? Math.max(v, q) : Math.min(v, q); }
      tmp[y * l + x] = v;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < l; x++) {
      let v = max ? 0 : 1; for (let d = -r; d <= r; d++) { const yy = y + d; if (yy < 0 || yy >= h) continue; const q = tmp[yy * l + x]; v = max ? Math.max(v, q) : Math.min(v, q); }
      out[y * l + x] = v;
    }
    return out;
  };
  m = filtre(filtre(m, true), false);
  const vu = new Uint8Array(l * h), pile = new Int32Array(l * h); let best = null;
  for (let s0 = 0; s0 < m.length; s0++) {
    if (!m[s0] || vu[s0]) continue;
    let n = 0, top = 0, x0 = l, x1 = 0, y0 = h, y1 = 0; pile[top++] = s0; vu[s0] = 1;
    while (top) {
      const q = pile[--top], x = q % l, y = (q / l) | 0; n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const r of [q - 1, q + 1, q - l, q + l]) {
        if (r < 0 || r >= m.length || vu[r] || !m[r] || (r === q - 1 && x === 0) || (r === q + 1 && x === l - 1)) continue;
        vu[r] = 1; pile[top++] = r;
      }
    }
    if (!best || n > best.n) best = { n, x0, y0, x1, y1 };
  }
  if (!best || best.n < l * h * 0.03) return null; // rien de convaincant : on garde la photo entière
  const mx = (best.x1 - best.x0) * 0.02, my = (best.y1 - best.y0) * 0.04;
  const x = Math.max(0, (best.x0 - mx) / k), y = Math.max(0, (best.y0 - my) / k);
  return { x, y, w: Math.min(W, (best.x1 + 1 + mx) / k) - x, h: Math.min(H, (best.y1 + 1 + my) / k) - y };
}
function binaire(g, l, h, fac, rayon) { // noir/blanc « local » : chaque point est comparé à la moyenne de ses voisins
  const W1 = l + 1, ii = new Uint32Array(W1 * (h + 1));
  for (let y = 0; y < h; y++) { let ligne = 0; for (let x = 0; x < l; x++) { ligne += g[y * l + x]; ii[(y + 1) * W1 + x + 1] = ii[y * W1 + x + 1] + ligne; } }
  const out = new Uint8Array(l * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - rayon), y1 = Math.min(h, y + rayon + 1);
    for (let x = 0; x < l; x++) {
      const x0 = Math.max(0, x - rayon), x1 = Math.min(l, x + rayon + 1);
      const moy = (ii[y1 * W1 + x1] - ii[y0 * W1 + x1] - ii[y1 * W1 + x0] + ii[y0 * W1 + x0]) / ((x1 - x0) * (y1 - y0));
      out[y * l + x] = g[y * l + x] > moy * fac ? 255 : 0;
    }
  }
  return out;
}
function versCanvas(vals, l, h) {
  const cv = document.createElement("canvas"); cv.width = l; cv.height = h;
  const ctx = cv.getContext("2d"), id = ctx.createImageData(l, h);
  for (let i = 0, j = 0; i < vals.length; i++, j += 4) { id.data[j] = id.data[j + 1] = id.data[j + 2] = vals[i]; id.data[j + 3] = 255; }
  ctx.putImageData(id, 0, 0); return cv;
}
function etirer(g) { // étire le contraste : le plus sombre devient noir, le plus clair blanc
  const tri = Uint8Array.from(g).sort(), bas = tri[Math.floor(g.length * 0.02)], haut = tri[Math.floor(g.length * 0.98)], e = 255 / Math.max(1, haut - bas);
  for (let i = 0; i < g.length; i++) g[i] = Math.max(0, Math.min(255, (g[i] - bas) * e));
  return g;
}
function versNoirBlanc(img, sx, sy, sw, sh, largeur, facteurs) {
  const k = Math.min(1, largeur / sw), l = Math.round(sw * k), h = Math.round(sh * k);
  const [, ctx] = dessiner(img, l, h, sx, sy, sw, sh), g = etirer(gris(ctx, l, h)), rayon = Math.max(12, Math.round(l * 0.03));
  return facteurs.map(f => versCanvas(binaire(g, l, h, f, rayon), l, h));
}
async function preparerImage(fichier) {
  const img = await ouvrirImage(fichier);
  const W = img.width || img.naturalWidth, H = img.height || img.naturalHeight;
  // 1. code-barres : image entière en haute résolution (lignes de lecture aussi penchées) + sa position
  const kb = Math.min(1, 3000 / Math.max(W, H)), lb = Math.round(W * kb), hb = Math.round(H * kb);
  const [, cb] = dessiner(img, lb, hb);
  const p = Lecture.codeBarresPos(gris(cb, lb, hb), lb, hb, 5000);
  const pos = p ? { ...p, x0: p.x0 / kb, x1: p.x1 / kb, y0: p.y0 / kb, y1: p.y1 / kb } : null;
  // 2. en secours : image entière en noir et blanc local, et étiquette recadrée
  let complet = null;
  const entier = () => (complet ||= versNoirBlanc(img, 0, 0, W, H, 1800, [0.82, 0.9]));
  const z = zoneEtiquette(img, W, H);
  const recadre = () => z ? versNoirBlanc(img, z.x, z.y, z.w, z.h, 2400, [0.85])[0] : null;
  return { img, code: p ? p.code : null, pos, entier, recadre };
}
// Découpe une zone de l'étiquette, redressée d'après le code-barres, et la passe en noir et blanc net
const PX_PAR_CODE = 520; // largeur du code-barres une fois redressé, en pixels
function zoneCalee(img, pos, zone) {
  const bw = pos.x1 - pos.x0, th = pos.deg * Math.PI / 180;
  let e1 = [Math.cos(th), Math.sin(th)], e2 = [-Math.sin(th), Math.cos(th)];
  let O = [pos.x0, (pos.y0 + pos.y1) / 2];
  if (pos.retourne) { O = [pos.x1, O[1] + bw * Math.tan(th)]; e1 = [-e1[0], -e1[1]]; e2 = [-e2[0], -e2[1]]; } // étiquette à l'envers
  const S = PX_PAR_CODE, k = S / bw, l = Math.round((zone.u1 - zone.u0) * S), h = Math.round((zone.v1 - zone.v0) * S);
  const cv = document.createElement("canvas"); cv.width = l; cv.height = h;
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, l, h); ctx.imageSmoothingQuality = "high";
  ctx.setTransform(k * e1[0], k * e2[0], k * e1[1], k * e2[1],
    -k * (O[0] * e1[0] + O[1] * e1[1]) - S * zone.u0, -k * (O[0] * e2[0] + O[1] * e2[1]) - S * zone.v0);
  ctx.drawImage(img, 0, 0);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const g = gris(ctx, l, h), tri = Uint8Array.from(g).sort();
  const bas = tri[Math.floor(g.length * 0.01)], haut = tri[Math.floor(g.length * 0.99)], e = 255 / Math.max(1, haut - bas);
  if (haut - bas < 45) { const v = versCanvas(new Uint8Array((l + 50) * (h + 50)).fill(255), l + 50, h + 50); v.vide = true; return v; } // zone sans contraste = rien d'imprimé
  for (let i = 0; i < g.length; i++) g[i] = Math.max(0, Math.min(255, (g[i] - bas) * e));
  const s = otsu(g), M = 25, out = new Uint8Array((l + 2 * M) * (h + 2 * M)).fill(255);
  let noirs = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < l; x++) { const b = g[y * l + x] > s ? 255 : 0; out[(y + M) * (l + 2 * M) + x + M] = b; if (!b) noirs++; }
  const res = versCanvas(out, l + 2 * M, h + 2 * M);
  if (noirs < l * h * 0.002) res.vide = true;
  return res;
}
let workerOCR = null;
function obtenirWorker() {
  return (workerOCR ||= chargerTesseract().then(T => T.createWorker("eng", 1)).catch(e => { workerOCR = null; throw e; }));
}
function prechauffer() { // dès qu'on ouvre le pointage : le lecteur se télécharge pendant que tu prépares la photo
  if (CFG.PHOTO === false || !navigator.onLine || (navigator.connection && navigator.connection.saveData)) return;
  obtenirWorker().catch(() => {});
}
async function lireTexteEtiquette(prep) { // lit les zones de l'étiquette (repérées grâce au code-barres), sinon la photo entière
    etatLecture("Chargement du lecteur (la première fois, ça peut être long)…");
    const worker = await obtenirWorker();
    let texte = "", optionsLues = null, zones = null;
    if (prep.pos) {
      zones = {};
      let n = 0;
      for (const zone of Lecture.ZONES) {
        etatLecture(`Lecture de l'étiquette… ${Math.round(++n / Lecture.ZONES.length * 100)} %`);
        let lu = null;
        // on garde la première lecture qui a la forme attendue ; sinon on décale un peu la zone (photo en biais)
        essais: for (const dv of [0, 0.07, -0.07]) {
          const cv = zoneCalee(prep.img, prep.pos, { ...zone, v0: zone.v0 + dv, v1: zone.v1 + dv });
          for (const psm of dv ? ["7"] : ["7", "8", "6"]) {
            let t = "";
            if (!cv.vide) {
              await worker.setParameters({ tessedit_pageseg_mode: psm, tessedit_char_whitelist: zone.liste });
              t = (await worker.recognize(cv)).data.text.replace(/\s+/g, " ").trim();
            }
            if (zone.motif.test(t)) { lu = t; break essais; }
            if (lu === null && t) lu = { brut: t };
          }
          if (zone.nom === "options") break; // pas de décalage pour les options (on risquerait de lire le n° ou le lieu)
        }
        zones[zone.nom] = lu && lu.brut !== undefined ? null : lu;
        if (lu && lu.brut !== undefined) texte += "\n" + lu.brut; // lecture imparfaite : gardée pour les déductions
      }
      // Lieu : la partie chiffres est relue avec des chiffres seulement (« G7 » lu « GI », « D11 » lu « DT1 »)
      const lieuLu = (zones.lieu || "").split(" ").pop();
      if (lieuLu && /^[A-Z]/.test(lieuLu) && lieuLu.length >= 2) {
        const cv = zoneCalee(prep.img, prep.pos, { u0: -0.22, u1: 0.36, v0: -0.63, v1: -0.34 });
        if (!cv.vide) {
          await worker.setParameters({ tessedit_pageseg_mode: "8", tessedit_char_whitelist: "0123456789" });
          const chiffres = (await worker.recognize(cv)).data.text.replace(/\D/g, "");
          const n = lieuLu.length - 1;
          if (chiffres.length >= n) zones.lieu = zones.lieu.replace(/\S+$/, lieuLu[0] + chiffres.slice(-n));
        }
      }
      texte = Lecture.texteDepuisZones(zones) + texte;
      const s1 = Lecture.lireSpec(texte);
      if (!(s1 && s1.epaisseur != null)) { // pas confirmé par le volume : on relit chaque zone en la décalant un peu (photo de biais, chiffres coupés)
        const cand = { section: [], pieces: [], longueur: [], volume: [], code: [], lieu: [] };
        for (const k of Object.keys(cand)) if (zones[k]) cand[k].push(zones[k]);
        const ZONES_REPETEES = ["section", "pieces", "longueur", "volume", "code", "lieu"];
        let fus = null, n = 0;
        etatLecture("Lecture plus précise…");
        for (const dv of [-0.045, 0.045, -0.09, 0.09, -0.135, 0.135]) {
          for (const nom of ZONES_REPETEES) {
            const zone = Lecture.ZONES.find(z => z.nom === nom), cv = zoneCalee(prep.img, prep.pos, { ...zone, v0: zone.v0 + dv, v1: zone.v1 + dv });
            if (cv.vide) continue;
            await worker.setParameters({ tessedit_pageseg_mode: "7", tessedit_char_whitelist: zone.liste });
            const t = (await worker.recognize(cv)).data.text.replace(/\s+/g, " ").trim();
            if (zone.motif.test(t) || (nom === "volume" && /\d[,.]\d{3}/.test(t)) || (nom === "pieces" && /^\d{1,4}/.test(t))) cand[nom].push(t);
          }
          etatLecture(`Lecture plus précise… ${Math.round(++n / 6 * 100)} %`);
          fus = Lecture.fusionner(cand);
          if (fus) break; // une combinaison confirmée par le volume : inutile d'insister
        }
        const lieuChoisi = Lecture.majoritaire(cand.lieu.filter(t => Lecture.ZONES.find(z => z.nom === "lieu").motif.test(t)));
        // les valeurs retenues passent en tête du texte : c'est ce que lisent ensuite la vérification et le formulaire
        texte = (fus ? `${fus.epaisseur} x ${fus.largeur}\n${fus.pieces} P\n${nf(fus.longueur, 2)} m\n${nf(fus.volume, 3)} m3\n${fus.pieces}/${Math.round(fus.longueur * 100)}\n` : "") + (lieuChoisi ? lieuChoisi + "\n" : "") + texte;
        if (fus) { zones.section = `${fus.epaisseur} x ${fus.largeur}`; zones.pieces = `${fus.pieces} P`; zones.longueur = nf(fus.longueur, 2); zones.volume = `${nf(fus.volume, 3)} m3`; }
        if (lieuChoisi) zones.lieu = lieuChoisi;
      }
      optionsLues = zones.options !== undefined ? Lecture.optionsDepuisZone(zones.options) : null;
      await worker.setParameters({ tessedit_char_whitelist: "" });
    }
    if (!Lecture.lireSpec(texte)) { // pas de code-barres, ou zones pas assez sûres : lecture de la photo entière
      const motsPasses = [];
      const lire = async (image, psm) => {
        await worker.setParameters({ tessedit_pageseg_mode: psm });
        const d = (await worker.recognize(image)).data; texte += "\n" + d.text;
        return d;
      };
      etatLecture("Lecture de la photo entière…");
      const [a1, a2] = prep.entier();
      motsPasses.push(Lecture.motsDepuis(await lire(a1, "11")), Lecture.motsDepuis(await lire(a2, "6")));
      if (!Lecture.lireSpec(texte)) { const cv = prep.recadre(); if (cv) { await lire(cv, "6"); await lire(cv, "11"); } }
      if (optionsLues === null) optionsLues = Lecture.optionsPresDuNumero(motsPasses);
    }
  return { texte, optionsLues, zones };
}
let photoCible = null; // colis affiché au pointage quand la photo est prise depuis cet écran
let photoMode = "pointage"; // « pointage » : mettre un n° sur un colis en attente ; « retrouver » : chercher un colis déjà pointé
function ouvrirPhoto(mode, cible) { photoMode = mode; photoCible = cible || null; $("#photo-input").click(); }
async function lireEtiquette(fichier, cible) {
  if (!filePCTous().length) { toast("Aucun colis en attente de pointage."); return; }
  try {
    etatLecture("Lecture du code-barres…");
    const prep = await preparerImage(fichier);
    const r = await lireTexteEtiquette(prep);
    etatLecture(null);
    traiterLecture(r.texte, cible, prep.code, r.optionsLues, r.zones);
  } catch (err) {
    etatLecture(null);
    toast(err && err.message ? err.message : "Lecture impossible : réessaie avec une photo plus nette.");
    if (workerOCR) { workerOCR.then(w => w.terminate()).catch(() => {}); workerOCR = null; } // lecteur peut-être abîmé : on repartira d'un neuf
  }
}
// Ouvre la fiche du colis qui porte ce n°. Renvoie false s'il n'existe pas dans les données.
function trouverParNumero(numero) {
  const n = formatNumero(numero), c = liste.find(x => x.numero && formatNumero(x.numero) === n);
  if (!c) return false;
  ouvrirFiche(c.id); toast(`Colis ${n} retrouvé`); return true;
}
async function retrouverEtiquette(fichier) {
  try {
    etatLecture("Lecture du code-barres…");
    const prep = await preparerImage(fichier);
    const nCode = Lecture.numeroDepuisCode(prep.code);
    let numero = nCode ? formatNumero(nCode) : "";
    if (numero && trouverParNumero(numero)) { etatLecture(null); return; } // le code-barres suffit : pas besoin de lire le texte
    const r = await lireTexteEtiquette(prep); // sinon on lit l'étiquette : n° imprimé, valeurs
    etatLecture(null);
    const champs = Lecture.lireChamps(r.texte, ESSENCE_INVERSE);
    if (!numero && champs.numero) numero = formatNumero(champs.numero);
    const chiffres = numero.replace(/\D/g, "");
    if (chiffres.length >= 7 && trouverParNumero(numero)) return;
    if (chiffres.length === 6) { // début du n° seulement : suffixe non lu
      const cand = actifs().filter(x => x.numero && x.numero.replace(/\D/g, "").startsWith(chiffres));
      if (cand.length === 1) { ouvrirFiche(cand[0].id); toast(`Colis ${cand[0].numero} retrouvé`); return; }
      if (cand.length > 1) { $("#recherche").value = chiffres; filtre = "a_sortir"; rendreListe(); toast(`${cand.length} colis commencent par ${formatNumero(chiffres)} : choisis`); return; }
    }
    // Ce n° n'existe pas encore. Si l'étiquette correspond à un colis noté au calepin et pas encore pointé, c'est son étiquette :
    // on lance le pointage (n° mis dessus, fautes corrigées) au lieu de créer un doublon.
    const attente = filePCTous().map(parId), spec = Lecture.lireSpec(r.texte);
    if (chiffres.length >= 7 && attente.length && ((spec && Lecture.correspondance(spec, attente)) || Lecture.trouver(r.texte, attente))) {
      traiterLecture(r.texte, null, prep.code, r.optionsLues, r.zones); return;
    }
    proposerCreation(numero, chiffres.length >= 7, r, champs);
  } catch (err) {
    etatLecture(null);
    toast(err && err.message ? err.message : "Lecture impossible : réessaie avec une photo plus nette.");
  }
}
function proposerCreation(numero, numeroComplet, r, champs) {
  const spec = Lecture.lireSpec(r.texte), z = r.zones || {}, options = r.optionsLues || [];
  // Valeurs proposées : celles vérifiées par le volume ; à défaut, chaque zone lue séparément (à contrôler)
  const verifie = !!(spec && spec.epaisseur != null);
  const sec = /(\d{2,3})\s*[xX]\s*(\d{2,3})/.exec(z.section || ""), pi = /(\d{1,4})/.exec(z.pieces || ""), lg = /(\d{1,2})[,.](\d{2})/.exec(z.longueur || "");
  const v = {
    ep: spec && spec.epaisseur != null ? spec.epaisseur : sec ? +sec[1] : "",
    larg: spec && spec.largeur != null ? spec.largeur : sec ? +sec[2] : "",
    pieces: spec && spec.pieces ? spec.pieces : pi ? +pi[1] : "",
    lo: spec && spec.longueur ? spec.longueur : lg ? +(lg[1] + "." + lg[2]) : ""
  };
  const champ = (id, lab, val, attr = "") => `<label class="champ"><span>${lab}</span><input id="${id}" ${attr} value="${esc(val)}"></label>`;
  $("#intro-corps").innerHTML = `
    <p>${numeroComplet ? `Le n° <b>${esc(numero)}</b> n'existe pas dans tes données.` : "Le n° n'a pas pu être lu sur la photo : tape-le ci-dessous."}</p>
    <div class="lecture${verifie ? "" : " attention"}"><b>${verifie ? "✔ Section, pièces et longueur vérifiées (volume)" : "⚠ Lecture incertaine"}</b>
      <p>${verifie ? "Vérifie le lieu et le choix, puis appuie sur « Créer l'étiquette »." : "Compare avec l'étiquette et corrige si besoin."}</p></div>
    ${champ("intro-numero", "N° d'étiquette", numeroComplet ? numero : "", 'inputmode="numeric" class="gros-chiffre" placeholder="200-000-1"')}
    <span class="etiquette-champ">Section (mm)</span>
    <div class="section">
      <label class="champ"><input id="intro-ep" inputmode="numeric" placeholder="75" value="${esc(v.ep)}"><small>épaisseur</small></label><span class="fois">×</span>
      <label class="champ"><input id="intro-larg" inputmode="numeric" placeholder="110" value="${esc(v.larg)}"><small>largeur</small></label>
    </div>
    <div class="ligne-2">${champ("intro-pieces", "Pièces", v.pieces, 'inputmode="numeric"')}${champ("intro-long", "Longueur (m)", v.lo === "" ? "" : nf(v.lo, 2), 'inputmode="decimal"')}</div>
    <div class="segment" id="intro-type"><button type="button" data-itype="cde" aria-pressed="true">Commande</button><button type="button" data-itype="stock" aria-pressed="false">Stock</button></div>
    <div id="intro-bloc-cde">${champ("intro-commande", "N° de commande <i>facultatif</i>", "", 'inputmode="numeric" placeholder="34114"')}</div>
    <div class="ligne-2">${champ("intro-lieu", "Lieu de stock", champs.lieu || "", 'class="majuscules" inputmode="none" autocapitalize="characters" placeholder="G7"')}${champ("intro-choix", "Choix", champs.choix || DEF.choix, 'inputmode="numeric"')}</div>
    <p class="alerte" id="intro-erreur" hidden></p>
    <div class="actions"><button type="button" class="btn btn-principal" id="intro-creer">Créer l'étiquette</button><button type="button" class="btn btn-secondaire" data-fermer>Fermer</button></div>`;
  montrer("#introuvable");
  let typeIntro = "cde";
  $$("#intro-type [data-itype]").forEach(b => b.onclick = () => {
    typeIntro = b.dataset.itype;
    $$("#intro-type [data-itype]").forEach(x => x.setAttribute("aria-pressed", x.dataset.itype === typeIntro));
    $("#intro-bloc-cde").hidden = typeIntro === "stock";
  });
  $("#intro-creer").onclick = () => {
    const erreur = m => { const e = $("#intro-erreur"); e.textContent = m; e.hidden = false; };
    const n = formatNumero($("#intro-numero").value);
    if (n.replace(/\D/g, "").length < 7) return erreur("Tape le n° complet de l'étiquette (ex. 203-522-1).");
    const dejaLa = doublon(n); if (dejaLa) { cacher("#introuvable"); ouvrirFiche(dejaLa.id); toast("Ce n° existe déjà : voici le colis"); return; }
    const ep = num($("#intro-ep").value), larg = num($("#intro-larg").value), pieces = Math.round(num($("#intro-pieces").value) || 0), lo = num($("#intro-long").value);
    if (!ep || !larg || !pieces || !lo) return erreur("Renseigne la section, les pièces et la longueur.");
    let dateIso = maintenant();
    if (champs.date) { const d = new Date(champs.date.an, champs.date.mois - 1, champs.date.jour, champs.date.h, champs.date.min); if (!isNaN(d) && d.getTime() <= Date.now() + 2 * 3600e3) dateIso = d.toISOString(); }
    const c = { id: nouvelId(), numero: n, commande: typeIntro === "stock" ? STOCK : $("#intro-commande").value.trim(), lieu: $("#intro-lieu").value.trim().toUpperCase(), epaisseur: ep, largeur: larg, longueur: lo, pieces,
      choix: $("#intro-choix").value.trim() || DEF.choix, essence: champs.essence || "", nature: DEF.nature, options, ref_client: "", observation: "Créé d'après une photo d'étiquette",
      statut: "a_sortir", cree_le: dateIso, etiquete_le: dateIso, supprime: false };
    enregistrer(c); cacher("#introuvable"); ouvrirFiche(c.id); toast("Étiquette créée");
  };
}
function calculerVerifs(lec, c) {
  const s = lec.specLu;
  const multi = plusieursLongueurs(c); // plusieurs longueurs : l'étiquette ne peut pas confirmer pièces, longueur et volume d'un coup
  if (!s) { const v = Lecture.verifier(c, lec.texte); return multi ? { ...v, pieces: true, longueur: true, volume: true } : v; }
  const vol = volume(c) || 0;
  return {
    section: s.epaisseur != null ? (s.epaisseur === c.epaisseur && s.largeur === c.largeur) : Math.abs(c.epaisseur * c.largeur - s.aire) <= s.aire * 0.005,
    pieces: multi || s.pieces === c.pieces, longueur: multi || s.longueur === c.longueur, volume: multi || Math.abs(vol - s.volume) < 0.0015
  };
}
const CHAMPS_NOTE = ["epaisseur", "largeur", "pieces", "longueur"];
function appliquerSpec(id, spec) { // l'étiquette fait foi : la note est remplacée (annulable)
  const c = parId(id), l = lectures[id];
  if (plusieursLongueurs(c)) return;
  const avant = Object.fromEntries(CHAMPS_NOTE.map(k => [k, c[k]]));
  enregistrer({ ...c, ...Object.fromEntries(CHAMPS_NOTE.filter(k => spec[k] != null).map(k => [k, spec[k]])) });
  if (l) { l.avant = avant; l.corrige = true; l.spec = null; l.verifs = calculerVerifs(l, parId(id)); }
}
function traiterLecture(texte, cible, code, optionsLues, zones) {
  const attente = filePCTous().map(parId);
  const champs = Lecture.lireChamps(texte, ESSENCE_INVERSE), spec = Lecture.lireSpec(texte);
  const numCode = Lecture.numeroDepuisCode(code); // le code-barres est bien plus sûr que le texte
  const numero = numCode ? formatNumero(numCode) : champs.numero ? formatNumero(champs.numero) : "";

  // 1. Quel colis ? Celui affiché au pointage, sinon celui qui ressemble le plus à l'étiquette
  let colis = cible && parId(cible) && parId(cible).statut === "a_etiqueter" ? parId(cible) : null;
  if (!colis && spec) { const r = Lecture.correspondance(spec, attente); if (r) colis = r.colis; }
  if (!colis) { const r = Lecture.trouver(texte, attente); if (r) colis = r.colis; }
  if (!colis) { toast(`Aucun colis en attente ne correspond${numero ? " (lu : n° " + numero + ")" : ""}. Ouvre le colis dans « Pointer » puis reprends la photo depuis cet écran.`); return; }
  if (numero) {
    const d = doublon(numero, colis.id);
    if (d) { toast(`Le n° ${numero} est déjà pointé : ${section(d)}, ${cdeTxt(d)}.`); return; }
  }
  let dateIso = null;
  if (champs.date) {
    const d = new Date(champs.date.an, champs.date.mois - 1, champs.date.jour, champs.date.h, champs.date.min), t0 = d.getTime();
    if (!isNaN(t0) && t0 <= Date.now() + 2 * 3600e3 && t0 >= Date.now() - 14 * 86400e3 && t0 >= t(colis.cree_le) - 3600e3) dateIso = d.toISOString();
  }
  if (!$("#pc").hidden) garderPC();
  const id = colis.id;
  lectures[id] = { numero, parCode: !!numCode, lieu: champs.lieu, choix: champs.choix, essence: champs.essence, essenceCode: champs.essenceCode, options: optionsLues, code, zones, dateIso, texte, specLu: spec, spec: null, corrige: false, avant: null, verifs: null };

  // Ce qui est imprimé (lieu, essence, choix) est inscrit dans le colis : c'est ce qui compte, et tes retouches ensuite sont conservées
  { const lu = { ...(champs.lieu ? { lieu: champs.lieu } : {}), ...(champs.essence ? { essence: champs.essence } : {}), ...(champs.choix ? { choix: champs.choix } : {}) };
    if (Object.keys(lu).length) enregistrer({ ...parId(id), ...lu }); }

  // 2. L'étiquette corrige la note toute seule (section, pièces, longueur) — annulable
  const c0 = parId(id), avant = Object.fromEntries(CHAMPS_NOTE.map(k => [k, c0[k]]));
  const nouveau = spec && !plusieursLongueurs(c0) ? Object.fromEntries(["pieces", "longueur"].filter(k => spec[k] != null).map(k => [k, spec[k]])) : {};
  if (spec && spec.epaisseur != null && (spec.epaisseur !== c0.epaisseur || spec.largeur !== c0.largeur)) lectures[id].spec = { epaisseur: spec.epaisseur, largeur: spec.largeur }; // la section, on la propose seulement
  if (!spec && !plusieursLongueurs(c0) && Lecture.verifier(c0, texte).inverse) { nouveau.pieces = c0.longueur; nouveau.longueur = c0.pieces; }
  if (Object.keys(nouveau).some(k => nouveau[k] !== c0[k])) {
    enregistrer({ ...c0, ...nouveau });
    Object.assign(lectures[id], { avant, corrige: true });
  }
  lectures[id].verifs = calculerVerifs(lectures[id], parId(id));
  // Options : celles imprimées juste au-dessus du n° (aucune = pas d'option). Si la zone n'a pas été localisée, on ne touche à rien.
  if (optionsLues) enregistrer({ ...parId(id), options: optionsLues });

  const ids = filePCTous();
  filePC = ids; posPC = Math.max(0, ids.indexOf(id));
  rendrePC(); montrer("#pc");
  toast(lectures[id].corrige ? "Note corrigée d'après l'étiquette" : numero ? `N° ${numero} ajouté` : "Étiquette lue");
}
function resumeLecture(lec) {
  const s = lec.specLu;
  return [`code-barres : ${lec.code || "non lu"}`, `n° retenu : ${lec.numero || "non lu"}`,
    `zones : ${lec.zones ? Object.entries(lec.zones).map(([k, v]) => k + " « " + (v ?? "?") + " »").join(", ") : "code-barres non trouvé, photo entière"}`,
    `options : ${lec.options === null ? "zone non repérée" : lec.options.length ? lec.options.join(" ") : "aucune"}`,
    `valeurs lues : ${s ? JSON.stringify(s) : "aucune cohérente"}`, "", (lec.texte || "").replace(/\n{2,}/g, "\n").trim().slice(0, 700)].join("\n");
}
function bandeauLecture(lec, c) {
  if (!lec) return "";
  const v = lec.verifs, tout = v.section && v.pieces && v.longueur && v.volume && lec.numero && lec.numero.replace(/\D/g, "").length >= 7;
  const lignes = [["Section", v.section], ["Pièces", v.pieces], ["Longueur", v.longueur], ["Volume", v.volume]];
  const txt = x => `${x.epaisseur} × ${x.largeur}, ${np(x.pieces)} pièces de ${nf(x.longueur, 2)} m`;
  return `<div class="lecture${tout ? "" : " attention"}"><b>📷 Lu sur l'étiquette</b>
    <p>${lec.numero ? "n° <b>" + esc(lec.numero) + "</b>" + (lec.parCode ? " (code-barres ✔)" : "") + (lec.numero.replace(/\D/g, "").length < 7 ? " (fin du n° non lue : ajoute-la)" : "") : "n° non lu : tape-le ci-dessous"}${lec.lieu ? ", lieu " + esc(lec.lieu) : ""}${lec.dateIso ? ", imprimée le " + esc(dh(lec.dateIso)) : ""}</p>
    ${lec.corrige && lec.avant ? `<p class="ecart"><b>✔ Corrigé d'après l'étiquette :</b> ${CHAMPS_NOTE.filter(k => lec.avant[k] !== c[k]).map(k => `${{ epaisseur: "épaisseur", largeur: "largeur", pieces: "pièces", longueur: "longueur" }[k]} ${k === "longueur" ? nf(lec.avant[k], 2) : np(lec.avant[k])} → <b>${k === "longueur" ? nf(c[k], 2) : np(c[k])}</b>`).join(", ")}. <button type="button" class="lien" data-p="desinverser">Annuler</button></p>` : ""}
    ${lec.spec ? `<p class="ecart"><b>≠ Section :</b> l'étiquette dit ${lec.spec.epaisseur} × ${lec.spec.largeur}, ta note dit ${esc(section(c))}. <button type="button" class="lien" data-p="prendre">Prendre l'étiquette</button></p>` : ""}
    ${lec.options === null ? `<p class="note-stats">Options : zone non repérée sur la photo, coche-les toi-même.</p>` : ""}
    ${lec.essenceCode && !lec.essence ? `<p class="note-stats">Essence lue sur l'étiquette : « ${esc(lec.essenceCode)} ». Choisis la lettre du terminal.</p>` : ""}
    <div class="verifs">${lignes.map(([l, ok]) => `<i class="${ok ? "ok" : "ko"}">${l} ${ok ? "✔" : "?"}</i>`).join("")}</div>
    ${tout ? "" : `<p class="note-stats">Un « ? » veut dire non lu ou différent de ta note : compare avec l'étiquette avant de pointer.</p>`}
    <details class="details"><summary><span>Voir ce qui a été lu</span></summary><pre class="lu">${esc(resumeLecture(lec))}</pre></details></div>`;
}
$("#photo-input").addEventListener("change", e => { const f = e.target.files && e.target.files[0]; e.target.value = ""; const cible = photoCible, mode = photoMode; photoCible = null; photoMode = "pointage"; if (f) (mode === "retrouver" ? retrouverEtiquette(f) : lireEtiquette(f, cible)); });
$("#btn-photo").addEventListener("click", () => ouvrirPhoto("pointage"));
$("#btn-retrouver").addEventListener("click", () => ouvrirPhoto("retrouver"));

/* ═════════════ Copie d'étiquette imprimable ═════════════ */
// La copie est dessinée en SVG (unités = mm, 200 × 68) : la même image sert à l'aperçu, à l'impression et au PDF.
function svgEtiquette(c) {
  const ess = (CFG.ESSENCE_ETIQUETTE || {})[c.essence] || c.essence || "";
  const d = new Date(c.etiquete_le || c.cree_le), p2 = n => String(n).padStart(2, "0");
  const dt = `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)} ${p2(d.getHours())}${p2(d.getMinutes())}`;
  const vol = volume(c), num = String(c.numero || "").replace(/\D/g, ""), opts = (c.options || []).join(" ");
  const gros = num.length >= 7 ? [num.slice(0, 6), num.slice(6)] : [num || "______", ""];
  // « par » = largeur par caractère en mm : le texte est resserré pour tenir dans la place de l'étiquette officielle (police plus étroite qu'Arial)
  const T = (x, y, taille, txt, o = {}) => `<text x="${x}" y="${y}" font-size="${taille}"${o.par ? ` textLength="${(String(txt).length * o.par).toFixed(1)}" lengthAdjust="spacingAndGlyphs"` : ""}${o.gras ? ' font-weight="700"' : ""}${o.serif ? ' font-family="Times New Roman, serif"' : ""}${o.italique ? ' font-style="italic"' : ""}${o.centre ? ' text-anchor="middle"' : ""}>${esc(txt)}</text>`;
  let barres = "";
  const code = Lecture.texteCodeBarres(c.numero);
  if (code) { const e = Lecture.encoder39(code), u = 42 / e.total; barres = e.barres.map(([x, w]) => `<rect x="${(87 + x * u).toFixed(3)}" y="47" width="${(w * u).toFixed(3)}" height="8.4"/>`).join(""); }
  const cde = c.commande ? (c.commande === STOCK ? "Stock" : "Cde " + c.commande) : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 68" width="${(CFG.ETIQUETTE_MM || {}).largeur || 190}mm" font-family="Arial, Helvetica, sans-serif" fill="#000">
  <rect x="0.3" y="0.3" width="199.4" height="67.4" fill="#fff" stroke="#000" stroke-width="0.4"/>
  ${T(9, 7, 4.6, "Les SCIERIES du CENTRE", { gras: true, par: 2.4 })}
  ${T(75.5, 12, 13.5, `${c.epaisseur} x ${c.largeur}`, { gras: true, par: 5.75 })}
  ${T(67.5, 22.5, 7.5, `${totalPieces(c)}`, { gras: true })}${T(79, 22.5, 3.2, "P", { gras: true })}
  ${T(93.7, 22.5, 13.5, plusieursLongueurs(c) ? "mixte" : nf(c.longueur, 2), { gras: true, par: 4.6 })}${T(120.5, 22.5, 4.2, "m", { gras: true })}
  ${T(9, 42, 27, "SDC", { gras: true, par: 13.7 })}
  ${T(57.6, 35, 8, `${c.choix || ""} ${ess}`, { gras: true, par: 3.6 })}${T(82.4, 35, 10, c.lieu || "", { gras: true })}
  ${vol ? T(115, 34, 4, nf(vol, 3) + " m3", { gras: true }) : ""}
  ${opts ? T(57, 43, 3, opts, { gras: true }) : ""}
  ${T(51.3, 54.5, 9.5, gros[0], { gras: true, par: 3.85 })}${gros[1] ? T(82.6, 54.5, 9.5, gros[1], { gras: true }) : ""}
  ${barres}
  ${T(49, 59.5, 3.2, plusieursLongueurs(c) ? `${totalPieces(c)}` : `${c.pieces}/${Math.round((c.longueur || 0) * 100)}`, { gras: true, par: 1.45 })}
  ${T(11.4, 64.2, 3.8, "33 (0)4.73.84.65.13", { gras: true, par: 2.03 })}${T(71.5, 64.2, 3.4, dt, { gras: true, par: 1.84 })}${cde ? T(112, 64.2, 3.4, cde, { gras: true }) : ""}
  ${T(133, 27, 2.8, "Les Scieries du Centre, 63800 Cournon", { serif: true })}
  ${T(153, 31.5, 3.4, "26", { gras: true })}
  ${T(144, 39.5, 3.7, "EN 14081-1+A1", { gras: true })}
  ${T(134, 44, 2.7, "Bois de structure", { serif: true })}${T(134, 47.5, 3.6, "C24 (ST II)", { serif: true })}
  ${T(134, 51, 2.7, "Code essence", { serif: true })}${T(134, 53.6, 2.1, "PT (Bois traité - Voir Informations", { serif: true, italique: true })}
  ${T(166, 47, 2.7, "Frais de sciage", { serif: true })}${T(166, 50.6, 3.3, "WPCA", { serif: true })}
  ${T(134, 57.6, 2.7, "Norme de classement", { serif: true })}${T(167, 57.6, 2.7, "EN 330+NF B52-001-1", { serif: true })}
  ${T(134, 61, 2.7, "Réaction au feu", { serif: true })}${T(167, 61, 2.7, "D-s2.d0", { serif: true })}
  ${T(134, 64.4, 2.7, "Classe de durabilité", { serif: true })}${T(167, 64.4, 2.7, "NPD", { serif: true })}
  <rect x="150" y="4" width="42" height="17" rx="2" fill="none" stroke="#000" stroke-width="0.4" stroke-dasharray="1.6 1"/>
  ${T(171, 11.5, 6, "COPIE", { gras: true, centre: true })}${T(171, 17, 2.3, "l'étiquette officielle est éditée sur le PC", { centre: true })}
</svg>`;
}

// ── Aperçu, impression et PDF ──
const surIphone = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
let copiePrete = null; // { id, nom, blob } : le PDF est préparé à l'ouverture pour que « Imprimer » réponde tout de suite
function pdfDepuisJpeg(jpeg, lpx, hpx, lmm, hmm) {
  const pt = mm => (mm * 72 / 25.4).toFixed(2), enc = s => new TextEncoder().encode(s), morceaux = [], pos = [];
  let n = 0;
  const ajouter = b => { const u = typeof b === "string" ? enc(b) : b; morceaux.push(u); n += u.length; };
  const objet = (num, corps) => { pos[num] = n; ajouter(`${num} 0 obj\n`); corps.forEach(ajouter); ajouter("\nendobj\n"); };
  ajouter("%PDF-1.4\n");
  objet(1, ["<< /Type /Catalog /Pages 2 0 R >>"]);
  objet(2, ["<< /Type /Pages /Kids [3 0 R] /Count 1 >>"]);
  objet(3, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pt(lmm)} ${pt(hmm)}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`]);
  objet(4, [`<< /Type /XObject /Subtype /Image /Width ${lpx} /Height ${hpx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, jpeg, "\nendstream"]);
  const flux = `q ${pt(lmm)} 0 0 ${pt(hmm)} 0 0 cm /Im0 Do Q`;
  objet(5, [`<< /Length ${flux.length} >>\nstream\n${flux}\nendstream`]);
  const xref = n;
  ajouter(`xref\n0 6\n0000000000 65535 f \n${[1, 2, 3, 4, 5].map(k => String(pos[k]).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(morceaux, { type: "application/pdf" });
}
async function fabriquerPdf(c) {
  const svg = svgEtiquette(c), lmm = 200, hmm = 68, L = 2362, H = Math.round(L * hmm / lmm);
  const img = new Image(); img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.replace(/width="[\d.]+mm"/, `width="${L}" height="${H}"`));
  await img.decode();
  const cv = document.createElement("canvas"); cv.width = L; cv.height = H;
  const ctx = cv.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, L, H); ctx.drawImage(img, 0, 0, L, H);
  const jpeg = await new Promise(ok => cv.toBlob(ok, "image/jpeg", 0.95));
  return pdfDepuisJpeg(new Uint8Array(await jpeg.arrayBuffer()), L, H, lmm, hmm);
}
async function donnerFichier(blob, nom, titre) { // feuille de partage (AirPrint, Fichiers, Mail…) ou, à défaut, téléchargement
  const f = new File([blob], nom, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [f] })) {
    try { await navigator.share({ files: [f], title: titre || nom }); return "partage"; }
    catch (e) { if (e && e.name === "AbortError") return "annule"; }
  }
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = nom; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return "telecharge";
}
function imprimer(id) { // ouvre l'aperçu de la copie
  const c = parId(id); if (!c) return;
  copiePrete = null;
  $("#etq-apercu").innerHTML = svgEtiquette(c).replace(/ width="[\d.]+mm"/, "");
  $("#impression").innerHTML = svgEtiquette(c);
  $("#etq-imprimer").disabled = true; $("#etq-pdf").disabled = true;
  $("#etq-imprimer").textContent = "Préparation…";
  $("#etq-pdf").hidden = surIphone;
  $("#etq-aide").textContent = surIphone ? "Un menu va s'ouvrir : choisis « Imprimer » (AirPrint) ou « Enregistrer dans Fichiers »." : "";
  montrer("#etq");
  const nom = `etiquette-${(c.numero || "sans-numero")}.pdf`;
  fabriquerPdf(c).then(blob => { copiePrete = { id, nom, blob }; })
    .catch(() => { copiePrete = { id, nom, erreur: true }; })
    .finally(() => { $("#etq-imprimer").disabled = false; $("#etq-pdf").disabled = false; $("#etq-imprimer").textContent = surIphone ? "🖨 Imprimer / partager" : "🖨 Imprimer"; });
}
$("#etq-imprimer").addEventListener("click", async () => {
  if (!surIphone) { window.print(); return; }            // ordinateur : la boîte d'impression du navigateur
  if (copiePrete && copiePrete.blob) await donnerFichier(copiePrete.blob, copiePrete.nom, "Copie d'étiquette");
  else toast("Impossible de préparer le PDF. Réessaie.");
});
$("#etq-pdf").addEventListener("click", async () => {
  if (copiePrete && copiePrete.blob) await donnerFichier(copiePrete.blob, copiePrete.nom, "Copie d'étiquette");
  else toast("Impossible de préparer le PDF. Réessaie.");
});

/* ═════════════ Synchronisation Supabase ═════════════ */
const viaConfig = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
const CONN = lire("colis.connexion.v1", {});
const SB_URL = viaConfig ? CFG.SUPABASE_URL : (CONN.url || ""), SB_KEY = viaConfig ? CFG.SUPABASE_ANON_KEY : (CONN.cle || "");
const configure = !!(SB_URL && SB_KEY);
let stockageSur = null; // le navigateur a-t-il accepté de protéger nos données ?
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().then(ok => { stockageSur = ok; majEtat(); }).catch(() => {});
let suppressionLimitee = false; // la base n'a pas la règle « effacer » : les colis supprimés y sont seulement masqués
let sb = null, session = null, occupe = false, relancer = false, derniereErreur = "";

async function initSynchro() {
  if (!configure) { majEtat(); return; }
  if (!window.supabase) { derniereErreur = "Bibliothèque de synchro non chargée (hors ligne ?)"; majEtat(); return; }
  sb = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  const { data } = await sb.auth.getSession();
  session = data.session;
  sb.auth.onAuthStateChange((_e, s) => { session = s; majLogin(); });
  majLogin();
  if (session) synchroniser();
}
function majLogin() {
  $("#login").hidden = !configure || !sb || !!session;
  $("#btn-deconnexion").hidden = !session;
  majEtat();
}
$("#login-form").addEventListener("submit", async e => {
  e.preventDefault();
  const err = $("#login-erreur"); err.hidden = true;
  const { error } = await sb.auth.signInWithPassword({ email: $("#login-email").value.trim(), password: $("#login-mdp").value });
  if (error) { err.textContent = navigator.onLine ? "E-mail ou mot de passe incorrect." : "Pas de réseau : connecte-toi dès que ça capte."; err.hidden = false; return; }
  synchroniser();
});
$("#btn-deconnexion").addEventListener("click", async () => {
  if (!confirm("Se déconnecter ? Les colis restent sur cet appareil.")) return;
  await sb.auth.signOut();
});

const ligneDistante = c => Object.fromEntries(COLONNES.map(k => [k, k === "options" ? (c.options || []) : k === "autres" ? (c.autres || []) : k === "supprime" ? !!c.supprime : (c[k] === "" ? null : c[k] ?? null)]));

async function effacerEnLigne() {
  for (const id of [...suppressions]) {
    const r = await sb.from("colis").delete().eq("id", id).select("id");
    if (r.error) throw new Error(r.error.message);
    if (!r.data || !r.data.length) { // rien effacé : ligne déjà absente, ou règle « effacer » pas encore ajoutée dans Supabase
      const u = await sb.from("colis").update({ supprime: true, maj_le: maintenant() }).eq("id", id).select("id");
      if (!u.error && u.data && u.data.length) suppressionLimitee = true;
    }
    suppressions.delete(id); sauverLocal();
  }
}
async function pousser() {
  await effacerEnLigne();
  if (!attente.size) return;
  const lignes = [...attente].map(parId).filter(Boolean).map(ligneDistante);
  let { error } = await sb.from("colis").upsert(lignes, { onConflict: "id" });
  if (!error) { lignes.forEach(l => attente.delete(l.id)); sauverLocal(); return; }
  // en cas d'erreur, on isole le colis fautif pour envoyer quand même les autres
  let fautif = "";
  for (const l of lignes) {
    const r = await sb.from("colis").upsert([l], { onConflict: "id" });
    if (!r.error) attente.delete(l.id);
    else fautif = r.error.code === "23505" ? `Le n° ${l.numero} existe déjà sur un autre appareil : corrige-le.` : r.error.message;
  }
  sauverLocal();
  if (fautif) throw new Error(fautif);
}
async function tirer() {
  const depuis = lire(K.tire, null);
  let max = depuis, de = 0;
  const PAS = 1000;
  for (;;) {
    let q = sb.from("colis").select(COLONNES.join(",")).order("maj_le", { ascending: true }).range(de, de + PAS - 1);
    if (depuis) q = q.gt("maj_le", depuis);
    const { data, error } = await q;
    if (error) throw error;
    for (const r of data) {
      const loc = parId(r.id);
      if (!max || t(r.maj_le) > t(max)) max = r.maj_le;
      if (r.supprime) { if (loc && !attente.has(r.id)) liste = liste.filter(x => x.id !== r.id); continue; } // supprimé (ici ou sur un autre appareil)
      if (loc && attente.has(r.id) && t(loc.maj_le) > t(r.maj_le)) continue;
      r.options = r.options || [];
      if (!loc) liste.push(r); else if (t(r.maj_le) >= t(loc.maj_le)) liste[liste.indexOf(loc)] = r;
    }
    if (data.length < PAS) break;
    de += PAS;
  }
  migrer();
  if (max) ecrire(K.tire, max);
  sauverLocal();
}
// Un colis effacé en ligne depuis un autre appareil disparaît d'ici aussi (sauf s'il attend encore d'être envoyé).
async function purgerAbsentsEnLigne() {
  const ids = new Set(); let de = 0; const PAS = 1000;
  for (;;) {
    const { data, error } = await sb.from("colis").select("id").order("id", { ascending: true }).range(de, de + PAS - 1);
    if (error) throw error;
    data.forEach(x => ids.add(x.id));
    if (data.length < PAS) break;
    de += PAS;
  }
  if (!ids.size) return; // rien vu en ligne : par prudence, on ne retire rien ici
  const avant = liste.length;
  liste = liste.filter(c => ids.has(c.id) || attente.has(c.id));
  if (liste.length !== avant) sauverLocal();
}
async function synchroniser() {
  if (!sb || !session || !navigator.onLine) { majEtat(); return; }
  if (occupe) { relancer = true; return; }
  occupe = true; majEtat();
  try {
    if (lire(K.projet, null) !== SB_URL) { // première synchro avec cette base : tout ce qui est ici y est envoyé, rien n'est retiré
      liste.forEach(c => attente.add(c.id)); ecrire(K.tire, null); ecrire(K.projet, SB_URL); sauverLocal();
    }
    await pousser(); await tirer(); await purgerAbsentsEnLigne(); await syncReglages();
    derniereErreur = suppressionLimitee ? "les colis supprimés ne sont que masqués en ligne : relance le script SQL de Supabase (règle « effacer »)." : ""; ecrire(K.synchro, maintenant());
  } catch (e) {
    derniereErreur = e.message || "Synchronisation impossible";
  } finally {
    occupe = false;
    rafraichir();
    if (relancer) { relancer = false; synchroniser(); }
  }
}
function majEtat() {
  const p = $("#synchro-pastille"), txt = $("#reglage-synchro");
  let cls = "", msg;
  if (!configure) { cls = "local"; msg = "Les colis sont enregistrés sur cet appareil uniquement. Relie l'appli à Supabase pour tout garder en mémoire et retrouver tes colis sur l'iPhone et le PC."; }
  else if (derniereErreur) { cls = "erreur"; msg = "Problème de synchro : " + derniereErreur; }
  else if (!session) { cls = "attente"; msg = "Connecte-toi pour synchroniser."; }
  else if (!navigator.onLine) { cls = "attente"; msg = `Hors ligne. ${attente.size ? attente.size + " modification(s) partiront dès le retour du réseau." : "Rien en attente."}`; }
  else if (occupe || attente.size) { cls = "attente"; msg = "Synchronisation en cours…"; }
  else { const d = lire(K.synchro, null); msg = "Tout est synchronisé" + (d ? ", dernière fois " + quand(d) + "." : "."); }
  $("#bloc-liaison").hidden = configure; $("#btn-delier").hidden = !(configure && !viaConfig);
  if (typeof vueActive !== "undefined" && vueActive === "accueil") rendreAccueil();
  const si = $("#sauv-info");
  if (si) { const d = lire(K.sauvegarde, null); si.textContent = `Dernière sauvegarde : ${d ? quand(d) : "jamais"}. ` + (stockageSur === true ? "Stockage protégé par le navigateur ✔" : "Stockage non garanti par le navigateur : fais une sauvegarde de temps en temps, ou relie Supabase."); }
  p.className = "pastille-synchro " + cls;
  p.title = msg;
  if (txt) txt.textContent = msg;
}
$("#synchro-pastille").addEventListener("click", () => allerA("reglages"));
$("#btn-synchro").addEventListener("click", () => { derniereErreur = ""; synchroniser(); });
window.addEventListener("online", synchroniser);
window.addEventListener("offline", majEtat);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") synchroniser(); });
setInterval(synchroniser, 60000);

$("#btn-lier").addEventListener("click", () => {
  const url = $("#sb-url").value.trim().replace(/\/+$/, ""), cle = $("#sb-cle").value.trim();
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) || cle.length < 20) {
    toast("URL ou clé incorrecte : copie-les depuis Supabase, Project Settings, API."); return;
  }
  ecrire("colis.connexion.v1", { url, cle }); location.reload();
});
$("#btn-delier").addEventListener("click", () => {
  if (!confirm("Délier de Supabase ? Les colis restent sur cet appareil.")) return;
  localStorage.removeItem("colis.connexion.v1"); location.reload();
});

/* ═════════════ Apparence (thème, couleurs, animations : gardés dans Supabase) ═════════════ */
const PRINC = [["Indigo", "#5B4FBF"], ["Terracotta", "#D4917F"], ["Pêche", "#DDA791"], ["Rose poudré", "#D4A5A8"], ["Cuivre", "#C08A6E"], ["Or", "#D4B06E"], ["Sauge", "#8FA58F"],
  ["Menthe", "#8CC4B8"], ["Ciel", "#8DB8D9"], ["Bleu", "#5F7DB9"], ["Lavande", "#A199CE"], ["Bordeaux", "#843C4E"], ["Gris", "#9DA0AA"]];
const PALETTES = {
  princ: PRINC,
  chiffre: [["Ambre", "#F0B04A"], ["Turquoise", "#1F8A8A"], ["Cuivre foncé", "#B4682F"], ["Bordeaux", "#843C4E"], ["Indigo", "#5B4FBF"], ["Vert", "#3F7F5B"], ["Bleu", "#2F6DA3"], ["Brique", "#C0533D"], ["Or foncé", "#8C6D1F"],
    ["Ardoise", "#5A6B7B"], ["Noir", "#26201F"], ["Violet", "#7A4E9A"], ["Framboise", "#B23B6B"], ["Olive", "#6B7F3A"]]
};
const CLES_REGLAGES = ["mode", "anim", "c_princ", "c_fond", "c_nav", "c_chiffre"];
const REGLAGES_DEFAUT = { mode: "sombre", anim: true, c_princ: "#843C4E", c_fond: "#EEF2F7", c_nav: "auto", c_chiffre: "#F0B04A" };
const anciens = lire(K.reglages, {});
let reglages = { ...REGLAGES_DEFAUT, maj: anciens.maj || null, attente: !!anciens.attente };
CLES_REGLAGES.forEach(k => { if (anciens[k] !== undefined) reglages[k] = anciens[k]; }); // les anciens réglages (vert, or, forêt…) sont abandonnés
const THEME_V = 3; // nouvelle palette : on garde la couleur principale choisie, le reste est remplacé
if (anciens.tv !== THEME_V) {
  Object.assign(reglages, { mode: REGLAGES_DEFAUT.mode, c_fond: REGLAGES_DEFAUT.c_fond, c_nav: REGLAGES_DEFAUT.c_nav, c_chiffre: REGLAGES_DEFAUT.c_chiffre, maj: maintenant(), attente: true });
  reglages.tv = THEME_V; ecrire(K.reglages, reglages);
}
reglages.tv = THEME_V;
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const hex = v => "#" + v.map(x => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("");
const mix = (a, b, k) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * k)); };
const clarte = h => { const [r, g, b] = rgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
const themeSombre = () => reglages.mode === "sombre" || (reglages.mode === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
function appliquerTheme() {
  const r = reglages, s = document.documentElement.style, W = "#ffffff", sombre = themeSombre();
  const ac = r.c_princ, base = "#0F1219";
  const set = (k, v) => s.setProperty(k, v);
  set("--accent", ac);
  set("--sur-accent", clarte(ac) > 0.55 ? "#1C2230" : "#FFFFFF");
  set("--accent-texte", sombre ? (clarte(ac) < 0.5 ? mix(ac, W, 0.45) : ac) : (clarte(ac) > 0.5 ? mix(ac, "#000000", 0.45) : ac));
  set("--accent-fort", sombre ? mix(ac, W, 0.3) : mix(ac, "#000000", 0.28));
  set("--accent-doux", sombre ? mix(base, ac, 0.28) : mix(ac, W, 0.88));
  set("--accent-moyen", sombre ? mix(ac, W, 0.3) : mix(ac, W, 0.55));
  // Design « verre sur bois d'automne » : cartes translucides, voile sur la photo, barre flottante
  if (sombre) {
    set("--fond", "#1A100B"); set("--fond-haut", "#22150E"); set("--carte", "rgba(30,20,16,.58)"); set("--champ", "rgba(255,255,255,.09)"); set("--panneau", "rgba(26,17,13,.92)");
    set("--texte", "#FBF4EE"); set("--texte-doux", "#CDBFB4"); set("--bord", "rgba(255,255,255,.16)"); set("--ombre", "0 8px 28px rgba(0,0,0,.28)");
    set("--hero1", mix(base, ac, 0.55)); set("--hero2", mix(base, ac, 0.3));
    set("--chiffre", clarte(r.c_chiffre) < 0.45 ? mix(r.c_chiffre, W, 0.5) : r.c_chiffre);
    set("--voile", "linear-gradient(180deg, rgba(18,10,6,.58) 0%, rgba(18,10,6,.38) 38%, rgba(18,10,6,.66) 100%)");
    set("--barre", "rgba(24,15,11,.66)");
  } else {
    set("--fond", "#F6EDE3"); set("--fond-haut", "#F1E4D6"); set("--carte", "rgba(255,250,245,.80)"); set("--champ", "rgba(255,255,255,.92)"); set("--panneau", "rgba(255,251,247,.96)");
    set("--texte", "#2A1B14"); set("--texte-doux", "#6E5A4E"); set("--bord", "rgba(60,36,20,.14)"); set("--ombre", "0 8px 26px rgba(40,20,8,.14)");
    set("--hero1", mix(ac, W, 0.7)); set("--hero2", mix(ac, W, 0.87));
    set("--chiffre", mix(r.c_chiffre, "#000000", 0.32));
    set("--voile", "linear-gradient(180deg, rgba(255,243,230,.62) 0%, rgba(255,243,230,.48) 40%, rgba(255,243,230,.66) 100%)");
    set("--barre", "rgba(255,249,242,.80)");
  }
  set("--btn-hero1", mix(ac, "#000000", 0.12)); set("--btn-hero2", mix(ac, "#000000", 0.46));
  set("--nav-texte", sombre ? "rgba(255,255,255,.72)" : "#6E5A4E");
  set("--nav-actif", sombre ? "#FFFFFF" : mix(ac, "#000000", clarte(ac) > 0.5 ? 0.45 : 0.1));
  set("--nav-pastille", sombre ? "rgba(255,255,255,.2)" : mix(ac, W, 0.8));
  document.documentElement.style.colorScheme = sombre ? "dark" : "light";
  document.body.classList.toggle("sans-anim", !r.anim);
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = sombre ? "#1A100B" : "#F6EDE3";
}
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (reglages.mode === "auto") appliquerTheme(); });
/* Décor (propre à cet appareil) : fond flou ou net, quantité de feuilles qui tombent */
const DECO = (() => {
  let d = {}; try { d = JSON.parse(localStorage.getItem("colis_deco") || "{}"); } catch (e) { /* tant pis */ }
  const niv = typeof d.feuilles === "number" ? d.feuilles : d.feuilles === false ? 0 : 2; // ancien format : oui/non
  return { feuilles: Math.min(3, Math.max(0, niv)), flou: d.flou !== false };
})();
function appliquerDeco() {
  const html = document.documentElement;
  html.style.setProperty("--fond-img", `url("fond-automne${DECO.flou ? "" : "-net"}.jpg?v=231")`);
  html.classList.toggle("fond-net", !DECO.flou);
  if (window.FEUILLES) FEUILLES.regler(DECO.feuilles);
}
function changerDeco(patch) { Object.assign(DECO, patch); try { localStorage.setItem("colis_deco", JSON.stringify(DECO)); } catch (e) { /* tant pis */ } appliquerDeco(); majUIapparence(); }
function majUIapparence() {
  $$("#deco-feuilles [data-niv]").forEach(b => b.setAttribute("aria-pressed", Number(b.dataset.niv) === DECO.feuilles));
  $$("#deco-fond [data-flou]").forEach(b => b.setAttribute("aria-pressed", (b.dataset.flou === "1") === DECO.flou));
  $("#deco-etat").textContent = window.FEUILLES ? "" : "⚠️ Le fichier feuilles.js n'est pas en ligne : ajoute-le dans ton dépôt GitHub pour voir tomber les feuilles.";
  $$("#theme-mode [data-mode]").forEach(b => b.setAttribute("aria-pressed", b.dataset.mode === reglages.mode));
  $("#c-anim").checked = !!reglages.anim;
  const tint = mix(reglages.c_princ, "#ffffff", 0.84);
  const pal = (id, cle, liste, nombre) => {
    $(id).innerHTML = liste.map(([nom, val]) => `<button type="button" class="pastille" data-cle="${cle}" data-val="${val}" title="${esc(nom)}" aria-label="${esc(nom)}" aria-pressed="${String(reglages[cle]).toLowerCase() === val.toLowerCase()}" style="background:${val === "auto" ? tint : val}"></button>`).join("");
    $(nombre).textContent = `${liste.length} couleurs`;
  };
  pal("#pal-princ", "c_princ", PALETTES.princ, "#n-princ");
  pal("#pal-chiffre", "c_chiffre", PALETTES.chiffre, "#n-chiffre");
}
let minuteurReglages;
function changerReglages(patch) {
  reglages = { ...reglages, ...patch, maj: maintenant(), attente: true };
  ecrire(K.reglages, reglages); appliquerTheme(); majUIapparence();
  clearTimeout(minuteurReglages); minuteurReglages = setTimeout(synchroniser, 800);
}
$("#pli-apparence").addEventListener("click", e => {
  const p = e.target.closest(".pastille"); if (p) { changerReglages({ [p.dataset.cle]: p.dataset.val }); return; }
  const m = e.target.closest("[data-mode]"); if (m) changerReglages({ mode: m.dataset.mode });
});
$("#c-anim").addEventListener("change", e => changerReglages({ anim: e.target.checked }));
const valeursReglages = () => Object.fromEntries(CLES_REGLAGES.map(k => [k, reglages[k]]));
async function syncReglages() {
  const { data, error } = await sb.from("reglages").select("valeurs,maj_le").maybeSingle();
  if (error) return; // table pas encore créée : on ignore, les colis se synchronisent quand même
  if ((reglages.attente || !data) && reglages.maj) {
    const r = await sb.from("reglages").upsert({ user_id: session.user.id, valeurs: valeursReglages(), maj_le: reglages.maj }, { onConflict: "user_id" });
    if (!r.error) { reglages.attente = false; ecrire(K.reglages, reglages); }
  } else if (data && (!reglages.maj || t(data.maj_le) > t(reglages.maj))) {
    const v = data.valeurs || {}, recu = {}; CLES_REGLAGES.forEach(k => { if (v[k] !== undefined) recu[k] = v[k]; });
    reglages = { ...reglages, ...recu, maj: data.maj_le, attente: false };
    ecrire(K.reglages, reglages); appliquerTheme(); majUIapparence();
  }
}

/* ═════════════ Statistiques ═════════════ */
let periode = "7", statDu = "", statAu = "", statSerie = "pointes", statMetrique = "n";
const statsOuverts = new Set();
$("#stats-corps").addEventListener("toggle", e => {
  const d = e.target;
  if (!d.dataset || !d.dataset.pli) return;
  d.open ? statsOuverts.add(d.dataset.pli) : statsOuverts.delete(d.dataset.pli);
}, true);
const SERIES = { pointes: ["Pointés ✅", c => c.etiquete_le], saisis: ["Saisis", c => c.cree_le] };
const METRIQUES = { n: ["Colis", () => 1], v: ["m³", c => volume(c) || 0], p: ["Pièces", c => totalPieces(c)] };
const JOURS_COURTS = ["L", "M", "M", "J", "V", "S", "D"];
const JOURS_LONGS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

$("#stats-periode").addEventListener("click", e => {
  const b = e.target.closest("[data-per]"); if (!b) return;
  periode = b.dataset.per; statDu = statAu = ""; rendreStats();
});
["#stats-du", "#stats-au"].forEach(s => $(s).addEventListener("change", () => {
  statDu = $("#stats-du").value; statAu = $("#stats-au").value;
  periode = statDu || statAu ? "perso" : "7"; rendreStats();
}));
$("#stats-corps").addEventListener("click", e => {
  const s = e.target.closest("[data-serie]"), m = e.target.closest("[data-metrique]");
  if (s) { statSerie = s.dataset.serie; rendreStats(); }
  if (m) { statMetrique = m.dataset.metrique; rendreStats(); }
});

const debutJour = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
function duree(ms) {
  if (ms == null || isNaN(ms)) return "–";
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return `${h} h ${String(min % 60).padStart(2, "0")}`;
  return `${Math.round(h / 24)} j`;
}
function bornesStats() {
  const auj = debutJour(new Date()), fin = new Date(auj); fin.setDate(fin.getDate() + 1);
  let deb = new Date(0), f = fin;
  if (periode === "1") deb = auj;
  else if (periode === "hier") { deb = new Date(auj); deb.setDate(deb.getDate() - 1); f = auj; }
  else if (periode === "7" || periode === "30") { deb = new Date(auj); deb.setDate(deb.getDate() - (Number(periode) - 1)); }
  else if (periode === "mois") deb = new Date(auj.getFullYear(), auj.getMonth(), 1);
  else if (periode === "annee") deb = new Date(auj.getFullYear(), 0, 1);
  else if (periode === "perso") {
    if (statDu) deb = new Date(statDu + "T00:00");
    if (statAu) f = new Date(new Date(statAu + "T00:00").getTime() + 86400000);
  }
  return [deb.getTime(), f.getTime()];
}

function rendreStats() {
  const perso = periode === "perso";
  $$("#stats-periode button").forEach(b => b.classList.toggle("actif", !perso && b.dataset.per === periode));
  $("#stats-du").value = statDu; $("#stats-au").value = statAu;

  const tous = actifs(), [a, b] = bornesStats();
  const dans = (iso, r = [a, b]) => !!iso && t(iso) >= r[0] && t(iso) < r[1];
  const somme = arr => ({ n: arr.length, p: arr.reduce((s, c) => s + totalPieces(c), 0), v: arr.reduce((s, c) => s + (volume(c) || 0), 0) });
  const ouvert = a === 0;
  const [serieNom, serieFn] = SERIES[statSerie], [metNom, metFn] = METRIQUES[statMetrique];
  const fmt = v => statMetrique === "v" ? nf(v, 2) : np(v);
  const unite = statMetrique === "v" ? " m³" : "";

  // Cartes du haut
  const P = somme(tous.filter(c => dans(c.etiquete_le))), S = somme(tous.filter(c => dans(c.cree_le)));
  const carte = (lab, s) => `<div class="stat"><span>${lab}</span><b>${np(s.n)}</b><small>${np(s.p)} pièces, ${nf(s.v, 2)} m³</small></div>`;
  const attente = somme(tous.filter(c => c.statut === "a_etiqueter"));

  // Série choisie et graphique par jour (ou par mois si la période est longue)
  const items = tous.filter(c => dans(serieFn(c)));
  const evenements = tous.flatMap(c => [c.cree_le, c.etiquete_le]).filter(Boolean).map(t);
  const debutGraph = debutJour(ouvert ? (evenements.length ? Math.min(...evenements) : Date.now()) : a);
  const dernier = debutJour(Math.min(b - 1, Date.now()));
  const nbJours = Math.max(1, Math.round((dernier - debutGraph) / 86400000) + 1);
  const parMois = nbJours > 92, buckets = [], index = {};
  if (!parMois) for (let k = 0; k < nbJours; k++) { const d = new Date(debutGraph); d.setDate(d.getDate() + k); buckets.push({ d, key: jour(d.toISOString()), val: 0 }); }
  else for (let m = new Date(debutGraph.getFullYear(), debutGraph.getMonth(), 1); m <= dernier; m = new Date(m.getFullYear(), m.getMonth() + 1, 1))
    buckets.push({ d: new Date(m), key: `${m.getFullYear()}-${m.getMonth()}`, val: 0 });
  buckets.forEach(x => (index[x.key] = x));
  items.forEach(c => { const ev = serieFn(c), dt = new Date(ev), k = parMois ? `${dt.getFullYear()}-${dt.getMonth()}` : jour(ev); if (index[k]) index[k].val += metFn(c); });

  const barres = (vals, etiquettes, montrer) => {
    const max = Math.max(1e-9, ...vals);
    return `<div class="barres">${vals.map((v, i) => `<div class="barre-col"><span class="barre-val">${montrer && v ? fmt(v) : ""}</span><div class="barre${v ? "" : " zero"}" style="height:${v ? Math.max(6, v / max * 100) : 3}px"></div><span class="barre-lab">${etiquettes[i]}</span></div>`).join("")}</div>`;
  };
  const pas = Math.ceil(buckets.length / 6);
  const etiqGraph = buckets.map((x, i) => parMois ? x.d.toLocaleDateString("fr-FR", { month: "short" })
    : buckets.length <= 7 ? x.d.toLocaleDateString("fr-FR", { weekday: "narrow" }) : (i % pas === 0 || i === buckets.length - 1 ? x.d.getDate() : ""));
  const totalItems = items.reduce((s, c) => s + metFn(c), 0);

  // Heures et jours de la semaine
  const heures = Array(24).fill(0), semaine = Array(7).fill(0);
  items.forEach(c => { const dt = new Date(serieFn(c)); heures[dt.getHours()] += metFn(c); semaine[(dt.getDay() + 6) % 7] += metFn(c); });
  const meilleureHeure = heures.indexOf(Math.max(...heures)), meilleurJourSem = semaine.indexOf(Math.max(...semaine));

  // Moyennes
  const joursActifs = new Set(items.map(c => jour(serieFn(c)))).size;
  const It = somme(items);
  const moy = arr => arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null;
  const dPoint = moy(tous.filter(c => dans(c.etiquete_le) && c.cree_le).map(c => t(c.etiquete_le) - t(c.cree_le)));
  const lig = (lab, val, sm = "") => `<div class="rang simple"><b>${lab}</b><em>${val}</em>${sm ? `<small>${sm}</small>` : ""}</div>`;
  const moyennes = items.length ? [
    lig("Jours d'activité", np(joursActifs)),
    lig("Colis par jour d'activité", nf(It.n / joursActifs, 1)),
    lig("m³ par jour d'activité", nf(It.v / joursActifs, 2)),
    lig("Pièces par colis", np(It.p / It.n)),
    lig("m³ par colis", nf(It.v / It.n, 3)),
    lig("Délai saisie → pointage", duree(dPoint), "temps entre la note au calepin et le pointage au PC")
  ].join("") : "";

  // Records
  const jourTot = {};
  items.forEach(c => { const j = jour(serieFn(c)); const o = (jourTot[j] ||= { n: 0, v: 0, p: 0 }); o.n++; o.v += volume(c) || 0; o.p += totalPieces(c); });
  const meilleur = Object.entries(jourTot).sort((x, y) => y[1][statMetrique] - x[1][statMetrique])[0];
  const gros = [...items].sort((x, y) => (volume(y) || 0) - (volume(x) || 0))[0];
  const plusPieces = [...items].sort((x, y) => totalPieces(y) - totalPieces(x))[0];
  const desc = c => esc(`${section(c)}, ${resumeLots(c).replace(" · ", ", ")}${c.numero ? ", n° " + c.numero : ""}${c.commande ? (c.commande === STOCK ? ", stock" : ", cde " + c.commande) : ""}`);
  const records = items.length ? [
    lig("Meilleur jour", new Date(meilleur[0] + "T12:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" }), `${meilleur[1].n} colis, ${np(meilleur[1].p)} pièces, ${nf(meilleur[1].v, 2)} m³`),
    lig("Plus gros colis (m³)", `${nf(volume(gros) || 0, 2)} m³`, desc(gros)),
    lig("Plus de pièces", np(totalPieces(plusPieces)), desc(plusPieces))
  ].join("") : "";

  // Groupements
  const groupe = (fn, top = 12) => {
    const m = {};
    items.forEach(c => { const ks = fn(c); (Array.isArray(ks) ? ks : [ks]).forEach(k => { if (k) (m[k] ||= []).push(c); }); });
    return Object.entries(m).map(([k, arr]) => ({ k, ...somme(arr) })).sort((x, y) => y[statMetrique] - x[statMetrique] || y.n - x.n).slice(0, top);
  };
  const groupeLongueurs = top => {
    const m = {};
    items.forEach(c => lotsDe(c).forEach(l => {
      if (!l.longueur) return;
      const o = (m[nf(l.longueur, 2) + " m"] ||= { n: 0, p: 0, v: 0 });
      o.n++; o.p += l.pieces || 0; o.v += c.epaisseur && c.largeur ? (c.epaisseur / 1000) * (c.largeur / 1000) * l.longueur * (l.pieces || 0) : 0;
    }));
    return Object.entries(m).map(([k, o]) => ({ k, ...o })).sort((x, y) => y[statMetrique] - x[statMetrique] || y.n - x.n).slice(0, top);
  };
  const rangs = rows => rows.map(r => {
    const part = totalItems ? r[statMetrique] / totalItems * 100 : 0;
    return `<div class="rang"><b>${esc(r.k)}</b><em>${fmt(r[statMetrique])}${unite}</em>
      <span class="jauge"><i style="width:${Math.max(2, part)}%"></i></span>
      <small>${np(r.n)} colis, ${np(r.p)} pièces, ${nf(r.v, 2)} m³, ${nf(part, 0)} %</small></div>`;
  }).join("");

  const pli = (id, titre, resume, contenu) => `<details class="pli" data-pli="${id}"${statsOuverts.has(id) ? " open" : ""}><summary><span>${titre}</span>${resume ? `<em>${resume}</em>` : ""}</summary><div class="pli-corps">${contenu}</div></details>`;
  const pliGroupe = (id, titre, rows) => rows.length ? pli(id, titre, esc(rows[0].k), rangs(rows)) : "";
  const puces = (attr, obj, actif) => `<div class="filtres">${Object.entries(obj).map(([k, v]) => `<button type="button" ${attr}="${k}" class="${k === actif ? "actif" : ""}">${v[0]}</button>`).join("")}</div>`;
  const libPeriode = ouvert && periode !== "perso" ? "depuis le début" : "sur la période";

  const sousBloc = (titre, rows) => rows.length ? `<p class="mini">${titre}</p>${rangs(rows)}` : "";
  const autres = [sousBloc("Par épaisseur", groupe(c => c.epaisseur && c.epaisseur + " mm", 10)),
    sousBloc("Par longueur", groupeLongueurs(10)),
    sousBloc("Par essence, choix, nature", groupe(c => [c.essence, c.choix && "choix " + c.choix, c.nature].filter(Boolean).join(", "), 10)),
    sousBloc("Par option", groupe(c => (c.options && c.options.length ? c.options : ["Sans option"]), 10))].join("");

  $("#stats-corps").innerHTML = `
    <div class="stats-cartes">
      ${carte("Pointés ✅", P)}${carte("En attente de pointage", attente)}
    </div>
    ${pli("options", "Afficher", `${serieNom}, en ${metNom.toLowerCase()}`, puces("data-serie", SERIES, statSerie) + puces("data-metrique", METRIQUES, statMetrique))}
    ${items.length ? [
      pli("jour", parMois ? "Par mois" : "Par jour", `${fmt(totalItems)}${unite}`, `${barres(buckets.map(x => x.val), etiqGraph, buckets.length <= 14)}<p class="note-stats">${serieNom} ${libPeriode} : ${fmt(totalItems)}${unite}${statMetrique === "n" ? " colis" : ""}</p>`),
      pliGroupe("section", "Par section", groupe(c => section(c), 15)),
      pliGroupe("commande", "Par commande ou stock", groupe(c => c.commande && (c.commande === STOCK ? "Stock" : "Cde " + c.commande), 15)),
      pliGroupe("lieu", "Par lieu de stock", groupe(c => c.lieu && "Lieu " + c.lieu, 12)),
      pli("heures", "Heures et jours", `pic à ${meilleureHeure}h`,
        `<p class="mini">Par heure</p>${barres(heures, heures.map((_, h) => (h % 3 === 0 ? h + "h" : "")), false)}<p class="note-stats">Heure la plus chargée : ${meilleureHeure}h à ${meilleureHeure + 1}h.</p>
         <p class="mini">Par jour de la semaine</p>${barres(semaine, JOURS_COURTS, true)}<p class="note-stats">Jour le plus chargé : ${JOURS_LONGS[meilleurJourSem]}.</p>`),
      pli("moyennes", "Moyennes", `${nf(It.n / joursActifs, 1)} colis par jour`, moyennes),
      pli("records", "Records", "", records),
      autres ? pli("autres", "Épaisseur, longueur, essence, option", "", autres) : ""
    ].join("") : `<div class="vide-liste">Aucun colis ${serieNom.toLowerCase().replace(" ✅", "")} sur cette période.</div>`}`;
}

/* ═════════════ Export CSV ═════════════ */
$("#btn-export").addEventListener("click", () => {
  const cols = [["numero", "N° étiquette"], ["commande", "Commande"], ["lieu", "Lieu de stock"], ["epaisseur", "Épaisseur"],
    ["largeur", "Largeur"], ["longueur", "Longueur (m)"], ["pieces", "Pièces"], ["detail", "Détail des longueurs"], ["volume", "Volume (m3)"], ["essence", "Essence"],
    ["choix", "Choix"], ["nature", "Nature"], ["options", "Options"], ["ref_client", "Réf. client"], ["observation", "Observation"],
    ["statut", "Statut"], ["cree_le", "Saisi le"], ["etiquete_le", "Pointé le"]];
  const cell = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const dt = iso => iso ? new Date(iso).toLocaleString("fr-FR") : "";
  const lignes = actifs().sort((a, b) => t(a.cree_le) - t(b.cree_le)).map(c => cols.map(([k]) =>
    cell(k === "volume" ? nf(volume(c), 3) : k === "longueur" ? lotsDe(c).map(l => nf(l.longueur, 2)).join(" + ") : k === "pieces" ? totalPieces(c) : k === "detail" ? (plusieursLongueurs(c) ? lotsTxt(c) : "") : k === "options" ? (c.options || []).join(" ")
      : k === "commande" ? (c.commande === STOCK ? "Stock" : c.commande) : k === "statut" ? STATUTS[c.statut] : k.endsWith("_le") ? dt(c[k]) : c[k])).join(";"));
  const csv = "\uFEFF" + [cols.map(([, l]) => cell(l)).join(";"), ...lignes].join("\r\n");
  donnerFichier(new Blob([csv], { type: "text/csv;charset=utf-8" }), `colis-sdc-${jour(maintenant())}.csv`, "Colis SDC (Excel)");
});
$("#btn-sauvegarde").addEventListener("click", async () => {
  const blob = new Blob([JSON.stringify({ appli: "colis-sdc", date: maintenant(), colis: liste, reglages: valeursReglages() })], { type: "application/json" });
  const r = await donnerFichier(blob, `colis-sdc-sauvegarde-${jour(maintenant())}.json`, "Sauvegarde Colis SDC");
  if (r !== "annule") { ecrire(K.sauvegarde, maintenant()); majEtat(); toast("Sauvegarde enregistrée"); }
});
$("#btn-restaurer").addEventListener("click", () => $("#restaurer-input").click());
$("#restaurer-input").addEventListener("change", async e => {
  const f = e.target.files && e.target.files[0]; e.target.value = ""; if (!f) return;
  try {
    const d = JSON.parse(await f.text()), arr = Array.isArray(d) ? d : d.colis;
    if (!Array.isArray(arr) || !arr.length || !arr.every(c => c && c.id)) throw new Error("vide");
    let n = 0;
    for (const c of arr) { // on garde, pour chaque colis, la version la plus récente
      const loc = parId(c.id);
      if (loc && t(c.maj_le) <= t(loc.maj_le)) continue;
      if (loc) liste[liste.indexOf(loc)] = c; else liste.push(c);
      attente.add(c.id); n++;
    }
    migrer(); sauverLocal(); rafraichir(); synchroniser();
    toast(n ? `${n} colis restauré${n > 1 ? "s" : ""}` : "Rien à restaurer : tout est déjà à jour");
  } catch { toast("Fichier de sauvegarde illisible."); }
});

/* ═════════════ Démarrage ═════════════ */
function rafraichir() {
  rendreCalepin();
  if (vueActive === "accueil") rendreAccueil();
  if (vueActive === "stats") rendreStats();
  if (vueActive === "colis") rendreListe();
  if (ficheId && !$("#fiche").hidden) rendreFiche();
  majEtat();
}
sauverLocal(); // enregistre les anciennes données déjà converties
appliquerTheme(); majUIapparence();
document.body.classList.toggle("sans-photo", CFG.PHOTO === false);
formVierge();
allerA("accueil");
rendreCalepin();
initSynchro();
if ("serviceWorker" in navigator) {
  const avait = !!navigator.serviceWorker.controller;
  addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  // une nouvelle version prend la main : on recharge une fois, sans avoir à rouvrir l'appli
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (avait && !window.__rechargee) { window.__rechargee = true; location.reload(); } });
}
// Bouton « Mettre à jour » : vide le cache de l'appli (tes colis ne sont pas touchés) et recharge
$("#btn-maj").addEventListener("click", async () => {
  try {
    if ("serviceWorker" in navigator) (await navigator.serviceWorker.getRegistrations()).forEach(r => r.unregister());
    if (window.caches) (await caches.keys()).filter(k => k !== "colis-libs").forEach(k => caches.delete(k));
  } catch (e) { /* tant pis */ }
  location.reload();
});
// Décor : feuilles et fond
$("#deco-feuilles").addEventListener("click", e => { const b = e.target.closest("[data-niv]"); if (b) changerDeco({ feuilles: Number(b.dataset.niv) }); });
$("#deco-fond").addEventListener("click", e => { const b = e.target.closest("[data-flou]"); if (b) changerDeco({ flou: b.dataset.flou === "1" }); });
appliquerDeco();
// Pas de zoom à deux doigts (le double appui est déjà bloqué par le CSS)
["gesturestart", "gesturechange", "gestureend"].forEach(n => document.addEventListener(n, e => e.preventDefault()));
})();
