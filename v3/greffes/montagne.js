// Greffe « montagne » (ajout, éteinte par défaut) : les noms des sommets, façon PeakFinder. Source : OpenStreetMap (`natural=peak` nommés, avec
// altitude), la base libre la plus complète des sommets ; PeakFinder a ses propres données, fermées. La v1 n'en montre que peu : les 30 plus proches
// (Overpass, catégorie « Pointes, caps et sommets ») et, au loin, les grands sommets de plus de 1 500 m des tuiles OpenFreeMap de zoom 7.
// Greffe : tous les sommets nommés à moins de 120 km (une requête Overpass, gardée 30 jours sur l'appareil, rechargée après 25 km), triés par
// DOMINANCE : un sommet n'est gardé que si aucun sommet plus haut n'est à moins de max(0,3 km, d/30) — plus il est loin, plus il doit dominer
// ses voisins (évite la forêt de noms) — au plus 300. Ils rejoignent les sommets lointains de la v1 (`farPeaks`) : la v1 ne les affiche que s'ils
// se voient d'ici (pas cachés par le relief), avec son rendu et ses fiches. Point d'entrée : loadFarPeaks (après les sommets de la v1).
export const RAYON_KM=120, N_MAX=300, RECHARGE_KM=25, TTL_MS=30*86400000;
const RAD=Math.PI/180;
/** Altitude d'une étiquette OSM « ele » : « 1234 », « 1234 m », « 1 234,5 » ; null si illisible. */
export function lireAltitude(v){ if(v==null) return null; const m=/-?\d[\d\s]*(?:[.,]\d+)?/.exec(String(v)); if(!m) return null; const x=parseFloat(m[0].replace(/\s/g,'').replace(',','.')); return isFinite(x)&&x>-500&&x<9000?x:null; }
const distKm=(a,b)=>{ const la1=a.lat*RAD, la2=b.lat*RAD, dl=(b.lon-a.lon)*RAD, h=Math.sin((la2-la1)/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dl/2)**2; return 6371*2*Math.asin(Math.sqrt(Math.min(1,h))); };
const norm=s=>String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
/** Éléments Overpass → sommets {name, lat, lon, ele}. */
export function lireSommets(j){
  const out=[]; for(const e of (j&&j.elements)||[]){ const t=e.tags||{}, name=t['name:fr']||t.name, ele=lireAltitude(t.ele); if(!name||ele==null||!isFinite(e.lat)||!isFinite(e.lon)) continue; out.push({name,lat:e.lat,lon:e.lon,ele}); }
  return out;
}
/** Isolement minimal (km) exigé d'un sommet à `dKm` : plus il est loin, plus il doit dominer. */
export const isolementMin=dKm=>Math.max(0.3,dKm/30);
/**
 * Sommets retenus autour de `pos` : distance ≤ RAYON_KM, isolement (distance au plus proche sommet plus haut) ≥ isolementMin(d), au plus N_MAX
 * (les plus dominants d'abord). Pure. @returns {{name,lat,lon,ele,dist,iso}[]}
 */
export function selectionner(sommets,pos,{rayonKm=RAYON_KM,nMax=N_MAX}={}){
  const s=sommets.map(p=>({...p,dist:distKm(pos,p)})).filter(p=>p.dist<=rayonKm).sort((a,b)=>b.ele-a.ele);
  const garde=[];
  for(let i=0;i<s.length;i++){
    const p=s[i], need=isolementMin(p.dist), dLat=need/111, dLon=need/(111*Math.max(0.2,Math.cos(p.lat*RAD)));
    let iso=Infinity;
    for(let k=0;k<i;k++){ const q=s[k]; if(q.ele<=p.ele) break; if(Math.abs(q.lat-p.lat)>dLat||Math.abs(q.lon-p.lon)>dLon) continue; const d=distKm(p,q); if(d<iso){ iso=d; if(iso<need) break; } }
    if(iso>=need) garde.push({...p,iso});
  }
  return garde.sort((a,b)=>Math.min(b.iso,50)/isolementMin(b.dist)-Math.min(a.iso,50)/isolementMin(a.dist)||b.ele-a.ele).slice(0,nMax);
}
/** Ajoute les sommets retenus aux sommets lointains de la v1, sans doublon (même nom à moins de 2 km d'un lieu ou d'un sommet déjà là). */
export function fusionner(retenus,dejaLa){
  const proches=(a,b)=>norm(a.name)===norm(b.name)&&distKm(a,b)<2;
  return retenus.filter(p=>!dejaLa.some(q=>proches(p,q))).map(p=>({name:p.name,lat:p.lat,lon:p.lon,kind:'peak',pop:0,ele:p.ele,farPeak:true,montagne:true}));
}
let c=null, charge=null, enCours=false;
const etat={total:0,retenus:0,ajoutes:0,msg:'en attente du relief'};
async function lire(here){
  const q=`[out:json][timeout:90];node["natural"="peak"]["name"]["ele"](around:${RAYON_KM*1000},${here.lat.toFixed(4)},${here.lon.toFixed(4)});out body;`;
  const r=await c.dcFetch('mtg',`mtg/${here.lat.toFixed(2)},${here.lon.toFixed(2)}`,{ttl:TTL_MS,prune:['mtg/',12],load:async()=>lireSommets(await c.overpassQuery(q,90000,j=>j))});
  return Array.isArray(r.data)?r.data:JSON.parse(r.data);
}
export default {
  init(ctx){ c=ctx; },
  /** Point d'entrée de loadFarPeaks : complète les sommets lointains de la v1 (relit Overpass seulement après 25 km). */
  async charger(here){
    if(enCours) return; enCours=true;
    try{
      if(!charge||distKm(charge.at,here)>=RECHARGE_KM) charge={at:{...here},liste:await lire(here)};
      const ret=selectionner(charge.liste,c.pos||here), deja=c.cities.filter(x=>x.kind==='peak'||x.kind==='cape').concat(c.farPeaks.filter(x=>!x.montagne));
      const aj=fusionner(ret,deja);
      c.setFarPeaks(c.farPeaks.filter(x=>!x.montagne).concat(aj));
      Object.assign(etat,{total:charge.liste.length,retenus:ret.length,ajoutes:aj.length,msg:'ok'});
      c.logNet('Sommets (greffe montagne)',true,`${charge.liste.length} sommet(s) nommé(s) à moins de ${RAYON_KM} km, ${ret.length} dominant(s), ${aj.length} ajouté(s)`);
    }catch(e){ etat.msg='indispo : '+(e&&e.message||e); c.logNet('Sommets (greffe montagne)',false,etat.msg); }
    enCours=false;
  },
  etat:()=>({...etat}),
  statut:()=>`montagne : ${etat.msg==='ok'?`${etat.total} sommet(s) OSM à moins de ${RAYON_KM} km, ${etat.retenus} dominant(s), ${etat.ajoutes} ajouté(s) aux sommets lointains`:etat.msg}`,
};
