# donnees — réseau (un seul accès), caches, sources
- `reseau.js` : seul accès réseau (délai, nouvelles tentatives, doublons fusionnés, cache, hors ligne ; `requeter` : requête unique GET ou POST, option `brut`).
- `tuiles-relief.js`, `cache-api.js`, `decodage-navigateur.js` : tuiles d'altitude (étape 3).
- `mvt.js`, `overpass.js`, `openfreemap.js`, `relais-lieux.js`, `fusion.js`, `lieux.js` : sources de lieux (étape 5).
- `cache-donnees.js` : mémoire générique par zone (frais → réseau → secours périmé). `atlas.js`, `lieux-integres.js` : hors ligne.
- `wikidata.js`, `monuments-wikidata.js`, `monuments.js` : monuments Wikidata (étape 6a).
- `osm-tuiles.js`, `monuments-osm.js` : tours, bâtiments hauts et statues OpenStreetMap (étape 6a).
- `telecom.js` : pylônes et supports ANFR via le relais (nature → icône, opérateurs, 5G, mémoire 7 jours, secours périmé) (étape 7a).
- `reperes-hauts.js` : tours, clochers, châteaux d'eau, cheminées, mâts et immeubles hauts OpenStreetMap, noms fabriqués (étape 7a).
- `kml.js`, `kml-diagnostic.js`, `couches-perso.js` : couches personnelles KMZ/KML lues en local, diagnostic sans valeurs, mémoire `vh2-couches-perso` (étape 7a).
Les bâtiments BD TOPO (calque Silhouette, éteint par défaut) restent à reprendre ; le calque `monuments` reçoit pylônes et repères en paramètres.
- `trafic.js`, `avions.js`, `navires.js`, `memoire-direct.js` : avions et navires en direct, extrapolation, quota OpenSky, mémoire en direct (étape 8a). `reseau.requeter({brut:true})` renvoie aussi `entetes.get(nom)`.
- `wikidata-lieux.js` (11l) : repli pour les LIEUX (villes, villages, hameaux, îles, caps) quand tous les miroirs Overpass sont en échec : une requête SPARQL (service « around ») directe vers Wikidata ; ses lieux se fusionnent avec ceux des autres sources et le diagnostic affiche son état.
