# vision — analyse de l'image (photo ou caméra) : lecture des pixels et détections. Étape 10.
- `lire-pixels.js` : la SEULE périphérie DOM (canvas, `getImageData`) ; image réduite et recadrée comme à l'écran. Reprend `grabFrameRGB` de la v1.
- `soleil.js` (10a) : PUR. Taches blanches à 4 seuils de bleu, composantes connexes, taches compactes, rejet des reflets, candidats du soleil. Identique à `sunAlign` de la v1 (test sur le code extrait, puis sur 4 photos réelles).
- À venir : `silhouette-ciel.js` (10b, visibilité d'après la photo), détection de l'horizon (10c).
Pas d'IA : la v1 travaille à la couleur et à la luminance (l'IA de profondeur n'est que dans `debug/debug-profondeur.html`).
