# vision — analyse de l'image (photo ou caméra) : lecture des pixels et détections. Étape 10.
- `lire-pixels.js` : la SEULE périphérie DOM (canvas, `getImageData`) ; image réduite et recadrée comme à l'écran. Reprend `grabFrameRGB` de la v1.
- `soleil.js` (10a) : PUR. Taches blanches à 4 seuils de bleu, composantes connexes, taches compactes, rejet des reflets, candidats du soleil. Identique à `sunAlign` de la v1 (test sur le code extrait, puis sur 4 photos réelles).
- `silhouette-ciel.js` (10b) : PUR. Limite ciel / non-ciel sur 160 colonnes (couleur de référence médiane de la bande haute, ciel bleu ou clair peu saturé, roulis compensé) → `analysePhoto` (rafraîchie toutes les 3 s par `ui/page.js` quand « Visibilité d'après la photo » est cochée). Identique à `observeSkyline` de la v1.
- À venir : détection de l'horizon (10c).
Pas d'IA : la v1 travaille à la couleur et à la luminance (l'IA de profondeur n'est que dans `debug/debug-profondeur.html`).
