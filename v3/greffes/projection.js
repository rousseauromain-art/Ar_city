// Greffe « projection » (remplacement, éteinte par défaut) : projection exacte de la caméra. Constat du 11/11/2026 (Vercors) : en montagne, le
// relief dessiné s'écarte de l'image vers les bords de l'écran. La v1 place un point par deux formules indépendantes,
//   x = W/2 + f·tan(Δcap)   et   y = H/2 + f·tan(inclinaison − hauteur),
// exactes sur un horizon plat (elle a été mise au point en Bretagne) mais pas au-dessus : une vraie caméra voit la hauteur divisée par cos(Δcap),
// et les deux axes se mêlent quand le téléphone est incliné. Écart : 0,9° à 30° du centre pour une crête à 6° au-dessus de l'horizon, 2,3° à 15°.
// Formule exacte, avec les mêmes grandeurs : h' = atan(tan(hauteur) / cos(Δcap)) ;  y = H/2 + f·tan(inclinaison − h') ;
//   x = W/2 + f·tan(Δcap)·cos(h') / cos(h' − inclinaison).
// La greffe ne réécrit aucune ligne de dessin de la v1 : pendant le dessin de la scène, elle déplace chaque point que la v1 trace de sa position
// « v1 » à sa position exacte (tracés point par point ; un texte, une pastille ou un pictogramme d'un seul bloc, à partir de son point d'ancrage ;
// un nom et sa distance, écrits sur la même ligne, bougent ensemble). Tout ce que la scène dessine suit donc la même règle, sans exception :
// relief, crêtes, silhouettes, noms, monuments, soleil, lune, épingle. Le toucher fait le chemin inverse : le point touché est ramené dans le
// repère de la v1 avant d'être comparé aux zones tactiles ou converti en direction (fiches, calage au doigt, greffe nommer).
// Restent à la formule de la v1 : la lecture de l'image (Caler auto, soleil vu dans l'image) et le glisser.
// Points d'entrée : draw (début et fin de la scène), hitLocal (toucher), pointCalibrate (par hitLocal).
const RAD=Math.PI/180;
/** Du repère de la v1 (xv, yv) à l'écran exact. P : {f, W, H, p (inclinaison, radians)}. Hors du champ utile (plus de 80° de l'axe), inchangé. Pure. */
export function exact(xv,yv,P){
  const t=(xv-P.W/2)/P.f, a=P.p-Math.atan((yv-P.H/2)/P.f); if(!(Math.abs(a)<85*RAD)) return [xv,yv];
  const e=Math.atan(Math.tan(a)*Math.sqrt(1+t*t)), c=Math.cos(e-P.p); if(!(c>0.17)) return [xv,yv];
  return [P.W/2+P.f*t*Math.cos(e)/c,P.H/2+P.f*Math.tan(P.p-e)];
}
/** De l'écran au repère de la v1 (inverse de `exact`) : le rayon de la caméra passant par le point est redressé de l'inclinaison, puis replacé par
 *  les formules de la v1. Pure. */
