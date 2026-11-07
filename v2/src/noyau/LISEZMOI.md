# noyau — fonctions PURES, sans dépendance externe (étape 2 faite)
- `constantes.js` : rayon terrestre, réfraction, hauteur des yeux… avec leur origine.
- `maths.js` : écart d'angle, cap, borner.
- `geo.js` : distance et cap, point au cap, courbure, horizon, élévation apparente, lecture « lat, lon ».
- `astro.js` : position du soleil (la lune viendra avec le drapeau `lune`).
- `exif.js` : EXIF d'un JPEG, champ depuis la focale, direction corrigée du Pixel.
Parité avec la v1 vérifiée par `tests/unit/noyau.test.mjs` (les fonctions de la v1 y sont extraites et comparées).
