// @ts-check
/**
 * Lieux supplémentaires via le relais (Geoapify et GeoNames) : deux sources indépendantes, facultatives (sans relais configuré elles sont
 * absentes de la fusion, sans dégradation des autres). Le relais détient seul les identifiants. Reprend la v1.
 */

/** @typedef {import('./overpass.js').Lieu} Lieu */
/** @typedef {import('./overpass.js').ReseauRequeter} ReseauRequeter */

/** Catégories de repères que Geoapify sait chercher (les caps et rochers ne sont pas couverts). */
const CATEGORIES_GEOAPIFY = ['lighthouse', 'view', 'heritage', 'beach'];

/** Adresse de base du relais (origine), ou '' si non configuré. @param {string | undefined} relais */
export function baseRelais(relais) {
  let r = (relais || '').trim();
  if (!r) return '';
  if (!/^https?:\/\//i.test(r)) r = 'https://' + r;
  try { return new URL(r).origin; } catch { return r.replace(/\/+$/, ''); }
}

/**
 * @param {{reseau: ReseauRequeter, relais: string | undefined}} deps
 */
export function creerSourcesRelais({ reseau, relais }) {
  const base = baseRelais(relais);
  /** @param {string} route @param {{lat: number, lon: number}} p @param {number} rKm @param {string[]} kinds @returns {Promise<Lieu[]>} */
  async function lieuxDuRelais(route, p, rKm, kinds) {
    const results = await Promise.allSettled(kinds.map(async (k) => {
      const j = /** @type {{places?: Lieu[]}} */ (await reseau.requeter(`${base}/${route}?lat=${p.lat.toFixed(5)}&lon=${p.lon.toFixed(5)}&radius_km=${rKm}&kind=${k}`, { delaiMs: 10000 }));
      return j.places || [];
    }));
    const ok = results.filter((x) => x.status === 'fulfilled');
    if (!ok.length) {
      const premier = results.find((x) => x.status === 'rejected');
      throw (premier && /** @type {PromiseRejectedResult} */ (premier).reason) || new Error('aucune réponse');
    }
    return ok.flatMap((x) => /** @type {PromiseFulfilledResult<Lieu[]>} */ (x).value);
  }
  return {
    disponible: !!base,
    /** @param {{lat: number, lon: number}} p @param {number} rKm @param {Record<string, boolean>} reperes */
    geoapify(p, rKm, reperes) {
      const kinds = ['villes'];
      if (reperes.cape) kinds.push('sommets');
      for (const k of CATEGORIES_GEOAPIFY) if (reperes[k]) kinds.push(k);
      return lieuxDuRelais('geoapify', p, rKm, kinds);
    },
    /** @param {{lat: number, lon: number}} p @param {number} rKm @param {Record<string, boolean>} reperes */
    geonames(p, rKm, reperes) {
      const kinds = ['villes'];
      if (reperes.cape) kinds.push('sommets');
      return lieuxDuRelais('geonames', p, rKm, kinds);
    },
  };
}
