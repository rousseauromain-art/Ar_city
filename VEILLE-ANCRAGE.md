# Veille — garder les noms ancrés quand on tourne (boussole, gyroscope, vision)
*27/10/2026. Sert de base à l'étape 11 de `REFONTE.md`.*

## 1. Ce que montrent les captures de Grenelle (27/10, de nuit)

| Vue | Cap affiché | Tour Eiffel réelle | Icône dessinée | Écart |
|---|---|---|---|---|
| Après calage sur la tour | 28° | centre | centre (az 28,1°) | ~0° |
| On tourne un peu | 24° | x ≈ 1 085 px | x ≈ 1 195 px | ~4,5° |
| On tourne encore | 73° en haut, 56° dans la légende | au centre de l'image | absente | **~45°** |

- **Un saut de 45° en quelques secondes n'est pas une dérive :** c'est notre propre garde-fou.
- Depuis le 24/10, si le gyroscope et la boussole sont en désaccord de plus de 40° pendant 2 s (`GYRO_JUMP`), l'appli conclut que le repère du gyroscope a été réinitialisé, revient à la boussole et efface le calage.
- Dans une rue (voitures, métro, structures métalliques), la boussole peut se tromper de plus de 40°. Le garde-fou remplace alors un gyroscope juste par une boussole fausse.
- **À vérifier :** Diagnostic → ligne « Cap ». Le compteur « retour(s) à la boussole » et le message « gyroscope et boussole en désaccord de plus de 40° » le confirmeraient.
- **Deuxième cause, plus faible :** l'échelle (champ de vision). Si le champ réglé n'est pas le vrai, un objet calé au centre glisse vers les bords quand on tourne.

## 2. Comment font les applications de réalité augmentée : 4 niveaux

| Niveau | Principe | Précision du cap | Disponible pour nous (web, gratuit) ? |
|---|---|---|---|
| 1. Fusion des capteurs | Gyroscope pour les rotations, boussole pour le nord | Gyroscope : rotations relatives très justes, dérive lente. Boussole : 10 à 40° d'erreur en ville. | Oui : `deviceorientation`, et mieux, `RelativeOrientationSensor` |
| 2. Repères absolus | Soleil, lune, monument connu, horizon de mer : donnent le vrai nord ponctuellement | ≤ 1° quand c'est bien fait | Oui : c'est notre calage |
| 3. Suivi visuel (VIO) | Caméra et capteurs inertiels suivent le décor image par image ; ARCore et ARKit | Rotation quasi sans dérive ; les objets restent collés au décor | Oui, sur Chrome Android : WebXR `immersive-ar` (ARCore) |
| 4. Positionnement visuel (VPS) | Image comparée à un modèle 3D issu de Street View : Google Maps Live View, ARCore Geospatial API | Position et cap bien meilleurs que GPS et boussole | Non : applications natives seulement, clé Google Cloud |

**Le principe commun :** le nord ne vient de la boussole qu'en dernier recours. On suit les rotations avec ce qui ne dérive pas (gyroscope, puis vision), et on pose le nord une fois avec un repère fiable. Le calage sur le soleil ou la lune garde alors tout son bénéfice quand on tourne.

### Détails utiles
- **Android distingue deux fusions :**
  - le *rotation vector* (avec magnétomètre) ;
  - le *game rotation vector*, sans magnétomètre : « les rotations relatives sont plus justes et ne sont pas affectées par les variations du champ magnétique », mais son nord dérive lentement.
  - Sur Chrome Android, `deviceorientation` correspond au second, `deviceorientationabsolute` au premier.
- **API web récente :** `RelativeOrientationSensor` et `AbsoluteOrientationSensor` donnent l'orientation en quaternion, à une fréquence choisie (60 Hz), plus stable que les angles de `deviceorientation`. Elles demandent l'autorisation accéléromètre et gyroscope, et une page en HTTPS.
- **Détecter une boussole perturbée :** quand on tourne, la boussole doit tourner du même angle que le gyroscope. Si ce n'est pas le cas, le champ magnétique est perturbé, et on ignore la boussole au lieu de lui donner raison.
- **Repère du gyroscope réinitialisé**, le vrai cas visé par notre garde-fou : il se reconnaît à un **saut instantané** de l'orientation relative (une image à l'autre), ou à un événement (appli remise au premier plan, caméra rouverte). Ce n'est pas une divergence progressive.
- **WebXR `immersive-ar` sur Chrome Android :**
  - fonctions publiées : ancres, test d'impact, profondeur ;
  - superposition HTML (DOM overlay) : notre canvas peut rester par-dessus l'image ;
  - accès à l'image de la caméra (Raw Camera Access) pour l'analyse.
  - Le repère WebXR a un nord arbitraire au démarrage : un seul calage (boussole, soleil, repère) l'aligne, puis tient.
  - Contraintes : session plein écran lancée par un toucher, rendu WebGL, « Services Google Play pour la RA » requis (présent sur Pixel), suivi plus fragile de nuit, sur un décor uniforme ou en bougeant vite.
- **Déclinaison magnétique :** environ +1,5° en France. À vérifier si la boussole du navigateur donne le nord magnétique ; c'est secondaire face aux 40° d'erreur.

## 3. Recommandations, dans l'ordre

| # | Action | Effort | Gain attendu |
|---|---|---|---|
| A | **Correctif v1, bloquant** : ne plus jamais laisser la boussole défaire un calage. Le retour à la boussole ne se fait que sur un vrai saut du repère du gyroscope (saut instantané ou réouverture de l'appli ou de la caméra), pas sur un désaccord progressif. Afficher « boussole perturbée » dans la ligne Cap. | Petit | Le calage tient quand on tourne sur place |
| B | v2, `entrees/orientation.js` : `RelativeOrientationSensor` à 60 Hz (quaternions), boussole seulement pour l'estimation initiale, rejet automatique quand elle ne suit pas le gyroscope | Moyen | Suivi plus stable et plus fluide |
| C | Recalage automatique et continu dès qu'un repère fiable est dans l'image : soleil, lune, monument très lumineux de nuit (tour Eiffel) | Moyen | Le nord se corrige seul |
| D | Échelle calée une fois par téléphone avec 2 points, puis mémorisée | Petit | Les objets ne glissent plus vers les bords |
| E | Prototype « RA stable » en WebXR (`immersive-ar`, DOM overlay), derrière un drapeau, mesuré de jour et de nuit à Paris | Gros | Ancrage comparable aux applis natives |

## Sources
- Android, capteurs de position (game rotation vector) : https://developer.android.com/develop/sensors-and-location/sensors/sensors_position
- RelativeOrientationSensor (MDN) : https://developer.mozilla.org/en-US/docs/Web/API/RelativeOrientationSensor
- AbsoluteOrientationSensor (MDN) : https://developer.mozilla.org/en-US/docs/Web/API/AbsoluteOrientationSensor
- Spécification Orientation Sensor (W3C) : https://www.w3.org/TR/orientation-sensor/
- Capteurs pour le web (web.dev) : https://web.dev/generic-sensor/
- ARCore et WebXR, fonctions disponibles : https://developers.google.com/ar/develop/webxr/arcore-comparison
- WebXR DOM Overlays : https://immersive-web.github.io/dom-overlays/
- WebXR Anchors : https://immersive-web.github.io/anchors/
- WebXR Raw Camera Access (Chrome) : https://groups.google.com/a/chromium.org/g/blink-dev/c/LoCH4tthbsI
- ARCore Geospatial API (VPS, Street View) : https://developers.google.com/ar/develop/geospatial
