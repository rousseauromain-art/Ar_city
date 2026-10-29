# Architecture de la v2

Référence : `REFONTE.md` (méthode du figuier étrangleur, règles, plan). Ce document décrit **ce qui existe** ; il est mis à jour à chaque étape.

## Vue d'ensemble

```
index.html            lanceur (v1, v2 en développement, outils)
v1/                   application de référence FIGÉE (2026-10-25 (j))
debug/                outils de diagnostic (liés à la v1), dont debug-cache.html (export du cache)
v2/outils.html        page d'outils de la v2 (étape 1)
src/                  modules ES natifs de la v2 (sans outil de construction)
tests/unit            node:test sur les modules purs
tests/e2e             Playwright : parcours critiques, sur la v1 figée et sur v2/outils.html
tests/caracterisation harnais : rejoue des scènes de référence dans la v1 et écrit un dump par calque
tests/a-reprendre     tests des apports des 26–27/10 absents de la v1 (non lancés)
```

## Flux de données (cible)

```
entrees/ (direct, photo) ──► Vue ──► scene/ ──► calques/<un fichier par calque> ──► rendu/ (placement commun) ──► canvas
donnees/ (réseau unique, cache, sources) ─────────┘          calage/ et vision/ ◄── Vue + scène
```

Sens des dépendances : `ui → rendu → calques → scene, calage, vision → noyau`. `donnees` et `entrees` fournissent les données ; `noyau` n'importe rien ; **un calque n'importe jamais un autre calque**.

## Ce qui est en place (étapes 1 à 8)

