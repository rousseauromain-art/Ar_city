# Villes à l'horizon — contexte pour Claude

Fichier lu au début de chaque session Claude Code. Le tenir à jour à chaque décision importante.

## Le projet
- Application web de réalité augmentée façon PeakFinder. Par-dessus l'image de la caméra, elle affiche :
  - les noms des lieux et des monuments ;
  - le relief ;
  - les bateaux (AIS) et les avions ;
  - les équipements télécom.
- `villes-horizon.html` : une seule page (HTML, CSS et JS, environ 5 200 lignes), servie par GitHub Pages : https://rousseauromain-art.github.io/Ar_city/villes-horizon.html
- `config.js` : adresse du relais. Il est public et ne contient aucun secret.
- `index.html` : redirige vers `villes-horizon.html`.
- Pages de diagnostic, dans `debug/` (elles chargent `../config.js`) :
  - `debug/debug-trafic.html` : AIS et avions ;
  - `debug/debug-profondeur.html` : Depth Anything V2 et SegFormer, rejouer une photo, export JSON ;
  - `debug/debug-lieux.html`.
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
- **Matériel :** téléphone de test Google Pixel (Android, Chrome) ; poste de travail sous Windows 11, sans droits d'administrateur.

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
  - repli à plat pour TOUS les lieux sans place pour le nom incliné (vers le haut, puis sous le point) ; avant le 26/10/2026 seuls les monuments l'avaient ;
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
  - plein écran en photo rejouée = vue épurée (classe `clean` : bandeaux et informations masqués, plus de place pour les noms) ;
  - `readExif` lit le GPS, l'heure (avec OffsetTimeOriginal), la focale en équivalent 24×36 et la direction ;
  - la direction est décalée de +90° sur Pixel en paysage, et peu fiable en portrait ;
  - `photoBench()` ; les mobiles sont désactivés dans ce mode.
- **Cache générique :** `dcFetch`, `dcRead` et `dcPut`, sur la Cache API. Il faut du http(s) : pas de `file://`.

## Tests (`tests/`, lancés par `npm test` et par GitHub Actions à chaque envoi et pull request)
- **Technique :**
  - Playwright avec Chromium, page servie en http local (`tests/helpers/server.js`) ;
  - un crochet (`tests/helpers/hook.js`) injecté juste avant le dernier `})();` du script donne accès aux variables internes (`__vh.ev`) et capture les textes d'une image (`__vh.frame`) ;
  - `loadTileData` (relief synthétique), `overpassQuery` et `fetch` sont remplacés par des simulations ; horloge figée ; aucun accès réseau réel (`tests/helpers/app.js`).
- **Photos et caches de test, hors du dépôt public :** dépôt privé `rousseauromain-art/Ar_city-photos` (photos originales avec EXIF) ; export du cache de l'appli (Réglages > Exporter le cache) à y déposer aussi. L'export est coupé en paquets de 20 Mo au plus (`..._p1sur3.json`, tous à déposer) ; `tests/helpers/cache.js` (`readDump`, `readDumps` pour les paquets, `seedCaches`) rejoue un export dans la Cache API de la page : le vrai code relit relief, lieux et monuments comme sur le téléphone. Ne jamais committer photos ni exports dans `Ar_city`.
- **Couverts :** syntaxe du script sans le crochet de test (une apostrophe non échappée dans `APP_VERSION` a déjà cassé la page entière), hauteur de prise de vue (puce « œil » = correction, détail au toucher), repères rangés avec les calques, chargement sans erreur, redirection, pages de diagnostic, bloc WDCLASS identique, noms de lieux sans chevauchement, rempart de Saint-Malo (avec contrôle qui reproduit le bug d'avant), port dense.
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
- **Calage sur photos (26/10/2026) :** Ibiza, direction EXIF + 90° = 267° contre soleil calculé 267,1° (le recalage sur le soleil donne −2,3° de cap). Saint-Malo : la direction EXIF est fausse d'environ 14° (le recalage sur les repères, −14,4°, remet le fort du Petit Bé à sa place). Turin : le recalage (−19,4°, champ 71,5° → 58,5°) dégradait un cap EXIF juste ; cause : concordances fortuites de repères en ville dense (corrigé par un test de permutation dans `landmarkFit`). Le champ affiché à Turin (58,5°) n'est pas reproduit sans les données de Turin : voir l'export du cache.
- **Pixel :** la direction EXIF est décalée de +90° en paysage (vérifié sur 3 photos).
- **Boussole :** 30 à 40° d'erreur près du métal (port de Saint-Malo).
- **Horizon :** les pieds des passants donnent un indice d'horizon.
- **Photos de test :** les pièces jointes du chat perdent leurs EXIF. Déposer les originaux dans `tests/photos/<lieu>/`, avec un LISEZMOI : téléphone, ce qu'on voit, cap réel s'il est connu.
- **Wikidata :** beaucoup de monuments de Saint-Malo n'ont pas de hauteur.

## À faire (point du 25/10/2026)
1. **Dépôt propre :**
   - relais dans `relais/` ;
   - tests et GitHub Actions (socle en place, voir « Tests ») ;
   - puis découpe en modules (sans outil de construction) ;
   - puis suppression du code mort : ancien placement des bateaux, moteur de relief v1, ancien mode Wikidata, etc.
2. **Hauteur d'œil à l'écran :** puce « œil » affichée à côté du rayon (fait, 26/10/2026). Reste : un bouton « Réestimer » ; l'altitude GPS comme deuxième source.
3. **Boutons et calage :**
   - un libellé sous chaque icône de la colonne de boutons ;
   - un calage guidé en un seul bouton (« visez le soleil / la lune / ce repère ») ;
   - l'échelle (champ de vision) calée une fois par téléphone avec 2 points, puis mémorisée.
4. **Calage de nuit sur la lune :** position calculée avec la parallaxe, puis tache ronde et brillante près de la position prévue.
5. **Caler auto :** remettre le relief (l'algorithme d'origine) en premier, le soleil en second.
6. **Banc d'essai sur `tests/photos` :** cap EXIF comparé au soleil, par téléphone et par orientation, et écart de chaque méthode.
7. **IA de profondeur :** à réévaluer avec le banc d'essai. Le résultat de Saint-Malo n'est pas concluant : 2 points seulement, sur une scène simple.
8. **Rejouer une photo :** lire l'altitude EXIF comme indice de hauteur d'œil.
9. **Relais :**
   - déployer AisHub et CalibLog (migrations v1 et v2) si ce n'est pas fait ;
   - ajouter au CORS (`ALLOWED_ORIGIN`) les adresses de prévisualisation si l'on passe par Cloudflare Pages.
