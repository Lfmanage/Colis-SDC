// ─────────────────────────────────────────────────────────────
//  Réglages de l'appli Colis SDC
//  Colle ici l'URL et la clé "anon public" de TON projet Supabase
//  (Supabase → Project Settings → API).
//  Laisse vide pour utiliser l'appli sans synchro (données sur l'appareil).
// ─────────────────────────────────────────────────────────────
window.COLIS_CONFIG = {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",

  // Valeurs pré-remplies dans « Nouveau colis »
  // Seule la nature (G) ne change jamais. L'essence et le lieu changent : ils se choisissent à chaque colis.
  DEFAUTS: { essence: "", choix: "20", nature: "G", options: [] },

  // Essences proposées en un tap au pointage (lettre du terminal, ex. ["S", "D"]).
  // Celles déjà utilisées sur des colis apparaissent aussi toutes seules.
  ESSENCES: [],

  // Lieux de stockage proposés en un tap quand tu choisis « Stock » (ex. ["G7", "H1"]).
  // Les lieux déjà utilisés sur des colis apparaissent aussi tout seuls.
  LIEUX: [],

  // Lecture de l'étiquette par photo (mettre false pour masquer les boutons photo)
  PHOTO: true,

  // Options proposées en un tap (légende de tes feuilles de commande)
  OPTIONS: { TR: "Fongi. coloré (PT)", CR: "Cœur refendu" },

  // Code essence imprimé sur la copie d'étiquette (ton étiquette montre « SE » pour S)
  ESSENCE_ETIQUETTE: { S: "SE" },

  // Taille de la copie d'étiquette imprimée (en millimètres)
  ETIQUETTE_MM: { largeur: 190, hauteur: 62 }
};
