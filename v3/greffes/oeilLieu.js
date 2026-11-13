// Greffe « oeilLieu » (ajout, éteinte par défaut) : la hauteur d'œil appartient au lieu. Constat du 13/11/2026 (photo de Turin, prise debout sur
// la place) : le relief était calculé pour un œil à +13 m, une correction réglée un autre jour, ailleurs — la v1 garde une seule hauteur d'œil
// pour tous les lieux et pour toutes les photos.
//  - En direct : une correction réglée à la main (curseur, étage, puce « œil ») est notée avec l'endroit où elle a été réglée. À plus de 150 m de
//    là, la hauteur d'œil revient à 0 (au sol) ; de retour, elle est reprise. Une correction dont on ne sait pas où elle a été réglée (celle
//    d'avant la greffe) n'est pas gardée.
//  - Sur une photo rejouée : la hauteur d'œil est celle de la photo, pas celle du lieu où l'on se trouve. Elle est déduite de l'altitude
//    enregistrée dans la photo (au-dessus de l'ellipsoïde sur Android : le géoïde est retranché) comparée au sol du modèle de terrain, une fois
//    le relief fin chargé : moins de 10 m d'écart, la photo est prise du sol (l'altitude d'un téléphone est juste à quelques mètres près : sur
//    les quatre photos d'essai, −6 à +3 m) ; à partir de 10 m, l'écart devient la hauteur d'œil (immeuble, tour, belvédère construit). Un
//    rempart ou une terrasse de moins de 10 m ne se distingue pas ainsi : le modèle de terrain fin les contient souvent déjà (Saint-Malo :
//    sol lu à 12,5 m sur le rempart) ; sinon, la correction à la main reste possible, et elle est gardée pour l'endroit de la photo.
// Tout passe par le curseur de la v1 (#obsH) : même calcul, même mémoire. Lieux réglés gardés sous `vh3_oeilLieu` (30 au plus).
// Point d'entrée : exifTiff (altitude de la photo). Le reste est suivi sans toucher au code de la v1 (position et sol relus chaque seconde).
import {ondulationGeoide} from './_geoide-egm96.js';
export const RAYON_LIEU_M=150, SEUIL_PHOTO_M=10, OEIL_M=1.6, LIEUX_MAX=30, CLE='vh3_oeilLieu';
/** Altitude déjà au-dessus du niveau de la mer (iPhone, appareils photo) ; sinon au-dessus de l'ellipsoïde (téléphones Android). */
export const NIVEAU_MER=/apple|canon|nikon|fuji|olympus|om digital|panasonic|gopro|dji|garmin|ricoh|pentax|leica/i;
const RAD=Math.PI/180;
export function distanceM(a,b){ return Math.hypot((a.lat-b.lat)*111320,(a.lon-b.lon)*111320*Math.cos((a.lat+b.lat)/2*RAD)); }
/** Le lieu réglé à la main le plus proche de p, à `rayon` mètres au plus ; null sinon. Pure. */
export function lieuProche(lieux,p,rayon=RAYON_LIEU_M){
  let m=null, dm=rayon; for(const l of lieux||[]){ const d=distanceM(l,p); if(d<=dm){ m=l; dm=d; } } return m;
}
/** Liste des lieux après un réglage à la main de `h` mètres en p : il remplace ceux du voisinage. Un réglage à 0 est gardé (« ici, au sol »). Pure. */
export function noter(lieux,p,h,t=0,rayon=RAYON_LIEU_M){
  const r=(lieux||[]).filter(l=>distanceM(l,p)>rayon);
  r.push({lat:+p.lat.toFixed(5),lon:+p.lon.toFixed(5),h,t}); return r.slice(-LIEUX_MAX);
}
/** Hauteur d'œil d'une photo d'après son altitude. photo : {alt (m, EXIF), make} ; ondulation du géoïde et sol du modèle (m). Pure. */
export function deciderPhoto(photo,ondulationM,solM){
  if(!photo||typeof photo.alt!=='number'||!Number.isFinite(photo.alt)) return {source:'sans altitude',correction:0,texte:'au sol (pas d’altitude dans la photo)'};
  if(solM==null||!Number.isFinite(solM)) return {source:'sol inconnu',correction:0,texte:'au sol (sol du modèle inconnu)'};
  const mer=NIVEAU_MER.test(photo.make||''), altitude=photo.alt-(mer?0:ondulationM), exces=altitude-solM-OEIL_M;
  const detail=`altitude de la photo ${Math.round(altitude)} m${mer?'':` (géoïde ${Math.round(ondulationM)} m retranché)`}, sol ${Math.round(solM)} m`;
  if(exces>=SEUIL_PHOTO_M){ const correction=Math.min(250,Math.round(exces)); return {source:'altitude',correction,altitude,exces,texte:`en hauteur, œil à +${correction} m du sol (${detail})`}; }
  return {source:'altitude',correction:0,altitude,exces,texte:`au sol (${detail} : écart de ${exces<0?'−':'+'}${Math.abs(exces).toFixed(0)} m, moins de ${SEUIL_PHOTO_M} m)`};
}
let c=null, lieux=[], moi=false, vu=null, photo=null, enAttente=null, msg='en attente de la position';
const fmt=v=>(v>0?'+':v<0?'−':'')+Math.abs(v)+' m';
const actuelle=()=>+c.S.obsHeight||0;
function sauver(){ try{ localStorage.setItem(CLE,JSON.stringify(lieux)); }catch(e){} }
/** Règle la hauteur d'œil par le curseur de la v1 (libellé, mémoire, recalcul du relief) ; `force` : recalcul même si la valeur ne change pas. */
function regler(v,force){
  const s=c.$('obsH'); if(!s||(!force&&actuelle()===v)) return false;
  moi=true; try{ s.value=String(v); s.dispatchEvent(new Event('input')); s.dispatchEvent(new Event('change')); } finally { moi=false; }
  return true;
}
/** Réglage à la main (curseur, étage, puce « œil ») : noté avec l'endroit ; sur une photo, avec l'endroit de la photo. */
function surReglage(){
  if(moi) return; const p=c.pos, h=actuelle();
  if(!p){ enAttente=h; return; }
  lieux=noter(lieux,p,h,Date.now()); sauver(); vu={lat:p.lat,lon:p.lon};
  msg=`${fmt(h)} réglée à la main ${c.photoMode?'pour l’endroit de cette photo':'ici'}`;
  if(photo){ photo.attente=false; photo.decision={source:'main',correction:h,texte:`${fmt(h)}, réglée à la main pour l’endroit de cette photo`}; }
}
/** En direct : la hauteur d'œil est celle réglée ici (à 150 m près), sinon 0. Réévaluée à la première position puis tous les 30 m. */
function direct(){
  const p=c.pos; if(!p) return;
  if(enAttente!=null){ lieux=noter(lieux,p,enAttente,Date.now()); sauver(); enAttente=null; }
  if(vu&&distanceM(vu,p)<30) return; vu={lat:p.lat,lon:p.lon};
  const l=lieuProche(lieux,p), veut=l?l.h:0, avant=actuelle();
  if(veut===avant){ msg=l?`${fmt(veut)}, réglée ici à la main`:'au sol (aucune hauteur réglée ici)'; return; }
  regler(veut);
  if(l){ msg=`${fmt(veut)} reprise : réglée ici à la main`; c.note(`Hauteur d’œil ${fmt(veut)} reprise : celle réglée ici.`,5000); }
  else { const pres=lieux.filter(x=>x.h===avant).map(x=>distanceM(x,p)).sort((a,b)=>a-b)[0];
    msg=`remise à 0 : ${fmt(avant)} avait été réglée ${pres!=null?`à ${pres<1000?Math.round(pres)+' m':(pres/1000).toFixed(1)+' km'} d’ici`:'ailleurs ou avant cette greffe'}`;
    c.note(`Hauteur d’œil ${fmt(avant)} remise à 0 : elle avait été réglée ${pres!=null?'ailleurs':'ailleurs (ou avant cette fonction)'}. Si vous êtes en hauteur ici, réglez-la de nouveau : elle sera gardée pour ce lieu.`,8000); }
}
/** Photo rejouée : hauteur réglée à la main pour cet endroit, sinon déduite de l'altitude de la photo dès que le relief fin donne le sol. */
function surPhoto(pm){
  const p=c.pos; if(!p) return;
  if(!photo||photo.ref!==pm){
    const avant=actuelle(), l=lieuProche(lieux,p); photo={ref:pm,avant,attente:!l,decision:null};
    if(l){ photo.decision={source:'main',correction:l.h,texte:`${fmt(l.h)}, réglée à la main pour l’endroit de cette photo`}; regler(l.h); msg='photo : '+photo.decision.texte; return; }
    // sol relu à l'endroit de la photo : la v1 ne recalcule pas le relief à moins de 300 m du précédent
    const t=c.terrain; regler(0,!c.terrainBusy&&!!t&&distanceM(t.c,p)>30); msg='photo : au sol en attendant le sol du relief fin';
  }
  if(!photo.attente) return;
  const t=c.terrain; if(c.terrainBusy||!t||t.refining||t.partial||distanceM(t.c,p)>30||c.obsGround==null) return;
  const d=deciderPhoto(pm,ondulationGeoide(p.lat,p.lon),c.obsGround); photo.attente=false; photo.decision=d; msg='photo : '+d.texte;
  regler(d.correction);
  if(d.correction) c.note(`Photo prise en hauteur : œil à +${d.correction} m du sol, d’après l’altitude de la photo (${Math.round(d.altitude)} m pour un sol à ${Math.round(c.obsGround)} m). À corriger dans les Réglages si besoin.`,8000);
  else if(photo.avant) c.note(`Hauteur d’œil ${fmt(photo.avant)} non reprise pour cette photo (réglée ailleurs) : photo prise du sol d’après son altitude.`,7000);
  c.logNet('Hauteur d’œil (greffe oeilLieu)',true,'photo : '+d.texte);
}
function suivre(){
  const pm=c.photoMode;
  if(pm) return surPhoto(pm);
  if(photo){ photo=null; vu=null; } // photo quittée : retour à la hauteur du lieu où l'on est
  direct();
}
export default {
  init(ctx){
    c=ctx;
    try{ const v=JSON.parse(localStorage.getItem(CLE)||'[]'); if(Array.isArray(v)) lieux=v.filter(l=>l&&Number.isFinite(l.lat)&&Number.isFinite(l.lon)&&Number.isFinite(l.h)); }catch(e){}
    for(const id of ['obsH','floorN']){ const el=c.$(id); if(el) el.addEventListener('change',surReglage); }
    const info=c.$('photoInfo'); if(info) new MutationObserver(suivre).observe(info,{childList:true,characterData:true,subtree:true}); // photo ouverte ou quittée : tout de suite
    setInterval(suivre,1000); suivre();
  },
  /** Point d'entrée d'exifTiff : altitude enregistrée dans la photo (GPSAltitude, négative sous le niveau de référence). */
  exif(r,gps){ const a=gps&&gps[6]; if(typeof a==='number'&&Number.isFinite(a)) r.alt=gps[5]===1?-a:a; },
  suivre, etat:()=>({lieux:lieux.map(l=>({...l})),photo:photo&&{attente:photo.attente,decision:photo.decision&&{...photo.decision}},msg}),
  statut:()=>`oeilLieu : ${msg} · ${lieux.length} lieu(x) avec une hauteur réglée à la main (gardée à ${RAYON_LIEU_M} m près)`,
};
