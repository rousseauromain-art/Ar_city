// Greffe « calques » (remplacement, éteinte par défaut) — plan du 16/11, lot R2 : un calque par nature (constat K2).
// Dans la v1, 79 sommets sur 80 viennent de la liste des lieux et suivent le calque « Lieux » : décoché, plus aucun nom de montagne, même
// « Sommets » coché ; les zones n'ont aucun calque. Greffe allumée, une seule fonction, calqueDe(élément), dit à quel calque il appartient :
//  - « Lieux » : lieux habités (ville, village, hameau, habitation isolée) et repères sans milieu (point de vue, patrimoine) ;
//  - « Montagne » : sommets, cols, pas, crêtes, zones de montagne, et grottes, scialets, « trous » (réponse de Romain du 16/11) ;
//  - « Mer » : phares, plages, îles ;
//  - éléments AMBIGUS (grotte, rocher, cap, falaise, cascade, forêt, vallée) : leur calque vient de leur MILIEU, lu dans le relief déjà chargé
//    (la mer y est à l'altitude 0) — « Mer » au bord de l'eau (sol < 50 m et mer à moins de 500 m), « Montagne » si le relief est marqué
//    (≥ 300 m de dénivelé dans 2 km, ou sol ≥ 600 m), sinon « Lieux » ; le bord de l'eau l'emporte (règle acceptée par Romain le 16/11).
// Les monuments gardent leur calque. Affichage, bandeau du nombre de lieux et recherche (filtre de la liste affichée) suivent calqueDe ;
// le toucher (lot R3) aussi. Points d'entrée : layerOk et le décompte du bandeau dans draw(), G.lier (altitude).
export const SOL_MER_M=50, MER_KM=0.5, DENIVELE_M=300, RAYON_RELIEF_KM=2, SOL_MONTAGNE_M=600, MER_ALT_M=0.5;
const HABITE=new Set(['city','town','village','hamlet','isolated_dwelling']);
const MER=new Set(['lighthouse','beach','island']);
const AMBIGU=/grotte|\bcave\b|scialet|\btrou\b|gouffre|\baven\b|rocher|\brock\b|\bcap\b|\bcape\b|falaise|cliff|cascade|waterfall|for[êe]t|forest|vall[ée]e|valley|r[ée]surgence/i;
const RAD=Math.PI/180;
let c=null;

/** Points d'un anneau de rayon `km` autour de (lat, lon). Pure. */
function anneau(lat,lon,km,n=8){
  const out=[], dLat=km/111.32, dLon=km/(111.32*Math.max(0.2,Math.cos(lat*RAD)));
  for(let i=0;i<n;i++){ const a=2*Math.PI*i/n; out.push([lat+dLat*Math.cos(a),lon+dLon*Math.sin(a)]); }
  return out;
}
/**
 * Milieu d'un élément ambigu d'après le relief autour de lui. `alt(lat,lon)` → altitude en m (0 = mer), ou null si inconnue. Pure.
 * @returns {'mer'|'montagne'|'lieux'|null} null si le relief n'est pas encore là
 */
