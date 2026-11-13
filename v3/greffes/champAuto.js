// Greffe « champAuto » (ajout, éteinte par défaut) : le champ de la caméra est MESURÉ, plus réglé à la main. Constat du 11/11/2026 (Vercors) : le
// champ était réglé à 45° pour une caméra d'environ 62° → le tracé tournait 1,5 fois plus vite que l'image, « le calage ne tient pas dès que je
// tourne ». Une appli native lit le champ dans le système (focale et taille du capteur) ; une page web n'y a pas accès. La greffe le mesure :
// quand on tourne le téléphone, le gyroscope donne l'angle parcouru et l'image donne le déplacement en pixels ; leur rapport est la focale.
//  - image : la vidéo réduite à 192 px de grand côté ; décalage d'ensemble par corrélation au quart de définition, puis décalage fin de neuf
//    blocs par moindres carrés sur les pentes de l'image. Un bloc qui ne contient qu'un contour (une crête sur le ciel, par temps brumeux)
//    donne quand même une mesure, perpendiculaire au contour ;
//  - angle : `deviceorientation` relatif (gyroscope), brut, relu à l'instant de chaque image ; le retard entre image et capteur est cherché ;
//  - modèle exact (sténopé) du déplacement de chaque bloc, téléphone incliné compris ; une paire = environ 7° de rotation ; ajustement
//    robuste (un bloc de premier plan, un nuage qui bouge sont écartés) sur au moins 10 paires et 60° de rotation cumulée, deux moitiés
//    qui concordent à 4 % ; la mesure s'affine ensuite jusqu'à 40 paires.
// Une puce « champ » montre l'avancement (ou ce qui manque : pas de rotation, image sans détail…) puis le résultat. La mesure est gardée par
// caméra (`vh3_champAuto`) et appliquée au réglage « Champ de la caméra » ; une fois mesuré, le pincement à deux doigts ne le change plus
// (curseur des Réglages pour le changer, bouton « Remesurer »). À faire dehors, par temps clair, face à un paysage lointain.
// Points d'entrée : pincement (pointermove) ; le reste est une minuterie de la greffe.
const RAD=Math.PI/180;
export const GRAND_COTE=192, SEUIL_PAIRE_PX=18, REF_MAX_MS=4000, CADENCE_MS=70, ROTATION_MIN_DEG_S=2;
export const CORR_MIN=0.6, MARGE_MIN=0.05, CONTRASTE_MIN=4, PENTE_MIN=0.5, RESIDU_MAX=0.4, PAIRES_MIN=10, PAIRES_FIN=40, PAIRES_MAX=80, ROTATION_MIN_DEG=60, RMS_MAX_PX=1.5, PART_MIN=0.6, MOITIES_MAX=0.04, PRECISION_MAX=0.006;
export const RETARDS_MS=Array.from({length:35},(_,i)=>-40+10*i), CHAMP_MIN=35, CHAMP_MAX=100, AFFINAGE_MAX_MS=180000;
const CLE='vh3_champAuto';

// ---------- image : décalage d'ensemble (grossier), puis par blocs (fin) ----------
/** Image préparée : adoucie (deux passes 3×3 : les contours deviennent des pentes que l'ajustement fin sait suivre) et sa réduction au quart. */
export function preparer(lum,w,h){
  const adoucir=s=>{ const o=new Float32Array(w*h); for(let y=0;y<h;y++){ const a=Math.max(0,y-1)*w, b=y*w, c=Math.min(h-1,y+1)*w; for(let x=0;x<w;x++){ const l=Math.max(0,x-1), r=Math.min(w-1,x+1);
    o[b+x]=(s[a+l]+s[a+x]+s[a+r]+s[b+l]+s[b+x]+s[b+r]+s[c+l]+s[c+x]+s[c+r])/9; } } return o; };
  const I=adoucir(adoucir(lum)), w4=w>>2, h4=h>>2, P=new Float32Array(w4*h4);
  for(let y=0;y<h4;y++) for(let x=0;x<w4;x++){ let v=0; for(let j=0;j<4;j++) for(let i=0;i<4;i++) v+=I[(y*4+j)*w+x*4+i]; P[y*w4+x]=v/16; }
  return {I,w,h,P,w4,h4};
}
/**
 * Décalage d'ensemble du contenu entre deux images préparées (ref → cur) : cur(x,y) ≈ ref(x−sx, y−sy), au quart de définition, par corrélation
 * (centrée, normalisée : insensible à l'exposition) du centre de l'image. Refusé si l'image est sans détail, trop différente, si le décalage
 * touche la limite, ou si un AUTRE sommet de corrélation presque aussi haut existe (motif répété). `prevu` [px, py] : décalage attendu d'après
 * le gyroscope ; la recherche se limite alors à son voisinage (±40 %), ce qui lève l'ambiguïté d'un contour seul. @returns {{ok,raison,sx,sy,corr}} pixels
 */
