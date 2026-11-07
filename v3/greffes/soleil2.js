// Greffe « soleil2 » (remplacement, éteinte par défaut) : pointage au doigt sur le soleil de la v2 (v2/src/calage/pointage.js, ui/calage.js `evaluerPointage`).
// Le disque du soleil est cherché dans TOUTE l'image (roulis compensé) ; un toucher à moins de 8° du disque VU vaut « voici le soleil », même si la
// boussole est fausse de plus de 12° (v1 : seulement à moins de 12° du soleil calculé) ; la correction vient alors du disque, pas du doigt.
// Point d'entrée : pointCalibrate de v3/villes-horizon.html.
import {chercherDisque,wrap} from './_astre.js';
const FENETRE_SOLEIL_VU_DEG=8;
let c=null;
export default {
  init(ctx){ c=ctx; },
  /** Disque du soleil vu, si le toucher (relèvement brgTap, site elTap) en est à moins de 8° : {s (score, comme la v1), az, el}, sinon null. */
  vu(brgTap,elTap){
    const sp=c.sunNow(); if(!sp||sp.el<=-1) return null;
    const r=chercherDisque(c,sp,{large:true}); if(!r.ok) return null;
    const dVu=Math.hypot(wrap(r.az-brgTap),0.5*(elTap-r.el)); if(dVu>=FENETRE_SOLEIL_VU_DEG) return null;
    return {s:dVu-1,az:r.az,el:r.el};
  },
};
