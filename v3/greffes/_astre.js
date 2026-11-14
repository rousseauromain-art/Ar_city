// Outils partagés par les greffes soleil2, lune, recalageContinu et soleilReflet (pas une greffe : aucun interrupteur) : détection d'un disque brillant dans l'image (recopié de v2/src/vision/soleil.js,
// lui-même repris de `sunAlign` de la v1), position de la lune (v2/src/noyau/astro.js). Aucune dépendance à la v2.
const RAD=Math.PI/180;
export const wrap=a=>((a+540)%360)-180;
const SEUILS_BLEU=[150,185,215,240], ROUGE_MIN=245, VERT_MIN=232;
/** Taches blanches aux quatre seuils sur le bleu (le cœur blanc du disque résiste, le halo orange tombe). @param {{d:Uint8ClampedArray,cw:number,ch:number}} p */
export function detecterTaches({d,cw,ch},seuilsBleu=SEUILS_BLEU,rougeMin=ROUGE_MIN,vertMin=VERT_MIN){
  const toutes=[], n=cw*ch;
  for(const seuil of seuilsBleu){
    const masque=new Uint8Array(n), vu=new Uint8Array(n);
    for(let i=0;i<n;i++){ const r=d[i*4],g=d[i*4+1],b=d[i*4+2]; if(r>=rougeMin&&g>=vertMin&&b>=seuil) masque[i]=1; }
    for(let s=0;s<n;s++){
      if(!masque[s]||vu[s]) continue;
      const pile=[s]; vu[s]=1; let a=0,sx=0,sy=0,x0=cw,x1=0,y0=ch,y1=0;
      while(pile.length){ const q=pile.pop(), x=q%cw, y=(q/cw)|0; a++; sx+=x; sy+=y; if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y;
        for(const nb of [q-1,q+1,q-cw,q+cw]) if(nb>=0&&nb<n&&!vu[nb]&&masque[nb]&&Math.abs((nb%cw)-x)<=1){ vu[nb]=1; pile.push(nb); } }
      const bw=x1-x0+1, bh=y1-y0+1;
      toutes.push({seuil,aire:a,cx:sx/a,cy:sy/a,x0,x1,y0,y1,compacte:a>=3&&a<=n*0.02&&Math.max(bw,bh)<=2.5*Math.min(bw,bh)&&a>=0.45*bw*bh});
    }
  }
  return toutes;
}
/** Reflet (eau, sable mouillé) : une tache sous une autre, dans la même colonne, n'en est le reflet que si elle est sous l'horizon que l'autre
 *  implique si elle est l'astre (l'astre est à `astre.el` au-dessus de l'horizon, son reflet en dessous), à REFLET_MARGE près, et si l'autre n'est
 *  pas bien plus petite (au moins PART_AIRE_MIN de son aire : un éclat de nuage, une ampoule ne sont pas la source d'un reflet). La règle reprise
 *  de la v1 (« une tache claire au-dessus : c'est un reflet ») écartait le vrai soleil sous des nuages éclairés (Morgat, photo du 24/08). */
export const REFLET_MARGE=0.5;
/** Le soleil : le disque le plus gros. Les éclats de nuage plus petits que PART_AIRE_MIN du plus gros ne sont pas retenus. */
export const PART_AIRE_MIN=0.25;
/** Candidats (compacts, hors reflets, sans doublon), position dans la scène, roulis compensé. */
export function candidats(taches,{cw,W,H,fh,pose,astre,large}){
  const k=cw/W, cr=Math.cos(pose.roll*RAD), sr=Math.sin(pose.roll*RAD), tolColonne=Math.tan(1.5*RAD)*fh*k, vu=new Map();
  const scene=o=>{ let s=vu.get(o); if(!s){ const X=o.cx/k-W/2, Y=o.cy/k-H/2, dxs=X*cr+Y*sr, dys=-X*sr+Y*cr; s={az:pose.heading+Math.atan(dxs/fh)/RAD,el:pose.pitch-Math.atan(dys/fh)/RAD}; vu.set(o,s); } return s; };
  const reflet=o=>taches.some(q=>q!==o&&q.y1<o.y0-1&&Math.abs(q.cx-o.cx)<tolColonne+Math.max(2,(q.x1-q.x0)/2)&&q.aire>=PART_AIRE_MIN*o.aire&&scene(o).el<=scene(q).el-astre.el+REFLET_MARGE);
  const out=[];
  for(const o of taches){
    if(!o.compacte||reflet(o)) continue;
    const {az,el}=scene(o);
    if(out.some(c=>Math.hypot(wrap(c.az-az),c.el-el)<0.6)) continue;
    out.push({az,el,aire:o.aire,seuil:o.seuil,dist:Math.hypot((large?0.15:1)*wrap(az-astre.az),el-astre.el)});
  }
  return out;
}
/** Le disque le plus proche de l'astre calculé (dans 37,5°, sans limite en mode large) ; `gros` (le soleil) : parmi les disques d'au moins
 *  PART_AIRE_MIN de l'aire du plus gros. */