export function grossier(A,B,prevu){
  const {w4,h4}=B, mx=Math.floor(w4*0.3), my=Math.floor(h4*0.3), x0=mx, x1=w4-mx, y0=my, y1=h4-my, n=(x1-x0)*(y1-y0), R={ok:false,raison:'',sx:0,sy:0,corr:0};
  let mb=0; for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++) mb+=B.P[y*w4+x]; mb/=n;
  let vb=0; for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++){ const d=B.P[y*w4+x]-mb; vb+=d*d; }
  if(vb/n<CONTRASTE_MIN){ R.raison='image sans détail'; return R; }
  const ex=mx-1, ey=my-1, L=2*ex+1, C=new Float32Array(L*(2*ey+1)).fill(-2); let bi=-1;
  const cx=prevu?Math.round(prevu[0]/4):0, cy=prevu?Math.round(prevu[1]/4):0, rx=prevu?Math.max(2,Math.ceil(0.1*Math.abs(prevu[0]))+1):ex, ry=prevu?Math.max(2,Math.ceil(0.1*Math.abs(prevu[1]))+1):ey;
  if(Math.abs(cx)>ex-1||Math.abs(cy)>ey-1){ R.raison='rotation trop rapide'; return R; }
  for(let sy=Math.max(-ey,cy-ry);sy<=Math.min(ey,cy+ry);sy++) for(let sx=Math.max(-ex,cx-rx);sx<=Math.min(ex,cx+rx);sx++){
    let ma=0; for(let y=y0;y<y1;y++){ const o=(y-sy)*w4-sx; for(let x=x0;x<x1;x++) ma+=A.P[o+x]; } ma/=n;
    let va=0, cv=0; for(let y=y0;y<y1;y++){ const o=(y-sy)*w4-sx, ob=y*w4; for(let x=x0;x<x1;x++){ const a=A.P[o+x]-ma; va+=a*a; cv+=a*(B.P[ob+x]-mb); } }
    const k=(sy+ey)*L+sx+ex; C[k]=va>0?cv/Math.sqrt(va*vb):0; if(bi<0||C[k]>C[bi]) bi=k; }
  const by=Math.floor(bi/L)-ey, bx=bi%L-ex, cb=C[bi]; R.sx=4*bx; R.sy=4*by; R.corr=cb;
  if(cb<CORR_MIN){ R.raison='images trop différentes'; return R; }
  if(Math.abs(bx)>=ex||Math.abs(by)>=ey){ R.raison='rotation trop rapide'; return R; }
  if(!prevu) for(let sy=-ey+1;sy<ey;sy++) for(let sx=-ex+1;sx<ex;sx++){ if(Math.max(Math.abs(sx-bx),Math.abs(sy-by))<=2) continue; const k=(sy+ey)*L+sx+ex, v=C[k]; if(v<cb-MARGE_MIN) continue;
    if(v>C[k-1]&&v>=C[k+1]&&v>C[k-L]&&v>=C[k+L]){ R.raison='décalage ambigu (motif répété)'; return R; } }
  R.ok=true; return R;
}
/**
 * Décalage fin d'un bloc (centre bx,by ; demi-côtés hx,hy) par moindres carrés sur les pentes de l'image (Lucas-Kanade), à partir du décalage
 * d'ensemble `d0`. Un bloc qui a des pentes dans les deux sens donne deux mesures (dx, dy) ; un bloc qui ne contient qu'un contour (une crête)
 * n'en donne qu'une, PERPENDICULAIRE au contour : c'est la seule que l'image connaît. @returns {null | {n:[nx,ny],d:number}[]} d = décalage · n
 */
