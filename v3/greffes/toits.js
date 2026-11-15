// Greffe « toits » (ajout, éteinte par défaut). Constat de la sortie de Pont-en-Royans (14/11) : Choranche (village, 3,5 km) est jugé caché pour 0,36° (hauteur vue −1,79°,
// crête devant −1,43°) alors que la table d'orientation le montre : un village n'est pas un point, ses toits dépassent. La v1 teste un lieu habité comme un point à 12 m
// du sol avec 0,18° de tolérance ; la greffe porte la tolérance à MARGE_HABITE degrés pour les lieux habités (ville, village, hameau, habitation isolée).
// Les sommets, monuments et autres repères gardent la règle de la v1. Point d'entrée : applyOcclusion().
const MARGE_HABITE=0.5, HABITE=new Set(['city','town','village','hamlet','isolated_dwelling']);
export default {
  init(){},
  MARGE_HABITE,
  /** Le lieu `c`, jugé caché par la v1 (verdict `r` d'assessPlace), est-il en réalité visible ? */
  visible(c,r){ return HABITE.has(c.kind)&&r&&r.mask-r.aP<=MARGE_HABITE; },
};
