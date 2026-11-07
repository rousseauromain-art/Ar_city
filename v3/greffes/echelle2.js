// Greffe « echelle2 » (ajout, éteinte par défaut) : échelle du champ sur 2 points (v2/src/calage/echelle.js, étendu au soleil et à la lune).
// Deux calages au doigt successifs (bouton « Pointer », puis toucher) sur deux références connues — soleil, lune ou monument/lieu — à plus de 10° l'une de
// l'autre et à moins de 60 s d'intervalle donnent d'un coup la focale (donc le champ) ET le cap. Le téléphone peut tourner entre les deux touchers :
// la rotation mesurée par les capteurs entre les deux est retranchée. Point d'entrée : fin de pointCalibrate.
const RAD=Math.PI/180, wrap=a=>((a+540)%360)-180;
export const ECART_MIN_DEG=10, ECART_MIN_ECRAN=0.2, DELAI_MS=60000, CHAMP_MIN=20, CHAMP_MAX=110;
let c=null, premier=null;
/**
 * Pur : focale et décalage de cap d'après deux points. p = {x (abscisse dans le repère compensé du roulis, depuis le centre), b (relèvement vrai), raw (cap brut des capteurs au toucher)}.
 * @returns {{ok:true, f:number, off:number} | {ok:false, message:string}}
 */
export function resoudre(a,b,W){
  const delta=wrap((b.b-b.raw)-(a.b-a.raw)); // écart angulaire vu à l'écran entre les deux points (rotation du téléphone retranchée)
  if(Math.abs(wrap(b.b-a.b))<ECART_MIN_DEG) return {ok:false,message:`les deux références ne sont écartées que de ${Math.abs(wrap(b.b-a.b)).toFixed(1)}° : choisissez-en deux à plus de ${ECART_MIN_DEG}°`};
  if(Math.abs(b.x-a.x)<ECART_MIN_ECRAN*W&&Math.abs(b.raw-a.raw)<1) return {ok:false,message:'les deux points touchés sont trop proches sur l’écran'};
  const ecartPour=f=>Math.atan(b.x/f)-Math.atan(a.x/f), cible=delta*RAD;
  if(ecartPour(W/40)*cible<=0) return {ok:false,message:'les deux références sont dans l’ordre inverse de l’écran : vérifiez lesquelles vous avez touchées'};
  let lo=W/40, hi=W*40;
  if(Math.abs(ecartPour(lo))<Math.abs(cible)) return {ok:false,message:'écart impossible à cette distance sur l’écran : références mal identifiées ?'};
  for(let i=0;i<80;i++){ const m=(lo+hi)/2; if(Math.abs(ecartPour(m))>Math.abs(cible)) lo=m; else hi=m; }
  const f=(lo+hi)/2, offA=wrap(a.b-a.raw-Math.atan(a.x/f)/RAD), offB=wrap(b.b-b.raw-Math.atan(b.x/f)/RAD);
  return {ok:true,f,off:wrap(offA+wrap(offB-offA)/2)};
}
export default {
  init(ctx){ c=ctx; },
  oublier(){ premier=null; },
  /** Après un calage au doigt réussi. best : la référence touchée ; lx : abscisse du toucher compensée du roulis ; P : pose AVANT correction ; h0 : S.headOff avant correction. */
  noter(best,lx,P,h0){
    if(!best||best.brg==null) return;
    const S=c.S, W=c.W, nom=best.name==='soleil'||best.name==='lune'?best.name:(best.kind==='monument'?c.monName(best):best.name);
    const pt={x:lx-W/2,b:best.brg,raw:wrap(P.heading-h0),t:Date.now(),nom};
    if(!premier||pt.t-premier.t>DELAI_MS||premier.nom===nom){ premier=pt; return; }
    const a=premier; premier=null;
    const r=resoudre(a,pt,W); if(!r.ok){ c.note('Champ non calé : '+r.message,7000); return; }
    const affiche=2*Math.atan((W/2)/r.f)/RAD;
    if(c.vFovFor(CHAMP_MIN)>affiche||c.vFovFor(CHAMP_MAX)<affiche){ c.note(`Champ non calé : champ trouvé (${affiche.toFixed(0)}°) hors des valeurs possibles`,7000); return; }
    let lo=CHAMP_MIN, hi=CHAMP_MAX; for(let i=0;i<60;i++){ const m=(lo+hi)/2; if(c.vFovFor(m)<affiche) lo=m; else hi=m; }
    const ancien=S.camFov, ancienCap=S.headOff; S.camFov=Math.round((lo+hi))/2; S.headOff=r.off;
    const e=c.$('fov'); if(e) e.value=S.camFov; c.showFov(); c.saveSettings(); c.noteCalib(); c.bumpCities();
    c.note(`Champ calé : ${ancien}° → ${S.camFov}° (affiché ${affiche.toFixed(0)}°) · cap ${wrap(S.headOff-ancienCap)>=0?'+':''}${wrap(S.headOff-ancienCap).toFixed(1)}° · avec « ${a.nom} » et « ${nom} »`,9000);
    c.logNet('Calage',true,`échelle sur 2 points : champ ${ancien}° → ${S.camFov}°, références ${a.nom} / ${nom}`);
  },
};