export function bloc(A,B,bx,by,hx,hy,d0){
  const w=B.w, h=B.h, I=B.I, Rf=A.I, N=(2*hx+1)*(2*hy+1), Ix=new Float32Array(N), Iy=new Float32Array(N), Iv=new Float32Array(N), Rw=new Float32Array(N);
  let gxx=0, gxy=0, gyy=0, mi=0, k=0;
  for(let y=by-hy;y<=by+hy;y++) for(let x=bx-hx;x<=bx+hx;x++,k++){ const o=y*w+x, ix=(I[o+1]-I[o-1])/2, iy=(I[o+w]-I[o-w])/2; Ix[k]=ix; Iy[k]=iy; Iv[k]=I[o]; mi+=I[o]; gxx+=ix*ix; gxy+=ix*iy; gyy+=iy*iy; }
  mi/=N; if((gxx+gyy)/N<PENTE_MIN) return null;
  const tr=gxx+gyy, det=gxx*gyy-gxy*gxy, disc=Math.sqrt(Math.max(0,tr*tr/4-det)), l1=tr/2+disc, l2=tr/2-disc, plein=l2/N>=PENTE_MIN/2&&l2>=0.1*l1;
  let n1=Math.abs(gxy)>1e-9*tr?[gxy,l1-gxx]:gxx>=gyy?[1,0]:[0,1]; { const m=Math.hypot(n1[0],n1[1]); n1=[n1[0]/m,n1[1]/m]; }
  let vi=0; for(k=0;k<N;k++) vi+=(Iv[k]-mi)**2;
  let dx=d0[0], dy=d0[1], e2=Infinity;
  for(let it=0;it<12;it++){
    let mr=0; k=0;
    for(let y=by-hy;y<=by+hy;y++) for(let x=bx-hx;x<=bx+hx;x++,k++){ const xs=x-dx, ys=y-dy; if(xs<0||ys<0||xs>w-1.001||ys>h-1.001) return null; // le contenu vient de hors de l'image de référence
      const xi=Math.floor(xs), yi=Math.floor(ys), fx=xs-xi, fy=ys-yi, o=yi*w+xi, v=(Rf[o]*(1-fx)+Rf[o+1]*fx)*(1-fy)+(Rf[o+w]*(1-fx)+Rf[o+w+1]*fx)*fy; Rw[k]=v; mr+=v; }
    mr/=N; let sx=0, sy=0; e2=0; for(k=0;k<N;k++){ const e=(Iv[k]-mi)-(Rw[k]-mr); sx+=Ix[k]*e; sy+=Iy[k]*e; e2+=e*e; }
    let ax, ay; if(plein){ ax=-(gyy*sx-gxy*sy)/det; ay=-(gxx*sy-gxy*sx)/det; } else { const p=-(n1[0]*sx+n1[1]*sy)/l1; ax=p*n1[0]; ay=p*n1[1]; }
    const pas=Math.hypot(ax,ay), lim=pas>2?2/pas:1; dx+=ax*lim; dy+=ay*lim;
    if(Math.hypot(dx-d0[0],dy-d0[1])>8) return null; // parti trop loin du décalage d'ensemble : ce bloc ne suit pas le reste (objet proche, mouvement)
    if(pas<0.02) break;
  }
  if(!(e2/vi<=RESIDU_MAX)) return null;
  return plein?[{n:[1,0],d:dx},{n:[0,1],d:dy}]:[{n:n1,d:dx*n1[0]+dy*n1[1]}];
}
/** Les neuf blocs du centre de l'image : mesures {cx, cy (centre du bloc, écart au centre de l'image), hx, hy, n, d}. `d0` : décalage de départ,
 *  [dx, dy] pour tous ou fonction (cx, cy) → [dx, dy]. */
export function blocs(A,B,d0){
  const {w,h}=B, hx=Math.round(0.11*w), hy=Math.round(0.11*h), out=[];
  for(const fy of [0.26,0.5,0.74]) for(const fx of [0.26,0.5,0.74]){ const bx=Math.round(fx*w), by=Math.round(fy*h), cx=bx-(w-1)/2, cy=by-(h-1)/2, m=bloc(A,B,bx,by,hx,hy,typeof d0==='function'?d0(cx,cy):d0); if(m) for(const q of m) out.push({cx,cy,hx,hy,n:q.n,d:q.d}); }
  return out;
}

