// Greffe « champPhoto » (ajout, éteinte par défaut) : le champ réel des photos d'un appareil, appris une fois puis repris.
// Constat du 14/11/2026 : la v1 déduit le champ d'une photo de la focale « équivalente 24×36 » écrite dans la photo. Pour le Pixel 9 (24 mm), cela
// donne 71,5° sur le grand côté ; les photos disent autre chose : « Caler auto » sur le relief de Morgat trouve 63,5° (±0,2°, trois départs
// différents), les réglages à la main sur Turin 58,5 à 60°, la convergence des verticales de Turin 62 à 68°, et la caméra en direct environ 62°.
// Avec 71,5°, tout le tracé d'une photo est trop serré de 16 % (60 px au bord de l'écran).
// La focale écrite par l'appareil est une valeur nominale : la bonne se mesure. La greffe :
//  - retient, pour chaque appareil et chaque objectif (modèle + focale équivalente), le rapport entre le champ trouvé par « Caler auto » sur le
//    relief et le champ tiré de la photo — seulement si ce calage est précis (écart ≤ 0,35°) et si le champ trouvé n'est pas resté en butée de la
//    recherche (un champ en butée n'est pas mesuré : Turin, en ville) ; plusieurs photos calées font une moyenne, pondérée par leur précision ;
//  - à l'ouverture d'une photo du même appareil, part du champ corrigé et le dit.
// Les réglages à la main ne sont pas retenus : sur des repères proches, une erreur de position GPS se rattrape à tort par le champ.
// Point d'entrée : runAutoAlign (calage sur le relief réussi). Table gardée sous `vh3_champPhoto`.
const RAD=Math.PI/180;
export const COUT_MAX=0.35, BUTEE=11.5, RAPPORT_MIN=0.7, RAPPORT_MAX=1.4, MESURES_MAX=8, CLE='vh3_champPhoto';
/** Champ du grand côté de l'image (°) d'après la focale équivalente 24×36, définie sur la diagonale : le calcul de la v1. Pure. */
export function champExif(f35,w,h){ const dd=2*Math.atan(43.27/2/f35); return 2*Math.atan(Math.tan(dd/2)*Math.max(w,h)/Math.hypot(w,h))/RAD; }
/** Appareil et objectif d'une photo. */
export const cleAppareil=pm=>`${String(pm.model||'appareil inconnu').trim()} · ${pm.f35} mm`;
/** Focale réelle / focale tirée de la photo, d'après les deux champs. Pure. */
export const rapport=(champ,exif)=>Math.tan(exif/2*RAD)/Math.tan(champ/2*RAD);
/** Champ corrigé (au demi-degré, comme la v1). Pure. */
export const corriger=(exif,r)=>Math.round(2*Math.atan(Math.tan(exif/2*RAD)/r)/RAD*2)/2;
/**
 * Table après un calage sur le relief. m : {champ (trouvé), depart (champ avant le calage), exif (champ tiré de la photo), cout (écart, °), photo (clé), t}.
 * Refusé : calage imprécis, champ en butée de la recherche, rapport invraisemblable. Une photo recalée remplace sa mesure précédente. Pure.
 */
