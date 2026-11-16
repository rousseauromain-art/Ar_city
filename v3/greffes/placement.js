// Greffe « placement » (remplacement, éteinte par défaut) — plan du 16/11, lot R4 : étiquettes dans le ciel, sans recouvrement, rapides
// (constats K3, K4, K7). Elle règle la greffe etiquettes et le placement de la v1 par des points d'entrée ; elle ne réécrit rien.
//  - Trait de rappel borné : les voies du nom incliné ne montent pas plus haut qu'un quart de l'écran au-dessus du point, au moins 140 px (la v1 : 60 voies) ;
//    le repli à plat d'etiquettes ne descend pas plus loin qu'un quart de l'écran, et, pour un nom de montagne, reste tout près du point
//    (deux lignes au plus) : un nom qui ne tient pas n'est pas écrit et compte dans « + N » (la v1 et etiquettes : jusqu'à 260 px sous la crête).
//  - La tenue de 2 s d'etiquettes RÉSERVE sa place : un nom tenu n'est redessiné que si sa place est libre (jamais deux textes l'un sur l'autre).
//  - Rien sous les boutons et les puces : la colonne de boutons de droite et les puces visibles s'ajoutent aux obstacles de la v1 (qui ne
//    comptait que la barre du bas).
//  - Altitude et distance d'un nom de montagne en vert, comme le nom (la v1 : ocre pour tous).
//  - Vitesse : largeurs de texte gardées en mémoire ; un nom qui n'a pas trouvé de place n'est réessayé à plat qu'au plus cinq fois par
//    seconde, ou dès que la vue bouge de plus de 0,2° (photo immobile : il n'est plus réessayé à chaque image).
// Points d'entrée : draw() (obstacles, voies, couleur de l'altitude), etiquettes.poser (repli, tenue, essais espacés).
export const QUART=0.25, PLANCHER=140, MARGE_PROJ=5, LIGNES_MONTAGNE=4, ESSAI_MS=200, VUE_DEG=0.2, LBL_STEP=10, LEVEE=18;
let c=null, obs=null, obsT=0, vue={h:0,p:0,t:0};
const echecs=new Map(); // nom|genre -> {t, h, p} : dernier essai raté du repli à plat
const rates=new WeakMap(); // lieu -> {t, h, p} : dernière image où il n'a trouvé aucune place

/** Hauteur de ce qui est vu à l'écran : celle de la scène, sauf photo grossie (greffe photo : la scène est plus grande que l'écran, un trait de rappel se borne à l'écran). */
const hv=H=>{ const G=typeof window!=='undefined'&&window.G; return G&&G.actif&&G.actif('photo')?G.photo.hVisible(H):H; };
/** Longueur la plus grande d'un trait de rappel (px) pour une scène de hauteur `H` : un quart de l'écran, au moins PLANCHER px (en paysage, un quart d'écran
 *  ne laisse que 83 px : les noms de crêtes, dont le ciel est pourtant libre au-dessus, n'avaient pas de place). */
export function limite(H){ return Math.max(hv(H)*QUART,PLANCHER); }
/** Nombre de voies du nom incliné pour que son trait reste sous la limite. Pure. */
export function voies(H){ return Math.max(3,Math.floor((limite(H)-LEVEE)/LBL_STEP)); }
/** Lignes du repli à plat : `montagne` → LIGNES_MONTAGNE ; sinon autant qu'il en tient dans la limite. Pure. */
export function lignes(montagne,size,H){ return montagne?LIGNES_MONTAGNE:Math.max(1,Math.floor(limite(H)/(size+6))); }
/** Faut-il réessayer un nom raté ? Pas avant ESSAI_MS, sauf si la vue a bougé de plus de VUE_DEG. Pure. */
export function reessayer(e,maintenant,h,p){
  if(!e) return true;
  if(maintenant-e.t>=ESSAI_MS) return true;
  const dh=Math.abs((((h-e.h)%360)+540)%360-180);
  return dh>VUE_DEG||Math.abs(p-e.p)>VUE_DEG;
}
const maintenant=()=>(typeof performance!=='undefined'?performance.now():Date.now());

function memoriserLargeurs(){
  const ov=c.$('ov'); if(!ov) return; const x=ov.getContext('2d'); if(x.__g3Memo) return;
  const brut=x.measureText.bind(x), memo=new Map();
  x.measureText=function(t){ const k=this.font+'\u0001'+t; let r=memo.get(k); if(!r){ r=brut(t); if(memo.size>4000) memo.clear(); memo.set(k,r); } return r; };
  x.__g3Memo=true;
}

