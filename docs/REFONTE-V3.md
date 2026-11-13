# Refonte v3 — la v1, plus des greffes activables
*07/11/2026. Ce document prime sur `REFONTE.md` et sur l'historique des sessions.*

## 1. Pourquoi
- **La v2 (27/10 – 06/11)** a réécrit la v1 en environ 150 modules. Sur le terrain, elle fait moins bien que la v1 :
  - démarrage plus lent ;
  - plus de dérive quand on tourne ;
  - fiches réduites et aides « ? » perdues ;
  - essais de calage (WebXR, capteur relatif, recalage continu, rue, toits…) sans gain visible, mais qui alourdissent l'appli.
- **Ce qui marche dans la v2 :**
  - le calage sur le soleil et sur la lune ;
  - le test contre les coïncidences de repères (Turin) ;
  - la puce œil ;
  - les libellés sous les icônes ;
  - la page d'accueil des versions.
- **Décision de Romain :** la v3 part de la v1 (j), intacte. Chaque greffe venue de la v2 est placée derrière un interrupteur (*feature flag*), éteint par défaut. Le développement se fait d'un bloc ; Romain valide chaque greffe sur le terrain quand il le peut.

## 2. Dépôt : un dossier par version, la racine réduite au minimum
- **Même dépôt `Ar_city`.** Ce qui reste en place :
  - l'adresse GitHub Pages ;
  - le relais Cloudflare ;
  - les secrets ;
  - la CI.
- **Avant tout changement :** poser le tag `v2-fin` sur `main`.
- **Tout ce qui ne sert qu'à la v2 part dans `v2/`.** La v2 est ensuite gelée, mais elle doit marcher à l'identique après le déplacement :
  - mêmes adresses de pages ;
  - `?modules=1` ;
  - service worker ;
  - tests verts.

```
index.html            page d'accueil : la seule page à la racine
config.js             adresse du relais (la v1 figée la lit en ../config.js : il reste ici)
CLAUDE.md  README.md  lus à la racine par Claude Code et par GitHub
package.json  package-lock.json  playwright.config.js   outils de test communs
.github/              CI et publication (GitHub l'exige à la racine)
v1/                   v1 (j), figée, jamais modifiée
v2/                   toute la v2, gelée (tag v2-fin), source des greffes
  ar.html  photo.html  outils.html
  src/  construction/  tests/  docs/  REFONTE.md  eslint.config.mjs  tsconfig.json
v3/
  villes-horizon.html la v1 + points d'entrée + pierres tombales + correctif du §5
  greffes.js          registre des interrupteurs et panneau « Greffes v2 »
  greffes/            un fichier par greffe, autonome
  tests/              tests de la v3
relais/               Worker Cloudflare (dossier racine « relais » côté Cloudflare : ne pas déplacer)
debug/                outils : trafic, profondeur, lieux, export du cache
tests/commun/         harnais partagé : serveur de test, crochet, rejeu des caches, scènes réelles,
                      comparaison avec la v1, banc de vitesse, écarts acceptés
docs/                 REFONTE-V3.md, ETAT.md, VEILLE-ANCRAGE.md
```

- **Supprimé :** `villes-horizon.html` à la racine (ancienne adresse, qui redirigeait vers la v1). La page d'accueil devient la seule entrée.
- **Publication (`pages.yml`, `v2/construction/construire.mjs`) :** la v2 est construite depuis `v2/src/`. La v1, la v3, `debug/`, la page d'accueil et `config.js` sont copiés tels quels.
- **CI :**
  - les tests de la v2 ne tournent que si `v2/` change ;
  - ceux de la v3 tournent à chaque PR ;
  - `parite.yml` compare la v1 et la v3, toutes greffes éteintes.
- **Une greffe recopie dans son propre fichier le code utile de `v2/src/` ; elle n'importe rien de la v2.** On pourra ainsi archiver la v2 sans casser la v3.
- **Données et réglages :**
  - la v3 partage avec la v1 les caches de données (lieux, relief, monuments), au même format ;
  - elle a ses propres réglages, sous une autre clé, recopiés une seule fois depuis ceux de la v1 ;
  - les interrupteurs ont leur propre clé ;
  - une greffe ne doit jamais modifier les réglages de la v1.
