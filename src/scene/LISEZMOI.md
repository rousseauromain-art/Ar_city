# scene — PUR : relief, hauteur d'œil, visibilité (étape 3 faite)
- `relief.js` : bandes de tuiles, altitude en un point, masque par relèvement.
- `hauteur-oeil.js` : sol sous les pieds et altitude de l'œil.
- `masque.js` / `masque-worker.js` : masque sur tous les relèvements (fil principal par tranches, ou Worker).
- `terrain.js` : relief en deux passes, repli AWS.
- `visibilite.js` : verdict « caché par le relief » (règle commune à tous les calques).
Parité avec la v1 : `tests/unit/relief.test.mjs` (bloc TERRAIN-CORE extrait de la v1) et `tests/e2e/relief-v2-parite.spec.js` (scènes réelles).
