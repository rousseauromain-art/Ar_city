# Refonte de Villes à l'horizon — architecture cible et règles de développement
*Rédigé le 27/10/2026. À lire avec `CLAUDE.md` avant toute tâche de refonte.*

## 1. Objectifs
- **Déboguer par petites fonctions :** chaque fonction a des entrées et des sorties claires, et se teste seule.
- **Un même moteur pour deux modes :**
  - **Réalité augmentée en direct :** caméra, GPS, boussole et gyroscope.
  - **Analyse d'image :** photo rejouée et banc d'essai.
  - Ces deux modes appellent exactement les mêmes fonctions de calcul (scène, calage, rendu). Seule la source des données change.
- **Une page d'accueil (lanceur)** pour choisir le mode et la version.
- **Garder l'application actuelle intacte**, comme référence et comme secours sur le terrain.
- **Contrainte :** Romain travaille uniquement sur téléphone. Pas de PC, pas de serveur local : tout se teste via GitHub Actions et sur le téléphone.

## 2. Choix techniques

| Sujet | Choix | Pourquoi |
|---|---|---|
| Langage | JavaScript moderne en **modules ES natifs**, **sans outil de construction** | GitHub Pages sert les fichiers tels quels ; rien à compiler, le code en ligne est le code du dépôt. |
| Vérification des types | `// @ts-check` en tête de chaque module, types en JSDoc, `tsc --noEmit` dans la CI | Les avantages de TypeScript (fautes de frappe, mauvais arguments, `undefined`) sans étape de construction. |
| Bibliothèques externes | Le moins possible ; si besoin, **import maps** avec versions figées | Les import maps sont prises en charge par tous les navigateurs modernes depuis 2023. |
| Interface | DOM natif avec quelques petites fonctions utilitaires ; **Lit** seulement si l'interface grossit beaucoup | Le cœur de l'appli est du calcul et du dessin sur canvas : un framework (React, Vue, Svelte) n'y apporte rien et impose une construction. |
| Calculs lourds | **Web Workers** : masque du relief, analyse d'image, IA de profondeur | La boucle d'affichage ne fait que dessiner et reste fluide. |
| Tests unitaires | **`node:test`**, le lanceur de tests intégré à Node, sans dépendance | Les fonctions de calcul pures se testent en millisecondes, sans navigateur. C'est la majorité des tests. |
| Tests de bout en bout | **Playwright**, déjà en place, limité à une dizaine de parcours | Ils sont lents et coûteux : seulement les parcours critiques. |
| Qualité | ESLint + vérification des types + tests dans GitHub Actions à chaque envoi | Les erreurs sont détectées avant d'arriver sur le téléphone. |
| Débogage sur téléphone | **Eruda** (console mobile) chargée avec `?debug=1`, panneau de journal dans l'appli, bouton « Exporter un rapport » | Sans PC, impossible d'utiliser les outils de développement de Chrome. |
| Hébergement | GitHub Pages (inchangé). En option, Cloudflare Pages pour une adresse de test par branche. | Pas de changement d'adresse. Les prévisualisations deviennent utiles quand plusieurs chantiers avancent en parallèle. |

**Ce qu'on ne fait pas, et pourquoi :**
- **Vite + TypeScript compilé :** possible plus tard, avec une construction dans GitHub Actions. Aujourd'hui, ça ajoute une étape et un écart entre le code et ce qui tourne, sans résoudre le vrai problème, qui est le découpage.
- **React, Vue ou Svelte :** pensés pour des interfaces riches en formulaires et en écrans, pas pour un moteur de calcul et de dessin.

## 3. Organisation du dépôt

```
index.html                 lanceur : choisir le mode et la version
villes-horizon.html        redirige vers v1/villes-horizon.html (anciens liens et raccourci sur l'écran d'accueil)
config.js                  adresse du relais (partagée par v1 et v2)
v1/                        application actuelle, FIGÉE (aucune évolution ; corrections bloquantes seulement)
  villes-horizon.html
debug/                     outils de diagnostic actuels (restent liés à v1)
v2/
  ar.html                  mode réalité augmentée en direct
  photo.html               mode analyse d'image (photo rejouée, banc d'essai)
  outils.html              diagnostic v2 (journal, caches, relais)
src/                       modules de la v2, aucun code dans les pages HTML
  noyau/                   fonctions PURES, sans DOM ni réseau : géo (distance, cap, projection), astro (soleil, lune),
                           exif, maths (ajustements, statistiques), constantes et unités
  donnees/                 sources : relief (tuiles), lieux, monuments (Wikidata, OSM), mobiles (relais), cache, réseau
  scene/                   ce qui est visible d'ici : masquage par le relief, sélection des lieux, règles de visibilité (pur)
  vision/                  analyse d'image sur ImageData : silhouette du ciel, soleil, lune, profondeur en option (pur, en Worker)
  calage/                  cap, inclinaison et champ à partir de la scène et de la vision : soleil, relief, repères (pur)
  rendu/                   canvas : moteur unique de placement des étiquettes, icônes, dessin
  entrees/                 sources de « vue » : direct (caméra, GPS, capteurs) et photo (image et EXIF), même interface
  ui/                      réglages, calques, fiches, puces : DOM uniquement
  outils/                  journal, rapport, état, stockage, drapeaux de fonctions
  workers/                 points d'entrée des Web Workers
relais/                    Worker Cloudflare (inchangé, API rétrocompatible)
tests/
  unit/                    node:test sur les modules purs (rapides)
  e2e/                     Playwright : parcours critiques
  fixtures/                petites données de test ; les exports de cache et les photos restent dans Ar_city-photos (privé)
docs/
  ARCHITECTURE.md          schéma du flux de données et rôle de chaque dossier
  decisions/               une note de 5 lignes par décision importante
```

