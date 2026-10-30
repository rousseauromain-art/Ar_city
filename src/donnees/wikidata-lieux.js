// @ts-check
/**
 * Repli Wikidata pour les LIEUX (villes, villages, hameaux, îles, caps) : quand les miroirs Overpass (OpenStreetMap) sont tous en échec, la liste des lieux serait pauvre. Wikidata les connaît aussi,
 * avec leurs coordonnées et leur population : une requête SPARQL par zone (service « around »), appelée directement (le service accepte les requêtes de navigateur, sans clé).
 * Entrées : centre, rayon, réseau (donnees/reseau.js). Sortie : lieux { name, lat, lon, kind, pop, ele } comme les autres sources, fusionnés par nom et proximité.
 */

/** @typedef {import('./overpass.js').Lieu} Lieu */
/** @typedef {import('./overpass.js').ReseauRequeter} ReseauRequeter */

export const POINT_SPARQL = 'https://query.wikidata.org/sparql';
/** Rayon maximal demandé à Wikidata (km) et nombre maximal de lieux : au-delà, le service met trop longtemps à répondre. */
export const RAYON_MAX_KM = 120, LIMITE = 700;
/** Classes Wikidata → type de lieu de l'application. */
export const CLASSES = Object.freeze(/** @type {Record<string, string>} */ ({
  Q1549591: 'city', Q515: 'city', Q3957: 'town', Q484170: 'village', Q15284: 'village', Q532: 'village', Q5084: 'hamlet', Q23442: 'island', Q185113: 'cape',
}));

/** Requête SPARQL des lieux autour d'un point. @param {{lat: number, lon: number}} p @param {number} rKm */
export function requeteSparql(p, rKm) {
  const valeurs = Object.keys(CLASSES).map((q) => 'wd:' + q).join(' ');
  return `SELECT ?item ?itemLabel ?coord ?pop ?classe WHERE { SERVICE wikibase:around { ?item wdt:P625 ?coord . bd:serviceParam wikibase:center "Point(${p.lon.toFixed(5)} ${p.lat.toFixed(5)})"^^geo:wktLiteral . bd:serviceParam wikibase:radius "${Math.min(rKm, RAYON_MAX_KM)}" . } VALUES ?classe { ${valeurs} } ?item wdt:P31 ?classe . OPTIONAL { ?item wdt:P1082 ?pop } SERVICE wikibase:label { bd:serviceParam wikibase:language "fr,en,es,it,de". } } LIMIT ${LIMITE}`;
}

/**
 * Lit la réponse SPARQL : un lieu par entité (le plus peuplé des enregistrements), les noms « Q123 » (sans libellé) écartés.
 * @param {any} json @param {boolean} hameaux @returns {Lieu[]}
 */
export function lireReponse(json, hameaux) {
  const par = new Map();
  for (const b of (json && json.results && json.results.bindings) || []) {
    const m = /^Point\(([-\d.eE+]+) ([-\d.eE+]+)\)$/.exec((b.coord && b.coord.value) || ''), name = b.itemLabel && b.itemLabel.value, cls = b.classe && /Q\d+$/.exec(b.classe.value), kind = cls && CLASSES[cls[0]];
    if (!m || !name || /^Q\d+$/.test(name) || !kind || (kind === 'hamlet' && !hameaux)) continue;
    const id = b.item.value, pop = b.pop ? +b.pop.value || 0 : 0, lieu = { name, lat: +m[2], lon: +m[1], kind, pop, ele: null };
    const avant = par.get(id); if (!avant || pop > avant.pop) par.set(id, lieu);
  }
  return [...par.values()];
}

/** @param {{reseau: ReseauRequeter}} deps */
export function creerWikidataLieux({ reseau }) {
  return {
    /** @param {{lat: number, lon: number}} p @param {number} rKm @param {boolean} hameaux @returns {Promise<Lieu[]>} */
    async charger(p, rKm, hameaux) {
      const url = `${POINT_SPARQL}?format=json&query=${encodeURIComponent(requeteSparql(p, rKm))}`;
      return lireReponse(await reseau.requeter(url, { delaiMs: 25000 }), hameaux);
    },
  };
}