export function milieu(lat,lon,alt){
  const sol=alt(lat,lon); if(sol==null) return null;
  if(sol<SOL_MER_M){ for(const km of [MER_KM/2,MER_KM]) for(const [la,lo] of anneau(lat,lon,km)){ const a=alt(la,lo); if(a!=null&&a<=MER_ALT_M) return 'mer'; } }
  if(sol>=SOL_MONTAGNE_M) return 'montagne';
  let mn=sol, mx=sol;
  for(const km of [RAYON_RELIEF_KM/2,RAYON_RELIEF_KM]) for(const [la,lo] of anneau(lat,lon,km)){ const a=alt(la,lo); if(a==null) continue; if(a<mn) mn=a; if(a>mx) mx=a; }
  return mx-mn>=DENIVELE_M?'montagne':'lieux';
}
/** Sites naturels parmi les monuments (Wikipédia) : grottes, gorges, rochers, arches, falaises, cascades, voies et secteurs d'escalade. */
export const NATUREL=/\b(grottes?|gouffres?|avens?|gorges?|rochers?|roches?|arches?|porte du diable|falaises?|cascades?|cirques?|aiguilles?|dents?|voies?|secteurs?|canyons?|défilés?|cave|cliff|waterfall|rock)\b/i;
/** Type sans ambiguïté : calque direct, ou null si l'élément est ambigu (son milieu décide). Pure. */
export function calqueDuType(e){
  if(!e) return 'lieux';
  if(e.kind==='monument') return NATUREL.test(String(e.name||'')+' '+String(e.type||'')+' '+String(e.types||''))?'montagne':'monuments'; // un site naturel venu de Wikipédia va avec la montagne
  if(HABITE.has(e.kind)) return 'lieux';
  if(MER.has(e.kind)) return 'mer';
  const texte=String(e.types||'')+' '+String(e.name||'');
  if(e.zone){ if(AMBIGU.test(texte)) return null; return e.kind==='peak'?'montagne':'lieux'; }
  if(e.kind==='peak'){ return /^(cap|pointe du|pointe de la|rocher)\b/i.test(String(e.name||''))?null:'montagne'; } // OpenFreeMap range des caps et rochers en « peak »
  if(e.kind==='cape'||e.kind==='rock') return null;
  return 'lieux';
}
/** Calque d'un élément : type, sinon milieu ; repli si le relief manque (grotte : montagne, cap : mer, sinon lieux). Pure. */
export function calqueDe(e,alt){
  const t=calqueDuType(e); if(t) return t;
  const m=alt?milieu(e.lat,e.lon,alt):null; if(m) return m;
  const texte=String(e.types||'')+' '+String(e.name||'');
  return /grotte|\bcave\b|scialet|\btrou\b|gouffre|\baven\b/i.test(texte)?'montagne':e.kind==='cape'||/\bcap\b/i.test(texte)?'mer':'lieux';
}

function monter(){
  const lieux=c.$('lyPlaces'); if(!lieux||c.$('lyMontagne')) return;
  const lab=lieux.closest('label'), em=c.$('lyInfoPlaces'); if(em) em.textContent='villes, villages, hameaux';
  const ligne=(id,nom,detail,svg)=>{ const l=document.createElement('label'); l.id=id+'L'; l.innerHTML=`${svg}<span class="lyN">${nom}<em>${detail}</em></span><input type="checkbox" id="${id}">`; return l; };
  const mtg=ligne('lyMontagne','Montagne','sommets, cols, crêtes, gorges, grottes…','<svg viewBox="0 0 24 24" stroke="#6EE08F"><path d="M2 20l7-12 4 6 3-4 6 10z"/></svg>');
  const mer=ligne('lyMer','Mer','phares, plages, îles ; grottes et rochers au bord de l’eau','<svg viewBox="0 0 24 24" stroke="#7FB8E3"><path d="M2 15q2.5-2 5 0t5 0 5 0 5 0M2 19q2.5-2 5 0t5 0 5 0 5 0M12 3v8M9 6h6"/></svg>');
  lab.after(mtg); mtg.after(mer);
  const S=c.S; S.layers=S.layers||{};
  for(const [id,cle] of [['lyMontagne','montagne'],['lyMer','mer']]){
    const cb=c.$(id); cb.checked=S.layers[cle]!==false;
    cb.onchange=()=>{ S.layers[cle]=cb.checked; c.bumpCities(); try{ c.saveSettings(); }catch(e){} };
  }
  const sommets=c.$('lyMtgL'); if(sommets) sommets.style.display='none'; // greffe montagne : son calque « Sommets » est remplacé par « Montagne »
}

export default {
  init(ctx){ c=ctx; monter(); setTimeout(monter,0); },
  calqueDuType,calqueDe,milieu,
  /** Calque d'un élément de la page (milieu gardé en mémoire tant que le relief ne change pas). */
  calque(e){
    const t=calqueDuType(e); if(t) return t;
    const at=c.terrain&&c.terrain.at;
    if(e._calque&&e._calque.at===at) return e._calque.v;
    const v=calqueDe(e,at?((la,lo)=>c.altitude(la,lo)):null); if(at) e._calque={at,v}; return v;
  },
  /** Point d'entrée de layerOk : l'élément est-il dans un calque allumé ? */
  affiche(e){
    const L=c.S.layers||{}, k=this.calque(e);
    return k==='monuments'?L.monuments!==false:k==='lieux'?L.places!==false:k==='montagne'?L.montagne!==false:L.mer!==false;
  },
  statut(){ const L=(c&&c.S.layers)||{}; return `calques : Lieux ${L.places!==false?'oui':'non'} · Montagne ${L.montagne!==false?'oui':'non'} · Mer ${L.mer!==false?'oui':'non'}`; },
};