**Sens des dépendances**, sans exception : `ui` → `rendu` → `calage`, `scene`, `vision` → `noyau`.
- `donnees` et `entrees` fournissent les données.
- `noyau` n'importe rien.
- Aucun module pur n'accède au DOM, au réseau ou au stockage.

**Le cœur commun aux deux modes :** une `Vue` décrit ce qu'on regarde :

```js
/** @typedef {{image: ImageData|null, pos: {lat:number, lon:number, altM:number|null},
 *  heure: Date, capDeg: number|null, inclinaisonDeg: number|null, champDeg: number,
 *  source: 'direct'|'photo', meta: object}} Vue */
```

- `entrees/direct.js` et `entrees/photo.js` produisent une `Vue`.
- Ensuite, le même enchaînement s'applique : `scene(Vue)` → `calage(Vue, scene)` → `rendu(Vue, scene, calage)`.

## 4. Règles de code

| # | Règle |
|---|---|
| 1 | Un module = un rôle, environ 300 lignes au plus. Une fonction = une action, environ 40 lignes au plus. |
| 2 | Calculs en **fonctions pures** : paramètres en entrée, résultat en sortie, aucune variable globale modifiée. Les effets (DOM, réseau, stockage, capteurs) restent à la périphérie. |
| 3 | Un seul état de l'application (`outils/etat.js`). On le modifie par des fonctions nommées, pas directement de partout. |
| 4 | **Unités dans les noms :** `distKm`, `capDeg`, `hauteurM`, `dureeMs`. Constantes réunies dans `noyau/constantes.js`, chacune avec son origine (« mesuré à Saint-Malo le 25/10/2026 »). |
| 5 | En tête de chaque module : rôle, entrées et sorties, dépendances. Seule l'interface publique est exportée. |
| 6 | Jamais de `catch` vide. Chaque erreur passe par `journal.erreur(module, message, données)`. Les messages pour l'utilisateur sont séparés du journal. |
| 7 | Un seul accès réseau (`donnees/reseau.js`) : délai maximal, nouvelles tentatives, pas de requête en double, cache et mode hors ligne. Les sources de données ne font jamais `fetch` elles-mêmes. |
| 8 | **Stockage préfixé et versionné :** clés `vh2:…`, caches `vh2-…`, format versionné avec migration. La v1 garde ses clés : les deux versions cohabitent sur la même adresse sans se gêner. |
| 9 | Budget d'affichage : une image en moins de 8 ms sur le Pixel. Ce qui dépasse part dans un Worker. Le temps par étape s'affiche en mode debug. |
| 10 | **Drapeaux de fonctions** pour l'expérimental (lune, profondeur…) : réglage ou `?drapeaux=lune,profondeur`. Rien d'expérimental n'est activé par défaut. |
| 11 | **Interface mobile :** zones de toucher d'au moins 44 px, un libellé visible sous chaque icône, rien d'important au survol seulement. |
| 12 | Aucun commentaire d'historique daté dans le code : l'historique est dans git. Un commentaire explique un « pourquoi » qui ne se devine pas. |
| 13 | Aucun secret dans le dépôt : les clés sont des secrets du Worker, et le relais n'accepte que les origines autorisées. |

## 5. Tests et débogage
- **Proportionnés :**
  - un module pur a ses tests unitaires (`node:test`, toute la suite en moins de 2 s) ;
  - Playwright couvre seulement les parcours critiques : lanceur, mode direct simulé, photo rejouée, port dense, rempart de Saint-Malo.
- **Scènes de référence :**
  - les exports de cache de Saint-Malo, Turin et Ibiza (dépôt privé) servent de scènes « or » ;
  - chaque module extrait de la v1 doit donner le même résultat que la v1 sur ces scènes (tests de caractérisation) ;
  - une différence voulue est documentée dans la PR.
