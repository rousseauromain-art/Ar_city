// Greffe « recalageContinu » (ajout, éteinte par défaut) : action C de docs/VEILLE-ANCRAGE.md (v2 : calage/continu.js, ui/calage-continu.js). En direct,
// toutes les 3 s, le disque du soleil (de jour) ou de la lune (soleil couché) est cherché dans l'image, près de sa position calculée ; quand deux détections
// concordent à 1° près sur au moins 3 s, téléphone stable (< 10°/s) et écart plausible (cap ≤ 15°, horizon ≤ 8° : au-delà, reflet), le cap et l'horizon
// sont corrigés d'un demi-pas, au plus un pas toutes les 10 s, cumul plafonné à ±20°, plus rien sous 0,3°. Le nord se corrige seul après un calage, sans
// rien toucher. Carnet : « auto continu soleil » / « auto continu lune ». Aucun point d'entrée dans le code de la v1 (minuterie de la greffe).
import {chercherDisque,positionLune,wrap} from './_astre.js';
export const PERIODE_MS=3000, CONCORDANCE_DEG=1, ACCORD_MIN_MS=3000, ROTATION_MAX_DEG_S=10, ECART_CAP_MAX_DEG=15, ECART_HORIZON_MAX_DEG=8, CONVERGE_DEG=0.3;
export const PAUSE_PAS_MS=10000, PART_PAS=0.5, CUMUL_MAX_DEG=20, HISTORIQUE_MAX=6;
function serieConcordante(ds){
  const der=ds[ds.length-1]; let i=ds.length-1;
  while(i>0&&Math.abs(ds[i-1].dh-der.dh)<=CONCORDANCE_DEG&&Math.abs(ds[i-1].dp-der.dp)<=CONCORDANCE_DEG) i--;
  return ds.slice(i);
}
/** Décision pure (v2 calage/continu.js) : {pas:{dh,dp}|null, raison}. `historique` : détections {t, dh, dp}, la plus récente en dernier. */
export function decisionCalageContinu({historique,derniereMs,maintenantMs,cumulDeg,rotationDegS}){
  if(rotationDegS>ROTATION_MAX_DEG_S) return {pas:null,raison:`téléphone en mouvement (${Math.round(rotationDegS)}°/s)`};
  if(historique.length<2) return {pas:null,raison:'en attente d’une deuxième détection'};
  const ds=historique.slice(-HISTORIQUE_MAX), der=ds[ds.length-1], serie=serieConcordante(ds);
  if(serie.length<2||der.t-serie[0].t<ACCORD_MIN_MS) return {pas:null,raison:'détections non concordantes ou trop récentes'};
  const dh=serie.reduce((s,d)=>s+d.dh,0)/serie.length, dp=serie.reduce((s,d)=>s+d.dp,0)/serie.length;
  if(Math.abs(dh)>ECART_CAP_MAX_DEG||Math.abs(dp)>ECART_HORIZON_MAX_DEG) return {pas:null,raison:`écart trop grand (${dh.toFixed(1)}° / ${dp.toFixed(1)}°) : reflet probable`};
  if(Math.abs(dh)<CONVERGE_DEG&&Math.abs(dp)<CONVERGE_DEG) return {pas:null,raison:'convergé'};
  if(maintenantMs-derniereMs<PAUSE_PAS_MS) return {pas:null,raison:'pause entre deux pas'};
  let pasCap=dh*PART_PAS;
  if(CUMUL_MAX_DEG-Math.abs(cumulDeg+pasCap)<0) pasCap=Math.sign(pasCap)*Math.max(0,CUMUL_MAX_DEG-Math.abs(cumulDeg));
  if(Math.abs(pasCap)<0.05&&Math.abs(dp*PART_PAS)<0.05) return {pas:null,raison:`cumul de ${CUMUL_MAX_DEG}° atteint`};
  return {pas:{dh:pasCap,dp:dp*PART_PAS},raison:''};
}
let c=null, historique=[], derniereMs=-Infinity, cumulDeg=0, capPrec=null, tPrec=0, doigt=0;
const etat={etat:'en attente',pas:0,dernier:null};
/** L'astre visible : le soleil de jour, la lune quand il est couché. */
function astre(){
  const sp=c.sunNow(); if(sp&&sp.el>-1) return {nom:'soleil',pos:sp};
  const t=c.sunTime(), p=c.pos; return p&&t?{nom:'lune',pos:positionLune(t,p.lat,p.lon)}:null;
}
/** Une détection, à l'instant `t` (ms, horloge monotone). Appelée par la minuterie ; exposée pour les tests. */
function tick(t){
  const P=c.pose(), rot=capPrec===null||t<=tPrec?0:Math.abs(wrap(P.heading-capPrec))/((t-tPrec)/1000); capPrec=P.heading; tPrec=t;
  if(c.photoMode||!c.sensor){ historique=[]; etat.etat=c.photoMode?'photo : sans objet':'en attente des capteurs'; return; }
  if(document.hidden||doigt>0){ etat.etat='en attente (page cachée ou doigt sur l’écran)'; return; }
  const a=astre(); if(!a){ etat.etat='position inconnue'; return; }
  const r=chercherDisque(c,a.pos,{nom:a.nom});
  if(!r.ok){ historique=[]; etat.etat=`${a.nom} : ${r.msg}`; return; }
  historique.push({t,dh:wrap(a.pos.az-r.az),dp:a.pos.el-r.el}); if(historique.length>HISTORIQUE_MAX) historique.shift();
  const d=decisionCalageContinu({historique,derniereMs,maintenantMs:t,cumulDeg,rotationDegS:rot});
  etat.etat=d.pas?`${a.nom} : pas appliqué`:`${a.nom} : ${d.raison}`;
  if(d.pas) appliquer(d.pas,a.nom,t);
}
function appliquer(pas,nom,t){
  const S=c.S, avant={h:S.headOff,p:S.pitchOff};
  S.headOff+=pas.dh; S.pitchOff+=pas.dp; cumulDeg+=pas.dh; derniereMs=t; historique=[];
  c.noteCalib(); c.saveSettings(); c.calRecord(nom==='lune'?'auto continu lune':'auto continu soleil',avant);
  etat.pas++; etat.dernier={dh:pas.dh,dp:pas.dp,astre:nom};
  const f=v=>(v>=0?'+':'')+v.toFixed(1)+'°';
  c.logNet('Calage',true,`recalage continu sur ${nom==='lune'?'la lune':'le soleil'} : cap ${f(pas.dh)}, horizon ${f(pas.dp)} (cumul ${cumulDeg.toFixed(1)}°)`);
  c.note(`Cap recalé sur ${nom==='lune'?'la lune':'le soleil'} (${f(pas.dh)})`,2000);
}
export default {
  init(ctx){
    c=ctx;
    addEventListener('pointerdown',()=>{ doigt++; },true); const leve=()=>{ doigt=Math.max(0,doigt-1); };
    addEventListener('pointerup',leve,true); addEventListener('pointercancel',leve,true);
    setInterval(()=>tick(performance.now()),PERIODE_MS);
  },
  tick, decisionCalageContinu,
  etat:()=>({...etat,cumulDeg,historique:historique.length}),
  statut:()=>`recalageContinu : ${etat.etat} · ${etat.pas} pas, cumul ${cumulDeg.toFixed(1)}°${etat.dernier?` · dernier ${etat.dernier.astre} ${etat.dernier.dh.toFixed(1)}°`:''}`,
};
