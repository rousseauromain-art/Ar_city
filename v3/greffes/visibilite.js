// Greffe « visibilite » (remplacement, éteinte par défaut) — plan du 16/11, lot R1 : n'écrire que ce qui se voit (constat K5).
// Dans la v1, deux cases répondent à la même question : « Masquer ce qui est caché par le relief » (décochée, la v1 pose tous les noms
// sur la ligne d'horizon et ne masque rien : 20 noms au lieu de 13 sur la vue des gorges, dont des villages derrière le plateau) et
// « Visibilité d'après la photo » (qui masque à tort dès que le calage est faux de plus de 0,5°, et sur une seule lecture). Greffe allumée :
//  - le test du relief est TOUJOURS appliqué aux noms (plus de mode « tout sur l'horizon ») ; « Tout voir » reste le moyen de montrer les
//    cachés, en fantômes ;
//  - une seule case, « N'afficher que ce qui se voit — affiner avec la photo », remplace les deux : la lecture de la photo n'est qu'un
//    affinage (objet proche devant), appliqué seulement quand la silhouette lue suit le relief calculé à ACCORD_DEG près (calage sûr) et
//    jamais sur une seule lecture (deux lectures sûres de suite) ;
//  - zones (greffe zones) : ponctuelles (col, pas, grotte, scialet, trou, cascade…) testées comme un point ; étendues (gorges, massif,
//    crête, forêt…) visibles si une partie se voit : le centre ou l'un des points de deux anneaux autour de lui.
// Points d'entrée : applyOcclusion (zones), photoFresh (affinage), et G.lier (skylineElevAt, voirPoint).
export const ACCORD_DEG=0.5, ANNEAUX_KM=[1,3], POINTS_PAR_ANNEAU=8;
let c=null, derniere=null, sureCourante=false, surePrecedente=false;
const RAD=Math.PI/180;

/** Écart médian (°) entre la silhouette lue dans l'image et le relief calculé ; null si trop peu de colonnes comparables. Pure. */
export function ecartMedian(cols,reliefA){
  const d=[];
  for(const col of cols||[]){ const t=reliefA(col.brg); if(t==null||!isFinite(t)||!isFinite(col.a)) continue; d.push(Math.abs(col.a-t)); }
  if(d.length<8) return null;
  d.sort((a,b)=>a-b); return d[Math.floor(d.length/2)];
}
/** Points de l'anneau de rayon `km` autour de (lat, lon). Pure. */
export function anneau(lat,lon,km,n=POINTS_PAR_ANNEAU){
  const out=[], dLat=km/111.32, dLon=km/(111.32*Math.max(0.2,Math.cos(lat*RAD)));
  for(let i=0;i<n;i++){ const a=2*Math.PI*i/n; out.push({lat:lat+dLat*Math.cos(a),lon:lon+dLon*Math.sin(a)}); }
  return out;
}
/** Une zone est-elle cachée ? `r` : verdict de la v1 pour son centre ; `voir(lat,lon)` → vrai si ce point se voit (null : inconnu). Pure. */
export function zoneCachee(z,r,voir){
  if(!r||!r.hidden) return false;                // le centre se voit
  if(z.nature==='point') return true;            // un col, une grotte : un lieu précis, caché comme un point
  for(const km of ANNEAUX_KM) for(const p of anneau(z.lat,z.lon,km)){ const v=voir(p.lat,p.lon); if(v===true) return false; }
  return true;
}

function remplacerCases(){
  const rel=c.$('rel'), phv=c.$('phv'); if(!rel||!phv||c.$('g3Vis')) return;
  const rowRel=rel.closest('.row'), rowPhv=phv.closest('.row');
  const row=document.createElement('div'); row.className='row'; row.id='g3VisRow';
  row.innerHTML='<label for="g3Vis">N’afficher que ce qui se voit — affiner avec la photo (objet proche devant)</label><input type="checkbox" id="g3Vis">'
    +'<span class="hint">Le relief est toujours appliqué : un nom caché par le relief n’est écrit qu’en « Tout voir ». La photo n’affine que si sa silhouette suit le relief à 0,5° près, deux lectures de suite.</span>';
  rowPhv.before(row); rowPhv.style.display='none'; rowRel.style.display='none';
  const cb=c.$('g3Vis'); cb.checked=c.S.photoVis===true;
  cb.addEventListener('change',()=>{ phv.checked=cb.checked; phv.dispatchEvent(new Event('change')); });
}

export default {
  init(ctx){
    c=ctx;
    if(c.S.relief!==true){ c.S.relief=true; try{ c.saveSettings(); }catch(e){} } // le relief n'est plus une option : la case disparaît
    remplacerCases();
  },
  ACCORD_DEG,ecartMedian,anneau,
  /** Point d'entrée d'applyOcclusion : zone (greffe zones) cachée ? */
  zoneCachee(z,r){ return zoneCachee(z,r,(la,lo)=>c.voirPoint(la,lo)); },
  /** Point d'entrée de photoFresh : la lecture de la photo peut-elle masquer ? Deux lectures sûres de suite. */
  photoSure(ps){
    if(ps!==derniere){ surePrecedente=sureCourante; const e=ecartMedian(ps&&ps.cols,b=>c.skylineElevAt(b)); sureCourante=e!=null&&e<=ACCORD_DEG; derniere=ps; }
    return sureCourante&&surePrecedente;
  },
  statut:()=>`visibilite : relief toujours appliqué · photo ${c&&c.S.photoVis===true?(sureCourante&&surePrecedente?'sûre (affine)':'pas sûre : n’affine pas'):'non lue'}`,
};
