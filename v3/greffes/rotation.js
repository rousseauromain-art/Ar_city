// Greffe « rotation » (ajout, éteinte par défaut) : message « Téléphone en paysage, écran en portrait : activez la rotation automatique » (v2/src/entrees/rotation.js).
// En direct seulement : roulis de plus de 50° pendant plus de 1,5 s alors que l'écran est en portrait ; maintien tant que le roulis dépasse 35°, sortie après 2 s
// continues hors condition, pause de 5 min comptée depuis la sortie ; un toucher le ferme. Aucun point d'entrée dans le code de la v1 (lecture de la pose).
export const ROULIS_PAYSAGE_DEG=50, ROULIS_SORTIE_DEG=35, DUREE_MIN_MS=1500, SORTIE_MS=2000, PAUSE_MS=5*60*1000;
export const MESSAGE='Téléphone en paysage, écran en portrait : activez la rotation automatique (réglages rapides d\'Android)';
export const etatInitial=()=>({depuis:null,actif:false,dernier:null,hors:null});
/** Pur : nouvel état et « afficher maintenant ». */
export function evaluer(e,{direct,roulis,typeEcran,t}){
  const portrait=direct&&/^portrait/.test(typeEcran||''), r=Math.abs(roulis), entree=portrait&&r>ROULIS_PAYSAGE_DEG, maintien=portrait&&r>ROULIS_SORTIE_DEG;
  if(e.actif){ if(maintien) return {etat:{...e,hors:null},avertir:true};
    const hors=e.hors??t; if(t-hors>SORTIE_MS) return {etat:{depuis:null,actif:false,dernier:t,hors:null},avertir:false};
    return {etat:{...e,hors},avertir:true}; }
  if(!entree) return {etat:{depuis:null,actif:false,dernier:e.dernier,hors:null},avertir:false};
  const depuis=e.depuis??t, ok=t-depuis>DUREE_MIN_MS&&(e.dernier===null||t-e.dernier>=PAUSE_MS);
  return ok?{etat:{depuis,actif:true,dernier:e.dernier,hors:null},avertir:true}:{etat:{...e,depuis,hors:null},avertir:false};
}
let etat=etatInitial();
export default {
  init(c){
    const b=document.createElement('div'); b.id='g3Rot'; b.setAttribute('role','alert'); b.textContent=MESSAGE; b.hidden=true;
    b.style.cssText='position:absolute;left:50%;top:calc(var(--safe-t) + 80px);transform:translateX(-50%);max-width:min(420px,86vw);z-index:7;padding:12px 14px;border-radius:6px;background:rgba(14,26,43,.92);border:1px solid #E0A526;color:#F3E9D2;font:600 14px/1.35 var(--display);text-align:center';
    b.addEventListener('click',()=>{ etat={depuis:null,actif:false,dernier:Date.now(),hors:null}; b.hidden=true; });
    (c.$('stage')||document.body).appendChild(b);
    setInterval(()=>{
      const typeEcran=screen.orientation&&screen.orientation.type, P=c.pose();
      const r=evaluer(etat,{direct:!c.photoMode&&c.sensor,roulis:P.roll,typeEcran,t:Date.now()}); etat=r.etat; b.hidden=!r.avertir;
    },250);
  },
  etat:()=>etat,
};
