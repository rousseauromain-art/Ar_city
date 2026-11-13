// Greffe « horizonPhoto » (ajout, éteinte par défaut) : l'horizon d'une photo rejouée, trouvé dans l'image. Constat du 13/11/2026 (photo de Turin) :
// une photo n'enregistre pas l'inclinaison de l'appareil ; la v1 place l'horizon au milieu de l'image (inclinaison 0), alors que la photo, prise
// en visant un peu vers le haut, a son horizon aux trois quarts de la hauteur : tout le tracé est décalé de 10°, à rattraper au doigt.
// En ville, les arêtes verticales des bâtiments (angles de murs, fenêtres, colonnes, mâts) donnent la réponse : sur l'image, elles ne sont
// parallèles que si l'appareil est tenu à l'horizontale ; sinon elles convergent vers un point (le zénith vu par l'appareil), d'autant plus proche
// que l'appareil est incliné. La greffe :
//  1. relève les arêtes droites proches de la verticale (contours fins, chaînes, droites ajustées à moins d'un pixel) ;
//  2. cherche l'inclinaison et le roulis pour lesquels le plus grand nombre de ces arêtes pointent vers le zénith (toutes les valeurs par pas de
//     0,5°, puis affinage) : les lignes du sol, les obliques et les personnes penchées ne s'accordent sur aucune valeur et sont écartées ;
//  3. n'applique le résultat que s'il est sûr : assez d'arêtes, d'accord pour au moins 40 % d'entre elles, réparties sur la largeur de l'image
//     (c'est leur écartement qui mesure l'inclinaison), nettement plus nombreuses que pour toute autre valeur.
// Sans bâtiments (mer, montagne), elle ne change rien : « Caler auto » règle alors l'horizon sur le relief, comme dans la v1.
// L'inclinaison se déduit de la convergence des arêtes ET du champ de la photo (plus le champ est étroit, plus la même convergence veut dire
// un appareil incliné) : si le champ est corrigé ensuite (pincement), l'horizon posé par la greffe est recalculé avec lui.
// Aucun point d'entrée dans le code de la v1 : la greffe lit l'image de la photo et règle l'horizon comme le fait le glisser (S.pitchOff).
const RAD=Math.PI/180;
export const COTE=1280;           // grand côté de l'image analysée (px) : à 640, les arêtes des fenêtres sont trop courtes pour donner leur direction
export const LONGUEUR_MIN=0.018;  // longueur minimale d'une arête, en part du grand côté
export const ECART_VERTICALE=35;  // arêtes gardées : à moins de 35° de la verticale de l'image
export const INCLINAISON_MAX=40, ROULIS_MAX=10; // domaine cherché (°)
export const ARETES_MIN=12, LONGUEUR_TOTALE_MIN=1.2, PART_MIN=0.4, ETALEMENT_MIN=0.2, RIVAL_MAX=0.75, PRECISION_MAX=0.5; // critères d'une réponse sûre

