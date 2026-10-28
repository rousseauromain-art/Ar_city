# donnees — réseau (un seul accès), caches, sources
- `reseau.js` : seul accès réseau (délai, nouvelles tentatives, doublons fusionnés, cache, hors ligne ; `requeter` : requête unique GET ou POST, option `brut`).
- `tuiles-relief.js`, `cache-api.js`, `decodage-navigateur.js` : tuiles d'altitude (étape 3).
- `mvt.js`, `overpass.js`, `openfreemap.js`, `relais-lieux.js`, `fusion.js`, `lieux.js` : sources de lieux (étape 5).
- `cache-donnees.js` : mémoire générique par zone (frais → réseau → secours périmé). `atlas.js`, `lieux-integres.js` : hors ligne.
- `wikidata.js`, `monuments-wikidata.js`, `monuments.js` : monuments Wikidata (étape 6a).
- `osm-tuiles.js`, `monuments-osm.js` : tours, bâtiments hauts et statues OpenStreetMap (étape 6a).
Les pylônes ANFR et les bâtiments BD TOPO arrivent avec leurs calques (étape 7) ; le calque `monuments` les reçoit en paramètres.