// ---------- orientation : axes de la caméra dans le temps ----------
/** Axes de la caméra (v : axe de la caméra arrière, r : droite de l'écran ; repère Est/Nord/Haut) d'après alpha, beta, gamma : `camAxes` de la v1. */
export function axes(alpha,beta,gamma,angleEcran){
  const a=alpha*RAD,b=beta*RAD,g=gamma*RAD, cA=Math.cos(a),sA=Math.sin(a),cB=Math.cos(b),sB=Math.sin(b),cG=Math.cos(g),sG=Math.sin(g);
  const x=[cA*cG-sA*sB*sG,cG*sA+cA*sB*sG,-cB*sG], y=[-cB*sA,cA*cB,sB], z=[cG*sA*sB+cA*sG,sA*sG-cA*cG*sB,cB*cG], neg=k=>k.map(m=>-m);
  return {v:neg(z),r:angleEcran===90?y:(angleEcran===270||angleEcran===-90)?neg(y):angleEcran===180?neg(x):x};
}
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2], unit=a=>{ const n=Math.hypot(a[0],a[1],a[2])||1; return [a[0]/n,a[1]/n,a[2]/n]; };
const croix=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
/** Axes à l'instant t, interpolés dans l'historique [{t,v,r}] (trié) ; null si t en sort de plus de 150 ms. */
export function axesA(hist,t){
  const n=hist.length; if(!n||t<hist[0].t-150||t>hist[n-1].t+150) return null;
  let lo=0, hi=n-1; while(hi-lo>1){ const m=(lo+hi)>>1; if(hist[m].t<=t) lo=m; else hi=m; }
  const A=hist[lo], B=hist[hi], k=B.t>A.t?Math.max(0,Math.min(1,(t-A.t)/(B.t-A.t))):0, mix=(p,q)=>[p[0]+(q[0]-p[0])*k,p[1]+(q[1]-p[1])*k,p[2]+(q[2]-p[2])*k];
  const v=unit(mix(A.v,B.v)), r0=mix(A.r,B.r), s=dot(r0,v);
  return {v,r:unit([r0[0]-s*v[0],r0[1]-s*v[1],r0[2]-s*v[2]])};
}
/** Déplacement attendu du contenu entre deux orientations (A0 → A1) : `a(f, cx, cy, n)` = composante sur `n` du déplacement du contenu vu en
 *  (cx, cy) (pixels, écart au centre de l'image ; x vers la droite, y vers le bas), divisée par la focale `f` ; `rot` : angle parcouru (tangente).
 *  Sténopé exact : le point vu en (cx, cy) dans la seconde image est renvoyé dans la première. */
export function modele(A0,A1){
  const u0=croix(A0.r,A0.v), u1=croix(A1.r,A1.v), vv=dot(A1.v,A0.v); if(vv<0.5) return null;
  const rv=dot(A1.r,A0.v), uv=dot(u1,A0.v), vr=dot(A1.v,A0.r), rr=dot(A1.r,A0.r), ur=dot(u1,A0.r), vu=dot(A1.v,u0), ru=dot(A1.r,u0), uu=dot(u1,u0);
  return {rot:Math.hypot(vr,vu)/vv, a(f,cx,cy,n){ const z=f*vv+cx*rv-cy*uv, x0=f*(f*vr+cx*rr-cy*ur)/z, y0=-f*(f*vu+cx*ru-cy*uu)/z; return ((cx-x0)*n[0]+(cy-y0)*n[1])/f; }};
}

// ---------- ajustement : focale (en pixels de l'image réduite) ----------
const mc=cs=>{ let sa=0, sd=0; for(const q of cs){ sa+=q.a*q.a; sd+=q.a*q.d; } return sa>0?sd/sa:NaN; };
/**
 * Focale d'après les paires {t0,t1,m:[{cx,cy,hx,hy,n,d}]} (pixels de l'image réduite) et l'historique d'orientation. Le retard image/capteur est
 * cherché ; ajustement robuste (un bloc de premier plan, un nuage qui bouge sont écartés) ; `f0` : focale de départ (le modèle en dépend peu).
 * @returns {{ok:boolean,raison:string,f:number,champ:number,n:number,rotation:number,rms:number,part:number,retard:number}}
 */
