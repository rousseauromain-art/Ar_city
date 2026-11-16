// Greffe « toucher » (ajout, éteinte par défaut) — plan du 16/11, lot R3 : tout nom se touche (constat K6).
// Dans la v1, seuls monuments, pylônes, bateaux et avions ont une zone tactile : toucher un nom de lieu, de sommet ou de zone tombe dans
// la greffe nommer, qui nomme le relief SOUS LE DOIGT, c'est-à-dire sous l'étiquette (toucher « Le Grand Serre » ouvrait « Sirouza »).
// Greffe allumée :
//  - chaque nom écrit (incliné par la v1, à plat ou tenu par la greffe etiquettes) enregistre sa zone tactile : son point et la bande de son
//    étiquette, au même format que les monuments, et le même test unique (hitBest : le plus proche du doigt) ;
//  - un toucher sur un nom ouvre SA fiche : nom, nature, altitude, distance, direction, calque, source, lien vers la carte ; nommer ne répond
//    que si aucun nom, monument, pylône ni mobile n'est sous le doigt ;
//  - la puce « Près de … » (greffe presDe) ouvre la fiche du même lieu.
// Points d'entrée dans draw() (vider, noter) et dans showTelecomDetail (zones, ouvrir).
let c=null; const zones=[];
const NATURE={city:'ville',town:'ville',village:'village',hamlet:'hameau',isolated_dwelling:'lieu-dit',peak:'sommet',cape:'cap',rock:'rocher',
  lighthouse:'phare',beach:'plage',view:'point de vue',heritage:'patrimoine',island:'île',locality:'lieu-dit'};
const SOURCE={osm:'OpenStreetMap',ofm:'OpenFreeMap',gpf:'Geoapify',gnm:'GeoNames',wd:'Wikidata',atlas:'mémoire de l’appareil'};
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
const km=d=>d==null||!isFinite(d)?'—':d<10?d.toFixed(1).replace('.',','):String(Math.round(d));
const POINTS=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSO','SO','OSO','O','ONO','NO','NNO'];

/** Nature d'un élément, en clair. Pure. */
export function nature(t){
  if(t.zone){ const ty=String(t.types||'').split('|').map(s=>s.trim()).filter(Boolean)[0]; return ty||'zone'; }
  if(t.kind==='peak'&&/^(col|pas)\b/i.test(String(t.name||''))) return 'col';
  return NATURE[t.kind]||t.kind||'lieu';
}
/** Source d'un élément, en clair. Pure. */
export function source(t){
  if(t.zone) return 'Wikidata';
  if(t.montagne) return 'OpenStreetMap (sommets dominants)';
  if(t.farPeak) return 'sommets lointains';
  return SOURCE[t.src]||t.src||'liste des lieux (OpenFreeMap, Geoapify, GeoNames, OpenStreetMap)';
}
/** Corps de la fiche d'un nom. Pure (`calque` : nom du calque ou null). */
export function ficheHtml(t,{calque=null}={}){
  const alt=t.ele!=null?t.ele:t.dem!=null?t.dem:null, dir=t.brg!=null?`${Math.round(t.brg)}° (${POINTS[Math.round(((t.brg%360)+360)%360/22.5)%16]})`:'—';
  const vu=t.far?'au-delà de la portée de ce genre':t.hidden?'caché par le relief d’ici':'visible d’ici';
  const lien=isFinite(t.lat)&&isFinite(t.lon)?`<a style="color:#F2C14E" target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=${t.lat.toFixed(5)}&mlon=${t.lon.toFixed(5)}#map=14/${t.lat.toFixed(5)}/${t.lon.toFixed(5)}">voir sur la carte</a>`:'';
  return `<div class="dbgline" style="font-size:18px;font-weight:700;color:#F2C14E">${esc(t.name)}</div>`
    +`<div class="dbgline">${esc(nature(t))}${alt!=null?` · ${Math.round(alt).toLocaleString('fr-FR')} m`:''} · à ${km(t.dist)} km · direction ${dir}</div>`
    +`<div class="dbgline">${vu}${calque?` · calque « ${esc(calque)} »`:''}</div>`
    +`<div class="dbgsec">Source</div><div class="dbgline">${esc(source(t))}</div>`
    +(lien?`<div class="dbgsec">En savoir plus</div><div class="dbgline">${lien}</div>`:'');
}
const NOM_CALQUE={lieux:'Lieux',montagne:'Montagne',mer:'Mer',monuments:'Monuments'};

export default {
  init(ctx){
    c=ctx;
    if(!document.getElementById('g3ToucherSt')){ const st=document.createElement('style'); st.id='g3ToucherSt'; // la rangée des puces ne prend pas les touchers : la puce « Près de » si
      st.textContent='#g3Pres{pointer-events:auto;cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px}'; document.head.appendChild(st); }
    document.addEventListener('click',e=>{ const p=e.target&&e.target.closest&&e.target.closest('#g3Pres'); if(!p) return; // puce « Près de … » : même fiche
      let t=null; try{ t=c.lieuProche&&c.lieuProche(); }catch(er){} if(t) this.ouvrir(t); },true);
  },
  nature,source,ficheHtml,
  /** Point d'entrée de draw : début d'une image. */
  vider(){ zones.length=0; },
  /**
   * Point d'entrée de draw : un nom vient d'être écrit. `boite` : entrée de `placed` ([x0,x1,y0,y1,poly?]) ou [x0,x1,y0,y1].
   * Zone = le point du lieu (icône de 16 px) et la bande de son étiquette.
   */
  noter(t,boite,x,ay,roll){
    if(!t||!boite) return;
    const poly=boite[4]||[[boite[0],boite[2]],[boite[1],boite[2]],[boite[1],boite[3]],[boite[0],boite[3]]];
    zones.push({t,roll:roll||0,nom:true,poly,icon:[x-8,x+8,ay-8,ay+8],x0:boite[0],x1:boite[1],y0:boite[2],y1:boite[3]});
  },
  /** Zones de l'image en cours, pour hitBest. */
  zones:()=>zones,
  /** Ouvre la fiche d'un nom. */
  ouvrir(t){
    const k=window.G&&window.G.actif('calques')?window.G.calques.calque(t):null;
    c.fiche(String(t.name),ficheHtml(t,{calque:k?NOM_CALQUE[k]||k:null}));
  },
  statut:()=>`toucher : ${zones.length} nom(s) touchable(s) sur l’image`,
};