/** Rectangle d'écran [x0,x1,y0,y1] → repère où la v1 place les noms : décalé comme la scène (photo grossie), puis agrandi jusqu'à la position où la projection exacte le portera
 *  (elle déplace un nom d'un bloc, après son placement) et de MARGE_PROJ px en hauteur (le déplacement dépend du point d'ancrage du nom, pas de l'endroit où il touche le bouton).
 *  Sans cela, un bouton ou une puce était comparé à un nom 30 px plus bas ou plus haut que celui qui est écrit. */
function enScene(r){
  const G=typeof window!=='undefined'&&window.G; if(!G||!G.actif) return r;
  const ph=G.actif('photo'), pr=G.actif('projection'); if(!ph&&!pr) return r;
  let [x0,x1,y0,y1]=r; if(ph){ [x0,y0]=G.photo.scene(x0,y0); [x1,y1]=G.photo.scene(x1,y1); }
  if(!pr) return [x0,x1,y0,y1];
  const xs=[x0,x1], ys=[y0,y1]; for(let i=0;i<=4;i++) for(let j=0;j<=4;j++){ const q=G.projection.inverse(x0+(x1-x0)*i/4,y0+(y1-y0)*j/4); xs.push(q[0]); ys.push(q[1]); }
  return [Math.min(...xs),Math.max(...xs),Math.min(...ys)-MARGE_PROJ,Math.max(...ys)+MARGE_PROJ];
}
export default {
  init(ctx){ c=ctx; memoriserLargeurs(); },
  QUART,reessayer,limite,
  /** Point d'entrée de draw : nombre de voies du nom incliné. */
  voies,
  /** Point d'entrée de draw : obstacles de la v1 (barre du bas) + colonne de boutons et puces visibles (rectangles [x0,x1,y0,y1]). */
  obstacles(base){
    const now=maintenant(); // l'horloge de la page peut être figée (banc de test) : performance.now()
    if(!obs||now-obsT>1000){ obsT=now; obs=[];
      for(const el of document.querySelectorAll('#tools button,.chip,#g3Retour')){
        const b=el.getBoundingClientRect(), st=getComputedStyle(el);
        if(b.width>0&&b.height>0&&st.display!=='none'&&st.visibility!=='hidden'&&!el.hidden) obs.push([b.left-4,b.right+4,b.top-4,b.bottom+4]);
      } }
    return base.concat(obs).map(enScene);
  },
  /** Point d'entrée de draw : couleur de l'altitude et de la distance d'un nom (`tint` : couleur du nom). */
  couleurDistance(tint,ghost,vert){ return tint===vert?`rgba(${tint},${ghost?.5:1})`:`rgba(224,165,38,${ghost?.5:1})`; },
  /** Point d'entrée de draw : ce lieu, sans place à l'image d'avant, peut-il être sauté (vue immobile, moins de ESSAI_MS) ? */
  sauter(lieu){
    const e=rates.get(lieu); if(!e) return false;
    const t=maintenant(); if(t-vue.t>16){ try{ const P=c.pose(); vue={h:P.heading,p:P.pitch,t}; }catch(er){} }
    if(reessayer(e,t,vue.h,vue.p)){ rates.delete(lieu); return false; }
    return true;
  },
  /** Point d'entrée de draw : ce lieu n'a trouvé aucune place. */
  rate(lieu){ const e=rates.get(lieu), t=maintenant(); if(e&&t-e.t<ESSAI_MS) return; if(t-vue.t>16){ try{ const P=c.pose(); vue={h:P.heading,p:P.pitch,t}; }catch(er){} } rates.set(lieu,{t,h:vue.h,p:vue.p}); },
  /** Longueur à l'écran d'un trait (x1,y1)→(x2,y2) du repère de la v1 : redressé par la greffe projection si elle est allumée (elle étire les bords). */
  longueur(x1,y1,x2,y2){
    const G=typeof window!=='undefined'&&window.G; if(G&&G.actif('projection')){ const a=G.projection.exact(x1,y1), b=G.projection.exact(x2,y2); return Math.hypot(b[0]-a[0],b[1]-a[1]); }
    return Math.hypot(x2-x1,y2-y1);
  },
  /** Pour etiquettes : lignes du repli à plat. */
  lignes,
  /** Pour etiquettes : le repli à plat de ce nom peut-il être réessayé à cette image ? */
  essayer(cle){
    const t=maintenant(); if(t-vue.t>16){ try{ const P=c.pose(); vue={h:P.heading,p:P.pitch,t}; }catch(e){} }
    return reessayer(echecs.get(cle),t,vue.h,vue.p);
  },
  /** Pour etiquettes : résultat d'un essai à plat. */
  noter(cle,ok){ if(ok) echecs.delete(cle); else { echecs.set(cle,{t:maintenant(),h:vue.h,p:vue.p}); if(echecs.size>4000) echecs.clear(); } },
  statut:()=>`placement : ${echecs.size} nom(s) en attente d'une place`,
};
