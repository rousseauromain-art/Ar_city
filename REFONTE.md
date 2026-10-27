# Refonte de Villes à l'horizon — méthode, architecture et règles
*Version du 27/10/2026 au soir. À lire avec `CLAUDE.md` avant toute tâche de refonte. Toute la refonte relève du mode « Évolution ».*

## 1. Objectifs
- **Un calque = un module.** Lieux, monuments, équipements, bateaux, avions, relief, silhouette lue sur la photo… Chacun se débogue seul, fonction par fonction, avec Romain.
- **Les règles d'affichage sont communes**, jamais recodées dans un calque : Essentiel, Tout voir, masqué par le relief, placement des noms.
- **Un même moteur pour deux modes :** réalité augmentée en direct, et analyse d'une photo rejouée.
- **Une page d'accueil (lanceur)** pour choisir le mode et la version.
- **Aucune régression :** la v2 doit se comporter exactement comme la v1 de référence tant qu'une différence n'a pas été décidée par Romain.
- **Contrainte :** Romain travaille uniquement sur téléphone (pas de PC, pas de serveur local).

## 2. La référence : v1 = version `2026-10-25 (j)`
- **La v1 figée est la version `2026-10-25 (j)`**, et non la version actuelle de `main` (`2026-10-27 (b)`).
  - Dans `Ar_city` : `git show f51f883:villes-horizon.html`.
  - Vérifier que `APP_VERSION` commence par `2026-10-25 (j)`.
- **Pourquoi pas `main` :** les changements des 26 et 27/10 ont introduit des régressions d'affichage (noms affichés, Essentiel / Tout voir / masqués par le relief, traits bleus de la silhouette lue sur la photo).
- **Ces changements ne sont pas jetés.** Chacun sera repris plus tard dans la v2, un par un, en mode « Évolution », après accord de Romain :

