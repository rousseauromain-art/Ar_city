# entrees — direct (caméra, GPS, orientation) et photo (image, EXIF) → une même « Vue ». Étape 9.
- `photo.js` (9b) : PUR. `analyserPhoto(octets, {largeurPx, hauteurPx, positionSimulee})` → position (EXIF, sinon position simulée), cap de départ avec la correction du Pixel (+90° / −90°), champ d'après la focale, heure de prise de vue ; `texteInfoPhoto` ; `lirePositionTexte`. La lecture du fichier et de l'image (DOM) est dans `ui/page-photo.js`.
- `direct.js` (9c, à venir) : caméra, GPS, capteurs, fusion boussole/gyroscope.
