# entrees — direct (caméra, GPS, orientation) et photo (image, EXIF) → une même « Vue ». Étape 9.
- `photo.js` (9b) : PUR. `analyserPhoto(octets, {largeurPx, hauteurPx, positionSimulee})` → position (EXIF, sinon position simulée), cap de départ avec la correction du Pixel (+90° / −90°), champ d'après la focale, heure de prise de vue ; `texteInfoPhoto` ; `lirePositionTexte`.
- `capteurs.js` (9c) : PUR. Fusion boussole / gyroscope par secteurs de 30° (`creerFusion`, `surOrientation`, `poseCapteurs`, `noterCalage`), identique à la v1 (test sur le code extrait de la v1) ; horloge passée en paramètre.
- `direct.js` (9c) : navigateur. Caméra arrière (reprise au retour d'arrière-plan), GPS haute précision, événements d'orientation, permission iOS ; renvoie la position et alimente la fusion.
La lecture du fichier et de l'image de la photo (DOM) est dans `ui/page.js`.
