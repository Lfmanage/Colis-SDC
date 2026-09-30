# Colis SDC – mise en ligne

Appli séparée de l'appli de ventes : rien n'est modifié dans `lffood/scierie`.

## 1. Mettre en ligne (GitHub Pages)
1. Sur GitHub (compte lffood), crée un nouveau dépôt **colis** (public).
2. « Add file » → « Upload files » → dépose **tout le contenu** de ce dossier (y compris le dossier `icons`) → « Commit changes ».
3. Settings → Pages → Branch : `main`, dossier `/ (root)` → Save.
4. Après 1 à 2 minutes : https://lffood.github.io/colis/

L'appli marche déjà ainsi, mais les colis restent sur l'appareil où ils sont saisis.

## 2. Garder tout en mémoire dans Supabase
1. Sur supabase.com, crée un projet (ou réutilise celui que tu veux) puis SQL Editor → New query → colle `supabase.sql` → Run.
   (Si tu avais déjà lancé une version précédente, relance-le : il ne casse rien et ajoute la table des couleurs.)
2. Authentication → Users → « Add user » → ton e-mail + mot de passe (coche « Auto confirm »).
3. Authentication → Sign In / Providers → désactive « Allow new users to sign up ».
4. Project Settings → API : copie « Project URL » et la clé « anon public ».
5. Dans l'appli : Réglages → Base de données Supabase → colle l'URL et la clé → « Relier à Supabase » → connecte-toi avec l'e-mail du point 2.
   À faire une fois sur l'iPhone et une fois sur le PC. (Autre option : les coller dans `config.js` sur GitHub, alors tous les appareils sont reliés d'office.)

Ensuite les colis, les dates de pointage et tes couleurs sont sauvegardés en ligne et retrouvés sur tous tes appareils.

## 3. Installer comme une appli
- **iPhone** : ouvre le lien dans Safari → bouton Partager → « Sur l'écran d'accueil ».
- **PC** (Chrome ou Edge) : icône d'installation à droite de la barre d'adresse.

## Photo de l'étiquette
Au PC, après l'impression : bouton « 📷 Photo de l'étiquette » (onglet Colis, ou dans l'écran de pointage).
L'appli lit l'étiquette, retrouve le colis en attente qui correspond, remplit le n°, le lieu et les options,
et vérifie section, pièces, longueur et volume. Tu ajoutes la commande (ou Stock) puis tu appuies sur « Pointer ».
- Si ta note contient une faute sur les pièces ou la longueur (ex. 45 au lieu de 150), l'étiquette la corrige toute seule, et un bouton « Annuler » remet ta saisie. En cas de doute (plusieurs colis proches, section différente), l'appli propose seulement « Prendre l'étiquette ».
- Il faut internet la première fois (le lecteur se télécharge une fois, puis reste dans l'appli).
- Photo à plat, bien éclairée, étiquette bien cadrée. Si un « ? » apparaît, compare avec l'étiquette avant de pointer.
- Pour masquer les boutons photo : `PHOTO: false` dans `config.js`.

## Comment la photo lit l'étiquette
- Le **code-barres** donne le n° complet (ex. 203482001 = 203-482-1), même si la photo est un peu penchée.
- Le texte est lu sur toute la photo en noir et blanc « local » (marche aussi quand la photo est sombre).
- Section, pièces et longueur ne sont utilisées que si elles retombent sur le **volume imprimé** ; si une valeur manque, elle est déduite du volume.
- Pour de meilleurs résultats : étiquette entière, de face, code-barres net.

## Options lues par la photo
Les options (TR, TA, TI, PR, CR, S, MI-BOIS) sont lues **uniquement à l'endroit où l'étiquette les imprime : juste au-dessus du n°**.
Si rien n'est imprimé à cet endroit, aucune option n'est cochée. Si la photo ne permet pas de repérer cette zone, l'appli ne touche à rien et te le dit.
La section n'est jamais changée toute seule : l'appli te la propose avec un bouton.
Le lien « Voir ce qui a été lu » (dans l'encadré de la photo) montre ce que l'appli a compris : utile pour me signaler un souci.

## Mise à jour
Après une modification sur GitHub, ferme puis rouvre l'appli (deux fois si besoin).
Si l'ancienne version reste affichée, augmente `VERSION` dans `sw.js` (ex. `colis-v1.0.1`).

## Réglages utiles (config.js)
- `DEFAUTS` : essence, choix, nature et options pré-remplis.
- `ESSENCES` : essences proposées en un tap au pointage (lettre du terminal). `ESSENCE_ETIQUETTE` : le code imprimé sur l'étiquette pour chaque lettre (ex. S → SE).
- `LIEUX` : lieux de stockage proposés en un tap quand tu choisis « Stock » (les lieux déjà utilisés apparaissent aussi tout seuls).
- `OPTIONS` : les options proposées en un tap (TR, CR…).
- `ESSENCE_ETIQUETTE` : code imprimé sur la copie (S → SE).
- `ETIQUETTE_MM` : taille de la copie imprimée.
