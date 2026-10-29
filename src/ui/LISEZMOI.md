# ui — réglages, calques, fiches, pages. DOM uniquement.
- `page-photo.js` (v2/photo.html) : la page « photo rejouée », même interface que la v1 (balisage et style repris tels quels, `style.css`). Branche les commandes sur les réglages (`moteur/reglages.js`), la racine de composition (`app/application.js`) et le moteur de scène (`moteur/scene.js`) ; boucle d'affichage à 30 images/s ; glisser (cap, horizon) et pincer (champ) ; déclencheur ; diagnostic.
- Les commandes qui dépendent de l'étape 10 (calage automatique, calage appris, viser un repère, banc d'essai, visibilité d'après la photo) sont présentes mais désactivées.
- `outils-page.js` (v2/outils.html) : journal, relais, rapport.
