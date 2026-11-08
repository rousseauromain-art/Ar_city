// Greffe « tailleReelle » (ajout, éteinte par défaut). Constat terrain (Les Horizons, Rennes, 0,3 km) : la silhouette d'un monument proche rétrécit quand on
// baisse le téléphone, parce que le plafond de la v1 (SPR_MAX_FRAC = 30 % de l'écran, SPR_MAX_PX = 240 px, dans monAng) ne s'applique que si le pied du monument
// est à l'écran. Greffe allumée : plus de plafond, la silhouette garde toujours sa taille réelle (sol → sommet) ; le nom reste au sommet, ou, si le sommet sort
// par le haut, au bord haut de l'écran, sous la ligne des puces (et juste sous le sommet s'il n'y a pas de place au-dessus). Points d'entrée : monAng (plafond) et pose du nom des monuments, dans draw().
let c=null;
/** Haut utile de l'écran (px) : sous la ligne des puces (état, rayon), à défaut 40 px. */
function limiteHaute(){ const r=c&&c.$('chips'), l=r&&r.querySelector('.chiprow'); const b=l?l.getBoundingClientRect().bottom:0; return Math.max(40,(b||0)+6); }
export default {
  init(ctx){ c=ctx; },
  /** Le plafond de la v1 est-il levé ? (toujours, greffe allumée) */
  sansPlafond:()=>true,
  /** Nom d'un monument dont le sommet est à `ay` (px) : null si le sommet est visible (nom au sommet, comme la v1), sinon {y} ligne de base du nom au bord haut. */
  ancre(ay,taille){ if(ay>=200) return null; const L=limiteHaute(); return ay<L?{y:L+taille+2}:null; },
  /** Nom à plat au bord haut : à côté de l'axe du monument (comme la v1), sinon centré sur lui (silhouette large, écran étroit). `placeFlat` : celle de draw(). */
  poser:(placeFlat,o)=>placeFlat(o)||placeFlat({...o,halfW:-o.w/2-4,sides:[1]}),
  /** Pas de place au-dessus du sommet (silhouette haute, sommet près du bord) : ligne de base du nom juste sous le sommet, jamais au-dessus du bord haut. */
  sous:(ay,taille)=>Math.max(limiteHaute(),ay)+taille+2,
  limiteHaute,
};
