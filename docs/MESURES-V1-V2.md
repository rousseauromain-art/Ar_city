# Mesures v1 / v2

Banc : `tests/perf/banc.mjs` (`npm run build && npm run perf -- --n 7`). Chromium, téléphone simulé (412 × 915, processeur 4× plus lent), cache désactivé, service worker bloqué, polices Google coupées partout.
Réseaux : **bon** = 10 Mb/s, 40 ms ; **faible** = préréglage « Slow 4G » de Chrome (1,6 Mb/s, 562 ms). Mesure : de la navigation à l'appli prête (v1 : fin de `load`, son script est dans la page ; v2 : `window.__vh2` posé). Médiane de 9 ouvertures (7 pour les lignes intermédiaires).

## Chargement

| Version | Fichiers | Poids | Bon réseau | Réseau faible |
|---|---|---|---|---|
| v1 (j) | 2 | 434 Ko | 1,6 s* · 0,49 s | 4,7 s* · 3,02 s |
| v2 du 31/10 (mesure de Romain) | 110 | 656 Ko | 3,0 s* | 8,5 s* |
| v2 avant cette PR, modules bruts (`?modules=1`) | 149 | 1 328 Ko | 1,95 s | 19,6 s |
| v2 regroupée, 4 fichiers (1er essai) | 4 | 395 Ko | 0,57 s | 2,90 s |
| v2 publiée, fiches de la v1 ajoutées, tout dans la page | 2 | 414 Ko | 0,52 s | 2,98 s |
| **v2 publiée (cette PR) : workers et contenu des fiches chargés au premier usage** | **2** | **396 Ko** | **0,49 s** | **2,87 s** |

\* chiffres du banc de Romain (autre machine, autres réglages de réseau) ; les autres colonnes viennent du banc versionné, sur une même machine : ce sont elles qu'il faut comparer entre elles.

Ce qui a compté :
1. **Regrouper et minifier** (esbuild) : 149 fichiers → 1 ; 1 328 Ko → 357 Ko de code.
2. **Mettre le code et le style DANS la page**, comme la v1 : un aller-retour de moins (0,56 s sur réseau faible). Avec 4 fichiers, la v2 restait plus lente que la v1 sur le bon réseau.
3. **Format ESM dans un bloc, pas d'IIFE** : V8 compile d'un coup une fonction entre parenthèses ; avec l'IIFE, l'initialisation prenait ~190 ms contre ~95 ms (processeur 4× plus lent). En ESM : à 15 ms de la v1.
4. **Rien qui ne serve pas à l'ouverture** : les 3 workers démarrent au premier calcul (relief, silhouette, toits), le contenu des fiches (16 Ko, `b/ui/fiche-contenu.js`) au premier toucher. Sur le bon réseau du banc (page non compressée), 1 Ko coûte ~0,8 ms : les fiches de la v1 avaient ramené la v2 à 0,52 s.

À noter : GitHub Pages compresse les pages (gzip) ; le banc ne compresse pas, il compare les deux versions à égalité.

Ouvertures suivantes : la page et les workers sont servis par le service worker (`v2/sw.js`, versionné par l'empreinte des fichiers) ; l'appli s'ouvre sans réseau (`tests/e2e/livraison-v2.spec.js`).

## « Caler » à Cesson

`tests/e2e/affichage-reel-v2.spec.js` (« Caler à Cesson »), en direct des deux côtés, médiane de 5 : v1 **10 ms**, v2 **7 ms**. La caméra est simulée (pas de vraie image de Cesson) : les deux échouent vite, de la même façon (« horizon peu visible · repères : ciel peu lisible »). La v2 ne fait plus de guidage au premier toucher : « Caler » fait comme la v1.

## Affichage sur les 6 scènes réelles

| Scène | Test | Résultat |
|---|---|---|
| Saint-Malo, Turin, Morgat, Ibiza (photos) | `photo-v2-parite.spec.js` : trame entière identique (chaque trait, chaque texte), Essentiel et Tout voir, 3 poses | identique |
| Paris Grenelle (sans photo) | `affichage-reel-v2.spec.js` : noms nets, chacun ses données | 96 nets, 2 083 transparents des deux côtés |
| Cesson (06/11, sans photo) | idem, en photo rejouée et en direct | 60 nets, 1 503 transparents des deux côtés |

Cesson, versions comparées (même scène, mêmes caches rejoués) : v1, v2 du 31/10 (9cc4646), v2 du 06/11 (07719bd, celle du téléphone ce jour-là), v2 de cette PR, en photo rejouée ET en direct : **les quatre donnent les mêmes 60 noms nets** (Réservoir des Gallets, cathédrale Saint-Pierre, Les Horizons, Mât TDF de 98 m…). Aucun commit fautif à chercher : l'écart vu sur le téléphone (235 cachés en v1, 511 en v2) ne vient pas du code de classement.

Ce qui manque pour conclure : le relief de Cesson n'est pas dans `Ar_city-photos` (seul celui de Rennes, du 27/10 : 227 tuiles Mapterhorn utiles sur 262, il manque 10 tuiles fines z13 autour de Cesson) ; et l'outil d'export ne lisait que les caches de la v1, jamais ceux de la v2 (`vh2-terrain`, `vh2-donnees`) : ce que la v2 avait chargé ce jour-là ne pouvait pas être exporté. Corrigé dans cette PR (`debug/debug-cache.html` lit aussi les caches de la v2). Hypothèse la plus probable, à vérifier avec un nouvel export : la hauteur d'œil (66 m ici, sans relief fin ; plus basse avec le relief fin IGN de la v2 → plus d'éléments cachés), ou des réglages différents entre v1 et v2 (rayon, correction d'œil : chacune garde les siens).
