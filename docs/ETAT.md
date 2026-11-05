# État des sujets (v2)

Une ligne par sujet. **Chaque PR met à jour ce fichier.** La colonne « Terrain » reste à « non testé » tant que Romain n'a pas vérifié sur son téléphone ; seule une vérification sur le terrain la change (avec la date).

| Sujet | État | Preuve (fichier:fonction, test, PR) | Terrain |
|---|---|---|---|
| Page photo rejouée (v2/photo.html) | fait | `src/ui/page.js:demarrerPage`, `tests/e2e/photo-v2.spec.js` | validé 29/10 |
| Page direct (v2/ar.html) | fait | `src/entrees/direct.js:creerEntreeDirecte`, `tests/e2e/direct-v2.spec.js` | validé 29/10 |
| Moteur de scène (calques, bande, étiquettes) | fait | `src/moteur/scene.js:composerScene`, parité v1 `tests/e2e/*-parite.spec.js` | validé 29/10 |
| Relief (deux passes, ligne, crêtes) | fait | `src/scene/terrain.js`, `tests/integration/relief*.test.mjs` | validé 30/10 |
| Relief en direct (GPS qui bouge) | fait | `src/app/position.js`, `tests/e2e/relief-direct-v2.spec.js` | non testé |
| Lieux (OSM, OpenFreeMap, atlas, publication progressive) | fait | `src/donnees/lieux.js:creerSourceLieux`, `tests/unit/donnees-lieux.test.mjs` | validé 29/10 |
| Monuments (Wikidata, OSM, statues) | fait | `src/calques/monuments.js`, `tests/e2e/monuments-donnees-v2.spec.js` | validé 30/10 |
| Équipements télécom et repères hauts | fait | `src/calques/equipements.js`, `src/calques/reperes.js` | validé 30/10 |
| Bateaux et avions (trafic en direct) | fait | `src/calques/bateaux.js`, `src/calques/avions.js`, `tests/e2e/trafic-donnees-v2.spec.js` | validé 29/10 |
| Couches perso KMZ/KML | fait | `src/app/couches.js`, `tests/e2e/kmz-v2.spec.js` (PR 65) | non testé |
| Fiches au toucher | fait | `src/scene/toucher.js`, `src/ui/fiches.js`, `tests/e2e/fiches-v2.spec.js` | non testé |
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
| Calage guidé en un bouton | fait | `src/calage/guide.js`, `src/ui/calage-guide.js`, `tests/e2e/calage-guide-direct.spec.js` (PR 69) | non testé |
| Hauteur d'œil : le GPS propose | fait | `src/scene/oeil-gps.js`, `src/ui/oeil.js`, `tests/unit/oeil-gps.test.mjs` | non testé |
| Altitude GPS Android − géoïde | fait | `src/noyau/geoide.js`, `tests/unit/geoide.test.mjs` | validé 31/10 |
| Bandeau de rotation d'écran | fait | `src/entrees/rotation.js`, `tests/e2e/rotation-ecran-v2.spec.js` | non testé |
| Mode hors ligne : télécharger une zone (lieux, relief) | fait | `src/app/application.js:telechargerZone` | non testé |
| Relais Cloudflare (`relais/`) | fait | `relais/relais-worker.js` | validé |
| CI : lint, types, unitaires ; parité à la main | fait | `.github/workflows/tests.yml`, `.github/workflows/parite.yml` | sans objet |
