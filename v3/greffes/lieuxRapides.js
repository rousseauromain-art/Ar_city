// Greffe « lieuxRapides » (ajout, éteinte par défaut). Constat de la sortie de Pont-en-Royans (14/11) : loadCities attend TOUTES les sources (Overpass jusqu'à ~30 s, ou sans fin
// quand il ne répond pas) avant de publier la moindre liste : « chargement des lieux… » reste affiché, aucun nom. La greffe, à partir du point d'entrée dans loadCities() :
//  - publie une liste provisoire (fusion des sources déjà arrivées) à chaque réponse, tant que le chargement n'est pas fini ;
//  - borne l'attente d'Overpass à DELAI_OSM ms : passé ce délai, le chargement s'achève avec les autres sources ; quand Overpass répond enfin (réponse gardée dans le cache),
//    les lieux sont rechargés pour l'intégrer.
// Le chargement final de la v1 (fusion, atlas, relance) reste inchangé.
let c=null;
const DELAI_OSM=8000;
function publier(lists,noms,fusion){
  if(!c||!c.chargement()||!lists.length) return;
  let got=fusion(lists,1.5); if(!c.S.hamlets) got=got.filter(x=>x.kind!=='hamlet'&&x.kind!=='isolated_dwelling'); // même filtre que le chargement final
  c.publierLieux(got,noms.join('+'));
}
/** Borne une promesse : rejet après `ms` ; `apres` est appelé si la promesse d'origine aboutit ensuite. */
function borner(p,ms,apres){
  let fini=false;
  return new Promise((ok,ko)=>{
    const t=setTimeout(()=>{ fini=true; ko(new Error('délai dépassé : lieux publiés sans cette source')); },ms);
    p.then(v=>{ clearTimeout(t); if(fini){ if(apres) apres(); } else ok(v); },e=>{ clearTimeout(t); if(!fini) ko(e); });
  });
}
export default {
  init(ctx){ c=ctx; },
  DELAI_OSM,
  publier,borner,
  /** Point d'entrée : `tasks` (Overpass en premier) est modifié sur place. */
  suivre(tasks,noms,fusion){
    const relancer=()=>{ let n=0; const essai=()=>{ if(!c.chargement()||n++>20) { if(!c.chargement()) c.recharger(); return; } setTimeout(essai,1000); }; essai(); };
    tasks[0]=borner(tasks[0],DELAI_OSM,relancer);
    const lists=new Array(tasks.length).fill(null);
    tasks.forEach((t,i)=>t.then(r=>{ lists[i]=r&&r.data; publier(lists.filter(Boolean),noms.filter((_,j)=>lists[j]),fusion); },()=>{}));
  },
};
