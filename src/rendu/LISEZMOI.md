# rendu — COMMUN à tous les calques (étapes 4 et 5)
- `projection.js` : relèvement et site → pixels (une seule définition), champ affiché.
- `commandes.js` : modèle de dessin (traits, remplissages, textes avec liseré, groupes pivotés) ; `canvas.js` : seul module qui dessine.
- `reservations.js` : places prises, chevauchement de rectangles inclinés, obstacles d'interface.
- `placement.js` : noms inclinés à 45° et à plat, mémoire de placement. `etiquettes.js` : pose les noms et les convertit en commandes.
- `repere-horizon.js` : ligne d'horizon et réticule.
- `icones.js` : pictogrammes et silhouettes de monuments en listes d'opérations ; `commandes.js`/`canvas.js` gèrent chemins, règle evenodd et commande glyphe ; `etiquettes.js` pose lieux et monuments (pastilles « +N »).
- `bande.js` : bande des équipements (étape 7), commune à `equipements`, `reperes` et `kml` : groupement, icônes, noms, deux étages, pastilles au bord.
