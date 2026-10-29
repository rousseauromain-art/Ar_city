# calage — corrections du cap, de l'horizon et du champ à partir de repères connus. Étape 10.
- `soleil.js` (10a) : PUR. « Caler auto » sur le soleil : le disque détecté (`vision/soleil.js`) comparé au soleil calculé (heure EXIF en photo, heure du téléphone en direct) → correction de cap ET d'horizon ; messages de refus de la v1.
- `pointage.js` (10a) : PUR. Toucher un repère à l'écran (le soleil, un monument par son sommet, un lieu) → correction de cap, et d'horizon si la hauteur est connue ; textes de la v1.
- À venir : `horizon.js`, `reperes.js`, `auto.js` (10c : relief puis repères), `carnet.js`, `banc.js` (10d).
Tout est pur (aucun DOM) ; `ui/page.js` applique les corrections (`S.headOff`, `S.pitchOff`, pause de la boussole en direct).
