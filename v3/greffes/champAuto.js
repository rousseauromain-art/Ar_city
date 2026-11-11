// Greffe « champAuto » (ajout, éteinte par défaut) : le champ de la caméra est MESURÉ, plus réglé à la main. Constat du 11/11/2026 (Vercors) : le
// champ était réglé à 45° pour une caméra d'environ 62° → le tracé tournait 1,5 fois plus vite que l'image, « le calage ne tient pas dès que je
// tourne ». Une appli native (PeakFinder) lit le champ dans le système (focale et taille du capteur) ; une page web n'y a pas accès. La greffe le
// mesure : quand on tourne le téléphone, le gyroscope donne l'angle parcouru et l'image donne le déplacement en pixels ; leur rapport est la focale.
//  - image : la vidéo réduite à 192 px de grand côté, profils de luminosité par colonnes et par lignes (trois bandes chacun), décalage par
//    corrélation des gradients au centre de l'image ; les bandes doivent concorder (sinon premier plan trop proche ou image trop pauvre) ;
//  - angle : `deviceorientation` relatif (gyroscope), brut, relu à l'instant de chaque image ; le retard entre image et capteur est cherché ;
//  - une paire = environ 6° de rotation ; ajustement robuste sur au moins 14 paires et 90° de rotation cumulée, deux moitiés qui concordent à 4 %.
// La mesure est gardée par caméra (`vh3_champAuto`) et appliquée au réglage « Champ de la caméra » ; une fois mesuré, le pincement à deux doigts
// ne le change plus (curseur des Réglages pour le changer, bouton « Remesurer »). À faire dehors, face à un paysage lointain.
// Points d'entrée : pincement (pointermove) ; le reste est une minuterie de la greffe.
const RAD=Math.PI/180;
export const GRAND_COTE=192, PART_FENETRE=0.2, SEUIL_PAIRE_PX=18, REF_MAX_MS=2000, CADENCE_MS=70, ROTATION_MIN_DEG_S=2;
export const CORR_MIN=0.6, MARGE_MIN=0.1, TEXTURE_MIN=0.6, PAIRES_MIN=14, PAIRES_MAX=80, ROTATION_MIN_DEG=90, RMS_MAX_PX=1.5, PART_MIN=0.7, MOITIES_MAX=0.04;
export const RETARDS_MS=Array.from({length:35},(_,i)=>-40+10*i), CHAMP_MIN=35, CHAMP_MAX=100;
const CLE='vh3_champAuto';

// ---------- image : profils et décalage ----------
/** Profils de gradient d'une image de luminosité (lum : Uint8/Float, w×h) : trois bandes de lignes → profils par colonnes (pour dx),
 *  trois bandes de colonnes → profils par lignes (pour dy). */
export function profils(lum,w,h){
  const bandes=(n0,n1)=>{ const a=Math.round(n0+(n1-n0)/6), b=Math.round(n0+(n1-n0)*5/6), p=(b-a)/3; return [0,1,2].map(i=>[Math.round(a+i*p),Math.round(a+(i+1)*p)]); };
  const grad=p=>{ const g=new Float32Array(p.length); for(let i=1;i<p.length-1;i++) g[i]=p[i+1]-p[i-1]; return g; };
  const col=bandes(0,h).map(([y0,y1])=>{ const p=new Float32Array(w); for(let y=y0;y<y1;y++){ const o=y*w; for(let x=0;x<w;x++) p[x]+=lum[o+x]; } for(let x=0;x<w;x++) p[x]/=(y1-y0); return grad(p); });
  const lig=bandes(0,w).map(([x0,x1])=>{ const p=new Float32Array(h); for(let y=0;y<h;y++){ const o=y*w; let s=0; for(let x=x0;x<x1;x++) s+=lum[o+x]; p[y]=s/(x1-x0); } return grad(p); });
  return {col,lig,w,h,colC:bandes(0,h).map(([a,b])=>(a+b)/2-h/2),ligC:bandes(0,w).map(([a,b])=>(a+b)/2-w/2)};
}
/** Décalage du contenu entre deux jeux de profils (ref → cur) : cur[i] ≈ ref[i−d]. Corrélation normalisée sur la fenêtre centrale (±20 % de la
 *  longueur), affinée au dixième de pixel. `centres` : écart de chaque bande au centre de l'image ; `centre` rendu : là où les détails pèsent
 *  (moyenne des bandes riches, pondérée par leur contraste) — téléphone incliné, l'image tourne aussi un peu autour de son centre, et le
 *  décalage mesuré est celui de cet endroit, pas du centre. @returns {{d:number,corr:number,ok:boolean,raison:string,centre:number}} */