export function estimer(paires,hist,f0=GRAND_COTE/2/Math.tan(32.5*RAD)){
  const R={ok:false,raison:'',f:NaN,champ:NaN,n:0,rotation:0,rms:NaN,part:0,retard:0,precision:1};
  const comps=tau=>{ const cs=[]; paires.forEach((p,i)=>{ const A0=axesA(hist,p.t0-tau), A1=axesA(hist,p.t1-tau), g=A0&&A1&&modele(A0,A1); if(!g) return;
    for(const q of p.m) cs.push({g,q,d:q.d,w2:(q.hx*q.n[0])**2+(q.hy*q.n[1])**2,i,rot:g.rot}); }); return cs; };
  // la focale entre dans le modèle (endroit mesuré, en focales) : la correction est petite, quelques passes suffisent
  const poser=(cs,f)=>{ for(const c of cs){ c.a=c.g.a(f,c.q.cx,c.q.cy,c.q.n); c.dc=c.d/(1+c.w2/(3*f*f)); } };
  const mcc=cs=>{ let sa=0, sd=0; for(const c of cs){ sa+=c.a*c.a; sd+=c.a*c.dc; } return sa>0?sd/sa:NaN; };
  const garder=(cs,f)=>cs.filter(c=>Math.abs(c.dc-f*c.a)<=Math.max(1,0.06*Math.abs(f*c.a)));
  const ajuster=cs=>{ let f=f0, g=cs; for(let k=0;k<5;k++){ poser(cs,f); const f1=mcc(k?g:cs); if(!(f1>0)) return null; f=f1; poser(cs,f); g=garder(cs,f); if(g.length<4) return null; const f2=mcc(g); if(!(f2>0)) return null; f=f2; } return {f,g}; };
  let best=null;
  for(const tau of RETARDS_MS){ const cs=comps(tau); if(cs.length<6) continue; const r=ajuster(cs); if(!r) continue;
    let cout=0; for(const c of r.g) cout+=(c.dc-r.f*c.a)**2; cout=cout/r.g.length+2*(1-r.g.length/cs.length); // le coût se lit sur les mesures concordantes, et pénalise celles qu'on écarte
    if(!best||cout<best.cout) best={tau,cs,f:r.f,g:r.g,cout}; }
  if(!best){ R.raison='pas assez de mesures'; return R; }
  const f=best.f, garde=best.g, idx=new Set(garde.map(c=>c.i)); let rot=0, rms=0, signal=0; const vus=new Set();
  for(const c of garde){ if(!vus.has(c.i)){ vus.add(c.i); rot+=Math.atan(c.rot)/RAD; } rms+=(c.dc-f*c.a)**2; signal+=(f*c.a)**2; }
  rms=Math.sqrt(rms/Math.max(1,garde.length));
  // précision de la focale : écart des mesures rapporté à tout le déplacement mesuré (un contour seul mesure peu à chaque fois, mais mesure)
  const precision=signal>0?Math.max(rms,0.3)/Math.sqrt(signal):1, f1=mcc(garde.filter(c=>c.i%2===0)), f2=mcc(garde.filter(c=>c.i%2===1));
  Object.assign(R,{f,champ:2*Math.atan(GRAND_COTE/2/f)/RAD,n:idx.size,rotation:rot,rms,part:garde.length/best.cs.length,retard:best.tau,precision});
  if(idx.size<PAIRES_MIN) R.raison=`${idx.size}/${PAIRES_MIN} mesures`;
  else if(rot<ROTATION_MIN_DEG) R.raison=`${Math.round(rot)}°/${ROTATION_MIN_DEG}° de rotation`;
  else if(precision>PRECISION_MAX) R.raison='image peu détaillée : il faut tourner davantage';
  else if(R.part<PART_MIN) R.raison='mesures trop dispersées (premier plan trop proche ?)';
  else if(rms>RMS_MAX_PX) R.raison='mesures trop bruitées';
  else if(!(f1>0&&f2>0)||Math.abs(f1-f2)/f>MOITIES_MAX) R.raison='les deux moitiés des mesures ne concordent pas encore';
  else if(R.champ<CHAMP_MIN||R.champ>CHAMP_MAX) R.raison=`champ hors des valeurs plausibles (${R.champ.toFixed(1)}°)`;
  else R.ok=true;
  return R;
}
/** Avancement de la mesure, de 0 à 1 : la plus en retard des conditions (nombre de paires, rotation cumulée, précision). */
export const avancement=e=>Math.max(0,Math.min(1,(e.n||0)/PAIRES_MIN,(e.rotation||0)/ROTATION_MIN_DEG,e.precision>0?PRECISION_MAX/e.precision:0));