export function inverse(x,y,P){
  const a=(x-P.W/2)/P.f, b=-(y-P.H/2)/P.f, cp=Math.cos(P.p), sp=Math.sin(P.p), F=cp-b*sp, U=sp+b*cp; if(!(F>0.05)) return [x,y];
  return [P.W/2+P.f*a/F,P.H/2+P.f*Math.tan(P.p-Math.atan2(U,Math.hypot(a,F)))];
}
let P=null, actif=false, local=false, force=null, texte=null, cadre=null, pile=[], pose=null, images=0;
const dep=(x,y)=>{ if(force) return force; const e=exact(x,y,P); return [e[0]-x,e[1]-y]; };
const pt=(x,y)=>force?[x+force[0],y+force[1]]:exact(x,y,P);
/** Habille une fois le contexte de dessin : hors de la scène (ou dans un repère déplacé par la v1 : nom incliné, pictogramme), rien ne change. */
function habiller(ctx){
  const o={}, garde=(nom,f)=>{ o[nom]=ctx[nom]; if(typeof o[nom]==='function') ctx[nom]=function(...a){ return actif&&!local?f.call(this,...a):o[nom].apply(this,a); }; };
  const libre=nom=>{ o[nom]=ctx[nom]; if(typeof o[nom]==='function') ctx[nom]=function(...a){ if(actif) local=true; return o[nom].apply(this,a); }; }; // repère changé par la v1 : la suite est dessinée telle quelle
  o.save=ctx.save; ctx.save=function(){ if(actif) pile.push([local,force]); return o.save.call(this); };
  o.restore=ctx.restore; ctx.restore=function(){ if(actif&&pile.length){ const s=pile.pop(); local=s[0]; force=s[1]; } return o.restore.call(this); };
  for(const nom of ['rotate','scale','transform','setTransform','resetTransform']) libre(nom);
  garde('translate',function(x,y){ const q=pt(x,y); local=true; return o.translate.call(this,q[0],q[1]); }); // l'ancrage d'un bloc : déplacé, puis le bloc est dessiné tel quel
  for(const nom of ['moveTo','lineTo']) garde(nom,function(x,y){ const q=pt(x,y); return o[nom].call(this,q[0],q[1]); });
  garde('quadraticCurveTo',function(cx,cy,x,y){ const c=pt(cx,cy), q=pt(x,y); return o.quadraticCurveTo.call(this,c[0],c[1],q[0],q[1]); });
  garde('bezierCurveTo',function(ax,ay,bx,by,x,y){ const a=pt(ax,ay), b=pt(bx,by), q=pt(x,y); return o.bezierCurveTo.call(this,a[0],a[1],b[0],b[1],q[0],q[1]); });
  garde('arcTo',function(ax,ay,bx,by,r){ const a=pt(ax,ay), b=pt(bx,by); return o.arcTo.call(this,a[0],a[1],b[0],b[1],r); });
  for(const nom of ['arc','ellipse']) garde(nom,function(x,y,...r){ const q=pt(x,y); return o[nom].call(this,q[0],q[1],...r); });
  // cadre de découpe (silhouette d'un monument coupée par ce qui la cache) : déplacé d'un bloc, d'après le milieu de son bord bas ; le cadre suivant qui
  // le prolonge (même axe, bord haut = ce bord bas) et tout ce qui est dessiné dedans suivent le même déplacement
  garde('rect',function(x,y,w,h){ const ax=x+w/2, d=cadre&&cadre.x===ax&&cadre.bas===y?cadre.d:dep(ax,y+h); cadre={x:ax,bas:y+h,d}; if(pile.length) force=d; return o.rect.call(this,x+d[0],y+d[1],w,h); });
  for(const nom of ['roundRect','fillRect','strokeRect','clearRect']) garde(nom,function(x,y,w,h,...r){ const d=dep(x+w/2,y+h/2); return o[nom].call(this,x+d[0],y+d[1],w,h,...r); });
  // texte : déplacé d'un bloc d'après son point d'ancrage ; la suite d'un même libellé (sa distance, à droite sur la même ligne) garde le même déplacement
  for(const nom of ['fillText','strokeText']) garde(nom,function(t,x,y,...r){ let d; if(texte&&y===texte.y&&x>=texte.x&&x-texte.x<=360) d=texte.d; else { d=dep(x,y); texte={x,y,d}; }
    return o[nom].call(this,t,x+d[0],y+d[1],...r); });
}
let habille=null;
export default {
  init(){},
  /** Point d'entrée de draw, au début de la scène (repère déjà redressé du roulis). */
  debut(ctx,{pitch,fh,W,H}){
    if(habille!==ctx){ habiller(ctx); habille=ctx; }
    P={f:fh,W,H,p:Math.max(-80,Math.min(80,pitch))*RAD}; pose={pitch,fh,W,H}; actif=true; local=false; force=null; texte=null; cadre=null; pile=[]; images++;
  },
  /** Point d'entrée de draw, à la fin de la scène : le ruban de cap et le reste de l'écran ne sont pas concernés. */
  fin(){ actif=false; },
  /** Point d'entrée du toucher (hitLocal) : du point touché (repère redressé du roulis) au repère de la v1, où sont les zones tactiles et les formules de direction. */
  inverse:(x,y)=>P?inverse(x,y,P):[x,y],
  exact:(x,y)=>P?exact(x,y,P):[x,y],
  etat:()=>({actif,images,pose:pose&&{...pose}}),
  statut(){ if(!P) return 'projection : exacte (en attente de la première image)';
    const hy=P.H/2+P.f*Math.tan(P.p), xv=P.W, yv=P.H/2+P.f*Math.tan(P.p-6*RAD), e=exact(xv,yv,P);
    return `projection : exacte · inclinaison ${(P.p/RAD).toFixed(1)}° · au bord droit de l’écran, un point à 6° au-dessus de l’horizon est déplacé de ${Math.round(Math.hypot(e[0]-xv,e[1]-yv))} px (horizon à ${Math.round(hy)} px du haut)`; },
};