- **Une fois que la v3 a remplacé la v1 sur le terrain :** retirer `v2/` du dépôt (le tag garde l'historique).

## 3. Règles
1. **Tout éteint = v1.** Un test automatique tourne à chaque PR. Toutes greffes éteintes, la v3 doit produire, sur les scènes réelles, la même trame de dessin et la même interface que la v1 (libellés, aides, fiches). Scènes : les 5 actuelles, plus Cesson et Rennes centre dès que leurs exports sont disponibles.
2. **Une greffe = un fichier + un interrupteur, éteint par défaut.**
   - Elle est branchée dans la v1 par un point d'entrée court, par exemple `G.actif('lune') && G.lune.evaluer(...)`.
   - Son fichier n'est chargé que si l'interrupteur est allumé.
3. **Deux types de greffes :**
   - un *ajout* : une fonction en plus ;
   - un *remplacement* : l'interrupteur choisit entre le code de la v1 et celui de la v2.
4. **Tests :** chaque greffe seule, puis toutes allumées. On ne teste pas toutes les combinaisons.
5. **Décision pour chaque greffe :**
   - validée : elle devient la règle, et on retire l'interrupteur et l'ancien code ;
   - rejetée : on supprime son fichier.
   - Seul Romain change l'état « terrain » dans `docs/ETAT.md`.
6. **Panneau « Greffes v2 » dans les Réglages :**
   - une ligne par greffe : interrupteur, une phrase d'explication, état (non testé / validé / rejeté) ;
   - réglage possible aussi par l'adresse de la page (`?g=lune,permutation`) ;
   - les greffes allumées figurent dans le Diagnostic et dans les exports.
7. **La v1 n'est pas réécrite.** Seules modifications permises : les points d'entrée, les pierres tombales (§6) et le correctif du §5. Pas de renommage, pas de reformatage.
8. **Livraison :** la v3 reste une page unique. Les greffes se chargent à la demande, pour garder la vitesse de démarrage de la v1.
9. **Méthode de travail avec Claude Code :**
   - tout le lot dans une seule PR, sans attendre de validation terrain entre les parties ;
   - une session courte par lot ;
   - pas de plan à valider.

## 4. Greffes du premier lot (toutes éteintes par défaut)

| Interrupteur | Greffe | Type | Code source (dans `v2/src/`) |
|---|---|---|---|
| `soleil2` | Calage sur le soleil de la v2 : le pointage retrouve le disque du soleil, même téléphone penché | remplacement | `calage/soleil.js`, `vision/soleil.js` |
| `lune` | Calage de nuit sur la lune (position avec parallaxe, tache ronde et brillante) | ajout | `noyau/astro.js` (`positionLune`), `ui/calage.js` |
| `permutation` | Test contre les coïncidences de repères dans « Caler auto » (Turin : scènes au hasard acceptées à 100 % sans le test, environ 7 % avec) | ajout | `calage/permutation.js`, `calage/reperes.js` |
| `echelle2` | Échelle sur 2 points : soleil ou lune + un monument touché donnent le cap **et** le champ | ajout | `calage/echelle.js`, étendu au soleil et à la lune |
| `oeil` | Puce œil près du rayon : détail au toucher, « Réestimer », étage, altitude GPS en simple proposition | ajout | `ui/oeil.js`, `scene/hauteur-oeil.js` |
| `icones` | Libellés sous les icônes et menus simplifiés, en gardant toutes les aides « ? » de la v1 | remplacement | `ui/style.css`, et la page `v2/ar.html` |
| `rotation` | Message « Téléphone en paysage, écran en portrait : activez la rotation automatique » | ajout | `entrees/rotation.js` |
| `lieuxWikidata` | Repli Wikidata pour les lieux quand OSM échoue | ajout | `donnees/wikidata-lieux.js` |
| `boussoleA` | Ne jamais laisser la boussole défaire un calage (correctif A de `VEILLE-ANCRAGE.md`), à comparer à la v1 sur le terrain | remplacement | `entrees/capteurs.js` |
| `tailleReelle` | Monuments à taille réelle : plus de plafond SPR_MAX_FRAC / SPR_MAX_PX (il ne jouait que pied à l'écran : Les Horizons à 0,3 km rétrécissaient quand on baissait le téléphone) ; nom au sommet, ou au bord haut sous les puces si le sommet sort | ajout | aucun (correction de la v1, `monAng`) |

| `plaque` | Lire une plaque de rue : OCR dans le navigateur, Base Adresse Nationale, position corrigée après confirmation, puis suivie au pas (le GPS ne reprend la main qu'après 20 s d'écart) | ajout | `ui/lire-plaque.js`, `calage/adresse.js`, `donnees/adresse.js`, `ui/position-propre.js`, `scene/pas.js` |
| `capteurRelatif` | Anti-dérive : capteur d'orientation relatif à 60 Hz (quaternions) à la place du gyroscope de `deviceorientation` (action B de `VEILLE-ANCRAGE.md`) | remplacement | `entrees/capteurs.js` (`axesDepuisQuaternion`), `entrees/direct.js` |
| `recalageContinu` | Anti-dérive : recalage continu du cap sur le soleil et la lune (action C de `VEILLE-ANCRAGE.md`) | ajout | `calage/continu.js`, `ui/calage-continu.js` |
| `montagne` | Noms des sommets : tous les sommets nommés d'OpenStreetMap (`natural=peak`, altitude) à moins de 120 km, triés par dominance (au plus 300), affichés seulement s'ils se voient d'ici | ajout | aucun (nouvelle source ; la v1 n'avait que 30 sommets proches et les grands sommets de plus de 1 500 m) |
| `champAuto` | Champ de la caméra mesuré : gyroscope comparé au déplacement de l'image quand on tourne ; puce d'avancement ; mesure gardée par caméra ; mesuré, le pincement ne le change plus | ajout | aucun (une appli native lit le champ dans le système ; une page web doit le mesurer) |
| `projection` | Projection exacte de la caméra : en montagne, le relief et les noms ne s'écartent plus de l'image vers les bords (la v1 : environ 1° à 30° du centre). Les points tracés par la v1 sont déplacés pendant le dessin ; aucune ligne de dessin de la v1 n'est réécrite | remplacement | aucun (accord de Romain du 12/11/2026) |
| `nettete` | Mise au point fixée au plus loin à l'ouverture de la caméra (flou après avoir visé le soleil) | ajout | aucun |
| `nommer` | Toucher le relief donne son nom : rayon suivi dans le relief déjà chargé, noms d'OpenStreetMap autour du point et de sa crête, fiche et épingle | ajout | aucun (demande du 11/11/2026) |
| `degage` | Écran dégagé : le bouton ÉCRAN masque aussi puces, boutons et barre du bas (un quart de l'écran en paysage) ; bandeau de la photo replié en une puce | ajout | aucun (demande du 13/11/2026) |
| `hauteurs` | Hauteurs des monuments : la hauteur d'une tour d'OpenStreetMap va au monument compatible le plus proche (la v1 : au premier de la liste à moins de 120 m, une statue comprise) ; hauteur des statues lue dans leur fiche OpenStreetMap | remplacement | aucun (photo de Turin du 13/11/2026) |
| `oeilLieu` | Hauteur d'œil du lieu : la correction réglée à la main vaut pour l'endroit où elle a été réglée (la v1 : une seule valeur partout, photos comprises) ; sur une photo, hauteur déduite de l'altitude de la photo et du sol du modèle | ajout | `scene/oeil-gps.js` (géoïde retranché) ; le reste est nouveau (photo de Turin du 13/11/2026) |

**Non repris :**
- WebXR, calage guidé ;
- rue, ombres, toits, GPS nettoyé (le compteur de pas est repris dans `plaque`) ;
- silhouette des bâtiments de la v2 (la v1 a la sienne) ;
- fiches de la v2 (la v1 garde les siennes) ;
- découpage en modules.

**Export du cache :** l'outil existe déjà dans `debug/debug-cache.html`. Il lit les caches partagés par la v1 et la v3.

## 5. Correctif dans la v3 (bug de la v1, ce n'est pas une greffe)
- **Le symptôme :** téléphone tenu de côté, écran resté en portrait. Le glisser pour caler suit les axes de l'écran alors que la scène est dessinée tournée : le cap bouge au lieu de l'horizon. Le toucher des noms (`hitBest`) a le même défaut.
- **La correction :** convertir le déplacement et le point touchés dans le repère tourné, avec la formule déjà utilisée par le pointage de la v2 (`v2/src/calage/pointage.js`, ligne 43).
- **Sans effet quand le roulis est nul :** le test « tout éteint = v1 » reste valable.

## 6. Code mort : les pierres tombales
- **Les suspects :**
  - les fonctions de la v1 qu'aucun module de la v2 ne cite comme source (chaque module de la v2 nomme la fonction v1 qu'il reprend) ;
  - `v2/docs/INVENTAIRE-CODE-MORT.md` ;
  - les cas déjà connus : partie bateaux de `mobSpec`, couloir `anchorY` de `placeFlat`, option `reliefV1`.
- **La pierre tombale :** une ligne `tombe('id')` au début de chaque bloc suspect.
  - Elle compte les passages dans le stockage local.
  - Le Diagnostic affiche l'identifiant, le nombre de passages et la date du dernier.
- **La suppression :** après 2 à 3 semaines d'usage normal et le passage des tests sur les scènes réelles, une PR supprime les blocs restés à 0. Git les garde.
- **Les environ 90 commentaires d'historique datés :**
  - garder ceux qui expliquent un fait du terrain ;
  - retirer le reste dans la même PR, puisque les commentaires n'ont aucun effet à l'exécution.

## 7. Quand la v3 remplace la v1
- Le test « tout éteint = v1 » est vert.
- Les greffes que Romain veut garder sont marquées « validé » dans `docs/ETAT.md`.
- Le démarrage est au moins aussi rapide qu'en v1 (banc de vitesse de `tests/commun/`).