export function decalage(ref,cur,centres=[0,0,0]){
  const n=cur[0].length, x0=Math.round(n*(0.5-PART_FENETRE)), x1=Math.round(n*(0.5+PART_FENETRE)), smax=x0-2;
  const corr=(bandes,s)=>{ let ab=0, aa=0, bb=0; for(const b of bandes){ const A=cur[b], B=ref[b]; for(let x=x0;x<x1;x++){ const a=A[x], q=B[x-s]; ab+=a*q; aa+=a*a; bb+=q*q; } } return aa>0&&bb>0?ab/Math.sqrt(aa*bb):0; };
  const texture=b=>{ let s=0; for(let x=x0;x<x1;x++) s+=cur[b][x]*cur[b][x]; return s/(x1-x0); };
  const tx=[0,1,2].map(texture), riches=[0,1,2].filter(b=>tx[b]>=TEXTURE_MIN);
  if(!riches.length) return {d:0,corr:0,ok:false,raison:'image sans détail'};
  let sw=0, sc=0; for(const b of riches){ sw+=tx[b]; sc+=tx[b]*centres[b]; } const centre=sc/sw;
  const C=new Float32Array(2*smax+1); let best=-smax;
  for(let s=-smax;s<=smax;s++){ C[s+smax]=corr(riches,s); if(C[s+smax]>C[best+smax]) best=s; }
  const cb=C[best+smax]; let second=-1; for(let s=-smax;s<=smax;s++) if(Math.abs(s-best)>3&&C[s+smax]>second) second=C[s+smax];
  if(cb<CORR_MIN) return {d:best,corr:cb,ok:false,raison:'images trop différentes'};
  if(cb-second<MARGE_MIN) return {d:best,corr:cb,ok:false,raison:'décalage ambigu (motif répété)'};
  if(Math.abs(best)>=smax) return {d:best,corr:cb,ok:false,raison:'rotation trop rapide'};
  // les bandes riches doivent donner le même décalage : sinon premier plan proche (parallaxe) ou fausse concordance
  for(const b of riches){ if(riches.length<2) break; let sb=best, m=-1; for(let s=Math.max(-smax,best-6);s<=Math.min(smax,best+6);s++){ const v=corr([b],s); if(v>m){ m=v; sb=s; } }
    if(Math.abs(sb-best)>Math.max(1.5,0.08*Math.abs(best))) return {d:best,corr:cb,ok:false,raison:'bandes discordantes (premier plan trop proche ?)'}; }
  const a=C[best-1+smax], b=C[best+1+smax], den=a-2*cb+b, d=best+(den<0?0.5*(a-b)/den:0);
  return {d,corr:cb,ok:true,raison:'',centre};
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
/** Déplacement attendu du contenu entre deux orientations (A0 → A1), en unités de focale : `x(e)` pour le contenu vu à `e` focales SOUS le centre
 *  (profils par colonnes), `y(e)` pour le contenu vu à `e` focales À DROITE du centre (profils par lignes) ; `rot` : angle parcouru (tangente). */
export function modele(A0,A1){
  const u0=croix(A0.r,A0.v), u1=croix(A1.r,A1.v), m=dot(A1.v,A0.v); if(m<0.5) return null;
  const xr=dot(A1.v,A0.r), xu=dot(u1,A0.r), xm=dot(u1,A0.v), yu=dot(A1.v,u0), yr=dot(A1.r,u0), ym=dot(A1.r,A0.v);
  return {x:e=>-(xr-e*xu)/(m-e*xm), y:e=>(yu+e*yr)/(m+e*ym), rot:Math.hypot(xr,yu)/m};
}

// ---------- ajustement : focale (en pixels de l'image réduite) ----------
const mc=cs=>{ let sa=0, sd=0; for(const q of cs){ sa+=q.a*q.a; sd+=q.a*q.d; } return sa>0?sd/sa:NaN; };
/**
 * Focale d'après les paires {t0,t1,dx,dy,okx,oky} (pixels de l'image réduite w×h) et l'historique d'orientation. Le retard image/capteur est
 * cherché ; ajustement robuste ; correction de la fenêtre de corrélation (au bord de la fenêtre, le contenu se déplace un peu plus qu'au centre).
 * @returns {{ok:boolean,raison:string,f:number,champ:number,n:number,rotation:number,rms:number,part:number,retard:number}}
 */
export function estimer(paires,hist,w,h){
  const R={ok:false,raison:'',f:NaN,champ:NaN,n:0,rotation:0,rms:NaN,part:0,retard:0};
  const comps=tau=>{ const cs=[]; paires.forEach((p,i)=>{ const A0=axesA(hist,p.t0-tau), A1=axesA(hist,p.t1-tau), g=A0&&A1&&modele(A0,A1); if(!g) return;
    if(p.okx) cs.push({g:g.x,c:p.cx||0,d:p.dx,w:PART_FENETRE*w,i,rot:g.rot}); if(p.oky) cs.push({g:g.y,c:p.cy||0,d:p.dy,w:PART_FENETRE*h,i,rot:g.rot}); }); return cs; };
  // la focale entre dans le modèle (endroit mesuré, en focales) : deux passes suffisent, la correction est petite
  const poser=(cs,f)=>{ for(const q of cs) q.a=q.g(f>0?q.c/f:0); return mc(cs); };
  let best=null;
  for(const tau of RETARDS_MS){ const cs=comps(tau); if(cs.length<4) continue; const f=poser(cs,poser(cs,0)); if(!(f>0)) continue; let cout=0; for(const q of cs) cout+=(q.d-f*q.a)**2; cout/=cs.length; if(!best||cout<best.cout) best={tau,cs,f,cout}; }
  if(!best){ R.raison='pas assez de mesures'; return R; }
  let f=best.f, garde=best.cs;
  for(let k=0;k<4;k++){ // corrige la fenêtre et l'endroit mesuré, écarte les mesures aberrantes, réajuste
    const corr=best.cs.map(q=>({...q,a:q.g(q.c/f),d:q.d/(1+q.w*q.w/(3*f*f))}));
    garde=corr.filter(q=>Math.abs(q.d-f*q.a)<=Math.max(1.2,0.1*Math.abs(f*q.a)));
    const f2=mc(garde); if(!(f2>0)) break; f=f2;
  }
  const idx=new Set(garde.map(q=>q.i)); let rot=0; const vus=new Set(); for(const q of garde) if(!vus.has(q.i)){ vus.add(q.i); rot+=Math.atan(q.rot)/RAD; }
  let rms=0; for(const q of garde) rms+=(q.d-f*q.a)**2; rms=Math.sqrt(rms/Math.max(1,garde.length));
  const utiles=garde.filter(q=>Math.abs(f*q.a)>=SEUIL_PAIRE_PX/2), f1=mc(utiles.filter((_,i)=>i%2===0)), f2=mc(utiles.filter((_,i)=>i%2===1));
  Object.assign(R,{f,champ:2*Math.atan(GRAND_COTE/2/f)/RAD,n:idx.size,rotation:rot,rms,part:garde.length/best.cs.length,retard:best.tau});
  if(idx.size<PAIRES_MIN) R.raison=`${idx.size}/${PAIRES_MIN} mesures`;
  else if(rot<ROTATION_MIN_DEG) R.raison=`${Math.round(rot)}°/${ROTATION_MIN_DEG}° de rotation`;
  else if(R.part<PART_MIN) R.raison='mesures trop dispersées';
  else if(rms>RMS_MAX_PX) R.raison='mesures trop bruitées';
  else if(!(f1>0&&f2>0)||Math.abs(f1-f2)/f>MOITIES_MAX) R.raison='les deux moitiés des mesures ne concordent pas encore';
  else if(R.champ<CHAMP_MIN||R.champ>CHAMP_MAX) R.raison=`champ hors des valeurs plausibles (${R.champ.toFixed(1)}°)`;
  else R.ok=true;
  return R;
}

// ---------- suivi : des images et des orientations vers des paires ----------
/** Suivi pur (testable) : orientation(t, axes) et image(t, lum, w, h) alimentent les paires ; etat() donne l'estimation courante. */
export function creerSuivi(){
  let hist=[], paires=[], ref=null, dim=null, dernier='en attente d’une rotation';
  return {
    orientation(t,A){ hist.push({t,v:A.v,r:A.r}); if(hist.length>4000) hist=hist.slice(-3000); },
    /** Vitesse de rotation récente (°/s), d'après l'historique. */
    vitesse(t){ const A1=axesA(hist,t), A0=axesA(hist,t-150); if(!A0||!A1) return 0; return Math.acos(Math.max(-1,Math.min(1,dot(A0.v,A1.v))))/RAD/0.15; },
    image(t,lum,w,h){
      if(dim&&(dim.w!==w||dim.h!==h)) ref=null; dim={w,h};
      const P={...profils(lum,w,h),t};
      if(!ref){ ref=P; return null; }
      const X=decalage(ref.col,P.col,P.colC), Y=decalage(ref.lig,P.lig,P.ligC);
      if(!X.ok&&!Y.ok){ dernier=X.raison||Y.raison; ref=P; return null; }
      const g=Math.max(X.ok?Math.abs(X.d):0,Y.ok?Math.abs(Y.d):0);
      if(g>=SEUIL_PAIRE_PX){ const p={t0:ref.t,t1:t,dx:X.d,dy:Y.d,okx:X.ok,oky:Y.ok,cx:X.centre||0,cy:Y.centre||0}; paires.push(p); if(paires.length>PAIRES_MAX) paires.shift(); ref=P; dernier='mesure en cours'; return p; }
      if(t-ref.t>REF_MAX_MS) ref=P;
      return null;
    },
    oublier(){ ref=null; },
    vider(){ paires=[]; ref=null; dernier='en attente d’une rotation'; },
    etat(){ const e=dim&&paires.length>=4?estimer(paires,hist,dim.w,dim.h):{ok:false,raison:`${paires.length}/${PAIRES_MIN} mesures`,n:paires.length,rotation:0}; return {...e,paires:paires.length,dernier}; },
  };
}

// ---------- dans la page ----------
let c=null, suivi=null, actif=false, toile=null, x2d=null, dernierT=0, mesure=null, cleCam='', noteT=0, depart=0, rvfc=false;
const lire=()=>{ try{ return JSON.parse(localStorage.getItem(CLE)||'null')||{}; }catch(e){ return {}; } };
const ecrire=v=>{ try{ localStorage.setItem(CLE,JSON.stringify(v)); }catch(e){} };
const video=()=>c.$('cam');
const angleEcran=()=>(screen.orientation&&screen.orientation.angle)??window.orientation??0;
/** Identité de la caméra : son nom et sa définition (un autre objectif ou une autre définition = une autre mesure). */
function camera(){ const v=video(), tr=v&&v.srcObject&&v.srcObject.getVideoTracks&&v.srcObject.getVideoTracks()[0]; if(!v||!v.videoWidth) return '';
  return `${(tr&&tr.label)||'caméra'} ${Math.max(v.videoWidth,v.videoHeight)}x${Math.min(v.videoWidth,v.videoHeight)}`; }
function appliquer(champ){ c.S.camFov=champ; const e=c.$('fov'); if(e) e.value=champ; c.showFov(); c.saveSettings(); c.bumpCities(); majLigne(); }
function majLigne(){
  const v=c.$('g3ChampV'), b=c.$('g3ChampBtn'); if(!v||!b) return;
  v.textContent=mesure?`${mesure.champ}°${c.S.camFov!==mesure.champ?` (réglé à ${c.S.camFov}°)`:''}`:actif?'mesure…':'—';
  b.textContent=actif?'Arrêter la mesure':mesure&&c.S.camFov!==mesure.champ?'Reprendre la mesure':'Remesurer';
}
function trame(t){
  const v=video(); if(!actif||c.photoMode||!v||!v.videoWidth||v.paused) return;
  if(t-dernierT<CADENCE_MS) return; dernierT=t;
  if(suivi.vitesse(t)<ROTATION_MIN_DEG_S){ suivi.oublier(); return; } // téléphone immobile : rien à mesurer, rien à calculer
  const k=GRAND_COTE/Math.max(v.videoWidth,v.videoHeight), w=Math.round(v.videoWidth*k), h=Math.round(v.videoHeight*k);
  if(!toile){ toile=document.createElement('canvas'); x2d=toile.getContext('2d',{willReadFrequently:true}); }
  if(toile.width!==w||toile.height!==h){ toile.width=w; toile.height=h; }
  let px; try{ x2d.drawImage(v,0,0,w,h); px=x2d.getImageData(0,0,w,h).data; }catch(e){ return; }
  const lum=new Uint8Array(w*h); for(let i=0,j=0;i<lum.length;i++,j+=4) lum[i]=(px[j]*77+px[j+1]*150+px[j+2]*29)>>8;
  if(suivi.image(t,lum,w,h)) conclure();
}
function conclure(){
  const e=suivi.etat(); if(!e.ok) return;
  const champ=Math.round(e.champ*2)/2, avant=c.S.camFov;
  mesure={champ,n:e.n,rms:+e.rms.toFixed(2),retard:e.retard,rotation:Math.round(e.rotation),t:Date.now()};
  const m=lire(); m[cleCam]=mesure; ecrire(m); actif=false; appliquer(champ);
  c.logNet('Champ (greffe champAuto)',true,`champ de la caméra mesuré : ${champ}° (${e.n} mesures sur ${Math.round(e.rotation)}° de rotation, écart ${e.rms.toFixed(2)} px, retard ${e.retard} ms) ; il était réglé à ${avant}°`);
  c.note(`Champ de la caméra mesuré : ${champ}°${Math.abs(avant-champ)>=1?` (il était réglé à ${avant}°)`:''}`,7000);
}
function demarrer(parBouton){
  suivi.vider(); actif=true; depart=Date.now(); majLigne();
  if(parBouton) c.note('Mesure du champ : dehors, face à un paysage lointain, tournez-vous lentement d’un quart de tour',9000); // lancée seule : sans message, elle se fait en regardant autour de soi
  boucle();
}
function boucle(){
  const v=video(); if(!actif||!v) return;
  if(v.requestVideoFrameCallback){ rvfc=true; v.requestVideoFrameCallback((now,meta)=>{ trame((meta&&(meta.captureTime||meta.presentationTime))||now); boucle(); }); }
}
/** Toutes les secondes : caméra prête → mesure connue reprise, ou mesure lancée ; sans rappel d'image du navigateur, les images sont lues ici. */
function veille(){
  if(c.photoMode||!c.camReady()) return;
  const cle=camera(); if(!cle) return;
  if(cle!==cleCam){ cleCam=cle; mesure=lire()[cle]||null; majLigne();
    if(mesure){ if(Math.abs(c.S.camFov-mesure.champ)>=2) c.note(`Champ réglé à ${c.S.camFov}°, mesuré à ${mesure.champ}° sur ce téléphone : Réglages › Calage et capteurs › « Reprendre la mesure »`,9000); }
    else if(!actif&&c.sensor) demarrer(false); }
  else if(!mesure&&!actif&&c.sensor&&!depart) demarrer(false);
  if(actif&&!rvfc) trame(performance.now());
  if(actif&&rvfc&&performance.now()-dernierT>3000) boucle(); // caméra relancée : le rappel d'image est redemandé
}
export default {
  init(ctx){
    c=ctx; suivi=creerSuivi();
    addEventListener('deviceorientation',e=>{ if(!actif||e.alpha==null||e.beta==null||e.gamma==null) return;
      const ios=typeof e.webkitCompassHeading==='number'; if(e.absolute===true&&!ios) return; suivi.orientation(e.timeStamp,axes(e.alpha,e.beta,e.gamma,angleEcran())); });
    const f=c.$('fov'), row=f&&f.closest('.row');
    if(row&&!c.$('g3ChampRow')){ const d=document.createElement('div'); d.className='row'; d.id='g3ChampRow';
      d.innerHTML='<label>Champ mesuré (greffe champAuto)</label><span class="val" id="g3ChampV">—</span><button type="button" id="g3ChampBtn" style="grid-column:1/-1;padding:9px;border-radius:10px;font:600 14px system-ui,sans-serif">Remesurer</button>'
        +'<span class="hint">Le champ est mesuré en comparant le gyroscope et le déplacement de l’image quand vous tournez (dehors, face à un paysage lointain, un quart de tour lent). Une fois mesuré, le pincement à deux doigts ne le change plus ; le curseur ci-dessus reste possible.</span>';
      row.after(d);
      d.querySelector('button').onclick=()=>{ if(actif){ actif=false; majLigne(); return; } if(mesure&&c.S.camFov!==mesure.champ){ appliquer(mesure.champ); c.note(`Champ repris : ${mesure.champ}° (mesuré)`,4000); return; } demarrer(true); };
      if(f) f.addEventListener('input',()=>setTimeout(majLigne,0));
    }
    setInterval(veille,1000);
  },
  /** Point d'entrée du pincement : vrai quand le champ est mesuré (le pincement ne le change plus). */
  verrou(){ if(!mesure) return false; const t=Date.now(); if(t-noteT>3000){ noteT=t; c.note(`Champ mesuré automatiquement (${mesure.champ}°) : le pincement ne le change plus — curseur dans Réglages › Calage et capteurs`,4000); } return true; },
  profils, decalage, axes, axesA, modele, estimer, creerSuivi,
  /** Tests : accès au suivi en cours. */
  suivi:()=>suivi, conclure, demarrer:()=>demarrer(true),
  etat:()=>({actif,mesure:mesure&&{...mesure},camera:cleCam,...(suivi?suivi.etat():{})}),
  statut(){
    const e=suivi.etat();
    return `champAuto : ${mesure?`champ mesuré ${mesure.champ}° (${mesure.n} mesures, ${mesure.rotation}° de rotation, écart ${mesure.rms} px)${c.S.camFov!==mesure.champ?` · RÉGLÉ À ${c.S.camFov}° (Réglages › « Reprendre la mesure »)`:''}`:'champ non mesuré'}`
      +`${actif?` · mesure en cours : ${e.paires} paire(s), ${e.ok?'prête':e.raison||e.dernier}${e.champ?` · estimation ${e.champ.toFixed(1)}°`:''}`:''} · caméra : ${cleCam||'en attente'}`;
  },
};
