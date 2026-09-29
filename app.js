(() => {
"use strict";

const CFG = window.COLIS_CONFIG || {};
const DEF = Object.assign({ essence: "", choix: "20", nature: "G", options: [] }, CFG.DEFAUTS || {});
const OPTIONS = CFG.OPTIONS || { TR: "Fongi. coloré", CR: "Cœur refendu" };
const K = { reglages: "colis.reglages.v1", data: "colis.donnees.v1", attente: "colis.attente.v1", tire: "colis.tire.v1", memo: "colis.memo.v1", synchro: "colis.synchroOk.v1" };
const STOCK = "STOCK"; // un colis « du stock » n'a pas de commande : sa commande vaut STOCK
const cdeTxt = c => c.commande === STOCK ? "Stock" : "Cde " + (c.commande || "–");
const STATUTS = { a_etiqueter: "En attente de pointage", a_sortir: "Pointé ✅", sorti: "Sorti" };
const STATUT_COURT = { a_etiqueter: "En attente", a_sortir: "Pointé ✅", sorti: "Sorti" };
const COLONNES = ["id","numero","commande","lieu","epaisseur","largeur","longueur","pieces","choix","essence","nature",
  "options","ref_client","observation","statut","cree_le","etiquete_le","sorti_le","maj_le","supprime"];

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ═════════════ Stockage local ═════════════ */
function lire(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }
function ecrire(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { toast("Mémoire de l'appareil pleine : exporte puis synchronise."); } }

let liste = lire(K.data, []);
let attente = new Set(lire(K.attente, []));
function sauverLocal() { ecrire(K.data, liste); ecrire(K.attente, [...attente]); }
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
function volume(c) {
  if (!c.epaisseur || !c.largeur || !c.longueur || !c.pieces) return null;
  return (c.epaisseur / 1000) * (c.largeur / 1000) * c.longueur * c.pieces;
}
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
document.addEventListener("input", e => {
  const el = e.target;
  if (el.id === "f-numero" || el.id === "pc-numero" || el.id === "fiche-numero") { const f = formatNumero(el.value); if (f !== el.value) el.value = f; }
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
function allerA(vue) {
  vueActive = vue;
  $$(".vue").forEach(s => (s.hidden = s.id !== "vue-" + vue));
  $$(".onglets button").forEach(b => b.classList.toggle("actif", b.dataset.vue === vue));
  majTitre();
  if (vue === "colis") rendreListe();
  if (vue === "reglages") { majEtat(); majUIapparence(); }
  if (vue === "stats") rendreStats();
  window.scrollTo(0, 0);
}
function majTitre() {
  $("#entete-titre").textContent = { nouveau: editionId ? "Modifier le colis" : "Calepin", colis: "Colis", stats: "Statistiques", reglages: "Réglages" }[vueActive];
}
$$(".onglets button").forEach(b => b.addEventListener("click", () => allerA(b.dataset.vue)));

/* Feuilles */
let ficheId = null;
function montrer(sel) { $(sel).hidden = false; document.body.style.overflow = "hidden"; }
function cacher(sel) {
  $(sel).hidden = true;
  if ($("#fiche").hidden && $("#pc").hidden) document.body.style.overflow = "";
  if (sel === "#fiche") ficheId = null;
}
$$(".feuille").forEach(f => f.addEventListener("click", e => { if (e.target.closest("[data-fermer]")) cacher("#" + f.id); }));
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  if (!$("#pc").hidden) cacher("#pc"); else if (!$("#fiche").hidden) cacher("#fiche");
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

function remplirForm(c) {
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
  rendrePuces(); majLive();
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
$("#form-colis").addEventListener("input", majLive);
$("#alerte-numero").addEventListener("click", e => { const b = e.target.closest("[data-ouvrir]"); if (b) ouvrirFiche(b.dataset.ouvrir); });

$(".stepper").addEventListener("click", e => {
  const b = e.target.closest("[data-pas]"); if (!b) return;
  const n = Math.max(0, (num(F("pieces").value) || 0) + Number(b.dataset.pas));
  F("pieces").value = n || ""; majLive();
});

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
      etiquete_le: v.numero ? maintenant() : null, sorti_le: null, supprime: false };
  }
  enregistrer(c);
  ecrire(K.memo, { t: Date.now(), commande: v.commande, lieu: v.lieu, ref_client: v.ref_client });
  return c;
}

function apresSauvegarde() {
  if (editionId) { finEdition(); return; }
  // colis suivant de la même commande : on garde tout sauf le n° et l'observation
  ["epaisseur", "largeur", "longueur", "pieces", "numero", "observation"].forEach(k => (F(k).value = ""));
  majLive(); window.scrollTo({ top: 0, behavior: "smooth" });
  if (matchMedia("(pointer: fine)").matches) F("epaisseur").focus();
}

$("#form-colis").addEventListener("submit", e => {
  e.preventDefault();
  const etaitEdition = !!editionId;
  const c = sauverForm(); if (!c) return;
  apresSauvegarde();
  if (etaitEdition) { allerA("colis"); ouvrirFiche(c.id); return; }
  toast(`Dans le calepin : ${section(c)}, ${np(c.pieces)} p`, "Annuler", () => enregistrer({ ...parId(c.id), supprime: true }));
});
$("#btn-suivant").addEventListener("click", () => {
  const etaitEdition = !!editionId;
  const c = sauverForm(); if (!c) return;
  apresSauvegarde();
  toast(etaitEdition ? "Modifications enregistrées" : `Colis ${section(c)} enregistré`, "Voir", () => ouvrirFiche(c.id));
});
$("#btn-nouvelle-cde").addEventListener("click", () => {
  F("commande").value = ""; F("lieu").value = ""; F("ref").value = "";
  localStorage.removeItem(K.memo); F("commande").focus(); majLive();
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
const normaliser = s => String(s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/(\d)\s*[x×*]\s*(\d)/g, "$1x$2").trim();
function cle(c) {
  return normaliser([c.numero, (c.numero || "").replace(/\D/g, ""), c.commande, c.lieu, `${c.epaisseur}x${c.largeur}`, longueurCourte(c.longueur),
    nf(c.longueur, 2), c.pieces, c.ref_client, c.observation, (c.options || []).join(" "),
    dh(c.cree_le), dh(c.etiquete_le), dh(c.sorti_le), STATUTS[c.statut]].join(" | "));
}

function ligne(c) {
  const vol = volume(c);
  const act = c.statut === "a_sortir" ? `<button type="button" class="action-rapide" data-action="sortir">Sortir</button>`
    : c.statut === "a_etiqueter" ? `<button type="button" class="action-rapide num-btn" data-action="pc">Pointer</button>` : "";
  const histo = c.statut === "a_etiqueter" ? `Noté le ${dh(c.cree_le)}`
    : `Pointé le ${dh(c.etiquete_le || c.cree_le)}${c.statut === "sorti" && c.sorti_le ? `, sorti le ${dh(c.sorti_le)}` : ""}`;
  return `<article class="colis st-${c.statut}" data-id="${c.id}" tabindex="0">
    ${c.numero ? `<span class="num">${esc(c.numero)}</span>` : `<span class="num vide">En attente du n°</span>`}
    <span class="desc"><b>${esc(section(c))}</b> &nbsp;${esc(nf(c.longueur, 2))} m, ${np(c.pieces)} p${vol ? `, ${nf(vol, 3)} m³` : ""}</span>
    <span class="meta">${c.commande || c.lieu ? `${esc(cdeTxt(c))}, lieu ${esc(c.lieu || "–")}` : "Commande et lieu à voir au PC"}</span>
    <span class="meta">${esc(histo)}</span>
    <span class="droite"><span class="statut ${c.statut}">${STATUT_COURT[c.statut]}</span>${act}</span>
  </article>`;
}
function totaux(arr) {
  const p = arr.reduce((s, c) => s + (c.pieces || 0), 0);
  const v = arr.reduce((s, c) => s + (volume(c) || 0), 0);
  const as = arr.filter(c => c.statut === "a_sortir").length, so = arr.filter(c => c.statut === "sorti").length;
  const ae = arr.filter(c => c.statut === "a_etiqueter").length;
  const st = [ae && `${ae} en attente`, as && `${as} pointé${as > 1 ? "s" : ""}`, so && `${so} sorti${so > 1 ? "s" : ""}`].filter(Boolean).join(", ");
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
  $("#btn-photo").hidden = !aEtiq.length;
  bpc.textContent = `Pointer au PC : ${aEtiq.length} en attente`;

  const q = normaliser($("#recherche").value);
  const mots = q.split(/\s+/).filter(Boolean);
  let res = tous.filter(c =>
    (mots.length || filtre === "tous" || c.statut === filtre) &&
    (!filtreDate || [c.cree_le, c.etiquete_le, c.sorti_le].some(x => x && jour(x) === filtreDate)) &&
    (!mots.length || (k => mots.every(m => k.includes(m)))(cle(c))));
  res.sort((a, b) => t(b.cree_le) - t(a.cree_le));

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
  } else if (filtre === "a_sortir" && !mots.length) {
    const lieux = {};
    res.forEach(c => (lieux[c.lieu || "Sans lieu"] ||= []).push(c));
    Object.keys(lieux).sort((a, b) => a.localeCompare(b, "fr", { numeric: true })).forEach(l => {
      html += `<div class="groupe"><h3>Lieu ${esc(l)}</h3><span>${totaux(lieux[l])}</span></div>` + lieux[l].map(ligne).join("");
    });
    res = [];
  }
  html += res.map(ligne).join("");
  el.innerHTML = html;
}

$("#recherche").addEventListener("input", rendreListe);
$("#filtres").addEventListener("click", e => {
  const b = e.target.closest("[data-filtre]"); if (!b) return;
  filtre = b.dataset.filtre; rendreListe();
});
$("#btn-file-pc").addEventListener("click", () => ouvrirPC(filePCTous()));
["#liste", "#calepin-liste"].forEach(sel => $(sel).addEventListener("click", e => {
  const aller = e.target.closest("[data-aller]"); if (aller) { allerA(aller.dataset.aller); return; }
  if (e.target.closest("[data-voir]")) { filtre = "a_sortir"; rendreListe(); return; }
  const art = e.target.closest(".colis"); if (!art) return;
  const act = e.target.closest("[data-action]");
  if (act?.dataset.action === "sortir") sortir(art.dataset.id);
  else if (act?.dataset.action === "pc") ouvrirPC([art.dataset.id]);
  else ouvrirFiche(art.dataset.id);
}));
["#liste", "#calepin-liste"].forEach(sel => $(sel).addEventListener("keydown", e => {
  if (e.key === "Enter" && e.target.classList.contains("colis")) ouvrirFiche(e.target.dataset.id);
}));
$("#btn-pointer").addEventListener("click", () => ouvrirPC(filePCTous()));
function rendreCalepin() {
  const ids = filePCTous(), arr = ids.map(parId).reverse();
  $("#btn-pointer").hidden = !ids.length;
  $("#btn-pointer").textContent = `Pointer au PC : ${ids.length} en attente`;
  $("#calepin").hidden = !ids.length;
  $("#calepin-total").textContent = ids.length ? `${ids.length} colis, ${np(arr.reduce((s, c) => s + (c.pieces || 0), 0))} pièces` : "";
  $("#calepin-liste").innerHTML = arr.map(ligne).join("");
}

/* ═════════════ Statuts ═════════════ */
function sortir(id) {
  const c = { ...parId(id), statut: "sorti", sorti_le: maintenant() };
  enregistrer(c);
  toast(`Colis ${c.numero || section(c)} sorti`, "Annuler", () => annulerSortie(id));
}
function annulerSortie(id) {
  const o = parId(id);
  enregistrer({ ...o, statut: o.numero ? "a_sortir" : "a_etiqueter", sorti_le: null });
}
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
  else if (c.statut === "a_sortir") actions = `<button type="button" class="btn btn-sortir" data-f="sortir">Marquer sorti</button>`;
  else actions = `<button type="button" class="btn btn-secondaire" data-f="annuler-sortie">Annuler la sortie</button>`;

  $("#fiche-corps").innerHTML = `
    <span class="statut ${c.statut}">${STATUTS[c.statut]}</span>
    <p class="fiche-section" style="margin-top:10px">${esc(section(c))}</p>
    <p class="fiche-sous">${np(c.pieces)} pièces de ${esc(nf(c.longueur, 2))} m${vol ? `, ${nf(vol, 3)} m³` : ""}</p>
    <div class="grille-infos">
      ${info(c.commande === STOCK ? "Type" : "Commande", c.commande === STOCK ? "Stock" : (c.commande || "–"))}${info("Lieu de stock", c.lieu || "–")}
      ${info("Essence", c.essence)}${info("Choix", c.choix)}${info("Nature", c.nature)}
      ${info("Options", (c.options || []).join(" "))}
      ${info("Référence client", c.ref_client, true)}${info("Observation", c.observation, true)}
    </div>
    <ul class="chrono">
      <li><span>Saisi</span><span>${dateLongue(c.cree_le)}</span></li>
      <li class="${c.etiquete_le ? "" : "futur"}"><span>Pointé</span><span>${c.etiquete_le ? dateLongue(c.etiquete_le) : "pas encore"}</span></li>
      <li class="${c.sorti_le ? "" : "futur"}"><span>Sorti</span><span>${c.sorti_le ? dateLongue(c.sorti_le) : "pas encore"}</span></li>
    </ul>
    <div class="actions">
      ${actions}
      <div class="boutons-2">
        <button type="button" class="btn btn-secondaire" data-f="pc">À taper sur le PC</button>
        <button type="button" class="btn btn-secondaire" data-f="imprimer">Imprimer la copie</button>
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
$("#fiche-corps").addEventListener("click", e => {
  const b = e.target.closest("[data-f]"); if (!b) return;
  const id = ficheId, c = parId(id);
  switch (b.dataset.f) {
    case "numero": validerNumeroFiche(); break;
    case "sortir": sortir(id); break;
    case "annuler-sortie": annulerSortie(id); break;
    case "pc": ouvrirPC([id]); break;
    case "imprimer": imprimer(id); break;
    case "modifier": commencerEdition(id); break;
    case "dupliquer": {
      finEdition();
      remplirForm({ ...c, numero: "", observation: "" });
      cacher("#fiche"); allerA("nouveau");
      toast("Copie prête : vérifie puis enregistre"); break;
    }
    case "supprimer":
      if (!confirm(`Supprimer le colis ${c.numero || section(c)} ?`)) return;
      enregistrer({ ...c, supprime: true }); cacher("#fiche");
      toast("Colis supprimé", "Annuler", () => enregistrer({ ...parId(id), supprime: false }));
      break;
  }
});

/* ═════════════ Pointage au PC : commande, lieu, options, n° ═════════════ */
let filePC = [], posPC = 0, dernierPC = null, pcOptions = new Set(), pcType = "cde";
const lectures = {}; // ce que la photo de l'étiquette a lu, par colis
const filePCTous = () => actifs().filter(c => c.statut === "a_etiqueter").sort((a, b) => t(a.cree_le) - t(b.cree_le)).map(c => c.id);
const PC = id => $("#pc-" + id);
function ouvrirPC(ids) { filePC = ids; posPC = 0; rendrePC(); montrer("#pc"); }

function rendrePC() {
  const c = parId(filePC[posPC]); if (!c) { cacher("#pc"); return; }
  const d = dernierPC || {}, lec = lectures[c.id];
  pcOptions = new Set(c.options && c.options.length ? c.options : lec ? lec.options : (c.numero ? [] : (d.options || [])));
  const brut = c.commande || d.commande || "", lieu = c.lieu || (lec && lec.lieu) || d.lieu || "", ref = c.ref_client || d.ref_client || "";
  pcType = brut === STOCK ? "stock" : "cde";
  const commande = brut === STOCK ? "" : brut;
  const essenceVal = (lec && lec.essence) || c.essence || "";
  const essencesHtml = essencesConnues().map(x => `<button type="button" class="puce" data-ess="${esc(x)}" aria-pressed="${x === essenceVal.toUpperCase()}">${esc(x)}</button>`).join("");
  const lieuxHtml = lieuxConnus().map(l => `<button type="button" class="puce" data-lieu="${esc(l)}" aria-pressed="false">${esc(l)}</button>`).join("");
  const plusieurs = filePC.length > 1;
  const cell = (lab, id, cls = "") => `<div class="${cls}"><span>${lab}</span><b id="t-${id}" class="vide">—</b></div>`;
  $("#pc-corps").innerHTML = `
    ${plusieurs ? `<div class="file-pc"><span>Colis ${posPC + 1} sur ${filePC.length}</span>
      <span><button type="button" class="lien" data-p="prec" ${posPC ? "" : "hidden"}>Précédent</button>
      <button type="button" class="lien" data-p="suiv" ${posPC < filePC.length - 1 ? "" : "hidden"}>Passer</button></span></div>` : ""}
    ${bandeauLecture(lec, c)}
    <p class="fiche-section" style="font-size:34px">${esc(section(c))}</p>
    <p class="fiche-sous">${np(c.pieces)} pièces de ${esc(nf(c.longueur, 2))} m</p>
    <div class="carte carte-or">
      <div class="segment" id="pc-type">
        <button type="button" data-type="cde" aria-pressed="true">Commande</button>
        <button type="button" data-type="stock" aria-pressed="false">Stock</button>
      </div>
      <div class="ligne-2" id="pc-ligne">
        <label class="champ" id="pc-champ-commande"><span>N° commande</span><input id="pc-commande" inputmode="numeric" placeholder="34114" value="${esc(commande)}"></label>
        <label class="champ"><span id="pc-lieu-lab">Lieu de stock</span><input id="pc-lieu" class="majuscules" placeholder="G7" autocapitalize="characters" value="${esc(lieu)}"></label>
      </div>
      ${lieuxHtml ? `<div id="pc-lieux"><span class="etiquette-champ">Lieux récents</span><div class="puces">${lieuxHtml}</div></div>` : ""}
      <label class="champ"><span>Essence</span><input id="pc-essence" class="majuscules" autocapitalize="characters" placeholder="S" value="${esc(essenceVal)}"></label>
      ${essencesHtml ? `<div class="puces" id="pc-essences">${essencesHtml}</div>` : ""}
      <span class="etiquette-champ">Options</span>
      <div class="puces" id="pc-options">${Object.entries(OPTIONS).map(([k, lib]) =>
        `<button type="button" class="puce" data-popt="${esc(k)}" aria-pressed="${pcOptions.has(k)}">${esc(k)} <small>${esc(lib)}</small></button>`).join("")}</div>
      <details class="details">
        <summary><span>Plus de détails</span></summary>
        <div class="ligne-2">
          <label class="champ"><span>Choix</span><input id="pc-choix" inputmode="numeric" value="${esc((lec && lec.choix) || c.choix || DEF.choix)}"></label>
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
      <button type="button" class="btn btn-secondaire" data-p="modifier">✏️ Corriger la note (section, pièces, longueur)</button>
      <button type="button" class="btn btn-secondaire" data-p="photo">📷 Photo de l'étiquette</button>
      <button type="button" class="btn btn-secondaire" data-p="imprimer">Imprimer la copie de l'étiquette</button>
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
function lieuxConnus() {
  const n = {};
  actifs().forEach(c => { if (c.lieu) n[c.lieu] = (n[c.lieu] || 0) + 1; });
  const frequents = Object.entries(n).sort((x, y) => y[1] - x[1]).map(x => x[0]);
  return [...new Set([...(CFG.LIEUX || []), ...frequents])].slice(0, 16);
}
function majChipsLieu() {
  const v = PC("lieu").value.trim().toUpperCase();
  $$("#pc-lieux [data-lieu]").forEach(b => b.setAttribute("aria-pressed", b.dataset.lieu === v));
}
function appliquerTypePC() {
  const stock = pcType === "stock";
  $$("#pc-type [data-type]").forEach(b => b.setAttribute("aria-pressed", b.dataset.type === pcType));
  $("#pc-champ-commande").hidden = stock;
  $("#pc-ligne").classList.toggle("une-colonne", stock);
  majChipsLieu();
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
  set("epaisseur", c.epaisseur); set("largeur", c.largeur); set("pieces", np(c.pieces)); set("longueur", longueurCourte(c.longueur));
  set("essence", ch.essence); set("choix", ch.choix); set("nature", ch.nature); set("lieu", ch.lieu);
  set("options", ch.options.join("  ")); set("ref", ch.ref_client);
}
function sauverChampsPC(extra = {}) {
  const c = { ...parId(filePC[posPC]), ...champsPC(), ...extra };
  enregistrer(c);
  if (c.commande || c.lieu) dernierPC = { commande: c.commande, lieu: c.lieu, options: c.options, ref_client: c.ref_client };
  return c;
}
let avertiNumero = "";
function validerNumeroPC() {
  const a = $("#pc-alerte"), erreur = m => { a.textContent = m; a.hidden = false; };
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
  const li = e.target.closest("[data-lieu]");
  if (li) { PC("lieu").value = li.dataset.lieu; majChipsLieu(); majTerminal(); return; }
  const o = e.target.closest("[data-popt]");
  if (o) {
    const k = o.dataset.popt; pcOptions.has(k) ? pcOptions.delete(k) : pcOptions.add(k);
    o.setAttribute("aria-pressed", pcOptions.has(k)); majTerminal(); return;
  }
  const b = e.target.closest("[data-p]"); if (!b) return;
  const p = b.dataset.p;
  if (p === "valider") validerNumeroPC();
  if (p === "imprimer") { const c = sauverChampsPC(); imprimer(c.id); }
  if (p === "photo") { photoCible = filePC[posPC]; $("#photo-input").click(); }
  if (p === "modifier") { garderPC(); const id = filePC[posPC]; cacher("#pc"); commencerEdition(id); }
  if (p === "prendre") { garderPC(); const id = filePC[posPC], l = lectures[id]; if (l && l.spec) appliquerSpec(id, l.spec); rendrePC(); }
  if (p === "desinverser") { // annuler la correction faite d'après l'étiquette
    garderPC(); const id = filePC[posPC], l = lectures[id];
    if (l && l.avant) { enregistrer({ ...parId(id), ...l.avant }); l.corrige = false; l.avant = null; l.verifs = Lecture.verifier(parId(id), l.texte); }
    rendrePC();
  }
  if (p === "suiv") { garderPC(); posPC++; rendrePC(); }
  if (p === "prec") { garderPC(); posPC--; rendrePC(); }
});
$("#pc-corps").addEventListener("input", e => {
  majTerminal();
  if (e.target.id === "pc-lieu") majChipsLieu();
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
async function preparerImage(fichier) {
  let img;
  try { img = await createImageBitmap(fichier, { imageOrientation: "from-image" }); }
  catch { img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = URL.createObjectURL(fichier); }); }
  const L = img.width || img.naturalWidth, H = img.height || img.naturalHeight, k = Math.min(1, 2000 / Math.max(L, H));
  const cv = document.createElement("canvas"); cv.width = Math.round(L * k); cv.height = Math.round(H * k);
  const ctx = cv.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, cv.width, cv.height);
  const data = ctx.getImageData(0, 0, cv.width, cv.height), p = data.data;
  for (let i = 0; i < p.length; i += 4) { // gris + un peu de contraste : le texte noir ressort mieux
    let g = (0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2] - 128) * 1.3 + 128;
    p[i] = p[i + 1] = p[i + 2] = g < 0 ? 0 : g > 255 ? 255 : g;
  }
  ctx.putImageData(data, 0, 0);
  return cv;
}
let photoCible = null; // colis affiché au pointage quand la photo est prise depuis cet écran
async function lireEtiquette(fichier, cible) {
  if (!filePCTous().length) { toast("Aucun colis en attente de pointage."); return; }
  let worker;
  try {
    etatLecture("Préparation de la photo…");
    const image = await preparerImage(fichier);
    etatLecture("Chargement du lecteur (la première fois, ça peut être long)…");
    const T = await chargerTesseract();
    let passe = 0;
    worker = await T.createWorker("eng", 1, { logger: m => { if (m.status === "recognizing text") etatLecture(`Lecture de l'étiquette… ${Math.round(((passe - 1) + m.progress) / 2 * 100)} %`); } });
    let texte = "";
    for (const psm of ["6", "11"]) { // deux façons de lire : on garde ce que chacune a compris
      passe++; await worker.setParameters({ tessedit_pageseg_mode: psm });
      texte += "\n" + (await worker.recognize(image)).data.text;
    }
    etatLecture(null);
    traiterLecture(texte, cible);
  } catch (err) {
    etatLecture(null);
    toast(err && err.message ? err.message : "Lecture impossible : réessaie avec une photo plus nette.");
  } finally { if (worker) worker.terminate().catch(() => {}); }
}
const CHAMPS_NOTE = ["epaisseur", "largeur", "pieces", "longueur"];
const differe = (spec, c) => CHAMPS_NOTE.some(k => spec[k] !== c[k]);
function appliquerSpec(id, spec) { // l'étiquette fait foi : la note est remplacée (annulable)
  const c = parId(id), l = lectures[id];
  const avant = Object.fromEntries(CHAMPS_NOTE.map(k => [k, c[k]]));
  enregistrer({ ...c, ...Object.fromEntries(CHAMPS_NOTE.map(k => [k, spec[k]])) });
  if (l) { l.avant = avant; l.corrige = true; l.spec = null; l.verifs = Lecture.verifier(parId(id), l.texte); }
}
function traiterLecture(texte, cible) {
  const attente = filePCTous().map(parId);
  const champs = Lecture.lireChamps(texte, ESSENCE_INVERSE), spec = Lecture.lireSpec(texte);
  const numero = champs.numero ? formatNumero(champs.numero) : "";

  // 1. Quel colis ? Celui affiché au pointage, sinon celui qui ressemble le plus à l'étiquette
  let colis = cible && parId(cible) && parId(cible).statut === "a_etiqueter" ? parId(cible) : null;
  if (!colis && spec && !spec.partiel) { const r = Lecture.correspondance(spec, attente); if (r) colis = r.colis; }
  if (!colis) { const r = Lecture.trouver(texte, attente); if (r) colis = r.colis; }
  if (!colis && spec && spec.partiel) {
    const memeSection = attente.filter(c => Lecture.verifier(c, texte).section);
    colis = memeSection.find(c => c.pieces === spec.pieces || c.longueur === spec.longueur) || memeSection[0] || null;
  }
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
  lectures[id] = { numero, lieu: champs.lieu, choix: champs.choix, essence: champs.essence, essenceCode: champs.essenceCode, options: champs.options, dateIso, texte, spec: null, corrige: false, avant: null, verifs: null };

  // 2. L'étiquette corrige la note toute seule (section, pièces, longueur) — annulable
  const c0 = parId(id), avant = Object.fromEntries(CHAMPS_NOTE.map(k => [k, c0[k]]));
  const nouveau = spec ? Object.fromEntries(CHAMPS_NOTE.filter(k => spec[k] != null).map(k => [k, spec[k]])) : {};
  if (!spec && Lecture.verifier(c0, texte).inverse) { nouveau.pieces = c0.longueur; nouveau.longueur = c0.pieces; }
  if (Object.keys(nouveau).some(k => nouveau[k] !== c0[k])) {
    enregistrer({ ...c0, ...nouveau });
    Object.assign(lectures[id], { avant, corrige: true });
  }
  lectures[id].verifs = Lecture.verifier(parId(id), texte);

  const ids = filePCTous();
  filePC = ids; posPC = Math.max(0, ids.indexOf(id));
  rendrePC(); montrer("#pc");
  toast(lectures[id].corrige ? "Note corrigée d'après l'étiquette" : numero ? `N° ${numero} ajouté` : "Étiquette lue");
}
function bandeauLecture(lec, c) {
  if (!lec) return "";
  const v = lec.verifs, tout = v.section && v.pieces && v.longueur && v.volume && lec.numero && lec.numero.replace(/\D/g, "").length >= 7;
  const lignes = [["Section", v.section], ["Pièces", v.pieces], ["Longueur", v.longueur], ["Volume", v.volume]];
  const txt = x => `${x.epaisseur} × ${x.largeur}, ${np(x.pieces)} pièces de ${nf(x.longueur, 2)} m`;
  return `<div class="lecture${tout ? "" : " attention"}"><b>📷 Lu sur l'étiquette</b>
    <p>${lec.numero ? "n° <b>" + esc(lec.numero) + "</b>" + (lec.numero.replace(/\D/g, "").length < 7 ? " (fin du n° non lue : ajoute-la)" : "") : "n° non lu : tape-le ci-dessous"}${lec.lieu ? ", lieu " + esc(lec.lieu) : ""}${lec.dateIso ? ", imprimée le " + esc(dh(lec.dateIso)) : ""}</p>
    ${lec.corrige && lec.avant ? `<p class="ecart"><b>✔ Corrigé d'après l'étiquette :</b> ${CHAMPS_NOTE.filter(k => lec.avant[k] !== c[k]).map(k => `${{ epaisseur: "épaisseur", largeur: "largeur", pieces: "pièces", longueur: "longueur" }[k]} ${k === "longueur" ? nf(lec.avant[k], 2) : np(lec.avant[k])} → <b>${k === "longueur" ? nf(c[k], 2) : np(c[k])}</b>`).join(", ")}. <button type="button" class="lien" data-p="desinverser">Annuler</button></p>` : ""}
    ${lec.spec ? `<p class="ecart"><b>≠ L'étiquette dit</b> ${esc(txt(lec.spec))} (ta note : ${esc(txt(c))}). <button type="button" class="lien" data-p="prendre">Prendre l'étiquette</button></p>` : ""}
    ${lec.essenceCode && !lec.essence ? `<p class="note-stats">Essence lue sur l'étiquette : « ${esc(lec.essenceCode)} ». Choisis la lettre du terminal.</p>` : ""}
    <div class="verifs">${lignes.map(([l, ok]) => `<i class="${ok ? "ok" : "ko"}">${l} ${ok ? "✔" : "?"}</i>`).join("")}</div>
    ${tout ? "" : `<p class="note-stats">Un « ? » veut dire non lu ou différent de ta note : compare avec l'étiquette avant de pointer.</p>`}</div>`;
}
$("#photo-input").addEventListener("change", e => { const f = e.target.files && e.target.files[0]; e.target.value = ""; const cible = photoCible; photoCible = null; if (f) lireEtiquette(f, cible); });
$("#btn-photo").addEventListener("click", () => { photoCible = null; $("#photo-input").click(); });

/* ═════════════ Copie d'étiquette imprimable ═════════════ */
function htmlEtiquette(c) {
  const ess = (CFG.ESSENCE_ETIQUETTE || {})[c.essence] || c.essence || "";
  const d = new Date(c.etiquete_le || c.cree_le), p2 = n => String(n).padStart(2, "0");
  const dt = `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)} ${p2(d.getHours())}${p2(d.getMinutes())}`;
  const vol = volume(c);
  const dim = CFG.ETIQUETTE_MM || { largeur: 190, hauteur: 62 };
  const traite = (c.options || []).includes("TR");
  return `<div class="etq" style="--etq-l:${dim.largeur}mm;--etq-h:${dim.hauteur}mm">
    <div class="g"><div class="nom">Les SCIERIES du CENTRE</div><div class="sdc">SDC</div><div class="tel">33 (0)4.73.84.65.13</div></div>
    <div class="m">
      <div class="sec">${esc(c.epaisseur)} x ${esc(c.largeur)}</div>
      <div class="l2">${esc(c.pieces)} P <span class="lg">${esc(nf(c.longueur, 2))}</span> m</div>
      <div class="l3"><span>${esc(c.choix)} ${esc(ess)} ${esc(c.lieu)}</span><small>${vol ? nf(vol, 3) + " m3" : ""}</small></div>
      <div class="opt">${esc((c.options || []).join(" "))}</div>
      <div class="no">${esc(c.numero || "______")}</div>
      <div class="bas"><span>${esc(c.pieces)}/${Math.round((c.longueur || 0) * 100)}</span><span>${dt}</span><span>${c.commande ? esc(c.commande === STOCK ? "Stock" : "Cde " + c.commande) : ""}</span></div>
    </div>
    <div class="d">
      <div class="centre">Les Scieries du Centre, 63800 Cournon</div>
      <div class="norme">EN 14081-1+A1</div>
      <table>
        <tr><td>Bois de structure<br><b>C24 (ST II)</b></td><td>Frais de sciage<br><b>WPCA</b></td></tr>
        ${traite ? `<tr><td colspan="2">Code essence PT (bois traité)</td></tr>` : ""}
        <tr><td>Norme de classement</td><td>EN 330+NF B52-001-1</td></tr>
        <tr><td>Réaction au feu</td><td>D-s2.d0</td></tr>
        <tr><td>Classe de durabilité</td><td>NPD</td></tr>
      </table>
      <div class="copie">COPIE – l'étiquette officielle CE est éditée sur le PC</div>
    </div>
  </div>`;
}
function imprimer(id) {
  const c = parId(id); if (!c) return;
  $("#impression").innerHTML = htmlEtiquette(c);
  setTimeout(() => window.print(), 50);
}

/* ═════════════ Synchronisation Supabase ═════════════ */
const viaConfig = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
const CONN = lire("colis.connexion.v1", {});
const SB_URL = viaConfig ? CFG.SUPABASE_URL : (CONN.url || ""), SB_KEY = viaConfig ? CFG.SUPABASE_ANON_KEY : (CONN.cle || "");
const configure = !!(SB_URL && SB_KEY);
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

const ligneDistante = c => Object.fromEntries(COLONNES.map(k => [k, k === "options" ? (c.options || []) : k === "supprime" ? !!c.supprime : (c[k] === "" ? null : c[k] ?? null)]));

async function pousser() {
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
      if (loc && attente.has(r.id) && t(loc.maj_le) > t(r.maj_le)) continue;
      r.options = r.options || [];
      if (!loc) liste.push(r); else if (t(r.maj_le) >= t(loc.maj_le)) liste[liste.indexOf(loc)] = r;
    }
    if (data.length < PAS) break;
    de += PAS;
  }
  if (max) ecrire(K.tire, max);
  sauverLocal();
}
async function synchroniser() {
  if (!sb || !session || !navigator.onLine) { majEtat(); return; }
  if (occupe) { relancer = true; return; }
  occupe = true; majEtat();
  try {
    await pousser(); await tirer(); await syncReglages();
    derniereErreur = ""; ecrire(K.synchro, maintenant());
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

/* ═════════════ Apparence (couleurs au choix, gardées dans Supabase) ═════════════ */
const THEMES = {
  foret: { nom: "Forêt SDC", vert: "#2F5143", or: "#D8BD86", fond: "#ECF0E8" },
  chene: { nom: "Chêne", vert: "#5B3F2A", or: "#D9A85B", fond: "#F3EBDD" },
  ardoise: { nom: "Ardoise", vert: "#34495E", or: "#C9A66B", fond: "#E8ECF0" },
  mousse: { nom: "Mousse", vert: "#3E6B4E", or: "#E0B45C", fond: "#F1F0E2" }
};
let reglages = Object.assign({ vert: THEMES.foret.vert, or: THEMES.foret.or, fond: THEMES.foret.fond, image: true, maj: null, attente: false }, lire(K.reglages, {}));
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const hex = v => "#" + v.map(x => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, "0")).join("");
const mix = (a, b, k) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * k)); };
function appliquerTheme() {
  const r = reglages, s = document.documentElement.style, W = "#ffffff";
  const encre = mix(r.vert, "#000000", 0.5);
  s.setProperty("--vert", r.vert); s.setProperty("--vert-fonce", mix(r.vert, "#000000", 0.25));
  s.setProperty("--sauge", mix(r.vert, W, 0.42)); s.setProperty("--sauge-clair", mix(r.vert, W, 0.86));
  s.setProperty("--or", r.or); s.setProperty("--encre", encre); s.setProperty("--encre-douce", mix(encre, W, 0.4));
  s.setProperty("--givre", `rgba(${rgb(mix(r.fond, W, 0.55)).join(",")}, 0.88)`);
  s.setProperty("--entete", `rgba(${rgb(mix(r.fond, W, 0.6)).join(",")}, 0.93)`);
  s.setProperty("--panneau", mix(r.fond, W, 0.6));
  const f = rgb(r.fond).join(",");
  s.setProperty("--voile1", `rgba(${f}, ${r.image ? 0.35 : 1})`); s.setProperty("--voile2", `rgba(${f}, ${r.image ? 0.55 : 1})`);
  document.body.style.background = mix(r.fond, "#000000", 0.06);
  $(".fond").style.backgroundImage = r.image ? "" : "none";
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = mix(r.vert, W, 0.42);
}
function majUIapparence() {
  $("#c-vert").value = reglages.vert; $("#c-or").value = reglages.or; $("#c-fond").value = reglages.fond;
  $("#c-image").checked = !!reglages.image;
  $("#themes").innerHTML = Object.entries(THEMES).map(([k, th]) => {
    const actif = th.vert.toLowerCase() === reglages.vert.toLowerCase() && th.or.toLowerCase() === reglages.or.toLowerCase() && th.fond.toLowerCase() === reglages.fond.toLowerCase();
    return `<button type="button" class="puce" data-theme="${k}" aria-pressed="${actif}"><i class="sw" style="background:${th.vert}"></i>${esc(th.nom)}</button>`;
  }).join("");
}
let minuteurReglages;
function changerReglages(patch) {
  reglages = { ...reglages, ...patch, maj: maintenant(), attente: true };
  ecrire(K.reglages, reglages); appliquerTheme(); majUIapparence();
  clearTimeout(minuteurReglages); minuteurReglages = setTimeout(synchroniser, 800);
}
$("#themes").addEventListener("click", e => {
  const b = e.target.closest("[data-theme]"); if (!b) return;
  const th = THEMES[b.dataset.theme]; changerReglages({ vert: th.vert, or: th.or, fond: th.fond });
});
$("#c-vert").addEventListener("input", e => changerReglages({ vert: e.target.value }));
$("#c-or").addEventListener("input", e => changerReglages({ or: e.target.value }));
$("#c-fond").addEventListener("input", e => changerReglages({ fond: e.target.value }));
$("#c-image").addEventListener("change", e => changerReglages({ image: e.target.checked }));
async function syncReglages() {
  const { data, error } = await sb.from("reglages").select("valeurs,maj_le").maybeSingle();
  if (error) return; // table pas encore créée : on ignore, les colis se synchronisent quand même
  if ((reglages.attente || !data) && reglages.maj) {
    const { vert, or, fond, image } = reglages;
    const r = await sb.from("reglages").upsert({ user_id: session.user.id, valeurs: { vert, or, fond, image }, maj_le: reglages.maj }, { onConflict: "user_id" });
    if (!r.error) { reglages.attente = false; ecrire(K.reglages, reglages); }
  } else if (data && (!reglages.maj || t(data.maj_le) > t(reglages.maj))) {
    reglages = { ...reglages, ...data.valeurs, maj: data.maj_le, attente: false };
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
const SERIES = { pointes: ["Pointés ✅", c => c.etiquete_le], sortis: ["Sortis", c => c.sorti_le], saisis: ["Saisis", c => c.cree_le] };
const METRIQUES = { n: ["Colis", () => 1], v: ["m³", c => volume(c) || 0], p: ["Pièces", c => c.pieces || 0] };
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
  const somme = arr => ({ n: arr.length, p: arr.reduce((s, c) => s + (c.pieces || 0), 0), v: arr.reduce((s, c) => s + (volume(c) || 0), 0) });
  const ouvert = a === 0;
  const [serieNom, serieFn] = SERIES[statSerie], [metNom, metFn] = METRIQUES[statMetrique];
  const fmt = v => statMetrique === "v" ? nf(v, 2) : np(v);
  const unite = statMetrique === "v" ? " m³" : "";

  // Cartes du haut
  const P = somme(tous.filter(c => dans(c.etiquete_le))), O = somme(tous.filter(c => dans(c.sorti_le)));
  const carte = (lab, s) => `<div class="stat"><span>${lab}</span><b>${np(s.n)}</b><small>${np(s.p)} pièces, ${nf(s.v, 2)} m³</small></div>`;
  const attente = somme(tous.filter(c => c.statut === "a_etiqueter")), stock = somme(tous.filter(c => c.statut === "a_sortir"));

  // Série choisie et graphique par jour (ou par mois si la période est longue)
  const items = tous.filter(c => dans(serieFn(c)));
  const evenements = tous.flatMap(c => [c.cree_le, c.etiquete_le, c.sorti_le]).filter(Boolean).map(t);
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
  const dSortie = moy(tous.filter(c => dans(c.sorti_le) && c.etiquete_le).map(c => t(c.sorti_le) - t(c.etiquete_le)));
  const lig = (lab, val, sm = "") => `<div class="rang simple"><b>${lab}</b><em>${val}</em>${sm ? `<small>${sm}</small>` : ""}</div>`;
  const moyennes = items.length ? [
    lig("Jours d'activité", np(joursActifs)),
    lig("Colis par jour d'activité", nf(It.n / joursActifs, 1)),
    lig("m³ par jour d'activité", nf(It.v / joursActifs, 2)),
    lig("Pièces par colis", np(It.p / It.n)),
    lig("m³ par colis", nf(It.v / It.n, 3)),
    lig("Délai saisie → pointage", duree(dPoint), "temps entre la note au calepin et le pointage au PC"),
    lig("Délai pointage → sortie", duree(dSortie), "temps entre le pointage et la sortie du colis")
  ].join("") : "";

  // Records
  const jourTot = {};
  items.forEach(c => { const j = jour(serieFn(c)); const o = (jourTot[j] ||= { n: 0, v: 0, p: 0 }); o.n++; o.v += volume(c) || 0; o.p += c.pieces || 0; });
  const meilleur = Object.entries(jourTot).sort((x, y) => y[1][statMetrique] - x[1][statMetrique])[0];
  const gros = [...items].sort((x, y) => (volume(y) || 0) - (volume(x) || 0))[0];
  const plusPieces = [...items].sort((x, y) => (y.pieces || 0) - (x.pieces || 0))[0];
  const desc = c => esc(`${section(c)}, ${nf(c.longueur, 2)} m, ${np(c.pieces)} p${c.numero ? ", n° " + c.numero : ""}${c.commande ? (c.commande === STOCK ? ", stock" : ", cde " + c.commande) : ""}`);
  const records = items.length ? [
    lig("Meilleur jour", new Date(meilleur[0] + "T12:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" }), `${meilleur[1].n} colis, ${np(meilleur[1].p)} pièces, ${nf(meilleur[1].v, 2)} m³`),
    lig("Plus gros colis (m³)", `${nf(volume(gros) || 0, 2)} m³`, desc(gros)),
    lig("Plus de pièces", np(plusPieces.pieces), desc(plusPieces))
  ].join("") : "";

  // Groupements
  const groupe = (fn, top = 12) => {
    const m = {};
    items.forEach(c => { const ks = fn(c); (Array.isArray(ks) ? ks : [ks]).forEach(k => { if (k) (m[k] ||= []).push(c); }); });
    return Object.entries(m).map(([k, arr]) => ({ k, ...somme(arr) })).sort((x, y) => y[statMetrique] - x[statMetrique] || y.n - x.n).slice(0, top);
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

  // À sortir maintenant (état actuel, indépendant de la période)
  const parLieu = {};
  tous.filter(c => c.statut === "a_sortir").forEach(c => (parLieu[c.lieu || "Sans lieu"] ||= []).push(c));
  const lieux = Object.entries(parLieu).map(([k, arr]) => ({ k, ...somme(arr) })).sort((x, y) => y.v - x.v);
  const anciens = tous.filter(c => c.statut === "a_sortir").sort((x, y) => t(x.etiquete_le) - t(y.etiquete_le)).slice(0, 5);
  const contenuStock = `${lieux.map(r => lig(esc("Lieu " + r.k), `${nf(r.v, 2)} m³`, `${np(r.n)} colis, ${np(r.p)} pièces`)).join("")}
    <p class="mini">Pointés depuis le plus longtemps</p>
    ${anciens.map(c => lig(esc(section(c) + (c.numero ? ", n° " + c.numero : "")), duree(Date.now() - t(c.etiquete_le)), esc(`lieu ${c.lieu || "–"}, ${c.commande === STOCK ? "stock" : "cde " + (c.commande || "–")}`))).join("")}`;

  const sousBloc = (titre, rows) => rows.length ? `<p class="mini">${titre}</p>${rangs(rows)}` : "";
  const autres = [sousBloc("Par épaisseur", groupe(c => c.epaisseur && c.epaisseur + " mm", 10)),
    sousBloc("Par longueur", groupe(c => c.longueur && nf(c.longueur, 2) + " m", 10)),
    sousBloc("Par essence, choix, nature", groupe(c => [c.essence, c.choix && "choix " + c.choix, c.nature].filter(Boolean).join(", "), 10)),
    sousBloc("Par option", groupe(c => (c.options && c.options.length ? c.options : ["Sans option"]), 10))].join("");

  $("#stats-corps").innerHTML = `
    <div class="stats-cartes">
      ${carte("Pointés ✅", P)}${carte("Sortis", O)}
      ${carte("En attente de pointage", attente)}${carte("Pointés, à sortir", stock)}
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
    ].join("") : `<div class="vide-liste">Aucun colis ${serieNom.toLowerCase().replace(" ✅", "")} sur cette période.</div>`}
    ${lieux.length ? pli("stock", "À sortir maintenant", `${np(stock.n)} colis`, contenuStock) : ""}`;
}

/* ═════════════ Export CSV ═════════════ */
$("#btn-export").addEventListener("click", () => {
  const cols = [["numero", "N° étiquette"], ["commande", "Commande"], ["lieu", "Lieu de stock"], ["epaisseur", "Épaisseur"],
    ["largeur", "Largeur"], ["longueur", "Longueur (m)"], ["pieces", "Pièces"], ["volume", "Volume (m3)"], ["essence", "Essence"],
    ["choix", "Choix"], ["nature", "Nature"], ["options", "Options"], ["ref_client", "Réf. client"], ["observation", "Observation"],
    ["statut", "Statut"], ["cree_le", "Saisi le"], ["etiquete_le", "Pointé le"], ["sorti_le", "Sorti le"]];
  const cell = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const dt = iso => iso ? new Date(iso).toLocaleString("fr-FR") : "";
  const lignes = actifs().sort((a, b) => t(a.cree_le) - t(b.cree_le)).map(c => cols.map(([k]) =>
    cell(k === "volume" ? nf(volume(c), 3) : k === "longueur" ? nf(c.longueur, 2) : k === "options" ? (c.options || []).join(" ")
      : k === "statut" ? STATUTS[c.statut] : k.endsWith("_le") ? dt(c[k]) : c[k])).join(";"));
  const csv = "\uFEFF" + [cols.map(([, l]) => cell(l)).join(";"), ...lignes].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `colis-sdc-${jour(maintenant())}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
});

/* ═════════════ Démarrage ═════════════ */
function rafraichir() {
  rendreCalepin();
  if (vueActive === "stats") rendreStats();
  if (vueActive === "colis") rendreListe();
  if (ficheId && !$("#fiche").hidden) rendreFiche();
  majEtat();
}
appliquerTheme(); majUIapparence();
document.body.classList.toggle("sans-photo", CFG.PHOTO === false);
formVierge();
allerA("nouveau");
rendreCalepin();
initSynchro();
if ("serviceWorker" in navigator) addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
})();
