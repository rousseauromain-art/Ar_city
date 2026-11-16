// Greffe « etiquettes » (ajout, éteinte par défaut). Constat de la sortie de Pont-en-Royans (14/11) : en gorge ou en montagne, la crête est haute dans l'image et le nom
// incliné à 45° vers le haut d'un lieu n'a pas la hauteur libre (Le Grand Serre, crête de Chalimont… jamais écrits) ; et un nom qui perd sa place pour quelques pixels disparaît aussitôt.
//  - Repli : quand le nom incliné ne tient pas, il s'écrit À PLAT à côté du point, au-dessus, sinon en dessous (versant, plaine), comme le font déjà les monuments.
//  - Tenue : un nom écrit reste affiché TENUE_MS après la dernière image où il avait sa place, à la même position relative à son point.
//  - Couleur : sommets et cols en vert (VERT, choisi par Romain le 15/11), texte cerné de sombre comme les autres noms.
// Points d'entrée dans draw() : `vert` (couleur), `noter` (place du nom incliné), `poser` (repli à plat, tenue).
const VERT='110,224,143', TENUE_MS=2000;
let boite=null; // boîte du dernier nom écrit par la greffe ([x0,x1,y0,y1,poly]) : zone tactile (greffe toucher)
const mem=new Map(); // nom|genre -> {t, mode:'inc'|'plat', dx, dy, sgn}
const maintenant=()=>(typeof performance!=='undefined'?performance.now():Date.now());
const cle=c=>c.name+'|'+c.kind;
const placement=()=>(typeof window!=='undefined'&&window.G&&window.G.actif('placement'))?window.G.placement:null; // greffe placement (lot R4)
/** Polygone du texte écrit à (lx, ly), incliné ('inc', côté sgn) ou à plat ('plat') : nom + altitude/distance. */
function polyDe(o,m,lx,ly,sgn){
  const {nw,dw,dtxt,size,ANG_LBL}=o, L=nw+(dtxt?7+(dw||0):0), a=m==='inc'?-sgn*ANG_LBL:0, s0=m==='inc'?sgn:1, ca=Math.cos(a), sa=Math.sin(a);
  const pt=(px,py)=>[lx+px*ca-py*sa,ly+px*sa+py*ca]; return [pt(0,-size),pt(s0*L,-size),pt(s0*L,3),pt(0,3)];
}
function dessiner(ctx,o,m,lx,ly,sgn){
  const {c,x,ay,lab,dtxt,nw,size,tint,alpha,ghost,ANG_LBL,FD,FM}=o;
  ctx.strokeStyle=`rgba(${tint},${.85*alpha})`; ctx.lineWidth=1; if(ghost) ctx.setLineDash([2,3]);
  const Lp=nw+(placement()&&dtxt?7+(o.dw||0):0); // greffe placement : à gauche du point, le trait s'arrête au bout du texte entier (il traversait l'altitude et la distance)
  ctx.beginPath(); ctx.moveTo(x,ay); ctx.lineTo(m==='inc'?lx:(lx<x?lx+Lp:lx),m==='inc'?ly:ly-size*0.35); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle=`rgba(${tint},${.95*alpha})`; ctx.beginPath(); ctx.arc(x,ay,ghost?1.8:2.4,0,7); ctx.fill();
  ctx.save(); ctx.translate(lx,ly);
  if(m==='inc'){ ctx.rotate(-sgn*ANG_LBL); ctx.textAlign=sgn>0?'left':'right'; } else ctx.textAlign='left';
  ctx.font=`700 ${size}px ${FD}`; ctx.strokeStyle=`rgba(14,26,43,${ghost?.6:.9})`; ctx.lineWidth=3.5;
  ctx.strokeText(lab,0,0); ctx.fillStyle=`rgba(${tint},${alpha})`; ctx.fillText(lab,0,0);
  if(dtxt){ ctx.font=`500 11px ${FM}`; const dx=m==='inc'?sgn*(nw+7):nw+7; ctx.lineWidth=3; ctx.strokeText(dtxt,dx,0); const P=placement(); ctx.fillStyle=P?P.couleurDistance(tint,ghost,VERT):`rgba(224,165,38,${ghost?.5:1})`; ctx.fillText(dtxt,dx,0); } // greffe placement : altitude et distance en vert pour la montagne
  ctx.restore();
  // boîte du texte écrit (nom + altitude/distance) dans le repère de la scène, pour la zone tactile (greffe toucher)
  const L=nw+(dtxt?7+ctx.measureText(dtxt).width:0), a=m==='inc'?-sgn*ANG_LBL:0, s0=m==='inc'?sgn:1, ca=Math.cos(a), sa=Math.sin(a);
  const pt=(px,py)=>[lx+px*ca-py*sa,ly+px*sa+py*ca], poly=[pt(0,-size),pt(s0*L,-size),pt(s0*L,3),pt(0,3)];
  const xs=poly.map(q=>q[0]), ys=poly.map(q=>q[1]); boite=[Math.min(...xs),Math.max(...xs),Math.min(...ys),Math.max(...ys),poly];
}
export default {
  init(){},
  VERT,TENUE_MS,
  /** Couleur (« r,g,b ») d'un sommet ou d'un col, sinon null (la v1 choisit). */
  vert:c=>c&&c.kind==='peak'?VERT:null,
  /** Nom incliné posé par la v1 : on retient sa place relative à son point. */
  noter(c,x,ay,lx,ly,sgn){ mem.set(cle(c),{t:maintenant(),mode:'inc',dx:lx-x,dy:ly-ay,sgn}); if(mem.size>3000) mem.clear(); },
  /** Pas de place pour le nom incliné : à plat au-dessus du point, sinon dessous ; sinon, si le nom était écrit il y a moins de TENUE_MS, à la même place relative. Renvoie vrai s'il est écrit. */
  poser(o){
    const {ctx,placeFlat,c,x,ay,nw,dw,dtxt,size}=o, w=nw+(dtxt?dw+7:0), k=cle(c), P=placement();
    // greffe placement : repli borné (montagne : tout près du point ; sinon un quart de l'écran), essais ratés espacés
    const essai=!P||P.essayer(k);
    let f=null;
    if(essai&&!P) f=placeFlat({x,y0:ay-6,halfW:4,w,size,own:c,dir:-1})||placeFlat({x,y0:ay+size+8,halfW:4,w,size,own:c,dir:1});
    else if(essai){ // greffe placement : chaque ligne essayée seulement si son trait reste sous un quart de l'écran (montagne : deux lignes au plus)
      const lim=P.limite(o.H||800), nMax=P.lignes(c.kind==='peak',size,o.H||800);
      for(const [y0,dir] of [[ay-6,-1],[ay+size+8,1]]) for(let k=0;k<nMax&&!f;k++){
        const y=y0+dir*k*(size+6); if(P.longueur(x,ay,x+8,y-size*0.35)>lim) break; // longueur à l'écran (projection comprise)
        f=placeFlat({x,y0:y,halfW:4,w,size,own:c,dir,maxK:1}); } }
    if(P&&essai) P.noter(k,!!f);
    if(f){ mem.set(k,{t:maintenant(),mode:'plat',dx:f.x-x,dy:f.y-ay}); dessiner(ctx,o,'plat',f.x,f.y,0); return true; }
    const m=mem.get(k);
    if(m&&maintenant()-m.t<=TENUE_MS){
      const lx=x+m.dx, ly=ay+m.dy;
      if(P&&P.longueur(x,ay,x+m.dx,ay+m.dy)>P.limite(o.H||800)) return false; // greffe placement : place retenue trop loin du point (trait borné, à l'écran)
      if(P&&o.placed&&o.chevauche){ // greffe placement : la tenue réserve sa place ; occupée, le nom n'est pas redessiné
        const poly=polyDe(o,m.mode,lx,ly,m.sgn), xs=poly.map(q=>q[0]), ys=poly.map(q=>q[1]), b=[Math.min(...xs),Math.max(...xs),Math.min(...ys),Math.max(...ys)];
        if(o.placed.some(r=>r[5]!==c&&b[0]<r[1]+3&&b[1]>r[0]-3&&b[2]<r[3]+3&&b[3]>r[2]-3&&o.chevauche(poly,r[4]||[[r[0],r[2]],[r[1],r[2]],[r[1],r[3]],[r[0],r[3]]],3))) return false;
        o.placed.push([b[0],b[1],b[2],b[3],poly,c]);
      }
      dessiner(ctx,o,m.mode,lx,ly,m.sgn); return true; }
    return false;
  },
  /** Mode montagne : les sommets et cols visibles passent devant les autres lieux (ordre conservé dans chaque groupe) ; les monuments gardent leur priorité, les fantômes restent derrière. */
  ordonner(liste){ // une seule passe : monuments, sommets visibles, autres lieux, zones (greffe zones : elles ne prennent que la place qui reste)
    const mon=[], som=[], autres=[], zon=[];
    for(const c of liste){ if(c.kind==='monument') mon.push(c); else if(c.kind==='peak'&&!c.far&&!c.hidden&&!c.zone) som.push(c); else if(c.zone) zon.push(c); else autres.push(c); }
    return mon.concat(som,autres,zon); },
  /** Boîte du dernier nom écrit par la greffe (zone tactile de la greffe toucher). */
  boite:()=>boite,
  /** Pour les tests : oublie les places retenues. */
  oublier(){ mem.clear(); },
};