/** Arêtes droites proches de la verticale d'une image en niveaux de gris (Uint8Array, ligne par ligne). → [{x,y (milieu), dx,dy (direction, dy<0 : vers le haut), l (longueur)}]. Pure. */
export function aretes(g,w,h){
  const n=w*h, gx=new Float32Array(n), m=new Float32Array(n), tanMax=Math.tan(ECART_VERTICALE*RAD);
  // gradient de Sobel ; une arête proche de la verticale a un gradient proche de l'horizontale
  for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){ const i=y*w+x;
    const a=g[i-w-1], b=g[i-w], c=g[i-w+1], d=g[i-1], e=g[i+1], f=g[i+w-1], k=g[i+w], l=g[i+w+1];
    const sx=(c+2*e+l)-(a+2*d+f), sy=(f+2*k+l)-(a+2*b+c);
    if(Math.abs(sy)<=Math.abs(sx)*tanMax){ gx[i]=sx; m[i]=Math.hypot(sx,sy); } }
  // seuil : contraste net, relatif à l'image (85e centile des gradients retenus, au moins 40 sur 1020)
  const hist=new Uint32Array(1024); let nb=0; for(let i=0;i<n;i++) if(m[i]>=16){ hist[Math.min(1023,m[i]|0)]++; nb++; }
  let seuil=40; { let acc=0; for(let v=1023;v>=0;v--){ acc+=hist[v]; if(acc>=nb*0.3){ seuil=Math.max(40,v); break; } } }
  // contours fins : maximum du gradient le long de la ligne, position affinée au dixième de pixel ; même sens de contraste (clair → sombre ou l'inverse)
  const fin=new Float32Array(n).fill(NaN);
  for(let y=1;y<h-1;y++) for(let x=1;x<w-1;x++){ const i=y*w+x, v=m[i]; if(v<seuil||v<m[i-1]||v<=m[i+1]) continue;
    const den=m[i-1]-2*v+m[i+1]; fin[i]=x+(den<0?0.5*(m[i-1]-m[i+1])/den:0); }
  // chaînes : d'une ligne à la suivante, le contour se poursuit à la colonne la plus proche (±1), même sens de contraste
  const pris=new Uint8Array(n), out=[], lmin=LONGUEUR_MIN*Math.max(w,h);
  for(let y0=1;y0<h-1;y0++) for(let x0=1;x0<w-1;x0++){ const i0=y0*w+x0; if(pris[i0]||!(fin[i0]===fin[i0])) continue;
    const pts=[], signe=gx[i0]>0; let x=x0, y=y0;
    for(;;){ const i=y*w+x; pris[i]=1; pts.push(fin[i],y); if(y>=h-2) break;
      let suiv=-1; for(const dx of [0,-1,1]){ const j=i+w+dx; if(fin[j]===fin[j]&&!pris[j]&&(gx[j]>0)===signe){ suiv=x+dx; break; } }
      if(suiv<0) break; x=suiv; y++; }
    if(pts.length/2>=lmin*0.7) decouper(pts,0,pts.length/2,lmin,out);
  }
  return out;
}
/** Ajuste une droite à la chaîne pts[a..b[ (x en fonction de y) ; trop courbe : coupée au point le plus écarté. */
function decouper(pts,a,b,lmin,out){
  const k=b-a; if(k<lmin*0.7) return;
  let sy=0, sx=0; for(let i=a;i<b;i++){ sx+=pts[2*i]; sy+=pts[2*i+1]; } const mx=sx/k, my=sy/k;
  let syy=0, sxy=0; for(let i=a;i<b;i++){ const dy=pts[2*i+1]-my; syy+=dy*dy; sxy+=dy*(pts[2*i]-mx); } const p=sxy/syy; // x = mx + p·(y − my)
  let pire=0, ip=-1, s2=0; for(let i=a;i<b;i++){ const e=Math.abs(pts[2*i]-mx-p*(pts[2*i+1]-my)); s2+=e*e; if(e>pire){ pire=e; ip=i; } }
  if(pire>1.2){ if(ip-a>=2) decouper(pts,a,ip,lmin,out); if(b-ip-1>=2) decouper(pts,ip+1,b,lmin,out); return; }
  const l=(k-1)*Math.hypot(1,p); if(l<lmin||Math.sqrt(s2/k)>0.5) return;
  const q=Math.hypot(1,p); out.push({x:mx,y:my,dx:-p/q,dy:-1/q,l});
}
/** Écart (rad) entre une arête et la direction du zénith vue depuis son milieu, pour le zénith v (repère de l'appareil : x à droite, y en bas, z devant). */
function ecart(s,v,f,cx,cy){
  const tx=f*v[0]-(s.x-cx)*v[2], ty=f*v[1]-(s.y-cy)*v[2], t=Math.hypot(tx,ty)||1;
  return Math.asin(Math.max(-1,Math.min(1,(s.dx*ty-s.dy*tx)/t)));
}
const zenith=(p,r)=>[Math.sin(r*RAD)*Math.cos(p*RAD),-Math.cos(r*RAD)*Math.cos(p*RAD),Math.sin(p*RAD)];
/**
 * Inclinaison et roulis de l'appareil d'après les arêtes. cam : {f (focale en px de l'image analysée), cx, cy (centre), h (hauteur de l'image)}.
 * → {inclinaison (°, positive : appareil levé, horizon sous le centre), roulis (°, positif : l'image penche dans le sens horaire), n, longueur, etalement, rival, precision, sur, raison}. Pure.
 */
