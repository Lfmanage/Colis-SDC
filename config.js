// ─────────────────────────────────────────────────────────────
//  Réglages de l'appli Colis SDC
//  Supabase : colle ici l'URL et la clé « anon public » de ton projet
//  (Supabase → Project Settings → API), ou fais-le depuis l'appli
//  (Réglages → Base de données Supabase). Vide = colis gardés sur l'appareil seulement.
// ─────────────────────────────────────────────────────────────
window.COLIS_CONFIG = {
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",

  // Pré-remplissage : seule la nature (G) ne change jamais. L'essence et le lieu se choisissent à chaque colis.
  DEFAUTS: { choix: "20", nature: "G" },

  // Essences et lieux proposés en un tap au pointage (ex. ["S", "D"] et ["G7", "H1"]).
  // Ceux déjà utilisés sur des colis apparaissent aussi tout seuls.
  ESSENCES: [],
  LIEUX: [],

  // Lettres proposées sur le clavier du « lieu de stock » (les chiffres sont toujours là)
  LETTRES_LIEU: ["C", "D", "G", "H"],

  // Options qui peuvent être imprimées sur l'étiquette (aucune = pas d'option). Le texte est une aide facultative.
  OPTIONS: { TR: "Fongi. coloré (PT)", TA: "", TI: "", PR: "", CR: "Cœur refendu", S: "", "MI-BOIS": "" },

  // Code essence imprimé sur l'étiquette pour chaque lettre du terminal (ton étiquette montre « SE » pour S)
  ESSENCE_ETIQUETTE: { S: "SE" },

  // Lecture de l'étiquette par photo (false = boutons photo masqués)
  PHOTO: true,

  // Largeur de la copie d'étiquette imprimée sur PC (en millimètres)
  ETIQUETTE_MM: { largeur: 190 }
};
