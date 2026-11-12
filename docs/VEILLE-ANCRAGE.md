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

## 4. État d'avancement (2/11/2026)

| # | Action | État |
|---|---|---|
| A | La boussole ne défait plus le calage | **Faite en v2 (PR « ancrage-boussole »).** Retour à la boussole seulement sur un vrai saut du repère du gyroscope : saut instantané (plus de 40° d'une mesure à l'autre, cap défini) ou réouverture (retour au premier plan, caméra relancée). Un désaccord de plus de 40° sans saut ne fait plus rien : la boussole est jugée « perturbée », ignorée (ni apprentissage, ni rattrapage), le cap suit le gyroscope et le calage tient ; elle redevient fiable après 2 s d'accord. Ligne « Cap » du Diagnostic : « BOUSSOLE PERTURBÉE (ignorée depuis N s) ». Écart volontaire avec la v1 (figée), qui garde l'ancienne règle. |
| B | Capteur d'orientation relatif 60 Hz (quaternions) | **Fait en v2, en essai (3/11)** : case « Capteur d'orientation relatif à 60 Hz » (décochée par défaut). `RelativeOrientationSensor` (60 Hz) remplace les mesures relatives de `deviceorientation` ; la boussole (`deviceorientationabsolute`) ne sert plus que de nord et de rattrapage lent, rejetée quand elle ne suit pas (action A). Le quaternion est converti en axes sans angles (`axesDepuisQuaternion` : pas de singularité caméra vers le haut ou le bas) ; équivalence prouvée par test (200 orientations, 4 rotations d'écran, 1e-9). Repli propre sur `deviceorientation` (API absente, page non HTTPS, permission refusée) ; Diagnostic : source, fréquence mesurée, erreur. Non testable sur un vrai capteur depuis la session : à valider sur le Pixel. |
| C | Recalage automatique continu sur le soleil et la lune | **Fait en v2 (3/11)**, case « Recalage continu du cap sur le soleil et la lune » (décochée par défaut, direct seulement). Toutes les 3 s le disque de l'astre est cherché ; quand deux détections concordent à 1° près sur au moins 3 s, téléphone stable (< 10°/s), écart plausible (cap ≤ 15°, horizon ≤ 8° : au-delà, reflet), le cap est corrigé d'un demi-pas, au plus un pas toutes les 10 s, cumul plafonné à ±20°, plus rien sous 0,3°. Carnet : « auto continu soleil/lune ». Diagnostic : état, pas, cumul. Monuments lumineux de nuit (tour Eiffel) : plus tard. |
| D | Échelle du champ calée avec 2 points | Faite (étape 11i). |
| E | Prototype « RA stable » WebXR | **Prototype en essai (3/11)** : bouton « Démarrer le suivi visuel » dans les Réglages (visible seulement si `immersive-ar` est pris en charge). Session `immersive-ar` avec superposition HTML ; la pose du suivi visuel (quaternion, repère WebXR → Est/Nord/Haut : `quaternionXrVersEnu`) alimente la même fusion que le capteur relatif ; le nord arbitraire du suivi est posé UNE fois par la boussole (puis soleil, lune, recalage continu). Pendant la session c'est le suivi qui cadence l'affichage ; la vidéo de la page est masquée (le navigateur compose l'image de la caméra). Repli et message si indisponible. Testé avec un faux `navigator.xr` (conversion de repère prouvée : cap, inclinaison, composition) ; **le vrai suivi ARCore n'est pas testable depuis la session : à mesurer de jour et de nuit sur le Pixel**. |

## 5. Vercors, 11/11/2026 : « le calage ne tient pas dès que je tourne »

### Ce que montrent les deux captures (17:04 et 17:05)
- Le ruban de cap donne le champ affiché : 5° tous les 195 px à 17:04, tous les 141 px à 17:05, pour un écran de 1 753 px. Soit **45° à 17:04, puis 62° à 17:05** (réglé à l'œil par Romain entre les deux).
- Le champ était donc réglé à 45° pour une caméra d'environ 62°. Le tracé tourne alors 1,5 fois plus vite que l'image : un point calé au centre reste juste, tout le reste glisse dès qu'on tourne. Ce n'est pas une dérive du gyroscope.
- Le champ est un réglage gardé d'une session à l'autre, que le pincement à deux doigts, « Caler auto » et la greffe `echelle2` modifient. Rien ne le reliait à la vraie caméra.

### Deuxième cause, propre à la montagne : la projection de la v1
- La v1 place un point par deux formules indépendantes : `x = W/2 + f·tan(Δcap)` et `y = H/2 + f·tan(inclinaison − hauteur)`.
- La vraie projection d'une caméra divise la hauteur par `cos(Δcap)` et couple les deux axes quand le téléphone est incliné.
- Sur un horizon plat (Bretagne), l'écart est nul. Pour une crête à 6° au-dessus de l'horizon, téléphone incliné de 3° : **0,9° d'écart à 30° du centre**, 0,2° à 15°. À 15° de hauteur : 2,3° à 30° du centre.
- Une quarantaine de lignes de `draw()` et du toucher portent ces formules. **Greffe `projection` (12/11, accord de Romain) :** plutôt que de réécrire ces lignes, elle déplace, pendant le dessin de la scène, chaque point tracé par la v1 de sa position « v1 » à sa position exacte, et ramène le point touché dans le repère de la v1. Formule exacte avec les mêmes grandeurs : `h' = atan(tan(hauteur)/cos(Δcap))`, `y = H/2 + f·tan(inclinaison − h')`, `x = W/2 + f·tan(Δcap)·cos(h')/cos(h' − inclinaison)`.

### Ce qu'une application native a de plus qu'une page web
| Sujet | Application native | Chez nous |
|---|---|---|
| Champ de la caméra | Lu dans le système : focale et taille du capteur. | Une page web n'a pas accès à ces valeurs → greffe `champAuto`, qui le mesure. |
| Zoom | Le pincement agrandit l'image et le tracé ensemble : il ne les désaccorde jamais. | Le pincement de la v1 ne change que le tracé → sans effet une fois le champ mesuré (`champAuto`). |
| Orientation | Capteur d'orientation fusionné du système (gyroscope + accéléromètre + boussole). | La v1 fait sa propre fusion : gyroscope pour tourner, boussole pour le nord (niveau 1 du §2). |
| Suivi visuel | ARCore quand le téléphone le permet : la rotation vient du suivi caméra + gyroscope. | WebXR (le même ARCore, vu du web) essayé en v2 : trop lent, abandonné. |
| Mise au point | Continue (réglage du système). | Greffe `nettete` : fixée au plus loin. |
| Rendu | Moteur 3D : projection exacte. | Greffe `projection`. |

**Conclusion :** la tenue d'une application native vient de trois choses — un champ exact, une projection exacte, le suivi visuel. Les deux premières sont à notre portée dans le navigateur ; la troisième ne l'est pas sans WebXR.

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