export function aplomb(segs,cam){
  const {f,cx,cy}=cam, H=cam.h, tol=s=>Math.max(0.6*RAD,Math.atan(0.5/s.l)), poids=s=>Math.min(s.l,0.25*H);
  const score=(p,r)=>{ const v=zenith(p,r); let t=0; for(const s of segs) if(Math.abs(ecart(s,v,f,cx,cy))<=tol(s)) t+=poids(s); return t; };
  const vide={inclinaison:0,roulis:0,n:0,longueur:0,part:0,etalement:0,rival:0,precision:Infinity,sur:false};
  if(segs.length<ARETES_MIN) return {...vide,raison:`trop peu d’arêtes verticales (${segs.length})`};
  // 1. toutes les valeurs, par pas de 0,5°
  const np=Math.round(INCLINAISON_MAX*4)+1, nr=Math.round(ROULIS_MAX*4)+1, carte=new Float32Array(np*nr); let best=-1, bi=0;
  for(let ip=0;ip<np;ip++) for(let ir=0;ir<nr;ir++){ const t=score(-INCLINAISON_MAX+ip*0.5,-ROULIS_MAX+ir*0.5); carte[ip*nr+ir]=t; if(t>best){ best=t; bi=ip*nr+ir; } }
  let p=-INCLINAISON_MAX+Math.floor(bi/nr)*0.5, r=-ROULIS_MAX+(bi%nr)*0.5;
  // rival : meilleure autre réponse, à plus de 4° de la première
  let rival=0; for(let ip=0;ip<np;ip++) for(let ir=0;ir<nr;ir++){ const dp=-INCLINAISON_MAX+ip*0.5-p, dr=-ROULIS_MAX+ir*0.5-r; if(Math.hypot(dp,dr)>4&&carte[ip*nr+ir]>rival) rival=carte[ip*nr+ir]; }
  // 2. affinage : moindres carrés sur les arêtes d'accord (écart ≈ linéaire en inclinaison et roulis), quatre passes
  let dedans=[];
  for(let passe=0;passe<4;passe++){
    const v=zenith(p,r); dedans=segs.filter(s=>Math.abs(ecart(s,v,f,cx,cy))<=tol(s)); if(dedans.length<3) break;
    const vp=zenith(p+0.05,r), vr=zenith(p,r+0.05); let a11=0,a12=0,a22=0,b1=0,b2=0;
    for(const s of dedans){ const e=ecart(s,v,f,cx,cy), jp=(ecart(s,vp,f,cx,cy)-e)/0.05, jr=(ecart(s,vr,f,cx,cy)-e)/0.05, wt=poids(s);
      a11+=wt*jp*jp; a12+=wt*jp*jr; a22+=wt*jr*jr; b1-=wt*jp*e; b2-=wt*jr*e; }
    const det=a11*a22-a12*a12; if(!(Math.abs(det)>1e-12)) break;
    p=Math.max(-INCLINAISON_MAX,Math.min(INCLINAISON_MAX,p+(b1*a22-b2*a12)/det)); r=Math.max(-ROULIS_MAX,Math.min(ROULIS_MAX,r+(a11*b2-a12*b1)/det));
  }
  // 3. sûreté de la réponse
  const v=zenith(p,r); let sw=0, sx=0, sxx=0, se=0, sjp=0, long=0;
  for(const s of dedans){ const wt=poids(s), X=(s.x-cx)/f, e=ecart(s,v,f,cx,cy); sw+=wt; sx+=wt*X; sxx+=wt*X*X; se+=wt*e*e; long+=s.l; }
  const etalement=sw?Math.sqrt(Math.max(0,sxx/sw-(sx/sw)**2)):0, residu=sw?Math.sqrt(se/sw)/RAD:0;
  // précision de l'inclinaison (°) : dispersion des arêtes / (écartement × racine du nombre) — l'inclinaison se lit dans la convergence des arêtes
  const precision=dedans.length>2&&etalement>0?residu/(etalement*Math.sqrt(dedans.length))/Math.max(0.3,Math.cos(p*RAD)**2):Infinity;
  let tout=0; for(const s of segs) tout+=poids(s);
  const res={inclinaison:p,roulis:r,n:dedans.length,longueur:long/H,part:tout?sw/tout:0,etalement,rival:best>0?rival/best:1,precision,residu,sur:false,raison:''};
  if(res.n<ARETES_MIN) res.raison=`trop peu d’arêtes d’accord (${res.n})`;
  else if(res.longueur<LONGUEUR_TOTALE_MIN) res.raison=`arêtes d’accord trop courtes (${res.longueur.toFixed(1)} hauteur d’image)`;
  else if(res.part<PART_MIN) res.raison=`les arêtes ne s’accordent pas (${Math.round(res.part*100)} % d’accord)`;
  else if(etalement<ETALEMENT_MIN) res.raison='arêtes groupées dans une seule partie de l’image';
  else if(res.rival>RIVAL_MAX) res.raison='deux réponses possibles';
  else if(precision>PRECISION_MAX) res.raison=`trop imprécis (±${precision.toFixed(1)}°)`;
  else res.sur=true;
  return res;
}
let c=null, vue=null, etat={msg:'en attente d’une photo',res:null,applique:false};
/** Image de la photo en niveaux de gris, réduite à COTE pixels de grand côté (jamais agrandie). */
function lire(img){
  const W=img.naturalWidth, Hh=img.naturalHeight; if(!W||!Hh) return null;
  const k=Math.min(1,COTE/Math.max(W,Hh)), w=Math.max(8,Math.round(W*k)), h=Math.max(8,Math.round(Hh*k)), cv=document.createElement('canvas'); cv.width=w; cv.height=h;
  const x=cv.getContext('2d',{willReadFrequently:true}); x.drawImage(img,0,0,w,h);
  let d; try{ d=x.getImageData(0,0,w,h).data; }catch(e){ return null; }
  const g=new Uint8Array(w*h); for(let i=0;i<w*h;i++) g[i]=(0.299*d[4*i]+0.587*d[4*i+1]+0.114*d[4*i+2])|0;
  return {g,w,h};
}
/** Règle l'horizon d'après les arêtes déjà relevées et le champ en cours. `premiere` : à l'ouverture de la photo ; sinon le champ vient de changer. */
function regler(premiere){
  const {segs,w,h,ms}=vue, champ=c.S.camFov, f=(Math.max(w,h)/2)/Math.tan(champ/2*RAD), res=aplomb(segs,{f,cx:w/2,cy:h/2,h});
  const detail=`${res.n} arêtes verticales d’accord sur ${segs.length} (${ms} ms) · champ ${champ}°`; vue.champ=champ;
  if(!res.sur){ vue.pose=null; etat={msg:`horizon laissé tel quel : ${res.raison} · ${detail}`,res,applique:false}; return; }
  // on ne touche qu'à un horizon que personne n'a réglé : 0 à l'ouverture de la photo, ou la valeur posée ici avant que le champ change
  const libre=c.S.pitchOff===(premiere?0:vue.pose), sens=res.inclinaison>=0?'levé':'baissé', angle=Math.abs(res.inclinaison).toFixed(1);
  vue.pose=libre?(c.S.pitchOff=Math.round(res.inclinaison*10)/10):null; if(libre) c.saveSettings();
  etat={msg:`horizon ${libre?'réglé':'mesuré (non appliqué : déjà réglé à la main)'} d’après les verticales des bâtiments : appareil ${sens} de ${angle}° (±${res.precision.toFixed(1)}°), penché de ${res.roulis.toFixed(1)}° · ${detail}`,res,applique:libre};
  if(premiere){ c.logNet('Horizon de la photo (greffe horizonPhoto)',true,etat.msg);
    if(libre) c.note(`Horizon de la photo réglé d’après les verticales des bâtiments (appareil ${sens} de ${angle}°). Glissez pour corriger.`,6000); }
}
function suivre(){
  const pm=c.photoMode; if(!pm){ if(vue){ vue=null; etat={msg:'en attente d’une photo',res:null,applique:false}; } return; }
  if(vue&&vue.pm===pm){ if(vue.segs&&vue.pose!=null&&c.S.camFov!==vue.champ) regler(false); return; } // champ changé (pincement) : l'inclinaison lue dans les mêmes arêtes change avec lui
  vue={pm,segs:null,pose:null,champ:null};
  try{ const im=lire(pm.img); if(!im){ etat={msg:'image illisible',res:null,applique:false}; return; }
    const t0=performance.now(); vue.segs=aretes(im.g,im.w,im.h); vue.w=im.w; vue.h=im.h; vue.ms=Math.round(performance.now()-t0); regler(true); }
  catch(e){ etat={msg:'analyse impossible : '+(e&&e.message||e),res:null,applique:false}; }
}
export default {
  init(ctx){ c=ctx; const info=c.$('photoInfo'); if(info) new MutationObserver(suivre).observe(info,{childList:true,characterData:true,subtree:true}); setInterval(suivre,500); suivre(); },
  suivre, aretes, aplomb, etat:()=>({...etat,res:etat.res&&{...etat.res}}),
  statut:()=>`horizonPhoto : ${etat.msg}`,
};
