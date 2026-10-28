# rendu — COMMUN à tous les calques (étapes 4 et 5)
- `projection.js` : relèvement et site → pixels (une seule définition), champ affiché.
- `commandes.js` : modèle de dessin (traits, remplissages, textes avec liseré, groupes pivotés) ; `canvas.js` : seul module qui dessine.
- `reservations.js` : places prises, chevauchement de rectangles inclinés, obstacles d'interface.
- `placement.js` : noms inclinés à 45° et à plat, mémoire de placement. `etiquettes.js` : pose les noms et les convertit en commandes.
- `repere-horizon.js` : ligne d'horizon et réticule.
