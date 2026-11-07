# Ar_city — Villes à l'horizon

Réalité augmentée dans le navigateur : par-dessus la caméra, les noms des lieux et des monuments, le relief, les bateaux, les avions et les équipements télécom.
Site : https://rousseauromain-art.github.io/Ar_city/ (page d'accueil).

- **v3** (`v3/`) : la version active — la v1 (j) + des greffes de la v2, chacune derrière un interrupteur éteint par défaut (Réglages › Greffes v2, ou `?g=lune,permutation`).
- **v1** (`v1/`) : la référence, figée.
- **v2** (`v2/`) : gelée (tag `v2-fin`).

Spécification : [`docs/REFONTE-V3.md`](docs/REFONTE-V3.md) · état des sujets : [`docs/ETAT.md`](docs/ETAT.md).

```
index.html            page d'accueil : la seule page à la racine
config.js             adresse du relais (la v1 et la v3 la lisent en ../config.js : elle reste ici)
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

Tests : `npm ci`, puis `npm run test:v3` et `npx playwright test --project=v3` (la v3) ou `--project=v2` (la v2). Construction du site publié : `npm run build` (dans `dist/`).
