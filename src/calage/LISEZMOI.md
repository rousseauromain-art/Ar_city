# calage — corrections du cap, de l'horizon et du champ à partir de repères connus. Étape 10.
- `soleil.js` (10a) : PUR. « Caler auto » sur le soleil : le disque détecté (`vision/soleil.js`) comparé au soleil calculé (heure EXIF en photo, heure du téléphone en direct) → correction de cap ET d'horizon ; messages de refus de la v1.
- `pointage.js` (10a) : PUR. Toucher un repère à l'écran (le soleil, un monument par son sommet, un lieu) → correction de cap, et d'horizon si la hauteur est connue ; textes de la v1.
- `horizon.js` (10c) : PUR. Calage sur le relief : table du relief (720 relèvements), horizon lu dans l'image (luminance 320 px), nettoyage des colonnes au premier plan, ajustement du cap, de l'horizon et du champ (coût robuste sur 70 % des colonnes).
- `reperes.js` (10c) : PUR. Pointes de la silhouette du ciel appariées aux repères fiables (tours, clochers, dômes), jusqu'à 3 passes, limite ±20°. Version de la v1 (j), SANS test de permutation (étape 11). `monumentsPourCalage` : tous les monuments chargés, comme `monumentSites` de la v1.
- `auto.js` (10c) : PUR et asynchrone, SANS effet de bord. « Caler auto » = soleil → relief (garde-fous : ville dense, < 25 colonnes, coût > 0,6°, horizon > 3° en direct) → repères ; renvoie message et corrections, `ui/page.js` les applique.
- À venir : `carnet.js`, `banc.js` (10d).
Tout est pur (aucun DOM) ; `ui/page.js` applique les corrections (`S.headOff`, `S.pitchOff`, pause de la boussole en direct).
