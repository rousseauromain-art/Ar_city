# calques — UN FICHIER PAR CALQUE (étapes 4 à 8 : relief, photo-silhouette, lieux, monuments, équipements, reperes, kml, avions, bateaux)
Un calque exporte `charger`, `classer`, `preparer` (REFONTE.md §7) et ne dessine ni ne place jamais : `preparer` renvoie des commandes ou des étiquettes que `rendu/` pose et dessine.
Un calque n'importe jamais un autre calque (`lieux` et `monuments` ne lisent que la constante `ANALYSE_VALIDE_MS` de `photo-silhouette`).
