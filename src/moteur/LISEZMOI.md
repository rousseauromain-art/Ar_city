# moteur — PUR : l'assemblage de tous les calques (étape 9a)
- `scene.js` : `composerScene({vue, reglages, donnees, memoires, ecran, maintenantMs, etat})` → commandes de la scène (sous la rotation du roulis) + commandes d'écran (ruban de cap, message central) + bilan (comptes, statut, zones tactiles). Même ordre que `draw()` de la v1. Ni réseau, ni DOM, ni horloge. Les mémoires (placement des noms, lignes de la bande, bateaux nommés, calage des monuments) sont passées par l'appelant et mises à jour.
- `classement.js` : classements de tous les calques, liste commune, étiquettes, couches de la bande.
- `reglages.js` : valeurs par défaut des réglages, liste blanche mémorisée (`vh2:reglages`), fusion, migration.
- `statut.js` : message central et bandeau d'état.
- Les deux modes (photo, direct) ne diffèrent que par la `Vue` et les `donnees` qu'on passe ici.
- Pas encore portés (étape 10) : symbole du soleil, silhouette lue sur la photo (le moteur sait la tracer si on la lui donne), silhouette des bâtiments (BD TOPO, jamais portée).

- `reglages.js` (10e) : `reprendreReglagesV1` reprend UNE fois, en lecture seule, les réglages d'affichage de la v1 (`vh_settings_v2` : ligne de relief, rayon, calques, POI, etc.), jamais le calage ni la position simulée ; marque `vh2:reglages-v1-repris`.
