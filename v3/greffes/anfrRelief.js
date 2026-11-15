// Greffe « anfrRelief » (ajout, éteinte par défaut). Constat de la sortie de Pont-en-Royans (14/11) : les pylônes ANFR sont posés sur la ligne d'horizon (pas à leur place sur le relief), et le même
// pylône apparaît deux fois : en monument « Mât TDF · Choranche (16 m) » (OpenStreetMap, bien placé) et en pylône ANFR. Greffe allumée :
//  - les supports ANFR sont posés à leur sommet réel (sol du relief + `height_m`), comme les repères hauts (point d'entrée : `anchorTop` du calque) ;
//  - chaque support ANFR est relié au mât d'OpenStreetMap le plus proche (`relier`, générique : deux listes de points) ; un support relié n'est plus dessiné seul : le mât
//    est dessiné une fois, à sa position (tracée sur photo aérienne, plus précise que la seconde d'arc de l'ANFR), et reçoit la hauteur et les opérateurs de l'ANFR quand il n'en a pas.
// Règles de lien, mesurées le 15/11 sur 202 mâts d'OpenStreetMap en zone ANFR : 1) même numéro des deux côtés ; 2) sinon le plus proche à moins de SEUIL_M (au-delà de 80 m on ne gagne presque plus
// rien : 51 % à 120 m contre 49 % à 80 m), les paires les plus proches d'abord, un support pour un mât, hauteurs d'accord à ACCORD_M près quand elles sont connues (départage les toits voisins) ;
// 3) sinon pas de lien : chacun reste seul. Point d'entrée dans draw() : `relier(telecomSites, monumentSites)`.
export const SEUIL_M=80, ACCORD_M=10;
const RAD=Math.PI/180;
const metres=(a,b)=>{ const la1=a.lat*RAD, la2=b.lat*RAD, dl=(b.lon-a.lon)*RAD, h=Math.sin((la2-la1)/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dl/2)**2; return 6371000*2*Math.asin(Math.sqrt(Math.min(1,h))); };
const hauteur=o=>{ const h=o.height_m??o.h; return typeof h==='number'&&isFinite(h)&&h>0?h:null; };
/**
 * Relie deux listes de points. Générique : tout calque (supports ANFR, mâts d'OpenStreetMap, calques personnels).
 * @param {{lat:number,lon:number,ref?:string,height_m?:number}[]} A
 * @param {{lat:number,lon:number,ref?:string,height_m?:number}[]} B
 * @returns {{a:number,b:number,d:number,regle:'numero'|'proximite'}[]} paires d'indices, un élément de A pour un élément de B
 */
export function relier(A,B,{seuilM=SEUIL_M,accordM=ACCORD_M}={}){
  const out=[], pa=new Set(), pb=new Set();
  const refs=new Map(); B.forEach((b,j)=>{ if(b&&b.ref) (refs.get(String(b.ref))||refs.set(String(b.ref),[]).get(String(b.ref))).push(j); });
  A.forEach((a,i)=>{ if(!a||!a.ref) return; const L=refs.get(String(a.ref))||[]; const j=L.find(k=>!pb.has(k)); if(j!=null){ pa.add(i); pb.add(j); out.push({a:i,b:j,d:metres(a,B[j]),regle:'numero'}); } });
  const cand=[];
  A.forEach((a,i)=>{ if(pa.has(i)||!a||!isFinite(a.lat)||!isFinite(a.lon)) return;
    B.forEach((b,j)=>{ if(pb.has(j)||!b||!isFinite(b.lat)||!isFinite(b.lon)) return;
      if(Math.abs(a.lat-b.lat)>0.002||Math.abs(a.lon-b.lon)>0.003) return; // ~220 m : écarte vite les paires sans intérêt
      const d=metres(a,b); if(d>seuilM) return;
      const ha=hauteur(a), hb=hauteur(b); if(ha!=null&&hb!=null&&Math.abs(ha-hb)>accordM) return;
      cand.push({a:i,b:j,d}); }); });
  cand.sort((x,y)=>x.d-y.d);
  for(const c of cand){ if(pa.has(c.a)||pb.has(c.b)) continue; pa.add(c.a); pb.add(c.b); out.push({...c,regle:'proximite'}); }
  return out;
}
let dernier=null, lies=0;
export default {
  init(){},
  SEUIL_M,ACCORD_M,relier,
  /**
   * Point d'entrée de draw() : relie les supports ANFR aux mâts d'OpenStreetMap (monuments « équipement » et tours d'OpenStreetMap). Refait seulement quand une des deux listes change.
   * @param {object[]} anfr supports ANFR (telecomSites) @param {object[]} monuments monuments (monumentSites)
   */
  relier(anfr,monuments){
    if(dernier&&dernier.anfr===anfr&&dernier.mon===monuments&&dernier.n===anfr.length+'/'+monuments.length) return;
    const mats=monuments.filter(m=>m&&(m.cat==='equip'||(m.type==='tour'&&m.src==='osm'))), pairs=relier(anfr,mats);
    for(const t of anfr) t.dupMon=false;
    for(const p of pairs){ const t=anfr[p.a], m=mats[p.b]; t.dupMon=true; t.lienMat=m.name;
      if(m.htOsm==null&&m.htWd==null&&hauteur(t)!=null) m.htOsm=hauteur(t); // le mât n'a pas de hauteur : celle de l'ANFR
      if(!m.opsAnfr&&t.ops&&t.ops.length) m.opsAnfr=t.ops; }
    lies=pairs.length; dernier={anfr,mon:monuments,n:anfr.length+'/'+monuments.length};
  },
  statut:()=>`anfrRelief : ${lies} support(s) ANFR relié(s) à un mât d'OpenStreetMap`,
};