| Module | Rôle |
|---|---|
| `src/outils/journal.js` | tampon circulaire d'événements (info, avert, erreur) ; `journal.erreur(module, message, données)` |
| `src/outils/etat.js` | **un seul état**, modifié par des fonctions nommées ; instantané copié |
| `src/outils/stockage.js` | clés `vh2:`, caches `vh2-`, enregistrements `{v, d}` versionnés avec migrations ; ne touche jamais aux clés de la v1 |
| `src/outils/drapeaux.js` | fonctions expérimentales, désactivées par défaut (`?drapeaux=lune`) |
| `src/outils/rapport.js` | rapport JSON borné en taille (« Exporter un rapport ») |
| `src/outils/debug.js` | `?debug=1` charge Eruda (version figée) |
| `src/donnees/reseau.js` | **seul accès réseau** : délai, nouvelles tentatives, doublons fusionnés, cache, hors ligne |
| `src/ui/outils-page.js` | écran de `v2/outils.html` (DOM uniquement) |
| `src/types.d.ts` | types communs : `Vue`, `Calque`, `ElementClasse`, `RapportV2` |
| `src/noyau/*` (étape 2) | constantes, maths d'angles, géo (distance, cap, courbure, horizon), soleil, EXIF et direction du Pixel |
| `src/donnees/tuiles-relief.js` | tuiles d'altitude : Mapterhorn, secours AWS (mosaïque de 4 tuiles), mer, abandon après 4 échecs |
| `src/donnees/cache-api.js`, `decodage-navigateur.js` | périphérie : Cache API (`vh2-…`) et décodage webp/png en pixels bruts |
| `src/scene/relief.js` | bandes de tuiles, altitude en un point, masque par relèvement (la silhouette) |
| `src/scene/hauteur-oeil.js` | sol sous les pieds (relief fin, sinon 15e centile du modèle 30 m, mer exclue), altitude de l'œil |
| `src/scene/masque.js`, `workers/masque-relief.js`, `scene/masque-worker.js` | masque sur 720 relèvements : fil principal par tranches de 8 ms, ou Worker (tuiles transférées sans copie) |
| `src/scene/terrain.js` | relief en deux passes (lointain publié d'abord), repli AWS, hauteur d'œil relue dans le relief fin |
| `src/rendu/projection.js` | **seule** projection relèvement/site → pixels, champ affiché, ligne d'horizon |
| `src/rendu/commandes.js`, `canvas.js` | un calque renvoie des **commandes** de dessin (testables) ; `canvas.js` est le seul module qui dessine |
| `src/rendu/reservations.js` | places déjà prises, chevauchement exact de rectangles inclinés, obstacles d'interface (base du placement des noms, étape 5) |
| `src/rendu/repere-horizon.js` | ligne d'horizon pointillée et réticule |
| `src/scene/cretes.js` | silhouette (angle, distance) et crêtes intérieures déduites du masque |
| `src/calques/relief.js` | silhouette graduée, crêtes (Essentiel : principales ; Tout voir : toutes), pastilles de distance des plans |
| `src/calques/photo-silhouette.js` | silhouette lue sur la photo, pointillés bleus, Tout voir seulement ; la lecture des pixels viendra avec `vision/` (étape 10) |
| `src/donnees/{mvt,overpass,openfreemap,relais-lieux,fusion}.js` | sources de lieux : décodeur de tuiles vectorielles, Overpass (course entre 5 miroirs), OpenFreeMap, Geoapify / GeoNames via le relais, fusion par nom et proximité |
| `src/donnees/{cache-donnees,atlas,lieux,lieux-integres}.js` | mémoire générique par zone (frais → réseau → secours périmé), atlas hors ligne, chargement des lieux en parallèle, liste intégrée de dernier recours |
| `src/donnees/{wikidata,monuments-wikidata,monuments}.js` | monuments Wikidata : tri monument / équipement / écarté (`wdClassify`), fabrication (plafonds, hauteurs supposées), chargement par tuiles du relais, Wikidata direct, mémoire de la zone |
| `src/donnees/{trafic,avions,navires,memoire-direct}.js` | trafic en direct : avions (OpenSky via le relais ou direct) et navires (AIS via le relais) ; extrapolation au cap, quota, mobiles proches, mémoire en direct (cases de 0,1°) |
| `src/donnees/{telecom,reperes-hauts}.js` | pylônes ANFR (relais `/telecom`, mémoire 7 jours) et repères hauts OpenStreetMap (tours, clochers, immeubles hauts) au format de la v1 |
| `src/donnees/{kml,kml-diagnostic,couches-perso}.js` | couches personnelles KMZ/KML : lecture locale, recherche, diagnostic de structure sans valeurs, mémoire `vh2-couches-perso` |
| `src/donnees/{osm-tuiles,monuments-osm}.js` | objets OpenStreetMap par tuiles fixes ; tours télécom, bâtiments hauts, statues comme monuments, fusion sans doublon avec Wikidata |
| `src/scene/regle-photo.js` | verdict « vu / caché / indéterminé » d'après la silhouette lue sur la photo (lieux et monuments) |
| `src/rendu/placement.js`, `etiquettes.js` | **placement commun des noms** (inclinés à 45°, à plat, mémoire d'une image à l'autre, obstacles d'interface) et leur conversion en commandes de dessin |
| `src/scene/liste-affichage.js` | liste commune lieux + monuments : priorité, score de notoriété, tri stable, dédoublonnage des homonymes, nets avant fantômes |
| `src/scene/mobiles.js` | visibilité d'un avion ou d'un bateau : champ, courbure de la Terre, filtre par nom |
| `src/rendu/{mobiles,escalier}.js` | icônes des mobiles regroupées et réservées avant les étiquettes, noms d'avions (incliné, à plat, « NOM +N »), noms de bateaux à plat en escalier avec choix des plus proches et pastilles « +N » |
| `src/calques/{avions,bateaux}.js` | classement des avions et des bateaux (champ, horizon, recherche) |
| `src/rendu/bande.js` | **bande des équipements commune** (équipements urbains, pylônes, repères hauts, couches personnelles) : groupes, icône + pastille du nombre, nom à côté, dessous ou en haut, étage bas ou haut, sites trouvés, pastilles au bord |
| `src/app/application.js` | **racine de composition** (étape 9b) : assemble réseau, caches, sources de données et relief, décide quand charger (seuils de la v1), publie les données au moteur |
| `src/entrees/photo.js` | photo rejouée : position, cap (correction du Pixel), champ, heure, d'après l'EXIF |
| `src/ui/page-photo.js`, `style.css`, `v2/photo.html` | page v2 « photo rejouée », même interface que la v1 |
| `src/donnees/sommets-lointains.js` | grands sommets jusqu'à 200 km (tuiles OpenFreeMap z7), gardés 60 jours |
| `src/moteur/` | **moteur de scène** (étape 9a) : `composerScene` assemble tous les calques dans l'ordre de la v1 (horizon, croix, relief, noms, bande, mobiles, ruban de cap, message), réglages et leur mémorisation, bandeau d'état |
| `src/rendu/{ruban-cap,croix-visee}.js` | ruban de cap (graduations, cardinaux) et croix de visée |
| `src/rendu/icones.js` | pictogrammes et silhouettes de monuments (listes d'opérations de chemin, sans canvas) |
| `src/calques/{equipements,reperes,kml}.js` | équipements urbains et pylônes télécom, repères hauts OSM, couches personnelles : classement (portée, plafond, relief, doublons) et couches de bande à poser |
| `src/calques/monuments.js` | monuments : classement Essentiel / Tout voir avec raison (portée, toits, plafond, masquage entre monuments, relief, photo), icônes et noms à poser |
| `src/calques/lieux.js` | villes, bourgs, villages, hameaux, lieux remarquables (phares, caps, îles, plages, sommets lointains) : classement Essentiel / Tout voir avec raison, puis étiquettes à poser |
| `src/scene/visibilite.js` | verdict « caché par le relief » commun à tous les calques (+ règle des tours OSM) ; les autres raisons viendront avec leurs calques |

Toutes les dépendances (fetch, horloge, stockage, journal) sont **injectées** : les modules se testent sans navigateur.

## Qualité (CI, à chaque envoi et pull request)

1. `npm run lint` : ESLint sur `src/` et `tests/unit/` (jamais de `catch` vide).
2. `npm run types` : `tsc --noEmit`, `checkJs` strict, types en JSDoc (`// @ts-check` en tête de chaque module).
3. `npm run test:unit` : `node:test`, moins de 2 s.
4. `npm run test:e2e` : Playwright.

La v1 figée, `debug/` et les tests Playwright (CommonJS) sont hors du lint et du contrôle de types.

## Harnais de caractérisation

`npm run dump:v1` rejoue chaque scène de `tests/caracterisation/scenes.mjs` dans la v1 **sans la modifier**, avec le vrai code de la page lisant les caches exportés (`debug/debug-cache.html`), et écrit un JSON par scène et par mode (Essentiel, Tout voir). Chaque élément de chaque calque : `etat` (net, transparent, absent), `raison`, `rendu` (dessiné, hors champ, sans place), position et opacité. Le comparateur complet v1/v2 par calque arrivera avec les premiers calques (étape 4) ; pour le relief, `tests/e2e/relief-v2-parite.spec.js` compare déjà, sur les scènes réelles, tuiles, hauteur d'œil, masque et verdict de chaque lieu (aucun écart toléré). Pour les lieux, `tests/e2e/lieux-v2.spec.js` compare sur les 5 scènes de référence : la liste de lieux rechargée par la v2 depuis les mêmes caches, le classement, tous les traits et textes (mémoire de placement comprise) et le badge de l'œil. Pour les monuments, `tests/e2e/monuments-donnees-v2.spec.js` compare la base Wikidata, les écartés, les objets OSM, la liste finale de 157 à 3 237 monuments et les doublons de bâtiments. Pour le dessin du relief, `tests/e2e/relief-v2-trace.spec.js` enregistre chaque trait et texte de la v1 (`tests/helpers/enregistreur.js`) et le compare à celui des commandes v2 rejouées, en Essentiel et en Tout voir. Écart signalé : l'horloge de test figée laisserait la v1 garder l'altitude des lieux lue dans le relief lointain ; le harnais la relit, comme en conditions réelles.

Photos, exports et dumps restent dans le dépôt privé `Ar_city-photos` (ils révèlent des lieux et des dates).
