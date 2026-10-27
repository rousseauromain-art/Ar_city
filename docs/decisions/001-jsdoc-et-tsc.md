# 001 — Types par JSDoc et `tsc --noEmit`, pas de TypeScript compilé

- **Date :** 27/10/2026. **Décision :** modules JavaScript natifs, types en JSDoc, vérifiés par `tsc --noEmit` dans la CI.
- **Pourquoi :** GitHub Pages sert les fichiers tels quels. Une étape de compilation ajouterait un écart entre le code du dépôt et celui qui tourne, et Romain ne travaille que sur téléphone : il doit pouvoir lire ce qui est en ligne.
- **Conséquence :** `// @ts-check` en tête de chaque module, types communs dans `src/types.d.ts`. Une construction (Vite) reste possible plus tard, dans GitHub Actions.
