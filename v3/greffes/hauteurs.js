// Greffe « hauteurs » (remplacement, éteinte par défaut) : la hauteur d'un monument vient du bon objet. Constat du 13/11/2026 (Turin, piazza San
// Carlo) : la statue équestre d'Emmanuel-Philibert était donnée « ↑40 m ». OpenStreetMap lui donne 4,4 m ; les 40 m sont ceux d'un clocher sans
// nom, à 115 m. Deux défauts de la v1 :
//  1. une tour ou un clocher d'OpenStreetMap donne sa hauteur au PREMIER monument de la liste à moins de 120 m, quel qu'il soit (une statue, une
//     place…). Greffe : au monument COMPATIBLE le plus PROCHE (ni statue, ni colonne, ni arc, ni pont, ni place, ni parc, ni plan d'eau, ni stade,
//     ni gare, ni salle) ; s'il n'y en a pas, la tour devient un monument à part, comme dans la v1 ;
//  2. une statue d'OpenStreetMap déjà connue de Wikidata est écartée avec sa hauteur. Greffe : sa hauteur passe au monument de Wikidata (même
//     identifiant Wikidata, sinon la statue ou colonne la plus proche à moins de 60 m), quand Wikidata n'en donne pas.
// Un calage au doigt sur le sommet d'un monument (cap et horizon) dépend de cette hauteur. Points d'entrée : tallMonuments, statueMonuments.
export const INCOMPATIBLES=/^(colonne|arc|pont|place|parc|eau|stade|gare|scene)$/;
const RAD=Math.PI/180;
const distKm=(a,b)=>{ const la1=a.lat*RAD, la2=b.lat*RAD, dl=(b.lon-a.lon)*RAD, h=Math.sin((la2-la1)/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dl/2)**2; return 6371*2*Math.asin(Math.sqrt(Math.min(1,h))); };
const etat={tours:0,sansMonument:0,statues:0,exemples:[]};
const noter=t=>{ if(etat.exemples.length<4) etat.exemples.push(t); };
/** Point d'entrée de tallMonuments : le monument qui reçoit la hauteur de la tour T ({lat, lon, h, kind}), ou undefined. Pur (hors compteurs). */
export function associer(monBase,T,rayonKm){
  let best, bd=Infinity;
  for(const m of monBase){ if(m.cat==='equip'||INCOMPATIBLES.test(m.type||'')) continue; const d=distKm(m,T); if(d<rayonKm&&d<bd){ bd=d; best=m; } }
  etat.tours++; if(!best) etat.sansMonument++; else if(T.h&&!best.htWd) noter(`${Math.round(T.h)} m → ${best.name} (à ${Math.round(bd*1000)} m)`);
  return best;
}
/** Point d'entrée de statueMonuments : la statue d'OpenStreetMap `e`, déjà connue de Wikidata, lui donne sa hauteur. `proche(m, e)` : le test de la v1 (60 m). */
export function statue(monBase,e,proche){
  const t=e.tags||{}, h=parseFloat(t.height); if(!(isFinite(h)&&h>0&&h<120)) return null;
  let M=t.wikidata?monBase.find(m=>m.qid===t.wikidata&&m.cat!=='equip'):null;
  if(!M){ let bd=Infinity; for(const m of monBase){ if(m.cat==='equip'||m.type!=='colonne'||!proche(m,e)) continue; const d=distKm(m,e); if(d<bd){ bd=d; M=m; } } }
  if(!M||M.htWd) return null;
  M.ht=h; M.htOsm=h; etat.statues++; noter(`${h} m → ${M.name}`); return M;
}
export default {
  init(){}, associer, statue, etat:()=>({...etat,exemples:etat.exemples.slice()}),
  statut:()=>`hauteurs : ${etat.tours} tour(s) ou clocher(s) rattaché(s) au monument compatible le plus proche (${etat.sansMonument} sans monument : affichés à part) · ${etat.statues} statue(s) avec la hauteur d’OpenStreetMap${etat.exemples.length?' · '+etat.exemples.join(' ; '):''}`,
};
