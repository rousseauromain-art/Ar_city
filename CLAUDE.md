# Villes à l'horizon — contexte pour Claude

Fichier lu au début de chaque session Claude Code. Le tenir à jour à chaque décision importante.

**Toute la refonte (méthode, architecture cible, règles, plan par étapes) : voir `REFONTE.md`** (et `VEILLE-ANCRAGE.md`). La v1 figée est la version `2026-10-25 (j)` ; la branche `archive/avant-refonte-2026-10-27` (commit `f61db6e`) garde l'état de `main` d'avant (étiquette impossible à pousser depuis les sessions cloud).

## Le projet
- Application web de réalité augmentée façon PeakFinder. Par-dessus l'image de la caméra, elle affiche :
  - les noms des lieux et des monuments ;
  - le relief ;
  - les bateaux (AIS) et les avions ;
  - les équipements télécom.
- `v1/villes-horizon.html` : l'application, version `2026-10-25 (j)` FIGÉE (une seule page, environ 5 200 lignes ; seul changement : `../config.js`). Adresse : https://rousseauromain-art.github.io/Ar_city/v1/villes-horizon.html
- `villes-horizon.html` (racine) : redirige vers `v1/villes-horizon.html` (anciens liens, raccourci du téléphone).
- `config.js` (à la racine) : adresse du relais. Il est public et ne contient aucun secret.
- `index.html` : le lanceur : la version 2 en premier (Réalité augmentée, Photo rejouée), puis les outils de diagnostic, puis la version 1 figée tout en bas.
- `v2/photo.html` : page v2 « photo rejouée » (même interface que la v1), liée depuis le lanceur ; calage sur le soleil (bouton cible) et pointage au doigt (réticule) actifs depuis l'étape 10a ; « Visibilité d'après la photo » active depuis l'étape 10b ; « Caler auto » complet (soleil, relief, repères) actif depuis l'étape 10c ; carnet de calage, « Reprendre l'écart appris » (direct) et banc d'essai (photo) actifs depuis l'étape 10d ; symbole du soleil affiché (heure EXIF).
- `v2/ar.html` : page v2 en direct (caméra, GPS, boussole/gyroscope, trafic), même interface que la v1, liée depuis le lanceur.
- `v2/outils.html` + `src/` : fondations de la v2 (étape 1 de `REFONTE.md`) : journal, état, stockage `vh2:`, drapeaux, rapport, réseau unique, Eruda avec `?debug=1`. Rôle de chaque dossier : `docs/ARCHITECTURE.md`.
- Pages de diagnostic, dans `debug/` (elles chargent `../config.js`) :
  - `debug/debug-trafic.html` : AIS et avions ;
  - `debug/debug-profondeur.html` : Depth Anything V2 et SegFormer, rejouer une photo, export JSON ;
  - `debug/debug-lieux.html`.
  - `debug/debug-cache.html` : export du cache de l'appareil (relief d'un lieu, données mémorisées) en fichiers de 20 Mo au plus, à déposer dans `Ar_city-photos` ; lit les mêmes caches que la v1 sans la modifier.
- Relais Cloudflare Worker `villes-horizon-relais` (rousseau-romain.workers.dev) :
  - les clés AISStream et OpenSky sont stockées en secrets du Worker ;
  - routes : /planes /ships /osm /telecom /geonames /geoapify /check /monuments /wdtile /ais-debug /calib /calib.csv ;
  - Durable Objects : `AisHub` (écoute AIS continue par zone de 0,5°, migration v1) et `CalibLog` (SQLite, carnet de calage, migration v2).
  - **La version la plus récente n'est pas encore dans ce dépôt : la placer dans `relais/` avec `wrangler.json`.**