- **Débogage sur téléphone :**
  - `?debug=1` charge Eruda (console, réseau, stockage) et affiche le journal et les temps de calcul à l'écran ;
  - le bouton « Exporter un rapport » produit un fichier : version, réglages, journal, dernière `Vue`, résultat du calage. Romain le joint à une conversation pour analyse.
- **Deux modes de travail** (voir `CLAUDE.md`) :
  - « Correction simple » : léger ;
  - « Évolution » : bug reproduit, test du cas, toute la suite verte.
  - La refonte relève toujours du mode « Évolution ».

## 6. Plan de la refonte, une PR par étape
On ne réécrit pas de zéro : on extrait la v1 module par module (approche « figuier étrangleur »), la v1 figée servant de référence. La v2 est « en développement » dans le lanceur : on peut fusionner sur `main` et la tester sur `/v2/` sans risque pour la v1.

| Étape | Contenu | Terminé quand |
|---|---|---|
| 0 | Figer la v1 dans `v1/`, redirection depuis l'ancienne adresse, lanceur `index.html` (modes × versions) | L'ancienne adresse et le raccourci du téléphone ouvrent toujours la v1 ; le lanceur affiche v1 et v2 (« en développement ») |
| 1 | Fondations : arborescence, `etat`, `journal`, `rapport`, `reseau`, `stockage` (préfixe `vh2:`), Eruda, CI (ESLint, vérification des types, `node:test`, Playwright), `docs/ARCHITECTURE.md` | CI verte ; `?debug=1` fonctionne sur le téléphone |
| 2 | `noyau/` : géo, astro (soleil, puis lune), EXIF, maths, constantes | Tests unitaires ; mêmes résultats que la v1 |
| 3 | `donnees/` : tuiles et masque du relief (en Worker), lieux, monuments, mobiles, cache | Scènes or : mêmes données et même hauteur d'œil que la v1 |
| 4 | `scene/` : visibilité et sélection des lieux | Scènes or : mêmes lieux visibles que la v1 |
| 5 | `rendu/` : un moteur de placement unique pour tous les calques | Aucun chevauchement, port dense, rien sous les boutons |
| 6 | `entrees/` + `v2/ar.html` et `v2/photo.html` sur la même `Vue` | Les deux modes affichent la même scène pour une photo et sa position |
| 7 | `vision/` et `calage/` : silhouette, soleil, relief, repères ; relief en premier dans « Caler auto » | Banc d'essai sur les photos de référence au moins aussi bon que la v1 |
| 8 | `ui/` : réglages et calques avec libellés visibles, puce « œil » avec « Réestimer », lanceur final | Parité avec la v1 (liste cochée dans la PR) |
| 9 | La v2 devient le choix par défaut du lanceur ; la v1 reste accessible quelques semaines, puis passe en archive (tag git) | Romain valide sur le terrain |

## 7. Première consigne pour Claude Code

```
Évolution : lis CLAUDE.md puis REFONTE.md. Réalise l'étape 0 de REFONTE.md, puis arrête-toi pour que je vérifie sur mon téléphone :
- déplace l'application actuelle dans v1/ sans la modifier (corrige seulement les chemins : config.js, pages debug/) ;
- remplace villes-horizon.html à la racine par une redirection vers v1/villes-horizon.html ;
- crée index.html, le lanceur : boutons « Réalité augmentée » et « Analyse d'une photo » pour la v1 (le mode photo ouvre la v1 directement en photo rejouée si c'est possible, sinon explique en une ligne comment y accéder), une ligne « v2 — en développement » pour l'instant sans lien, et les outils de diagnostic. Libellés visibles, gros boutons, adapté au téléphone ;
- adapte les tests existants aux nouveaux chemins ;
- ajoute dans CLAUDE.md une ligne qui renvoie à REFONTE.md pour toute la refonte.
Résumé de 3 lignes à la fin : ce que je dois tester sur le téléphone.
```

## Références
- Modules JavaScript : https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules
- Import maps, disponibles dans tous les navigateurs modernes : https://web.dev/blog/import-maps-in-all-modern-browsers
- Vérifier le JavaScript avec TypeScript (JSDoc, `checkJs`) : https://www.typescriptlang.org/docs/handbook/type-checking-javascript-files.html
- Lanceur de tests intégré à Node : https://nodejs.org/api/test.html
- Eruda, console pour navigateur mobile : https://github.com/liriliri/eruda
- Lit, composants web légers : https://github.com/lit/lit
- Figuier étrangleur (remplacement progressif) : https://martinfowler.com/bliki/StranglerFigApplication.html
- Prévisualisation par branche avec Cloudflare Pages : https://developers.cloudflare.com/pages/configuration/preview-deployments/
