# Architecture de la v2

Référence : `REFONTE.md` (méthode du figuier étrangleur, règles, plan). Ce document décrit **ce qui existe** ; il est mis à jour à chaque étape.

## Vue d'ensemble

```
index.html            lanceur (v1, v2 en développement, outils)
v1/                   application de référence FIGÉE (2026-10-25 (j))
debug/                outils de diagnostic (liés à la v1), dont debug-cache.html (export du cache)
v2/outils.html        page d'outils de la v2 (étape 1)
src/                  modules ES natifs de la v2 (sans outil de construction)
tests/unit            node:test sur les modules purs
tests/e2e             Playwright : parcours critiques, sur la v1 figée et sur v2/outils.html
tests/caracterisation harnais : rejoue des scènes de référence dans la v1 et écrit un dump par calque
tests/a-reprendre     tests des apports des 26–27/10 absents de la v1 (non lancés)
```

## Flux de données (cible)

```
entrees/ (direct, photo) ──► Vue ──► scene/ ──► calques/<un fichier par calque> ──► rendu/ (placement commun) ──► canvas
donnees/ (réseau unique, cache, sources) ─────────┘          calage/ et vision/ ◄── Vue + scène
```

Sens des dépendances : `ui → rendu → calques → scene, calage, vision → noyau`. `donnees` et `entrees` fournissent les données ; `noyau` n'importe rien ; **un calque n'importe jamais un autre calque**.

## Ce qui est en place (étape 1)

| Module | Rôle |
|---|---|
| `src/outils/journal.js` | tampon circulaire d'événements (info, avert, erreur) ; `journal.erreur(module, message, données)` |
| `src/outils/etat.js` | **un seul état**, modifié par des fonctions nommées ; instantané copié |
| `src/outils/stockage.js` | clés `vh2:`, caches `vh2-`, enregistrements `{v, d}` versionnés avec migrations ; ne touche jamais aux clés de la v1 |
| `src/outils/drapeaux.js` | fonctions expérimentales, désactivées par défaut (`?drapeaux=lune`) |
| `src/outils/rapport.js` | rapport JSON borné en taille (« Exporter un rapport ») |
| `src/outils/debug.js` | `?debug=1` charge Eruda (version figée) |
| `src/donnees/reseau.js` | **seul accès réseau** : délai, nouvelles tentatives, doublons fusionnés, cache, hors ligne |
| `src/ui/outils-page.js` | écran de `v2/outils.html` (DOM uniquement) |
| `src/types.d.ts` | types communs : `Vue`, `Calque`, `ElementClasse`, `RapportV2` |

Toutes les dépendances (fetch, horloge, stockage, journal) sont **injectées** : les modules se testent sans navigateur.

## Qualité (CI, à chaque envoi et pull request)

1. `npm run lint` : ESLint sur `src/` et `tests/unit/` (jamais de `catch` vide).
2. `npm run types` : `tsc --noEmit`, `checkJs` strict, types en JSDoc (`// @ts-check` en tête de chaque module).
3. `npm run test:unit` : `node:test`, moins de 2 s.
4. `npm run test:e2e` : Playwright.

La v1 figée, `debug/` et les tests Playwright (CommonJS) sont hors du lint et du contrôle de types.

## Harnais de caractérisation

`npm run dump:v1` rejoue chaque scène de `tests/caracterisation/scenes.mjs` dans la v1 **sans la modifier**, avec le vrai code de la page lisant les caches exportés (`debug/debug-cache.html`), et écrit un JSON par scène et par mode (Essentiel, Tout voir). Chaque élément de chaque calque : `etat` (net, transparent, absent), `raison`, `rendu` (dessiné, hors champ, sans place), position et opacité. À l'étape 3, la v2 produira le même format et un comparateur signalera tout écart non listé dans `tests/ecarts-acceptes.json`.

Photos, exports et dumps restent dans le dépôt privé `Ar_city-photos` (ils révèlent des lieux et des dates).