// ---------- suivi : des images et des orientations vers des paires ----------
/** Suivi pur (testable) : orientation(t, axes) et image(t, lum, w, h) alimentent les paires ; etat() donne l'estimation courante. */
export function creerSuivi(){
  let hist=[], paires=[], ref=null, dim=null, dernier='en attente d’une rotation', f0=GRAND_COTE/2/Math.tan(32.5*RAD), tau0=80, memo=null;
  /** Déplacement du centre de l'image attendu entre deux instants, d'après le gyroscope et la focale connue à ce moment (65° de champ au départ). */
  const prevoir=(ta,tb)=>{ const A0=axesA(hist,ta-tau0), A1=axesA(hist,tb-tau0), g=A0&&A1&&modele(A0,A1); return g?{g,px:f0*g.a(f0,0,0,[1,0]),py:f0*g.a(f0,0,0,[0,1])}:null; };
  const assez=p=>p&&Math.max(Math.abs(p.px),Math.abs(p.py))>=SEUIL_PAIRE_PX;
  return {
    orientation(t,A){ hist.push({t,v:A.v,r:A.r}); if(hist.length>4000) hist=hist.slice(-3000); },
    /** Vitesse de rotation récente (°/s), d'après l'historique. */
    vitesse(t){ const A1=axesA(hist,t), A0=axesA(hist,t-150); if(!A0||!A1) return 0; return Math.acos(Math.max(-1,Math.min(1,dot(A0.v,A1.v))))/RAD/0.15; },
    /** Faut-il lire l'image de l'instant t ? Oui sans image de référence, quand le téléphone a assez tourné depuis elle, ou quand elle est trop ancienne. */
    besoin(t){ return !ref||t-ref.t>REF_MAX_MS||assez(prevoir(ref.t,t)); },
    image(t,lum,w,h){
      if(dim&&(dim.w!==w||dim.h!==h)) ref=null; dim={w,h};
      if(!this.besoin(t)) return null;
      const P={...preparer(lum,w,h),t}, A=ref, pr=A&&prevoir(A.t,t); ref=P;
      if(!assez(pr)) return null; // nouvelle image de référence (la première, ou l'ancienne a trop vieilli)
      const G=grossier(A,P,[pr.px,pr.py]);
      if(!G.ok){ dernier=G.raison; return null; }
      const m=blocs(A,P,(cx,cy)=>[G.sx+f0*pr.g.a(f0,cx,cy,[1,0])-pr.px,G.sy+f0*pr.g.a(f0,cx,cy,[0,1])-pr.py]); // ce que la rotation ajoute loin du centre
      if(m.length<3){ dernier='image sans détail'; return null; }
      const p={t0:A.t,t1:t,m}; paires.push(p); if(paires.length>PAIRES_MAX) paires.shift(); memo=null; dernier='mesure en cours'; return p;
    },
    oublier(){ ref=null; }, immobile(){ ref=null; dernier='en attente d’une rotation'; },
    vider(){ paires=[]; ref=null; memo=null; dernier='en attente d’une rotation'; },
    etat(){ if(!memo){ memo=paires.length>=4?estimer(paires,hist,f0):{ok:false,raison:`${paires.length}/${PAIRES_MIN} mesures`,n:paires.length,rotation:0,precision:1};
        if(memo.f>0&&memo.n>=4&&memo.champ>=CHAMP_MIN&&memo.champ<=CHAMP_MAX){ f0=memo.f; tau0=memo.retard; } } // la prévision suit la mesure
      return {...memo,paires:paires.length,dernier}; },
  };
}

// ---------- dans la page ----------
let c=null, suivi=null, actif=false, toile=null, x2d=null, dernierT=0, mesure=null, cleCam='', noteT=0, depart=0, rvfc=false, finT=0;
const lire=()=>{ try{ return JSON.parse(localStorage.getItem(CLE)||'null')||{}; }catch(e){ return {}; } };
const ecrire=v=>{ try{ localStorage.setItem(CLE,JSON.stringify(v)); }catch(e){} };
const video=()=>c.$('cam');
const angleEcran=()=>(screen.orientation&&screen.orientation.angle)??window.orientation??0;
/** Identité de la caméra : son nom et sa définition (un autre objectif ou une autre définition = une autre mesure). */
function camera(){ const v=video(), tr=v&&v.srcObject&&v.srcObject.getVideoTracks&&v.srcObject.getVideoTracks()[0]; if(!v||!v.videoWidth) return '';
  return `${(tr&&tr.label)||'caméra'} ${Math.max(v.videoWidth,v.videoHeight)}x${Math.min(v.videoWidth,v.videoHeight)}`; }
