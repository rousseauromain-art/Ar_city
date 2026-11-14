// Greffe « soleilReflet » (remplacement, éteinte par défaut) : « Caler » sur le soleil, reflets et éclats de nuage mieux reconnus.
// Constat du 14/11/2026 (photo de Morgat, 24/08, soleil à 12° sous des nuages éclairés) : « Caler » réglait l'horizon 4 à 5° trop bas, dans la
// v1 comme dans la v3. La v1 écarte comme REFLET toute tache claire qui a une autre tache claire au-dessus d'elle dans la même colonne (règle
// du 25/10 pour un reflet sur l'eau à Ibiza). Sous des nuages éclairés, le vrai soleil a toujours du clair au-dessus : il était écarté, et un
// éclat de nuage 3 à 5° plus haut était pris pour lui.
// La greffe garde les mêmes taches (mêmes seuils, même forme compacte) et change deux règles :
//  - une tache n'est le reflet d'une tache plus haute que si elle est sous l'horizon que cette tache plus haute implique si elle est le soleil
//    (le soleil est à sa hauteur calculée au-dessus de l'horizon ; son reflet sur l'eau ou le sable est en dessous), et si la tache plus haute
//    n'est pas bien plus petite (un éclat de nuage, une ampoule ne sont pas la source d'un reflet) ;
//  - parmi les taches restantes, le soleil est un disque gros : les éclats plus petits que le quart du plus gros ne sont pas retenus ; puis,
//    comme la v1, le plus proche de la position calculée.
// Sur la photo d'Ibiza (le cas du 25/10), le résultat ne change pas. Les mêmes règles servent aux greffes soleil2, lune et recalageContinu
// (outil partagé `_astre.js`).
// Point d'entrée : sunAlign (après la recherche des taches).
import {candidats,meilleur,wrap} from './_astre.js';
let dernier=null;
export default {
  init(){},
  /** Point d'entrée de sunAlign : les taches de la v1 {thr,a,cx,cy,x0,x1,y0,y1,compact} (image de `cw` px de large) → même réponse que sunAlign. */
  caler(toutes,{cw,W,H,fh,pose,soleil,large}){
    const taches=toutes.map(o=>({seuil:o.thr,aire:o.a,cx:o.cx,cy:o.cy,x0:o.x0,x1:o.x1,y0:o.y0,y1:o.y1,compacte:o.compact}));
    const cs=candidats(taches,{cw,W,H,fh,pose,astre:soleil,large}), b=meilleur(cs,large,{gros:true});
    if(!b){ dernier={ok:false,n:cs.length}; return {ok:false,msg:toutes.length?'pas de disque solaire net (halo trop étalé ou seulement des reflets)':'pas de disque solaire net sur l\'image (voilé, nuages ?)'}; }
    dernier={ok:true,az:+b.az.toFixed(2),el:+b.el.toFixed(2),aire:b.aire,n:cs.length};
    return {ok:true,dh:wrap(soleil.az-b.az),dp:soleil.el-b.el,sun:soleil,n:cs.length};
  },
  etat:()=>dernier&&{...dernier},
  statut:()=>`soleilReflet : ${!dernier?'en attente d’un calage sur le soleil':dernier.ok?`dernier soleil vu à ${dernier.az}° / ${dernier.el}° (disque de ${dernier.aire} px, ${dernier.n} candidat(s))`:`dernier calage : aucun disque retenu (${dernier.n} candidat(s))`}`,
};