## Romain, l'utilisateur
- **Langue et ton :** français, réponses concises, livrables finis plutôt qu'un récit des étapes.
- **Erreurs :** il les conteste fermement ; reconnaître les siennes sans détour.
- **Code :** fonctions génériques et réutilisables. Une correction s'applique à tous les cas semblables, donc à tous les calques.
- **Coût :** uniquement des solutions gratuites.
- **Confidentialité :** les données réelles d'équipements TDF/ARCAD sont confidentielles. Ne jamais les demander.
- **Matériel :** il travaille **uniquement sur son téléphone** (Google Pixel, Android, Chrome) : pas de PC, pas de terminal, pas de git en ligne de commande.
- **Ne jamais lui demander de lancer une commande git ou un terminal.** Claude fait tous les commits, branches, envois et pull requests. Romain ne fait que : tester sur le téléphone, fusionner une PR (bouton « Merge » de GitHub dans le navigateur ou l'appli), déposer des fichiers via le site GitHub (« Add files via upload », par exemple dans `Ar_city-photos`). Toute consigne à son attention se donne en gestes sur le téléphone.

## Règles de travail
- **Branches :** `main` est la version en ligne. Une branche par sujet ; on relit le diff, puis on fusionne.
- **Tests :** aucune livraison sans tests automatiques verts.
- **Bug signalé :** le reproduire d'abord avec la version d'avant, puis vérifier qu'il disparaît.
- **Version :** `APP_VERSION`, en début de script, prend la date et une lettre, suivies d'un résumé.
- **Historique :** il va dans les messages de commit, plus dans des commentaires datés. Le fichier en contient environ 90, à alléger au nettoyage.
- **Réseau des sessions cloud :** il est limité aux registres de paquets et à GitHub. Les tests simulent donc les tuiles de relief, Overpass, Wikidata et le relais.

## Architecture : fonctions clés de villes-horizon.html
- **Affichage, `draw()`** (30 images/s au plus) :
  - `placed` : rectangles et polygones déjà réservés ;
  - `rectHit` et `polysOverlap` : tests de chevauchement ;
  - placement générique : `placeSlanted` (noms inclinés à 45°, mémoire `lblMem`) et `placeFlat` ;
  - `uiObstacles()` : réserve la place des boutons du bas.
- **Lieux, `visibleCities()` :**
  - filtres : rayon, puis portée selon le type de lieu ;
  - monuments : angle apparent d'au moins 0,12°, 40 noms nets au plus, les 15 plus proches toujours nets ;
  - masquages : toits en ville dense, monuments entre eux, règle de la photo ;
  - modes : Essentiel n'affiche que ce qui est visible ; Tout voir (bouton œil) ajoute le reste en transparence.
- **Relief, `computeTerrain()` :**
  - sources Mapterhorn : z13 fin (IGN en France) jusqu'à 5 km, puis z12, z11 et z8 (Copernicus 30 m) ;
  - deux passes : le relief lointain est publié d'abord ;
  - sous 300 m (`NEAR_KM`), on utilise la bande grossière.
- **Hauteur d'œil :**
  - le sol est relu dans le relief fin après la 2e passe (`fineGround`, correctif du 25/10/2026 pour les remparts de Saint-Malo) ;
  - repli : 15e centile du modèle 30 m, mer exclue ;
  - correction manuelle : `S.obsHeight`.
  - Voir aussi `applyOcclusion` et `assessPlace`.
- **Monuments :**
  - Wikidata en tuiles, via le relais :
    - `/wdtile` jusqu'à 15 km : au moins un article Wikipédia, ou monument historique ;
    - `/monuments` au-delà de 15 km : au moins 80 langues ;
  - tri par type avec `wdClassify` ;
  - `applyMonuments` :
    - plus de seuil de langues depuis la version (j) ;
    - un monument peu connu, sans hauteur, est supposé faire 12 m ;
    - plafond : 150 monuments, plus les 80 plus proches ;
  - OpenStreetMap, par tuiles `otTile` (clé `ot2/n`) : tours télécom, bâtiments hauts, statues (`statueMonuments`, jusqu'à 800 m, 300 m en ville dense).
- **Mobiles, `mobiles()` :**
  - bateaux :
    - noms à plat, en escalier sous l'horizon ;
    - les plus proches sont nommés d'abord (`shipSel`) ;
    - les autres sont regroupés en pastilles « +N », jamais « +1 » ;
  - avions : `mobSpec` ;
  - mémoire des positions : `liveRestore` et `liveSave` (cellules de 0,1°, 9 voisines lues).
- **Calage :**
  - `runAutoAlign0()`, dans cet ordre : soleil (`sunAlign`), puis relief (`cleanHorizonPts` et `fitHorizon`, avec garde-fous ville dense et écart > 3°), puis repères (`landmarkAlign`) ;
  - `pointCalibrate` : toucher un repère, le soleil ou le sommet d'un monument ;
  - boussole et gyroscope combinés par secteurs ;
  - carnet de calage : `calRecord` et `calFlush`, envoyés au relais sur `/calib`.
- **Rejouer une photo :**
  - `readExif` lit le GPS, l'heure (avec OffsetTimeOriginal), la focale en équivalent 24×36 et la direction ;
  - la direction est décalée de +90° sur Pixel en paysage, et peu fiable en portrait ;
  - `photoBench()` ; les mobiles sont désactivés dans ce mode.
- **Cache générique :** `dcFetch`, `dcRead` et `dcPut`, sur la Cache API. Il faut du http(s) : pas de `file://`.

## Tests (`tests/`, lancés par `npm test` et par GitHub Actions à chaque envoi et pull request)
- **Technique :**
  - Playwright avec Chromium, page servie en http local (`tests/helpers/server.js`) ; le crochet n'est injecté que dans `/v1/villes-horizon.html` ;
  - un crochet (`tests/helpers/hook.js`) injecté juste avant le dernier `})();` du script donne accès aux variables internes (`__vh.ev`) et capture les textes d'une image (`__vh.frame`) ;
  - `loadTileData` (relief synthétique), `overpassQuery` et `fetch` sont remplacés par des simulations ; horloge figée ; aucun accès réseau réel (`tests/helpers/app.js`).
- **Photos et caches de test, hors du dépôt public :** dépôt privé `rousseauromain-art/Ar_city-photos` (photos originales avec EXIF) ; exports du cache faits avec `debug/debug-cache.html` (le relief d'un lieu s'exporte lieu par lieu, après avoir ouvert l'appli ou rejoué la photo à cet endroit ; les données en une fois), à y déposer aussi, par paquets de 20 Mo au plus (`..._p1sur3.json`, tous à déposer) ; `tests/helpers/cache.js` (`readDump`, `readDumps` et `readExports` pour les paquets et plusieurs exports, `seedCaches`) rejoue un export dans la Cache API de la page : le vrai code relit relief, lieux et monuments comme sur le téléphone. Ne jamais committer photos ni exports dans `Ar_city`.
- **Commandes (CI à chaque envoi et pull request) :** `npm run lint` (ESLint sur `src/` et `tests/unit/`), `npm run types` (`tsc --noEmit`, JSDoc strict), `npm run test:unit` (`node:test`, `tests/unit/*.test.mjs`), `npm run test:e2e` (Playwright), `npm test` (tout) ; `npm run dump:v1` (harnais ci-dessous, local).
- **Harnais de caractérisation (`tests/caracterisation/`) :** `npm run dump:v1` rejoue les scènes de `scenes.mjs` dans la v1 figée (vrai code, caches de `Ar_city-photos` rejoués) et écrit un JSON par scène et par mode (Essentiel / Tout voir) : par calque et par élément, `etat` (net / transparent / absent), `raison`, `rendu` (dessiné / hors champ / sans place), position et opacité. Dumps dans `Ar_city-photos/dumps/` (privé). Voir `tests/caracterisation/LISEZMOI.md`.
- **Visent la v1 (j), lancés :** chargement et syntaxe de `v1/`, redirection racine, lanceur, pages de diagnostic, bloc WDCLASS identique, noms de lieux sans chevauchement, rempart de Saint-Malo (avec contrôle), port dense.
- **`tests/a-reprendre/` (non lancés) :** tests des apports des 26–27/10 absents de la v1 ; voir `tests/a-reprendre/LISEZMOI.md`.
- **Contexte :** les 47 séries précédentes, écrites hors du dépôt, sont perdues.
- **À couvrir en priorité :**
  - **Relief :**
    - les deux passes et le repli AWS ;
    - la hauteur d'œil sur un rempart : la jetée ne doit pas cacher Dinard ;
    - Turin : toits contre Alpes ;
    - les crêtes.
  - **Étiquettes :**
    - aucun chevauchement ;
    - port dense : les plus proches sont nommés, pastilles « +N », jamais « +1 » ;
    - aucun nom sous les boutons du bas ;
    - avions.
  - **Monuments :** classement par type, plafonds, statues OSM, masquage entre monuments.
  - **Calage :**
    - soleil, sans se laisser piéger par les reflets ;
    - relief et repères ;
    - toucher un repère ;
    - carnet de calage.
  - **Photo rejouée :** EXIF, correction Pixel, rattrapage après un saut de position.
  - **Autres :** caches (vivant, `dcFetch`, tuiles), trames AIS au format Blob, KMZ/KML, boutons et calques.

## Faits établis sur le terrain
- **Calage sur photos (26/10/2026) :** Ibiza, direction EXIF + 90° = 267° contre soleil calculé 267,1° (le recalage sur le soleil donne −2,3° de cap). Saint-Malo : la direction EXIF est fausse d'environ 14° (le recalage sur les repères, −14,4°, remet le fort du Petit Bé à sa place). Turin : le recalage (−19,4°, champ 71,5° → 58,5°) dégradait un cap EXIF juste ; cause : concordances fortuites de repères en ville dense (corrigé par un test de permutation dans `landmarkFit`, repris dans la v2 à l'étape 11b : Turin n'est plus recalé à tort). Le champ affiché à Turin (58,5°) n'est pas reproduit sans les données de Turin : voir l'export du cache.
- **Pixel :** la direction EXIF est décalée de +90° en paysage (vérifié sur 3 photos).
- **Boussole :** 30 à 40° d'erreur près du métal (port de Saint-Malo).
- **Horizon :** les pieds des passants donnent un indice d'horizon.
- **Photos de test :** les pièces jointes du chat perdent leurs EXIF. Déposer les originaux dans `tests/photos/<lieu>/`, avec un LISEZMOI : téléphone, ce qu'on voit, cap réel s'il est connu.
- **Wikidata :** beaucoup de monuments de Saint-Malo n'ont pas de hauteur. Repli pour les lieux (étape 11l) : quand Overpass est en échec, les lieux viennent aussi de Wikidata.

## À faire (point du 25/10/2026)
0. **Refonte :** étapes 0 à 8 faites, étape 9 terminée et étape 10 terminée (10a soleil + pointage, 10b analyse de la photo, 10c « Caler auto » (relief, repères), 10d carnet de calage, écart appris et banc d'essai ; à valider sur le terrain) ; étape 11 (évolutions) à lancer, voir la liste ci-dessous et `REFONTE.md` §9 ; pour mémoire 9a moteur de scène `src/moteur/` fait, 9b page photo `v2/photo.html` + `src/app/` + `src/ui/` + `src/entrees/photo.js` faite, 9c page direct `v2/ar.html` + `src/entrees/capteurs.js` et `direct.js` faite : étape 9 terminée, à valider sur le terrain) (v1 figée, lanceur, fondations v2, harnais, `src/noyau/`, `src/donnees/`, `src/scene/`, `src/rendu/`, calques `relief`, `photo-silhouette`, `lieux`, `monuments`, `equipements` (urbains et pylônes), `reperes` (repères hauts OSM), `kml`, `avions`, `bateaux` ; bande commune `rendu/bande.js` ; données du trafic en direct) ; la suite est dans `REFONTE.md` §9.
1. **Dépôt propre :**
   - relais dans `relais/` ;
   - tests et GitHub Actions (socle en place, voir « Tests ») ;
   - puis découpe en modules (sans outil de construction) ;
   - puis suppression du code mort : ancien placement des bateaux, moteur de relief v1, ancien mode Wikidata, etc.
2. **Hauteur d'œil à l'écran :** puce « œil » reprise dans la v2 (étape 11a). Fait à l'étape 11e : bouton « Réestimer » et « Altitude GPS » (direct) dans la fenêtre de la puce.
3. **Boutons et calage :**
   - (fait à l'étape 11d : un libellé sous chaque icône de la colonne de boutons) ;
   - un calage guidé en un seul bouton (« visez le soleil / la lune / ce repère ») ;
   - (fait à l'étape 11i : l'échelle du champ calée avec 2 repères touchés, en direct ; mémorisée avec les réglages).
4. **Calage de nuit sur la lune (étape 11h, à valider avec une photo de nuit) :** position calculée avec la parallaxe (`positionLune`, vérifiée contre une éphéméride à 0,4°), puis tache ronde et brillante près de la position prévue (même détection que le soleil) ; « Caler auto » l'essaie quand le soleil est couché. Pas encore éprouvé sur une vraie photo de lune.
5. **Caler auto :** réglage « le relief avant le soleil » ajouté à l'étape 11c (décoché par défaut). Mesure sur les 4 photos réelles : quand le soleil est visible, le relief seul se trompe jusqu'à 3° (Morgat : −4,3° contre −7,3° pour le soleil, et le champ change à tort) ; le soleil reste donc en premier par défaut. À rediscuter avec Romain.
6. **Banc d'essai sur `tests/photos` :** cap EXIF comparé au soleil, par téléphone et par orientation, et écart de chaque méthode.
7. **IA de profondeur :** à réévaluer avec le banc d'essai. Le résultat de Saint-Malo n'est pas concluant : 2 points seulement, sur une scène simple.
8. **Rejouer une photo :** lire l'altitude EXIF comme indice de hauteur d'œil.
9. **Relief séparé du masquage (fait à l'étape 10f, 30/10) :** « Calculer le relief » (`calculRelief`, ligne d'horizon, crêtes, calage ; la ligne est affichée par défaut) est indépendant de « Cacher ce qui est derrière le relief » (`relief`, masquage). Éteindre le calcul éteint le masquage ; cocher le masquage rallume le calcul.
   **Masquage par le relief (retour de Romain, 29/10, Saint-Malo), reste à traiter à l'étape 11 :** l'option « masquer ce qui est caché par le relief » fait disparaître des bâtiments pourtant visibles (le fort du Petit Bé, visible, a été traité comme un caillou). But voulu : en ville, tous les bâtiments ; sur un paysage, plutôt les lieux que les bâtiments lointains ; mais un fort ou un monument visible reste affiché. À traiter à l'étape 11 : comparer le verdict du relief avec la silhouette lue sur la photo, et ne pas masquer ce que la photo montre.
10. **Relais :**
   - déployer AisHub et CalibLog (migrations v1 et v2) si ce n'est pas fait ;
   - ajouter au CORS (`ALLOWED_ORIGIN`) les adresses de prévisualisation si l'on passe par Cloudflare Pages.
