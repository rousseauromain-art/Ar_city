# Points à mettre dans la future page d'aide

Liste tenue à jour au fil des retours de Romain ; chaque point = un cas rencontré sur le terrain, avec sa cause et son remède.

## Les noms glissent plus vite que l'image quand on tourne le téléphone (16/11/2026)
- **Cause** : le champ de la caméra est trop étroit. Constaté : 20° (le minimum du curseur, « affiché 11° ») alors que le champ mesuré par `champAuto` était de 56° (Pixel 9, caméra principale). Le tracé bouge alors beaucoup plus que l'image.
- **Remède** : Réglages › Calage et capteurs › « Remesurer » (ou « Reprendre la mesure »), ou le curseur « Champ de la caméra » (56° sur le Pixel 9, caméra principale).
- **Origine trouvée** : un doigt posé pendant un changement de mode (Caler / Se déplacer) ou pendant la sortie du mode photo laissait un « doigt fantôme » dans la v1 ; chaque glisser était alors lu comme un pincement et poussait le champ à 20° ou à 110°. Corrigé dans la greffe `photo` (les doigts transmis à la v1 lui sont retirés), test `photo.spec.js`.
- **À dire dans l'aide** : une valeur de champ très basse ou très haute (20°, 110°) est le signe d'un pincement involontaire.

## Mode photo (greffe `photo`)
- **Caler** : photo entière ; glisser règle le cap et l'horizon, pincer le champ, tourner à deux doigts la rotation (±15°).
- **Se déplacer** : photo en pleine largeur, bord haut en haut (le ciel d'abord) ; glisser fait monter ou descendre la photo (butée sur ses bords), pincer grossit (les noms sont refaits à l'échelle) ; double toucher : photo entière ↔ pleine largeur.
- Les bandes noires autour de la photo entière sont le reste de l'écran : la photo n'est plus recadrée.