export function apprendre(table,cle,m){
  const r=rapport(m.champ,m.exif);
  if(!(m.cout<=COUT_MAX)||!(Math.abs(m.champ-m.depart)<BUTEE)||m.champ===m.depart||!(r>=RAPPORT_MIN&&r<=RAPPORT_MAX)) return table;
  const mesures=((table[cle]&&table[cle].mesures)||[]).filter(x=>x.photo!==m.photo).concat([{r:+r.toFixed(4),cout:+m.cout.toFixed(2),photo:m.photo,t:m.t}]).slice(-MESURES_MAX);
  let sw=0, sl=0; for(const x of mesures){ const w=1/Math.max(0.1,x.cout)**2; sw+=w; sl+=w*Math.log(x.r); }
  return {...table,[cle]:{mesures,rapport:+Math.exp(sl/sw).toFixed(4)}};
}
let c=null, table={}, vue=null, msg='en attente d’une photo';
const ecrire=()=>{ try{ localStorage.setItem(CLE,JSON.stringify(table)); }catch(e){} };
const dire=v=>String(v).replace('.',',');
function majLigne(){
  const el=c.$('g3ChampPhoto'); if(!el) return; const cles=Object.keys(table); el.textContent='';
  if(!cles.length){ el.textContent='Champ des photos : celui écrit dans la photo. « Caler auto » sur une photo face à du relief apprend le champ réel de l’appareil.'; return; }
  el.append(`Champ appris des photos : ${cles.map(k=>`${k} → focale × ${dire(table[k].rapport.toFixed(2))} (${table[k].mesures.length} photo${table[k].mesures.length>1?'s':''} calée${table[k].mesures.length>1?'s':''})`).join(' ; ')} · `);
  const b=document.createElement('a'); b.href='#'; b.id='g3ChampPhotoOubli'; b.textContent='oublier'; b.onclick=e=>{ e.preventDefault(); table={}; ecrire(); majLigne(); c.note('Champ appris des photos oublié : les prochaines photos repartent du champ écrit dans la photo.',5000); }; el.append(b);
}
/** Photo ouverte : si son appareil est connu, le champ part de la valeur apprise. */
function ouvrir(){
  const pm=c.photoMode; if(!pm){ vue=null; msg='en attente d’une photo'; return; }
  if(vue===pm) return; vue=pm;
  if(!pm.f35){ msg='photo sans focale : champ inchangé'; return; }
  const exif=champExif(pm.f35,pm.w,pm.h), a=table[cleAppareil(pm)];
  if(!a){ msg=`${cleAppareil(pm)} : champ ${dire(c.S.camFov)}° d’après la photo (appareil pas encore appris)`; return; }
  const champ=corriger(exif,a.rapport);
  if(c.S.camFov!==Math.round(exif*2)/2){ msg=`${cleAppareil(pm)} : champ déjà réglé à ${dire(c.S.camFov)}°, laissé tel quel`; return; }
  c.S.camFov=champ; const e=c.$('fov'); if(e) e.value=champ; c.showFov(); c.bumpCities();
  msg=`${cleAppareil(pm)} : champ ${dire(champ)}° (appris ; la photo indiquait ${dire(exif.toFixed(1))}°)`;
  c.note(`Champ ${dire(champ)}° : celui appris pour cet appareil (la photo indiquait ${dire((Math.round(exif*2)/2))}°).`,6000);
  c.logNet('Champ de la photo (greffe champPhoto)',true,msg);
}
export default {
  init(ctx){
    c=ctx;
    try{ const v=JSON.parse(localStorage.getItem(CLE)||'{}'); if(v&&typeof v==='object') for(const k of Object.keys(v)) if(v[k]&&v[k].rapport>=RAPPORT_MIN&&v[k].rapport<=RAPPORT_MAX&&Array.isArray(v[k].mesures)) table[k]=v[k]; }catch(e){}
    const info=c.$('photoInfo');
    if(info){ if(!c.$('g3ChampPhoto')){ const s=document.createElement('span'); s.className='hint'; s.id='g3ChampPhoto'; s.style.display='block'; info.after(s); }
      new MutationObserver(ouvrir).observe(info,{childList:true,characterData:true,subtree:true}); }
    majLigne(); ouvrir();
  },
  /** Point d'entrée de runAutoAlign : calage sur le relief réussi, champ trouvé `cam` (il valait `depart`), écart `cout` (°). */
  cale(cam,depart,cout){
    const pm=c.photoMode; if(!pm||!pm.f35) return;
    const cle=cleAppareil(pm), avant=table[cle]&&table[cle].rapport;
    table=apprendre(table,cle,{champ:cam,depart,exif:champExif(pm.f35,pm.w,pm.h),cout,photo:`${pm.date||''}|${pm.lat!=null?pm.lat.toFixed(4)+','+pm.lon.toFixed(4):''}`,t:Date.now()});
    const apres=table[cle]&&table[cle].rapport; if(apres===avant) return;
    ecrire(); majLigne(); msg=`${cle} : champ ${dire(cam)}° retenu d’après ce calage sur le relief (±${dire(cout.toFixed(2))}°)`;
    c.logNet('Champ de la photo (greffe champPhoto)',true,msg+` · focale × ${apres}`);
  },
  ouvrir, etat:()=>({table:JSON.parse(JSON.stringify(table)),msg}),
  statut:()=>`champPhoto : ${msg} · ${Object.keys(table).length} appareil(s) appris${Object.keys(table).map(k=>` · ${k} : focale × ${table[k].rapport}`).join('')}`,
};
