# Inventaire du code jamais appelé (30/10/2026)

> **Nettoyage 1 fait le 30/10 (A, B, `reliefV1`)** : 3 morts supprimés, 62 `export` inutiles retirés (13 déclarations multiples gardées exportées car un de leurs noms est utilisé ailleurs), réglage `reliefV1` supprimé, `MS_EN_NOEUD` supprimé. Reste : D (boutons « zone » gardés sur décision de Romain), E (poignées de test), F (tests dormants), G (couverture).

Rapport seulement : **rien n'est supprimé**. Il sert de base au nettoyage (voir le plan D du fichier de plan). Méthode : pour chaque `export` de `src/`, recherche des usages dans les autres modules de `src/`, dans leur propre fichier, puis dans `tests/`, `v2/`, `index.html` et `debug/`. Aucun fichier de `src/` n'est orphelin : tous sont importés ou chargés.

Chiffres : 463 exports examinés.

## A. Code mort probable (3) — à supprimer sans risque
| Fichier | Nom | Remarque |
|---|---|---|
| `src/donnees/kml.js` | `PERSO_DISTANCES_KM` | constante jamais lue |
| `src/noyau/maths.js` | `enDegres`, `enRadians` | les conversions passent par `RAD` partout |

## B. Exportés pour rien (75) — retirer seulement le mot `export`
Utilisés uniquement dans leur propre fichier : surtout des constantes de réglage (seuils, durées, couleurs, tailles). Aucun risque ; cela réduit l'interface publique de chaque module. Exemples : `ANGLE_MIN_DEG`, `NOMS_NETS_MAX` côté calques ; `COUT_MAX_DEG`, `COLONNES_MIN` côté calage ; `WD_TUILE_DEG`, `TEL_MEMOIRE_MS` côté données ; `LISSAGE`, `GYRO_SAUT_DEG` côté capteurs. Liste complète : relancer `python3 mort.py` (script décrit ci-dessous).

## C. Utilisés seulement par les tests ou les pages (118) — à GARDER
Fonctions pures dont le test unitaire est la seule utilisation (`lireReponse`, `requeteSparql`, `kmzVersKml`, `scoreMonument`, `evaluerElement`, `ajusterSurReperes`, `fusionnerReglages`, etc.). Ce ne sont pas des morts : ce sont les points d'entrée testés ou les sous-fonctions des modules. Ne pas les toucher dans un nettoyage.

## D. Éléments d'interface sans fonction
- **Boutons grisés à vie** : « Télécharger cette zone (150 km) » et « Supprimer » (`btnZoneDL`, `btnZoneDel`, réglage « hors ligne »). Prévus par la v1, jamais branchés en v2. À brancher (tuiles de relief + lieux de la zone) ou à retirer.
- **Identifiants HTML jamais lus** (22) : `fltDiag`, `fltN`, `lyInfo*` (7), `lyUser`, `poiList`, `seaHint`, `simInfo`, `skyInfo`, `zoneInfo`, `sum_*` (6, résumés des groupes de réglages). Certains sont des textes d'aide sans code (sans conséquence) ; `sum_*`, `fltN`, `fltDiag` (nombre de résultats et diagnostic du filtre) devaient être remplis comme dans la v1 et ne le sont pas : **fonctions de la v1 non reprises**, à décider (reprendre ou retirer).
- **Style** : `.etape10` (opacité des boutons grisés) ne sert plus qu'aux deux boutons ci-dessus.

## E. Réglages et poignées
- **`reliefV1`** : réglage défini, mémorisé et jamais lu par le code (tolérances d'origine du relief). Mort.
- **Poignées de test `window.__vh2`** jamais utilisées par un test : `ouvrirPhoto`, `quitterPhoto`, `calerAuto` (utilisée par le banc mais pas en test direct), `evaluerLune`, `consigner`, `apprisIci`, `banc`, `obstacles`. À réduire.

## F. Tests dormants
`tests/a-reprendre/` : 5 fichiers (`calage-reperes.v1`, `export-cache`, `hauteur-oeil-puce`, `lieux-horizon-bas`, `photo-plein-ecran`) qui visent la v1 d'avant la refonte. Trois sont repris dans la v2 sous d'autres noms (permutation, puce œil, plein écran) ; `export-cache` vise une fonction de la v1 (la v2 a `debug/debug-cache.html`) ; `lieux-horizon-bas` est lié à une règle **non reprise** (repli à plat, cause probable de régression : décision à prendre). À supprimer ou à trancher.

## G. Ce que l'analyse ne voit pas
- Fonctions **non exportées** et jamais appelées : couvert par ESLint (`no-unused-vars`, déjà actif en CI : zéro avertissement).
- Branches mortes à l'intérieur d'une fonction (conditions toujours vraies ou fausses) : demande une couverture de tests ; à faire avec `c8` sur les tests unitaires au moment du nettoyage D2.
- `v1/` (figée) et `debug/` : volontairement hors périmètre (la page `debug-profondeur.html` est conservée).

## Reproduire
Le script d'analyse est un simple parcours des `export` de `src/` croisé avec les usages (regex sur les noms) : `python3 mort.py` à la racine (non versionné ; à ajouter en `tests/outils/` si on veut le garder).
