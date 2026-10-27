# Tests à reprendre (non lancés)

Ces tests vérifient des apports des 26 et 27/10/2026 qui ne sont **pas** dans la v1 figée (version 2026-10-25 (j)). Ils échouent contre `v1/villes-horizon.html`. Ils sont rangés hors de `tests/e2e/` : Playwright ne les lance pas.

À remettre dans la suite quand l'apport correspondant est repris dans la v2 (voir `REFONTE.md` §2, un apport à la fois, après accord de Romain), en adaptant l'adresse de la page.

| Fichier | Apport vérifié | Commit d'origine |
|---|---|---|
| `hauteur-oeil-puce.spec.js` | puce « œil » (correction, détail au toucher) ; repères rangés avec les calques | `04274ed`, `17a0bbd` |
| `calage-reperes.spec.js` | calage sur repères : test de permutation contre les coïncidences | `1c29728` |
| `export-cache.spec.js` | export du cache ; traits bleus seulement en debug (**comportement non voulu : ne pas reprendre ce point**) | `1c29728`, `8ec9a99`, `052d217` |
| `photo-plein-ecran.spec.js` | photo rejouée en plein écran : vue épurée | `052d217` |
| `lieux-horizon-bas.spec.js` | repli à plat pour tous les lieux sans place (**cause probable de régression : à ne reprendre qu'après décision**) | `30ad8a7` |

L'état complet de `main` avant la refonte est conservé dans la branche `archive/avant-refonte-2026-10-27` (commit `f61db6e`).
