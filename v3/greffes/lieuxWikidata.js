// Greffe « lieuxWikidata » (ajout, éteinte par défaut) : repli Wikidata pour les lieux quand OpenStreetMap (Overpass) échoue (v2 étape 11l : v2/src/donnees/wikidata-lieux.js).
// Une requête SPARQL par zone (service « around », appelée directement : Wikidata accepte les requêtes de navigateur, sans clé), lieux fusionnés aux autres sources
// par nom et proximité comme dans la v1. Point d'entrée : loadCities, après les sources de la v1, seulement si Overpass a échoué.
const POINT='https://query.wikidata.org/sparql';
export const RAYON_MAX_KM=120, LIMITE=700;
export const CLASSES={Q1549591:'city',Q515:'city',Q3957:'town',Q484170:'village',Q15284:'village',Q532:'village',Q5084:'hamlet',Q23442:'island',Q185113:'cape'};
export function requete(p,rKm){
  const v=Object.keys(CLASSES).map(q=>'wd:'+q).join(' ');
  return `SELECT ?item ?itemLabel ?coord ?pop ?classe WHERE { SERVICE wikibase:around { ?item wdt:P625 ?coord . bd:serviceParam wikibase:center "Point(${p.lon.toFixed(5)} ${p.lat.toFixed(5)})"^^geo:wktLiteral . bd:serviceParam wikibase:radius "${Math.min(rKm,RAYON_MAX_KM)}" . } VALUES ?classe { ${v} } ?item wdt:P31 ?classe . OPTIONAL { ?item wdt:P1082 ?pop } SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en,es,it,de". } } LIMIT ${LIMITE}`;
}
/** Pur : un lieu par entité (le plus peuplé des enregistrements), sans les noms « Q123 », au format des lieux de la v1 {name, lat, lon, kind, pop}. */
export function lire(json,hameaux){
  const par=new Map();
  for(const b of (json&&json.results&&json.results.bindings)||[]){
    const m=/^Point\(([-\d.eE+]+) ([-\d.eE+]+)\)$/.exec((b.coord&&b.coord.value)||''), name=b.itemLabel&&b.itemLabel.value, cls=b.classe&&/Q\d+$/.exec(b.classe.value), kind=cls&&CLASSES[cls[0]];
    if(!m||!name||/^Q\d+$/.test(name)||!kind||(kind==='hamlet'&&!hameaux)) continue;
    const id=b.item.value, pop=b.pop?+b.pop.value||0:0, lieu={name,lat:+m[2],lon:+m[1],kind,pop};
    const avant=par.get(id); if(!avant||pop>avant.pop) par.set(id,lieu);
  }
  return [...par.values()];
}
let c=null;
export default {
  init(ctx){ c=ctx; },
  /** Lieux autour de p (rayon rKm), au format des sources de la v1 (dcFetch les mémorise) ; lève une erreur en cas d'échec. */
  async charger(p,rKm,hameaux){
    const r=await c.fetchT(`${POINT}?format=json&query=${encodeURIComponent(requete(p,rKm))}`,{headers:{Accept:'application/sparql-results+json'}},25000);
    if(!r.ok) throw new Error('Wikidata HTTP '+r.status);
    return lire(await r.json(),hameaux);
  },
};