export const meilleur=(c,large,{gros=false}={})=>{ const f=c.filter(o=>large||o.dist<25*1.5); if(!f.length) return null;
  const amax=Math.max(...f.map(o=>o.aire)); return (gros?f.filter(o=>o.aire>=PART_AIRE_MIN*amax):f).sort((x,y)=>x.dist-y.dist)[0]||null; };

/** Position de la lune (topocentrique, parallaxe et réfraction comprises, ~0,3°) : v2/src/noyau/astro.js. */
export function positionLune(tMs,latDeg,lonDeg){
  const d=tMs/86400000+2440587.5-2451545.0, T=d/36525, s=a=>Math.sin(a*RAD), c=a=>Math.cos(a*RAD);
  const lon=218.32+481267.881*T+6.29*s(135.0+477198.87*T)-1.27*s(259.3-413335.36*T)+0.66*s(235.7+890534.22*T)+0.21*s(269.9+954397.74*T)-0.19*s(357.5+35999.05*T)-0.11*s(186.5+966404.03*T);
  const lat=5.13*s(93.3+483202.02*T)+0.28*s(228.2+960400.89*T)-0.28*s(318.3+6003.15*T)-0.17*s(217.6-407332.21*T);
  const parallaxe=0.9508+0.0518*c(135.0+477198.87*T)+0.0095*c(259.3-413335.36*T)+0.0078*c(235.7+890534.22*T)+0.0028*c(269.9+954397.74*T);
  const eps=23.439-0.00000036*d, l=lon*RAD, b=lat*RAD, e=eps*RAD;
  const x=Math.cos(b)*Math.cos(l), y=Math.cos(e)*Math.cos(b)*Math.sin(l)-Math.sin(e)*Math.sin(b), z=Math.sin(e)*Math.cos(b)*Math.sin(l)+Math.cos(e)*Math.sin(b);
  const ra=Math.atan2(y,x), dec=Math.asin(z);
  const gmst=(((18.697374558+24.06570982441908*d)%24)+24)%24, H=(gmst*15+lonDeg)*RAD-ra, p=latDeg*RAD;
  const elGeo=Math.asin(Math.sin(p)*Math.sin(dec)+Math.cos(p)*Math.cos(dec)*Math.cos(H))/RAD;
  const az=Math.atan2(-Math.sin(H),Math.tan(dec)*Math.cos(p)-Math.sin(p)*Math.cos(H))/RAD;
  const el=elGeo-parallaxe*Math.cos(elGeo*RAD);
  const refraction=el>-1.5?1.02/Math.tan((el+10.3/(el+5.11))*RAD)/60:0;
  return {az:(az+360)%360,el:el+refraction};
}
/** Fraction éclairée du disque lunaire (0 nouvelle lune, 1 pleine lune). */
export function phaseLune(tMs){
  const d=tMs/86400000+2440587.5-2451545.0, T=d/36525, s=a=>Math.sin(a*RAD);
  const lonLune=218.32+481267.881*T+6.29*s(135.0+477198.87*T)-1.27*s(259.3-413335.36*T)+0.66*s(235.7+890534.22*T)+0.21*s(269.9+954397.74*T)-0.19*s(357.5+35999.05*T)-0.11*s(186.5+966404.03*T);
  const g=357.529+0.98560028*d, lonSoleil=280.459+0.98564736*d+1.915*s(g)+0.020*s(2*g);
  return (1-Math.cos((lonLune-lonSoleil)*RAD))/2;
}
/** Cherche un astre dans l'image : {ok, az, el (position VUE), n} ou {ok:false, msg}. */
export function chercherDisque(c,astre,{large=false,nom='soleil'}={}){
  const P=c.pose(), W=c.W, H=c.H, fh=(W/2)/Math.tan(c.vFov()/2*RAD), demi=Math.atan((W/2)/fh)/RAD, vdemi=Math.atan((H/2)/fh)/RAD;
  if(astre.el<-1) return {ok:false,msg:nom+' couché'+(nom==='lune'?'e':'')};
  if(!large&&(Math.abs(wrap(astre.az-P.heading))>demi+25||Math.abs(astre.el-P.pitch)>vdemi+25)) return {ok:false,msg:nom+' hors du champ'};
  const fr=c.grabFrameRGB(480); if(!fr) return {ok:false,msg:'image illisible'};
  const ts=detecterTaches(fr), cs=candidats(ts,{cw:fr.cw,W,H,fh,pose:P,astre,large}), b=meilleur(cs,large,{gros:nom==='soleil'});
  if(!b) return {ok:false,msg:nom==='lune'?'pas de disque lunaire net sur l’image (nuages, lune trop pâle ?)':'pas de disque solaire net'};
  return {ok:true,az:b.az,el:b.el,n:cs.length};
}