| Apport des 26–27/10 | Commit d'origine |
|---|---|
| Puce « œil » (correction de hauteur, détail au toucher) | `04274ed`, `17a0bbd` |
| Calage sur repères : test de permutation contre les coïncidences | `1c29728` |
| Export du cache, en paquets de 20 Mo | `1c29728`, `8ec9a99`, `052d217` |
| Photo rejouée en plein écran : vue épurée | `052d217` |
| Repères (phares, plages…) rangés avec les calques | `17a0bbd` |
| Repli à plat pour tous les lieux sans place (**cause probable de régression : à ne reprendre qu'après décision**) | `30ad8a7` |
| Traits bleus seulement en debug (**contraire au comportement voulu : ne pas reprendre**) | `1c29728` |

- **Étiquette de sauvegarde :** l'état actuel de `main` est étiqueté `avant-refonte-2026-10-27` avant toute modification.

## 3. La méthode du figuier étrangleur, appliquée strictement
On ne réécrit pas l'application d'un bloc. La v2 pousse à côté de la v1 figée et la remplace **calque par calque**, chaque calque prouvant qu'il fait exactement comme la v1 avant de passer au suivant.

1. **La v1 ne bouge pas.** Seule exception : une correction bloquante, décidée par Romain, appliquée à la v1 et reportée dans la v2.
2. **Extraire, pas améliorer.** Le code d'un calque est sorti de la v1, découpé en petites fonctions et nettoyé, **sans changer son résultat**. Une amélioration attend que le calque soit à parité, puis fait l'objet d'une PR « Évolution » séparée.
3. **La parité se prouve par des tests de caractérisation :**
   - le même instantané est rejoué dans la v1 et dans la v2 : cache exporté, position, cap, inclinaison, champ, taille d'écran, Essentiel puis Tout voir ;
   - pour chaque calque, on compare la liste des éléments dessinés : nom, état (net, transparent, absent), raison, position, opacité ;
   - un écart fait échouer le test, sauf s'il figure dans `tests/ecarts-acceptes.json` avec la décision de Romain.
4. **Une PR par calque**, et la v2 affiche ce calque seul (les autres restent en v1) jusqu'à ce que tous soient extraits.
5. **Après chaque PR,** Romain vérifie sur son téléphone, dans le lanceur, la v1 et la v2 côte à côte.

## 4. Contrat de comportement de l'affichage, à préserver
La référence fait foi : en cas de doute, c'est le comportement de la v1 (j), mesuré par les tests de caractérisation. Règles connues :
- **Essentiel :** seulement les éléments visibles d'ici, en net.
- **Tout voir (bouton œil) :** on ajoute les éléments non visibles, en transparence, chacun avec sa raison :
  - caché par le relief ;
  - trop loin pour sa catégorie ;
  - au-delà du plafond de noms nets ;
  - plus bas que les toits (ville dense) ;
  - caché par un monument devant ;
  - caché sur la photo.
- **Passer en Tout voir ne fait jamais disparaître un nom affiché en Essentiel :** les nets sont placés d'abord, les transparents ensuite.
- **Le badge « +N » du bouton œil** donne, en Essentiel, le nombre d'éléments transparents disponibles dans le champ.
- **Un lieu masqué par le relief** est posé à l'angle de son sol et dessiné en transparence, seulement en Tout voir.
- **Un lieu (hors monument) sans place pour son nom incliné n'est pas affiché.** Un monument garde son icône et passe à un nom à plat.
- **Les icônes de monuments** sont réservées avant tout nom. Les icônes qui se chevauchent sont regroupées derrière la plus connue (pastille « +N »).
- **La silhouette lue sur la photo (traits bleus pointillés)** s'affiche en Tout voir quand l'analyse de la photo est active et récente.
- **Les crêtes du relief** ont des seuils différents en Essentiel et en Tout voir.
- **Bateaux :**
  - les plus proches nommés d'abord ;
  - noms à plat en escalier sous l'horizon, fils qui ne se croisent pas ;
  - les autres en pastilles « +N », jamais « +1 ».
- **Avions :** noms inclinés.
- **Aucun nom sous les boutons du bas,** quel que soit le calque.
- **Monuments :** pas de seuil de langues après la requête ; un monument peu connu sans hauteur est supposé faire 12 m.
- **Hauteur d'œil :** relue dans le relief fin. Sur un rempart, la jetée ne doit pas cacher Dinard.

## 5. Choix techniques

| Sujet | Choix | Pourquoi |
|---|---|---|
| Langage | JavaScript en **modules ES natifs, sans outil de construction** | GitHub Pages sert les fichiers tels quels : le code en ligne est le code du dépôt. |
| Types | `// @ts-check` et types en JSDoc ; `tsc --noEmit` dans la CI | Les fautes sont repérées sans compilation. |
| Bibliothèques | Le moins possible, via import maps, versions figées | Prises en charge par tous les navigateurs modernes depuis 2023. |
| Interface | DOM natif. La refonte graphique est une étape à part, plus tard. | Le cœur est du calcul et du dessin sur canvas ; un framework n'y apporte rien. |
| Calculs lourds | Web Workers : masque du relief, analyse d'image | L'affichage reste fluide. |
| Tests unitaires | `node:test` sur les fonctions pures | En millisecondes, sans navigateur. |
| Tests de caractérisation et de bout en bout | Playwright, déjà en place | Comparaison v1/v2 sur les scènes de référence, et quelques parcours. |
| Débogage sur téléphone | Eruda avec `?debug=1`, panneau « Calques », bouton « Exporter un rapport » | Sans PC, pas d'outils de développement Chrome. |

## 6. Organisation du dépôt

```
index.html                 lanceur : modes × versions
villes-horizon.html        redirige vers v1/villes-horizon.html (anciens liens, raccourci du téléphone)
config.js                  adresse du relais (partagée)
v1/villes-horizon.html     version 2026-10-25 (j), FIGÉE
debug/                     outils de diagnostic actuels (liés à v1)
v2/ar.html, v2/photo.html, v2/outils.html
src/
  noyau/        PUR : géo, astro (soleil, lune), exif, maths, constantes et unités
  donnees/      réseau (un seul accès), cache, tuiles de relief, sources (Overpass, Wikidata, relais)
  scene/        PUR : masque du relief, hauteur d'œil, visibilite.js (Essentiel, Tout voir, raisons : règles COMMUNES)
  calques/      UN FICHIER PAR CALQUE (voir §7) :
                relief.js (silhouette, crêtes) · photo-silhouette.js (traits bleus) · lieux.js · monuments.js
                (Wikidata, tours, bâtiments hauts, statues) · equipements.js (télécom) · reperes.js (phares, plages…)
                · kml.js (points personnels) · bateaux.js · avions.js · astres.js (soleil, lune)
  rendu/        COMMUN : placement des noms (incliné, à plat, escalier), réservations, icônes, pastilles, dessin
  vision/       PUR sur ImageData : silhouette du ciel, soleil, lune (en Worker)
  calage/       PUR : soleil, relief, repères, carnet
  entrees/      direct (caméra, GPS, orientation) et photo (image et EXIF) → une même « Vue »
  ui/           réglages, calques, fiches (la refonte graphique viendra plus tard)
  outils/       état, journal, rapport, stockage préfixé vh2:, drapeaux de fonctions
relais/  tests/unit  tests/caracterisation  tests/e2e  tests/ecarts-acceptes.json  docs/
```

**Sens des dépendances :**
- `ui` → `rendu` → `calques` → `scene`, `calage`, `vision` → `noyau`.
- `donnees` et `entrees` fournissent les données.
- **Un calque n'importe jamais un autre calque.**

## 7. Interface commune d'un calque, et débogage

```js
// src/calques/<nom>.js — chaque calque exporte exactement ceci
/** @type {import('../types').Calque} */
export const calque = {
  id: 'monuments', libelle: 'Monuments',
  async charger(zone, donnees) { /* éléments bruts (via donnees/, cache compris) */ },
  classer(elements, scene, reglages) { /* PUR → [{el, etat:'net'|'transparent'|'absent', raison}] */ },
  preparer(classes, vue) { /* PUR → [{ancre:{x,y}, icone, texte, detail, priorite, etat}] */ },
};
// Le placement et le dessin sont faits par rendu/ pour TOUS les calques : aucun calque ne place ses noms lui-même.
```

**En mode debug (`?debug=1`)**, le panneau « Calques » montre pour chaque calque :
- le nombre d'éléments chargés, nets, transparents et absents, avec leurs raisons ;
- le temps de chaque fonction (`charger`, `classer`, `preparer`) ;
- un bouton **« Solo »** pour n'afficher que ce calque ;
- un bouton **« Exporter »** qui produit le JSON de l'état du calque. Romain le joint à une conversation pour déboguer fonction par fonction.

## 8. Règles de code

| # | Règle |
|---|---|
| 1 | Un module = un rôle, environ 300 lignes au plus ; une fonction = une action, environ 40 lignes au plus. |
| 2 | Calculs en fonctions pures. Les effets (DOM, réseau, stockage, capteurs) restent à la périphérie. |
| 3 | Un seul état (`outils/etat.js`), modifié par des fonctions nommées. |
| 4 | Unités dans les noms (`distKm`, `capDeg`, `hauteurM`). Constantes dans `noyau/constantes.js`, avec leur origine. |
| 5 | En tête de module : rôle, entrées et sorties, dépendances. N'exporter que l'interface publique. |
| 6 | Jamais de `catch` vide : `journal.erreur(module, message, données)`. |
| 7 | Un seul accès réseau (`donnees/reseau.js`) : délais, nouvelles tentatives, pas de doublons, cache. |
| 8 | Stockage préfixé `vh2:` et versionné. La v1 garde ses clés : les deux cohabitent sans se gêner. |
| 9 | Une image en moins de 8 ms sur le Pixel ; au-delà, un Worker. |
| 10 | L'expérimental passe par des drapeaux, désactivés par défaut. |
| 11 | Zones de toucher d'au moins 44 px, libellé visible sous chaque icône. |
| 12 | Pas de commentaires d'historique datés : l'historique est dans git. |
| 13 | Aucun secret dans le dépôt. |

## 9. Plan, une PR par étape, arrêt après chacune

| Étape | Contenu | Terminé quand |
|---|---|---|
| 0 | Étiquette `avant-refonte-2026-10-27` ; v1 = (j) figée dans `v1/` ; redirection ; lanceur ; tests existants rangés (ceux des apports 26–27/10 dans `tests/a-reprendre/`, non lancés) | L'ancienne adresse ouvre la v1 (j) ; le lanceur affiche v1, et la v2 « en développement » |
| 1 | Fondations v2 (état, journal, rapport, réseau, stockage, Eruda, CI). **Harnais de caractérisation :** v1 et v2 sur un même instantané, dump par calque | CI verte ; dump v1 produit pour les scènes de référence |
| 2 | `noyau/` | Tests unitaires ; mêmes valeurs que la v1 |
| 3 | `donnees/` et `scene/` (masque du relief en Worker, hauteur d'œil, `visibilite.js`) | Mêmes états et raisons que la v1 sur les scènes de référence |
| 4 | `rendu/` commun, puis calques `relief` et `photo-silhouette` | Parité v1 (Essentiel et Tout voir) |
| 5 | Calque `lieux` | Parité v1 |
| 6 | Calque `monuments` | Parité v1 |
| 7 | Calques `equipements`, `reperes`, `kml` | Parité v1 |
| 8 | Calques `bateaux`, `avions` | Parité v1 |
| 9 | `entrees/` (direct et photo → même `Vue`), `v2/ar.html`, `v2/photo.html` | Les deux modes affichent la même scène |
| 10 | `vision/` et `calage/` | Banc d'essai au moins aussi bon que la v1 |
| 11 | **Après parité :** orientation et ancrage (voir `VEILLE-ANCRAGE.md`), reprise des apports 26–27/10, refonte graphique | Une PR « Évolution » par sujet, validée par Romain |
| 12 | La v2 devient le choix par défaut ; la v1 reste accessible, puis est archivée | Validation sur le terrain |

**Scènes de référence :**
- exports du cache de Saint-Malo (remparts, cap 240°), Paris Grenelle (tour Eiffel, nuit), Turin et Ibiza, rangés dans le dépôt privé `Ar_city-photos` ;
- dans la CI, ce dépôt est récupéré avec un jeton en lecture seule, stocké en secret GitHub.

## 10. Première consigne pour Claude Code

```
Évolution : lis CLAUDE.md puis REFONTE.md (méthode du figuier étrangleur, section 3). Réalise l'étape 0, puis arrête-toi pour que je vérifie sur mon téléphone :
1. Pose l'étiquette git avant-refonte-2026-10-27 sur l'état actuel de main.
2. Crée v1/villes-horizon.html à partir de la version 2026-10-25 (j) : git show f51f883:villes-horizon.html. Vérifie APP_VERSION. Ne change rien d'autre que le chemin de config.js (../config.js).
3. Remplace villes-horizon.html à la racine par une redirection vers v1/villes-horizon.html.
4. Crée index.html, le lanceur adapté au téléphone (gros boutons, libellés visibles) : « Réalité augmentée » et « Analyse d'une photo » pour la v1, une ligne « v2 — en développement » sans lien pour l'instant, et les outils de diagnostic.
5. Range les tests : ceux qui vérifient le comportement de la v1 (j) la visent ; ceux des apports des 26–27/10 vont dans tests/a-reprendre/, sans être lancés.
6. Ajoute dans CLAUDE.md une ligne qui renvoie à REFONTE.md pour toute la refonte.
Résumé de 3 lignes à la fin : ce que je dois vérifier sur le téléphone.
```

## Références
- Figuier étrangleur (remplacement progressif) : https://martinfowler.com/bliki/StranglerFigApplication.html
- Modules JavaScript : https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules
- Import maps : https://web.dev/blog/import-maps-in-all-modern-browsers
- Vérifier le JavaScript avec TypeScript : https://www.typescriptlang.org/docs/handbook/type-checking-javascript-files.html
- Lanceur de tests de Node : https://nodejs.org/api/test.html
- Eruda, console mobile : https://github.com/liriliri/eruda
