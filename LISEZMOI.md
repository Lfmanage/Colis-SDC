# Colis SDC — guide final

## Les fichiers du dépôt GitHub (rien d'autre n'est nécessaire)
`index.html` · `app.js` · `lecture.js` · `style.css` · `config.js` · `sw.js` · `manifest.webmanifest` · `bg.svg` · dossier `icons` (4 images)
Les fichiers `supabase.sql` et `LISEZMOI.md` peuvent y rester ou non : l'appli ne s'en sert pas.
Tout autre fichier (anciens zips, captures, anciennes versions) peut être supprimé du dépôt.

## Mise en ligne et installation
1. GitHub → dépôt (Public) → Add file → Upload files → glisse le **contenu** du dossier (pas le dossier lui-même) → Commit.
2. Settings → Pages → branche `main`, dossier `/ (root)`. Le lien s'affiche en haut de la page.
3. iPhone : ouvre le lien dans Safari → Partager → « Sur l'écran d'accueil ». Utilise ensuite toujours cette icône.
4. Mise à jour : remplace les fichiers, ferme et rouvre l'appli deux fois. Réglages → tout en bas : le numéro de version.

## Sauvegarder les colis en ligne (Supabase)
1. supabase.com → nouveau projet → SQL Editor → colle `supabase.sql` → Run.
2. Authentication → Users → Add user (e-mail + mot de passe, « Auto confirm »). Providers → désactive « Allow new users to sign up ».
3. Project Settings → API : copie l'URL et la clé « anon public ».
4. Dans l'appli : Réglages → Base de données Supabase → colle les deux → « Relier » → connecte-toi.
Tant que ce n'est pas fait, l'accueil affiche un bandeau orange : les colis ne sont que sur l'appareil.
Sans Supabase : Réglages → Sauvegarde et export → « Télécharger une sauvegarde » de temps en temps (restaurable au même endroit).

## Utilisation
- **Calepin** : section, pièces, longueur. Rien d'autre.
- **Pointage** : commande (ou Stock), lieu, essence, options, n° d'étiquette. La photo de l'étiquette remplit tout et corrige les fautes de la note ; le bouton photo est en haut **et** en bas de l'écran.
- **Lieu de stock** : sur téléphone, un pavé s'ouvre avec seulement les chiffres et les lettres C, D, G, H (lien « Clavier complet » si une autre lettre apparaît un jour). Sur ordinateur, les autres caractères sont simplement ignorés.
- **Colis** : glisse vers la droite pour pointer, vers la gauche pour supprimer (bouton Annuler ensuite).
- **Retrouver une étiquette** (Colis → Pointés ✅ → « 📷 Retrouver une étiquette ») : photographie n'importe quelle étiquette, la fiche du colis s'ouvre (date et heure de pointage comprises). Si le n° n'existe pas dans tes données, l'appli le dit et propose de **créer** le colis d'après l'étiquette ; un colis supprimé peut être rétabli.
- **Copie de l'étiquette** (fiche d'un colis) : aperçu, puis Imprimer (PC) ou Imprimer / partager (iPhone : menu AirPrint / Fichiers).
- **Stats** : blocs qui se déplient. **Réglages** : couleurs, Supabase, sauvegarde.

## La photo de l'étiquette
- Le code-barres donne le n° exact et sert de repère ; chaque info est lue dans sa zone puis contrôlée par le volume imprimé.
- Options : lues juste au-dessus du n° ; rien d'imprimé = aucune option.
- La section n'est jamais changée toute seule : l'appli te la propose. Pièces et longueur sont corrigées (bouton Annuler).
- Étiquette entière, de face, code-barres net. « Voir ce qui a été lu » montre ce que l'appli a compris.

## Réglages (config.js)
`LETTRES_LIEU` : lettres du pavé du lieu (C, D, G, H) · `ESSENCES` / `LIEUX` : boutons proposés au pointage · `OPTIONS` · `ESSENCE_ETIQUETTE` (code imprimé pour chaque lettre, ex. S → SE) · `PHOTO: false` masque la photo · `ETIQUETTE_MM` : largeur de la copie sur PC.
