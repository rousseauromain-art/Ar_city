# donnees — réseau (un seul accès), caches, sources
- `reseau.js` : seul accès réseau (délai, nouvelles tentatives, doublons fusionnés, cache, hors ligne ; `requeter` : requête unique GET ou POST).
- `tuiles-relief.js`, `cache-api.js`, `decodage-navigateur.js` : tuiles d'altitude (étape 3).
- `mvt.js`, `overpass.js`, `openfreemap.js`, `relais-lieux.js`, `fusion.js` : sources de lieux (étape 5).
- `cache-donnees.js` : mémoire générique par zone (frais → réseau → secours périmé). `atlas.js`, `lieux-integres.js` : hors ligne.
- `lieux.js` : charge les lieux depuis toutes les sources en parallèle.
Les sources monuments (Wikidata), pylônes et bâtiments arrivent avec leurs calques.
