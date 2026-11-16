// Contrôles « ce que l'on voit » (plan du 16/11, lot R0) : règles génériques appliquées à une image capturée
// par le crochet de test (textes de __vh.frame / frameOps, traces de l'enregistreur, rectangles de l'interface).
// Fonctions pures, partagées par la planche de rendus (rapport) et les tests (exigences) ; chaque fonction
// renvoie la liste des infractions, vide quand la règle est respectée.
const {textPoly,polysOverlap,overlaps,textsOver}=require('./labels');

/** Deux textes l'un sur l'autre (marge m px). @returns {[string,string][]} paires de textes en recouvrement */
function recouvrements(textes,m=1){ return overlaps(textes.filter(t=>t.text&&String(t.text).trim().length>1),m); }

/**
 * Textes posés (même en partie) sur un bouton ou une puce de l'interface.
 * @param {{left,right,top,bottom,id}[]} rects rectangles CSS des boutons et puces visibles
 * @returns {{text:string,sur:string}[]}
 */
function sousLesBoutons(textes,rects){
  const out=[];
  for(const r of rects) for(const t of textsOver(textes,[r])) out.push({text:t.text,sur:r.id||'bouton'});
  return out;
}

/**
 * Traits de rappel plus longs que `max` px : traits fins (≤ 1,5 px) à deux points seulement
 * (le fil qui relie un nom à son point), d'après les événements de l'enregistreur.
 * @param {object[]} ops événements frameOps().ops @param {number} max longueur maximale en px
 * @returns {{de:[number,number],a:[number,number],longueur:number}[]}
 */
function traitsTropLongs(ops,max,textes){
  const out=[];
  // un trait de rappel relie un NOM à son point : seuls comptent les traits dont un bout touche (à 14 px près) un texte écrit
  // (les fils des pylônes et équipements sous l'horizon relient une icône, pas un nom)
  const boites=(textes||[]).filter(t=>String(t.text).trim().length>1).map(t=>{ const P=textPoly(t), xs=P.map(p=>p[0]), ys=P.map(p=>p[1]); return [Math.min(...xs)-14,Math.max(...xs)+14,Math.min(...ys)-14,Math.max(...ys)+14]; });
  const touche=(x,y)=>!textes||boites.some(b=>x>=b[0]&&x<=b[1]&&y>=b[2]&&y<=b[3]);
  for(const e of ops||[]){
    if(e.t!=='trait'||e.largeur>1.5||(e.tirets&&e.tirets.length)||!Array.isArray(e.chemin)||e.chemin.length!==2) continue; // tirets : ligne d'horizon, fils des fantômes
    const [a,b]=e.chemin; if(a[0]!=='M'||b[0]!=='L') continue;
    const longueur=Math.hypot(b[1]-a[1],b[2]-a[2]);
    if(longueur>max&&(touche(a[1],a[2])||touche(b[1],b[2]))) out.push({de:[a[1],a[2]],a:[b[1],b[2]],longueur:Math.round(longueur),couleur:e.couleur});
  }
  return out;
}

/**
 * Noms écrits alors que leur élément est jugé caché par le relief, hors mode « Tout voir ».
 * @param {string[]} nomsCaches noms des éléments hidden de la page (cities, farPeaks, monuments)
 * @param {boolean} toutVoir S.beyond (mode « Tout voir » : les cachés sont volontairement montrés en fantômes)
 * @param {string[]} [nomsVisibles] noms des éléments visibles : un homonyme visible (« Le Château », « église Saint-Jean-Baptiste ») n'est pas une infraction
 * @returns {string[]}
 */
function cachesEcrits(textes,nomsCaches,toutVoir,nomsVisibles=[]){
  if(toutVoir) return [];
  const vus=new Set(nomsVisibles), caches=new Set(nomsCaches.filter(n=>!vus.has(n)));
  return [...new Set(textes.map(t=>String(t.text)).filter(n=>caches.has(n)))];
}

/** Les quatre contrôles d'un coup. `donnees` : {textes, ops, rects, nomsCaches, toutVoir, H}. */
function controler(donnees,{traitMax}={}){
  const H=donnees.H||0, max=traitMax!=null?traitMax:(H?H/4:1e9);
  return {
    recouvrements:recouvrements(donnees.textes||[]),
    sousLesBoutons:sousLesBoutons(donnees.textes||[],donnees.rects||[]),
    traitsTropLongs:traitsTropLongs(donnees.ops||[],max,donnees.textes||[]),
    cachesEcrits:cachesEcrits(donnees.textes||[],donnees.nomsCaches||[],!!donnees.toutVoir,donnees.nomsVisibles||[]),
  };
}
/** Nombre total d'infractions d'un résultat de controler(). */
const total=r=>r.recouvrements.length+r.sousLesBoutons.length+r.traitsTropLongs.length+r.cachesEcrits.length;
/** Une ligne de résumé, pour le README de la planche et les messages de test. */
function resume(r){
  const p=[];
  if(r.recouvrements.length) p.push(`${r.recouvrements.length} recouvrement(s)`);
  if(r.sousLesBoutons.length) p.push(`${r.sousLesBoutons.length} texte(s) sous un bouton`);
  if(r.traitsTropLongs.length) p.push(`${r.traitsTropLongs.length} trait(s) trop long(s)`);
  if(r.cachesEcrits.length) p.push(`${r.cachesEcrits.length} nom(s) caché(s) écrit(s)`);
  return p.length?p.join(', '):'aucune infraction';
}
/** Couleurs des traits des calques d'équipements de la v1 (pylônes, repères hauts, équipements urbains) : leurs fils relient une icône à son étiquette de calque. */
const COULEURS_CALQUES=/^rgba?\((232, ?90, ?90|169, ?139, ?255|120, ?205, ?232)/;
/** Couleur du fil d'un monument (v1) : il part du pied de la silhouette et la traverse jusqu'au nom. */
const COULEUR_MONUMENT=/^rgba?\(242, ?193, ?78/;
module.exports={COULEURS_CALQUES,COULEUR_MONUMENT,recouvrements,sousLesBoutons,traitsTropLongs,cachesEcrits,controler,total,resume,textPoly,polysOverlap};
