// Greffe « nettete » (ajout, éteinte par défaut) : mise au point de la caméra fixée à l'infini. Constat du 11/11/2026 : après un calage sur le
// soleil, l'image du paysage reste floue — la mise au point automatique continue du téléphone décroche sur le soleil (éblouissement, aucun
// contraste) et ne revient pas sur un paysage lointain et peu contrasté. Tout ce que l'appli regarde est à plus de quelques dizaines de mètres :
// la mise au point n'a pas à bouger. La greffe la règle au plus loin (`focusMode: manual`, `focusDistance` au maximum), à chaque ouverture de la
// caméra ; si le téléphone ne le permet pas, elle relance la mise au point continue ; sinon elle ne touche à rien et le dit dans le Diagnostic.
// PeakFinder laisse la mise au point continue du système (lu dans son APK) ; une page web peut faire mieux pour un paysage.
// Point d'entrée : startCamera (après l'ouverture du flux).
export const ESSAIS_MS=[0,700,2000]; // Chrome ne donne parfois les réglages de la caméra qu'un instant après l'ouverture
/** Réglage à demander d'après ce que la caméra permet (`MediaStreamTrack.getCapabilities()`) ; null si elle ne permet rien. Pure. */
export function choisir(caps){
  if(!caps) return null;
  const modes=Array.isArray(caps.focusMode)?caps.focusMode:[], fd=caps.focusDistance;
  if(modes.includes('manual')&&fd&&isFinite(fd.max)&&isFinite(fd.min)&&fd.max>fd.min&&fd.max>=1)
    return {mode:'infini',texte:`fixée à l’infini (au plus loin : ${fd.max>=100?'∞':fd.max.toFixed(1)+' m'})`,contraintes:{advanced:[{focusMode:'manual',focusDistance:fd.max}]}};
  if(modes.includes('continuous')) return {mode:'continu',texte:'continue, relancée (ce téléphone ne permet pas de la fixer)',contraintes:{advanced:[{focusMode:'continuous'}]}};
  return null;
}
let c=null, tour=0;
const etat={mode:'attente',texte:'en attente de la caméra',erreur:''};
/** Point d'entrée de startCamera : règle la mise au point du flux qui vient de s'ouvrir. */
async function regler(flux){
  const moi=++tour, piste=flux&&flux.getVideoTracks&&flux.getVideoTracks()[0];
  if(!piste||typeof piste.getCapabilities!=='function'||typeof piste.applyConstraints!=='function'){ Object.assign(etat,{mode:'aucun',texte:'non réglable par ce navigateur',erreur:''}); return etat; }
  etat.erreur='';
  for(const ms of ESSAIS_MS){
    if(ms) await new Promise(r=>setTimeout(r,ms));
    if(moi!==tour||piste.readyState==='ended') return etat; // caméra rouverte entre-temps : c'est l'autre appel qui règle
    let ch=null; try{ ch=choisir(piste.getCapabilities()); }catch(e){ etat.erreur=String(e&&e.message||e); }
    if(!ch) continue;
    try{ await piste.applyConstraints(ch.contraintes); Object.assign(etat,{mode:ch.mode,texte:ch.texte});
      c.logNet('Caméra (greffe nettete)',true,'mise au point '+ch.texte); return etat; }
    catch(e){ etat.erreur=String(e&&e.message||e); }
  }
  Object.assign(etat,{mode:'aucun',texte:'non réglable sur ce téléphone (mise au point automatique du navigateur)'});
  c.logNet('Caméra (greffe nettete)',false,'mise au point '+etat.texte+(etat.erreur?' : '+etat.erreur:''));
  return etat;
}
export default {
  init(ctx){ c=ctx; const v=c.$('cam'); if(v&&v.srcObject) regler(v.srcObject); }, // caméra déjà ouverte avant le chargement de la greffe
  regler, choisir, etat:()=>({...etat}),
  statut:()=>`nettete : mise au point ${etat.texte}${etat.erreur&&etat.mode==='aucun'?' · '+etat.erreur:''}`,
};
