# Harnais de caractérisation

`npm run dump:v1` (optionnel : `-- --scene=<id>`, `-- --sortie=<dossier>`) rejoue les scènes de `scenes.mjs` dans la **v1 figée** et écrit `<PHOTOS_DIR>/dumps/<scène>.<mode>.json`.

- Le vrai code de la v1 lit les caches rejoués (`tests/helpers/cache.js`) ; seuls le réseau (404 pour les tuiles absentes, 503 ailleurs) et l'horloge sont maîtrisés.
- Par calque (lieux, repères, sommets, monuments, équipements, pylônes, bâtiments) et par élément : `etat` (net / transparent / absent), `raison`, `rendu` (dessine / hors-champ / sans-place), position et opacité du texte dessiné.
- Une scène dont le relief n'est pas complet dans l'export est signalée en fin d'exécution (réexporter avec les coordonnées exactes de la prise de vue dans `debug/debug-cache.html`).
- Dépôt privé : les dumps révèlent lieux et dates (voir `docs/decisions/002-dumps-dans-le-depot-prive.md`).
