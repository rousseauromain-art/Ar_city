// Greffe « boussoleA » (remplacement, éteinte par défaut) : correctif A de docs/VEILLE-ANCRAGE.md §4 (v2/src/entrees/capteurs.js).
// v1 : « désaccord boussole / gyroscope > 40° pendant 2 s → retour à la boussole, calage défait » (saut de 45° vu à Grenelle).
// Greffe : retour à la boussole SEULEMENT sur un vrai saut du repère du gyroscope (cap relatif brut qui change de plus de 40° d'une mesure à la suivante,
// à moins de 0,5 s d'intervalle, caméra pas trop levée ni baissée) ou à la réouverture de l'appli / de la caméra ; un désaccord sans saut = « boussole
// perturbée » : ignorée (le cap suit le gyroscope, le calage tient), de nouveau fiable après 2 s d'accord. Point d'entrée : gyroLearn.
const RAD=Math.PI/180, wrap=a=>((a+540)%360)-180;
export const GYRO_SAUT_DEG=40, ACCORD_RETABLI_MS=2000, SAUT_INSTANTANE_DEG=40, SAUT_ECART_MAX_MS=500, INCLINAISON_CAP_DEFINI_DEG=70;
const f={relBrut:null,relBrutT:0,saut:false,reouverture:false,perturbee:false,accordDepuis:0,sauts:0,perturbations:0};
/** Axe de la caméra arrière (Est/Nord/Haut) d'après alpha, beta, gamma (comme `camAxes` de la v1). */
function axe(alpha,beta,gamma){ const a=alpha*RAD,b=beta*RAD,g=gamma*RAD, cA=Math.cos(a),sA=Math.sin(a),cB=Math.cos(b),sB=Math.sin(b),cG=Math.cos(g),sG=Math.sin(g);
  return [-(cG*sA*sB+cA*sG),-(sA*sG-cA*cG*sB),-(cB*cG)]; }
/** Une mesure du repère relatif (brute, non lissée). */
export function mesureRelative(e,t){
  if(e.alpha==null||e.beta==null||e.gamma==null) return;
  const v=axe(e.alpha,e.beta,e.gamma), incl=Math.asin(Math.max(-1,Math.min(1,v[2])))/RAD, cap=(Math.atan2(v[0],v[1])/RAD+360)%360, defini=Math.abs(incl)<INCLINAISON_CAP_DEFINI_DEG;
  if(defini&&f.relBrut!==null&&t-f.relBrutT<SAUT_ECART_MAX_MS&&Math.abs(wrap(cap-f.relBrut))>SAUT_INSTANTANE_DEG) f.saut=true;
  f.relBrut=defini?cap:null; f.relBrutT=t;
}
/** Remplace la règle des 2 s de la v1 : 'saut' (réinitialiser le repère, retour à la boussole), 'perturbee' (ignorer la boussole) ou null (comme d'habitude). */
export function evaluer(diff,gyroK,t){
  if(gyroK!==null&&(f.saut||f.reouverture)){ f.saut=false; f.reouverture=false; f.perturbee=false; f.accordDepuis=0; f.sauts++; return 'saut'; }
  const desaccord=gyroK!==null&&Math.abs(wrap(diff-gyroK))>GYRO_SAUT_DEG;
  if(desaccord){ f.accordDepuis=0; if(!f.perturbee){ f.perturbee=true; f.perturbations++; } return 'perturbee'; }
  if(f.perturbee){ if(!f.accordDepuis) f.accordDepuis=t; if(t-f.accordDepuis>ACCORD_RETABLI_MS){ f.perturbee=false; f.accordDepuis=0; return null; } return 'perturbee'; }
  return null;
}
export default {
  init(){
    addEventListener('deviceorientation',e=>{ if(e.absolute!==true) mesureRelative(e,Date.now()); });
    document.addEventListener('visibilitychange',()=>{ if(!document.hidden){ f.reouverture=true; f.relBrut=null; } });
  },
  evaluer, mesureRelative, etat:()=>({...f}),
  statut:()=>`boussoleA : ${f.perturbee?'boussole perturbée, ignorée':'boussole écoutée'} · ${f.sauts} vrai(s) saut(s) du gyroscope · ${f.perturbations} perturbation(s) ignorée(s)`,
};
