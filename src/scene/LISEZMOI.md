# scene — PUR : relief, hauteur d'œil, visibilité
- `relief.js`, `masque.js`, `masque-worker.js`, `terrain.js`, `hauteur-oeil.js` : relief et hauteur d'œil (étape 3).
- `cretes.js` : silhouette et crêtes (étape 4). `visibilite.js` : verdict « caché par le relief » (règle commune).
- `liste-affichage.js` : liste commune lieux + monuments (priorité, score, tri, dédoublonnage, nets avant fantômes).
- `regle-photo.js` : verdict d'après la silhouette lue sur la photo (étape 5).
- `mobiles.js` : visibilité d'un avion ou d'un bateau (champ, courbure de la Terre) — étape 8.
