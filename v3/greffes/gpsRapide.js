// Greffe « gpsRapide » (ajout, éteinte par défaut). Constat de la sortie de Pont-en-Royans (14/11) : `watchPosition(…, {enableHighAccuracy:true, maximumAge:5000, timeout:20000})` n'accepte
// qu'une position de moins de 5 s ; en gorge, le premier point tarde, l'écran reste « en attente du GPS » et, après un déplacement, le relief reste celui du lieu précédent
// (il n'est recalculé qu'à 300 m d'écart, à l'arrivée d'un nouveau point) : « Caler » travaille alors sur un relief faux. Une application native démarre sur la dernière position connue du système.
// La greffe, appelée au démarrage du GPS (point d'entrée dans le gestionnaire du bouton de départ) :
//  - demande la dernière position connue du système (getCurrentPosition, MAX_AGE_MS = 10 min, précision réseau acceptée) et, tant qu'aucun point n'est arrivé, la donne à la page comme position ;
//    une puce la dit « ancienne » (« il y a 4 min ») jusqu'au premier vrai point (le gestionnaire de la v1 est inchangé : il remplace la position à l'arrivée du point) ;
//  - suit les vrais points (un second watchPosition, sans coût : le système partage la mesure) et affiche une puce quand le dernier point a plus de TARDE_MS : le GPS tarde.
export const MAX_AGE_MS=600000, TARDE_MS=45000;
let c=null, puce=null, ancienne=null, dernierPoint=0, precision=null, vu=false;
const min=ms=>ms<90000?Math.max(1,Math.round(ms/1000))+' s':Math.round(ms/60000)+' min';
/** Texte de la puce : null quand tout va bien. `now`, `age` (ms depuis la position ancienne, ou null), `dernier` (date du dernier vrai point, ou 0). Pure. */
export function message({now,ancienne,dernier,precision}){
  if(dernier){ const t=now-dernier; return t>TARDE_MS?`GPS : dernier point il y a ${min(t)}${precision!=null?` (±${Math.round(precision)} m)`:''} — le relief peut être celui du lieu précédent`:null; }
  if(ancienne!=null) return `Position ancienne (il y a ${min(ancienne)}) — en attente du GPS`;
  return null;
}
function maj(){
  if(!puce) return; const now=Date.now();
  const t=message({now,ancienne:ancienne&&!dernierPoint?now-ancienne.t:null,dernier:dernierPoint,precision});
  puce.hidden=!t; if(t&&puce.textContent!==t) puce.textContent=t;
}
export default {
  init(ctx){ c=ctx; const st=c.$('status'); if(st&&!c.$('g3Gps')){ puce=Object.assign(document.createElement('div'),{id:'g3Gps',className:'chip',hidden:true}); st.after(puce); setInterval(maj,2000); } },
  MAX_AGE_MS,TARDE_MS,message,
  /** Point d'entrée : au démarrage du GPS. */
  demarrer(){
    if(vu||!navigator.geolocation||!c) return; vu=true;
    try{ navigator.geolocation.getCurrentPosition(p=>{
      if(dernierPoint||c.pos) return; // un vrai point (ou une position simulée) est déjà là
      ancienne={t:p.timestamp||Date.now(),acc:p.coords.accuracy}; c.onNewPos(p.coords.latitude,p.coords.longitude,p.coords.accuracy); maj();
    },()=>{},{enableHighAccuracy:false,maximumAge:MAX_AGE_MS,timeout:8000}); }catch(e){}
    try{ navigator.geolocation.watchPosition(p=>{ dernierPoint=Date.now(); precision=p.coords.accuracy; maj(); },()=>{},{enableHighAccuracy:true,maximumAge:5000,timeout:20000}); }catch(e){}
  },
  /** Pour les tests. */
  etat:()=>({ancienne,dernierPoint,precision,texte:puce&&!puce.hidden?puce.textContent:''}),
  maj,
  statut:()=>`gpsRapide : ${dernierPoint?'dernier vrai point il y a '+min(Date.now()-dernierPoint):ancienne?'position ancienne (il y a '+min(Date.now()-ancienne.t)+')':'aucune position'}`,
};