function appliquer(champ){ c.S.camFov=champ; const e=c.$('fov'); if(e) e.value=champ; c.showFov(); c.saveSettings(); c.bumpCities(); majLigne(); }
/** Ce que la puce dit : avancement de la mesure, ce qui manque, puis le résultat (10 s). Pure. */
export function textePuce({actif,mesure,etat,finT=0,maintenant=0}){
  if(actif&&!mesure){ const p=Math.round(100*avancement(etat)), d=etat.dernier;
    const quoi=d==='en attente d’une rotation'?'tournez-vous lentement':d==='image sans détail'?'image sans détail (brouillard, nuit ?)':d==='rotation trop rapide'?'moins vite':d&&d!=='mesure en cours'?d:/tourner davantage|dispersées|bruitées|plausibles/.test(etat.raison||'')?etat.raison:'';
    return `champ : mesure ${p} %${etat.paires>=4&&etat.champ?` (≈ ${Math.round(etat.champ)}°)`:''}${quoi?' · '+quoi:''}`; }
  if(mesure&&maintenant-finT<10000) return `champ ${mesure.champ}° mesuré`;
  return '';
}
function majLigne(){
  const puce=c.$('g3Champ'); if(puce){ const t=c.photoMode?'':textePuce({actif,mesure,etat:suivi.etat(),finT,maintenant:Date.now()}); puce.textContent=t; puce.hidden=!t; } // photo rejouée : son champ vient du fichier, rien à mesurer
  const v=c.$('g3ChampV'), b=c.$('g3ChampBtn'); if(!v||!b) return;
  v.textContent=mesure?`${mesure.champ}°${c.S.camFov!==mesure.champ?` (réglé à ${c.S.camFov}°)`:''}`:actif?'mesure…':'—';
  b.textContent=actif&&!mesure?'Arrêter la mesure':mesure&&c.S.camFov!==mesure.champ?'Reprendre la mesure':'Remesurer';
}
function trame(t){
  const v=video(); if(!actif||c.photoMode||!v||!v.videoWidth||v.paused) return;
  if(t-dernierT<CADENCE_MS) return; dernierT=t;
  if(suivi.vitesse(t)<ROTATION_MIN_DEG_S){ suivi.immobile(); return; } // téléphone immobile : rien à mesurer, rien à calculer
  if(!suivi.besoin(t)) return; // pas assez tourné depuis l'image de référence : l'image n'est même pas lue
  const k=GRAND_COTE/Math.max(v.videoWidth,v.videoHeight), w=Math.round(v.videoWidth*k), h=Math.round(v.videoHeight*k);
  if(!toile){ toile=document.createElement('canvas'); x2d=toile.getContext('2d',{willReadFrequently:true}); }
  if(toile.width!==w||toile.height!==h){ toile.width=w; toile.height=h; }
  let px; try{ x2d.drawImage(v,0,0,w,h); px=x2d.getImageData(0,0,w,h).data; }catch(e){ return; }
  const lum=new Uint8Array(w*h); for(let i=0,j=0;i<lum.length;i++,j+=4) lum[i]=(px[j]*77+px[j+1]*150+px[j+2]*29)>>8;
  if(suivi.image(t,lum,w,h)) conclure();
}
/** Première mesure prête : appliquée, gardée, annoncée. Ensuite elle s'affine en silence (jusqu'à 40 paires ou 3 minutes), puis la greffe s'arrête. */
function conclure(){
  const e=suivi.etat(); if(!e.ok) return;
  const champ=Math.round(e.champ*2)/2, avant=c.S.camFov, premiere=!mesure, fini=e.paires>=PAIRES_FIN||(!premiere&&Date.now()-finT>AFFINAGE_MAX_MS);
  if(premiere||champ!==mesure.champ||fini){
    mesure={champ,n:e.n,rms:+e.rms.toFixed(2),retard:e.retard,rotation:Math.round(e.rotation),t:Date.now()};
    const m=lire(); m[cleCam]=mesure; ecrire(m); if(premiere) finT=Date.now(); appliquer(champ);
    c.logNet('Champ (greffe champAuto)',true,`champ de la caméra ${premiere?'mesuré':'affiné'} : ${champ}° (${e.n} mesures sur ${Math.round(e.rotation)}° de rotation, écart ${e.rms.toFixed(2)} px, retard ${e.retard} ms)${premiere?` ; il était réglé à ${avant}°`:''}`);
    if(premiere) c.note(`Champ de la caméra mesuré : ${champ}°${Math.abs(avant-champ)>=1?` (il était réglé à ${avant}°)`:''}`,7000);
  }
  if(fini) actif=false;
  majLigne();
}
function demarrer(parBouton){
  suivi.vider(); mesure=null; actif=true; depart=Date.now(); majLigne();
  if(parBouton) c.note('Mesure du champ : dehors, face à un paysage lointain, tournez-vous lentement d’un quart de tour',9000); // lancée seule : la puce « champ » suffit
  boucle();
}
/** Instant d'une image : celui de sa prise de vue s'il est plausible (moins de 0,4 s avant son affichage), sinon celui de son affichage. */
export const instantImage=(now,meta)=>{ const tc=meta&&meta.captureTime, tp=meta&&meta.presentationTime; return tc>0&&now-tc>=-50&&now-tc<400?tc:tp>0&&Math.abs(now-tp)<400?tp:now; };
function boucle(){
  const v=video(); if(!actif||!v) return;
  if(v.requestVideoFrameCallback){ rvfc=true; v.requestVideoFrameCallback((now,meta)=>{ trame(instantImage(now,meta)); boucle(); }); }
}
/** Toutes les secondes : caméra prête → mesure connue reprise, ou mesure lancée ; sans rappel d'image du navigateur, les images sont lues ici. */
function veille(){
  majLigne();
  if(c.photoMode||!c.camReady()) return;
  const cle=camera(); if(!cle) return;
  if(cle!==cleCam){ cleCam=cle; mesure=lire()[cle]||null; actif=false; majLigne();
    if(mesure){ if(Math.abs(c.S.camFov-mesure.champ)>=2) c.note(`Champ réglé à ${c.S.camFov}°, mesuré à ${mesure.champ}° sur ce téléphone : Réglages › Calage et capteurs › « Reprendre la mesure »`,9000); }
    else if(c.sensor) demarrer(false); }
  else if(!mesure&&!actif&&c.sensor&&!depart) demarrer(false);
  if(actif&&!rvfc) trame(performance.now());
  if(actif&&rvfc&&performance.now()-dernierT>3000) boucle(); // caméra relancée : le rappel d'image est redemandé
}
export default {
  init(ctx){
    c=ctx; suivi=creerSuivi();
    addEventListener('deviceorientation',e=>{ if(!actif||e.alpha==null||e.beta==null||e.gamma==null) return;
      const ios=typeof e.webkitCompassHeading==='number'; if(e.absolute===true&&!ios) return;
      const now=performance.now(), t=Math.abs(e.timeStamp-now)<2000?e.timeStamp:now; // même horloge que les images
      suivi.orientation(t,axes(e.alpha,e.beta,e.gamma,angleEcran())); });
    const f=c.$('fov'), row=f&&f.closest('.row');
    if(row&&!c.$('g3ChampRow')){ const d=document.createElement('div'); d.className='row'; d.id='g3ChampRow';
      d.innerHTML='<label>Champ mesuré (greffe champAuto)</label><span class="val" id="g3ChampV">—</span><button type="button" id="g3ChampBtn" style="grid-column:1/-1;padding:9px;border-radius:10px;font:600 14px system-ui,sans-serif">Remesurer</button>'
        +'<span class="hint">Le champ est mesuré en comparant le gyroscope et le déplacement de l’image quand vous tournez (dehors, par temps clair, face à un paysage lointain, un quart de tour lent). La puce « champ », sur l’image, montre l’avancement. Une fois mesuré, le pincement à deux doigts ne le change plus ; le curseur ci-dessus reste possible.</span>';
      row.after(d);
      d.querySelector('button').onclick=()=>{ if(actif&&!mesure){ actif=false; majLigne(); return; } if(mesure&&c.S.camFov!==mesure.champ){ appliquer(mesure.champ); c.note(`Champ repris : ${mesure.champ}° (mesuré)`,4000); return; } demarrer(true); };
      if(f) f.addEventListener('input',()=>setTimeout(majLigne,0));
    }
    const calib=c.$('calib'); // puce d'avancement, sous les puces de la v1
    if(calib&&!c.$('g3Champ')){ const p=document.createElement('div'); p.id='g3Champ'; p.className='chip'; p.hidden=true; p.style.color='var(--ochre)'; calib.before(p); }
    setInterval(veille,1000);
  },
  /** Point d'entrée du pincement : vrai quand le champ est mesuré (le pincement ne le change plus). */
  verrou(){ if(!mesure||c.photoMode) return false; // photo rejouée : le champ est celui de la photo, le pincement l'ajuste comme dans la v1
    const t=Date.now(); if(t-noteT>3000){ noteT=t; c.note(`Champ mesuré automatiquement (${mesure.champ}°) : le pincement ne le change plus — curseur dans Réglages › Calage et capteurs`,4000); } return true; },
  preparer, grossier, bloc, blocs, axes, axesA, modele, estimer, creerSuivi, avancement, textePuce, instantImage,
  /** Tests : accès au suivi en cours. */
  suivi:()=>suivi, conclure, demarrer:()=>demarrer(true),
  etat:()=>({actif,mesure:mesure&&{...mesure},camera:cleCam,...(suivi?suivi.etat():{})}),
  statut(){
    const e=suivi.etat();
    return `champAuto : ${mesure?`champ mesuré ${mesure.champ}° (${mesure.n} mesures, ${mesure.rotation}° de rotation, écart ${mesure.rms} px)${c.S.camFov!==mesure.champ?` · RÉGLÉ À ${c.S.camFov}° (Réglages › « Reprendre la mesure »)`:''}`:'champ non mesuré'}`
      +`${actif?` · ${mesure?'affinage':'mesure'} en cours : ${e.paires} paire(s), ${e.ok?'prête':e.raison||e.dernier} · dernière image : ${e.dernier}${e.champ?` · estimation ${e.champ.toFixed(1)}°`:''}`:''} · caméra : ${cleCam||'en attente'}`;
  },
};
