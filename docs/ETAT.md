# État des sujets

Une ligne par sujet. **Chaque PR met à jour ce fichier.** La colonne « Terrain » ne change qu'après une vérification de Romain sur son téléphone (avec la date) : **seul Romain la change.**

## v3 — greffes (toutes éteintes par défaut : Réglages › Greffes v2, ou `?g=…`)

Décision par greffe (`docs/REFONTE-V3.md` §3, règle 5) : validée → elle devient la règle, on retire l'interrupteur et l'ancien code ; rejetée → on supprime son fichier.

| Greffe | Terrain | Preuve (fichier, test) |
|---|---|---|
| `soleil2` · remplacement : toucher le soleil retrouve le disque vu dans l’image, même boussole fausse de plus de 12° | non testé | `v3/greffes/soleil2.js`, `v3/tests/greffes.spec.js` (boussole fausse de 20°) |
| `lune` · ajout : « Caler auto » de nuit sur la lune, symbole de la lune | non testé | `v3/greffes/lune.js`, `v3/greffes/_astre.js:positionLune` (éphéméride à 0,6°), `v3/tests/greffes.spec.js` |
| `permutation` · ajout : « Caler auto » refuse les concordances fortuites de repères | non testé | `v3/greffes/permutation.js`, `v3/tests/greffes.test.mjs` (scènes au hasard : v1 120/120 acceptées, greffe 8/120) |
| `echelle2` · ajout : deux références touchées (soleil, lune, monument, lieu) donnent le cap et le champ | non testé | `v3/greffes/echelle2.js:resoudre`, `v3/tests/greffes.test.mjs`, `v3/tests/greffes.spec.js` |
| `oeil` · ajout : puce œil sous le rayon (détail, Réestimer, étage, proposition du GPS) | non testé | `v3/greffes/oeil.js`, `v3/tests/greffes.spec.js` |
| `icones` · remplacement : un libellé sous chaque bouton, aides « ? » de la v1 gardées | non testé | `v3/greffes/icones.js`, `v3/tests/greffes.spec.js` |
| `rotation` · ajout : message « écran en portrait, téléphone en paysage » | non testé | `v3/greffes/rotation.js:evaluer`, `v3/tests/greffes.test.mjs`, `v3/tests/greffes.spec.js` |
| `lieuxWikidata` · ajout : repli Wikidata pour les lieux quand Overpass échoue | non testé | `v3/greffes/lieuxWikidata.js`, `v3/tests/greffes.spec.js` (Overpass en panne simulée) |
| `boussoleA` · remplacement : la boussole ne défait plus un calage (retour seulement sur un vrai saut du gyroscope) | non testé | `v3/greffes/boussoleA.js:evaluer`, `v3/tests/greffes.test.mjs`, `v3/tests/greffes.spec.js` |
| `tailleReelle` · ajout : silhouette des monuments toujours à taille réelle (plus de plafond quand le pied est à l'écran), nom au sommet ou au bord haut sous les puces | non testé | `v3/greffes/tailleReelle.js`, `v3/villes-horizon.html:monAng`, `v3/tests/greffes.spec.js` (même hauteur en degrés à 0° et 27° d'inclinaison ; éteinte : plafond de 240 px pied à l'écran) |
| `plaque` · ajout : bouton « Lire une plaque de rue » (Réglages) : OCR, Base Adresse Nationale, position corrigée après « Appliquer », suivie au pas ; le GPS reprend après 20 s d'écart > 2 × sa précision | non testé | `v3/greffes/plaque.js`, `v3/tests/greffes.test.mjs` (lecture, trottoir, pas, reprise GPS), `v3/tests/greffes.spec.js` (plaque simulée → 30 m corrigés, tenus contre le GPS) |
| `capteurRelatif` · remplacement : anti-dérive, `RelativeOrientationSensor` 60 Hz à la place du gyroscope de `deviceorientation` ; repli sur `deviceorientation` | non testé | `v3/greffes/capteurRelatif.js:axesDepuisQuaternion`, `v3/tests/greffes.test.mjs` (mêmes axes que la v1, 200 orientations × 4 rotations d'écran), `v3/tests/greffes.spec.js` |
| `recalageContinu` · ajout : anti-dérive, le cap se corrige seul sur le soleil ou la lune vus dans l'image (demi-pas, 10 s entre deux pas, ±20° au plus) | non testé | `v3/greffes/recalageContinu.js:decisionCalageContinu`, `v3/tests/greffes.test.mjs`, `v3/tests/greffes.spec.js` (cap faux de 4° → 2° → 1°) |

## v3 — socle

| Sujet | État | Preuve | Terrain |
|---|---|---|---|
| Tout éteint = v1 (trame de dessin, fiches, interface) | fait | `v3/tests/tout-eteint-v1.spec.js` (scènes réelles du dépôt privé ; interface sans lui) | non testé |
| Correctif du glisser avec roulis (écran resté en portrait, §5) ; le toucher des noms compensait déjà le roulis dans la v1 | fait | `v3/villes-horizon.html` (pointermove), `v3/tests/roulis.spec.js` (−70° : la v1 déplace l'horizon, la v3 le cap) | non testé |
| Pierres tombales (99 fonctions suspectes + 3 blocs connus), Diagnostic | fait | `v3/greffes.js:tombe`, `v3/tests/chargement.spec.js` | en cours (2 à 3 semaines d'usage, puis suppression des blocs restés à 0) |
| Réglages propres (`vh3_settings`, recopiés une fois depuis la v1) | fait | `v3/tests/chargement.spec.js` | non testé |
| Règle de travail des greffes : une branche par demande, en local syntaxe + test de la greffe, CI pour « tout éteint = v1 », fusion par Claude si verte (arrêt si la v1 change hors points d'entrée) | fait | `CLAUDE.md` (règles de la v3, n° 10) | — |
| Rangement : un dossier par version (v2 dans `v2/`, harnais dans `tests/commun/`, documents dans `docs/`), `villes-horizon.html` de la racine supprimé | fait | site construit comparé avant/après (seuls changent les chemins `v2/src`, `v2/b` et les cartes de sources), tests de la v2 verts (lint, types, 326 unitaires, 59 intégration, 152 e2e avec les scènes réelles) | — |

## v2 — gelée (pour mémoire ; chemins relatifs à `v2/`)

| Sujet | État | Preuve (fichier:fonction, test, PR) | Terrain |
|---|---|---|---|
| Page photo rejouée : même page que le direct (v2/ar.html?mode=photo ; photo.html redirige ; Réglages › Rejouer une photo en direct) | fait | `src/ui/page-ar.js`, `src/ui/photo.js:passerEnPhoto`, `tests/e2e/photo-v2.spec.js` | validé 29/10 (avant la page unique) ; non testé depuis |
| Page direct (v2/ar.html) | fait | `src/entrees/direct.js:creerEntreeDirecte`, `tests/e2e/direct-v2.spec.js` | validé 29/10 |
| Moteur de scène (calques, bande, étiquettes) | fait | `src/moteur/scene.js:composerScene`, parité v1 `tests/e2e/*-parite.spec.js` | validé 29/10 |
| Relief (deux passes, ligne, crêtes) | fait | `src/scene/terrain.js`, `tests/integration/relief*.test.mjs` | validé 30/10 |
| Relief en direct (GPS qui bouge) | fait | `src/app/position.js`, `tests/e2e/relief-direct-v2.spec.js` | non testé |
| Lieux (OSM, OpenFreeMap, atlas, publication progressive) | fait | `src/donnees/lieux.js:creerSourceLieux`, `tests/unit/donnees-lieux.test.mjs` | validé 29/10 |
| Monuments (Wikidata, OSM, statues) | fait | `src/calques/monuments.js`, `tests/e2e/monuments-donnees-v2.spec.js` | validé 30/10 |
| Équipements télécom et repères hauts | fait | `src/calques/equipements.js`, `src/calques/reperes.js` | validé 30/10 |
| Bateaux et avions (trafic en direct) | fait | `src/calques/bateaux.js`, `src/calques/avions.js`, `tests/e2e/trafic-donnees-v2.spec.js` | validé 29/10 |
| Couches perso KMZ/KML | fait | `src/app/couches.js`, `tests/e2e/kmz-v2.spec.js` (PR 65) | non testé |
| Fiches au toucher : fonctions de la v1 déplacées, panneau plein écran (monument, équipement, ANFR, groupes, avions, bateaux, KML, lieux) | fait | `src/scene/toucher.js:hitBest`, `src/ui/fiche-contenu.js`, `src/ui/fiches.js`, `tests/e2e/fiches-parite.spec.js` (13 fiches = v1), `tests/e2e/fiches-v2.spec.js` | non testé |
| Calage sur le soleil et pointage au doigt | fait | `src/calage/soleil.js`, `src/calage/pointage.js`, `tests/e2e/calage-soleil-direct.spec.js` | validé 29/10 |
| Calage sur la lune (nuit) | fait | `src/noyau/astro.js:positionLune`, test local `photo-lune-reelle.spec.js` | non testé |
| Caler auto (soleil, relief, repères) | fait | `src/calage/auto.js:calerAutomatiquement`, `tests/integration/calage-relief.test.mjs` | validé 30/10 |
| Test de permutation des repères | fait | `src/calage/reperes.js:ajusterSurReperes`, `tests/integration/calage-permutation.test.mjs` | non testé |
| Échelle du champ (2 repères) | fait | `src/calage/echelle.js`, `tests/unit/echelle.test.mjs` | non testé |
| Carnet de calage, écart appris, banc d'essai | fait | `src/calage/carnet.js`, `src/calage/banc.js` | validé 29/10 |
| Visibilité d'après la photo | fait | `src/vision/silhouette-ciel.js`, `tests/e2e/visibilite-photo-v2.spec.js` | validé 30/10 |
| Ancrage A : boussole perturbée ≠ calage défait | fait | `src/entrees/capteurs.js:suivrePerturbation`, `tests/unit/capteurs.test.mjs` (PR 64) | non testé |
| Ancrage B : capteur d'orientation relatif 60 Hz (essai) | fait | `src/entrees/capteurs.js:surQuaternion`, `tests/e2e/capteur-relatif-v2.spec.js` (PR 67) | non testé |
| Ancrage C : recalage continu soleil/lune | fait | `src/calage/continu.js`, `tests/e2e/calage-continu-direct.spec.js` (PR 66) | non testé |
| Ancrage E : suivi visuel WebXR (essai) | fait (fond transparent, caméra libérée, camera-access) | `src/entrees/webxr.js:creerSuiviXr`, `src/ui/page.js:installerSuiviXr`, `tests/e2e/webxr-v2.spec.js` | non testé |
| « Caler » immédiat comme la v1 ; guidage au second toucher ou en repli, jamais si la boussole est douteuse | fait | `src/ui/calage-guide.js:creerBoutonCaler`, `tests/e2e/calage-guide-direct.spec.js` | non testé |
| Hauteur d'œil : le GPS propose | fait | `src/scene/oeil-gps.js`, `src/ui/oeil.js`, `tests/unit/oeil-gps.test.mjs` | non testé |
| Altitude GPS Android − géoïde | fait | `src/noyau/geoide.js`, `tests/unit/geoide.test.mjs` | validé 31/10 |
| Bandeau de rotation d'écran | fait | `src/entrees/rotation.js`, `tests/e2e/rotation-ecran-v2.spec.js` | non testé |
| Mode hors ligne : télécharger une zone (lieux, relief) | fait | `src/app/application.js:telechargerZone` | non testé |
| Relais Cloudflare (`relais/`) | fait | `relais/relais-worker.js` | validé |
| Silhouette des bâtiments (BD TOPO), calque éteint par défaut | fait (parité avec la v1 sauf la courbure terrestre, voulue) | `src/scene/silhouette-batiments.js`, `src/calques/batiments.js`, `tests/integration/silhouette-v1.test.mjs`, `tests/e2e/batiments-v2.spec.js` | non testé |
| Rues (OpenFreeMap z14, repli Overpass) | fait | `src/donnees/rues.js`, `tests/unit/rues.test.mjs` | non testé |
| Bâtiments et rues dans « Télécharger cette zone » | fait | `src/app/urbain.js:telechargerZone`, `tests/e2e/batiments-v2.spec.js` (hors ligne) | non testé |
| Cap sur l'axe de la rue (guidage en ville, deux sens, carrefour) | fait | `src/calage/rue.js`, `src/ui/calage-ville.js`, `tests/e2e/caler-rue-v2.spec.js` | non testé |
| GPS nettoyé (médiane à l'arrêt, hors des bâtiments, puce ± précision) | fait | `src/scene/position.js`, `src/ui/position-propre.js`, `tests/e2e/gps-batiment-v2.spec.js` | non testé |
| Calage sur les toits (cap seul, de jour, en ville) | fait | `src/calage/toits.js`, `tests/unit/calage-toits.test.mjs`, `tests/e2e/caler-toits-v2.spec.js` | non testé |
| Position par les toits (essai, décochée) | fait | `src/calage/position-toits.js`, `tests/unit/position-toits.test.mjs`, `tests/e2e/caler-toits-v2.spec.js` | non testé |
| Cap par une ombre tracée au doigt | fait | `src/calage/ombre.js`, `src/ui/calage-ombre.js`, `tests/e2e/caler-ombre-v2.spec.js` | non testé |
| Position par une plaque de rue (OCR Tesseract.js, Base Adresse) | fait (l'OCR réel n'est pas testé en session) | `src/calage/adresse.js`, `src/ui/lire-plaque.js`, `tests/e2e/caler-plaque-v2.spec.js` | non testé |
| Position corrigée qui avance avec les pas | fait | `src/scene/pas.js`, `tests/unit/pas.test.mjs` | non testé |
| CI : lint, types, unitaires ; parité à la main | fait | `.github/workflows/tests.yml`, `.github/workflows/parite.yml` | sans objet |
| Site publié regroupé (esbuild), Pages, `?modules=1` | fait (au moins aussi rapide que la v1 : 0,49 s / 2,87 s contre 0,49 s / 3,02 s) | `construction/construire.mjs`, `.github/workflows/pages.yml`, `tests/e2e/livraison-v2.spec.js`, `tests/perf/banc.mjs`, `docs/MESURES-V1-V2.md` | non testé (réglage Pages à faire) |
| Hors ligne : service worker (page et workers gardés, versionnés) | fait | `construction/construire.mjs:serviceWorker`, `tests/e2e/livraison-v2.spec.js` | non testé |
| Démarrage : dernière position (« position de HH:MM ») et dernier relief | fait | `src/app/demarrage.js`, `tests/e2e/demarrage-v2.spec.js` | non testé |
| Aides « ? », résumés des sections, catégories de repères, section « Essais » | fait | `src/ui/aides.js`, `tests/e2e/interface-parite.spec.js` | non testé |
| Parité de l'interface (Réglages, Calques, boutons, accueil) | fait (écarts justifiés : `tests/ecarts-acceptes.json`) | `tests/e2e/interface-parite.spec.js` | sans objet |
| Affichage de bout en bout sur les 6 scènes réelles (dont Cesson 06/11) | fait : mêmes noms nets que la v1 sur les données exportées ; l'écart vu à Cesson le 06/11 n'est pas reproduit (relief de Cesson et caches de la v2 non exportés) | `tests/e2e/affichage-reel-v2.spec.js`, `tests/e2e/photo-v2-parite.spec.js`, `tests/caracterisation/scenes.mjs` | à vérifier à Cesson |
| Export du cache : caches de la v2 lus aussi | fait | `debug/debug-cache.html`, `tests/e2e/export-cache-outil.spec.js` | non testé |
