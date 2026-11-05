// @ts-check
/**
 * Bâtiments de la BD TOPO (IGN), tuiles vectorielles de zoom 15 (~1 km) : de quoi tracer la silhouette de la ville (calque `batiments`), corriger une position GPS tombée dans un bâtiment et caler le cap sur les toits.
 * Entrées : position, rayon, réseau (injecté), cache de données, relais. Sortie : bâtiments { h, pts: Float64Array [lat, lon, …] } (anneau extérieur ; les cours intérieures font partie du bâtiment).
 * Hauteur : `hauteur` (m) ; sinon `nombre_d_etages` × 3 m ; sinon 6 m (2 étages), comme la v1. Source directe : data.geopf.fr ; si le navigateur la refuse, le relais (`/bdtopo`) et le reste de la session passe par lui.
 * Mémoire durable de l'appareil : 30 jours, clé `bd/z/x/y`. Reprend `urbDecodeTile`, `urbFetchTile`, `urbTilesAround`, `loadUrban` de la v1.
 * Dépend de : donnees/mvt.js, donnees/relais-lieux.js, noyau/geo.js.
 */
import { decoderTuileMVT, anneauxDeFeature, etiquettesDeFeature, localVersLonLat, tuilesDeBoite } from './mvt.js';
import { baseRelais } from './relais-lieux.js';
import { distanceEtCap } from '../noyau/geo.js';

/** @typedef {import('../scene/silhouette-batiments.js').Batiment} Batiment */
/** @typedef {{z: number, x: number, y: number}} Tuile */

export const BATIMENTS_Z = 15, BATIMENTS_RAYON_KM = 2.5, BATIMENTS_TUILES_MAX = 70, BATIMENTS_MEMOIRE_MS = 30 * 86400000, HAUTEUR_DEFAUT_M = 6, METRES_PAR_ETAGE = 3;
/** Gabarit des tuiles de l'IGN. */
export const GABARIT_BDTOPO = 'https://data.geopf.fr/tms/1.0.0/BDTOPO/{z}/{x}/{y}.pbf';
const PARALLELE = 4, DELAI_TUILE_MS = 15000;

/**
 * Hauteur d'un bâtiment d'après ses étiquettes (v1 : `hauteur` > 0, sinon étages × 3, sinon 6 m).
 * @param {Record<string, any>} tg @returns {{h: number, connue: boolean}}
 */
export function hauteurBatiment(tg) {
  const h = parseFloat(tg.hauteur);
  if (h > 0) return { h, connue: true };
  const e = parseFloat(tg.nombre_d_etages);
  return e > 0 ? { h: e * METRES_PAR_ETAGE, connue: true } : { h: HAUTEUR_DEFAUT_M, connue: false };
}

/**
 * Tuiles de zoom 15 autour d'une position, les plus proches d'abord (v1 : `urbTilesAround`) : celles dont le centre est à `rayonKm + 0,7` km au plus, 70 au plus.
 * @param {{lat: number, lon: number}} pos @param {number} [rayonKm] @returns {(Tuile & {cle: string, distKm: number})[]}
 */
export function tuilesBatiments(pos, rayonKm = BATIMENTS_RAYON_KM) {
  const dLat = rayonKm / 111, dLon = rayonKm / (111 * Math.max(0.2, Math.cos((pos.lat * Math.PI) / 180)));
  return tuilesDeBoite({ la1: pos.lat - dLat, la2: pos.lat + dLat, lo1: pos.lon - dLon, lo2: pos.lon + dLon }, BATIMENTS_Z)
    .map((t) => { const c = localVersLonLat(t.z, t.x, t.y, 2048, 2048, 4096); return { ...t, cle: `${t.z}/${t.x}/${t.y}`, distKm: distanceEtCap(pos, { lat: c.lat, lon: c.lon }).distKm }; })
    .filter((t) => t.distKm <= rayonKm + 0.7).sort((a, b) => a.distKm - b.distKm).slice(0, BATIMENTS_TUILES_MAX);
}

/**
 * Bâtiments d'une tuile (v1 : `urbDecodeTile`) : seules les couches dont le nom contient « bati » sont décodées.
 * @param {Uint8Array} buf @param {Tuile} t @returns {{batiments: Batiment[], n: number, nHauteur: number}}
 */
export function batimentsDeTuile(buf, t) {
  const out = { batiments: /** @type {Batiment[]} */ ([]), n: 0, nHauteur: 0 };
  if (!buf.length) return out;
  for (const couche of Object.values(decoderTuileMVT(buf, (nom) => /bati/i.test(nom)))) {
    for (const f of couche.features) {
      const { h, connue } = hauteurBatiment(etiquettesDeFeature(f, couche));
      out.n++; if (connue) out.nHauteur++;
      for (const anneau of anneauxDeFeature(f)) {
        const pts = new Float64Array(anneau.length * 2);
        anneau.forEach(([lx, ly], k) => { const ll = localVersLonLat(t.z, t.x, t.y, lx, ly, couche.extent); pts[2 * k] = ll.lat; pts[2 * k + 1] = ll.lon; });
        out.batiments.push({ h, pts });
      }
    }
  }
  return out;
}

/**
 * @param {{
 *   reseau: {requeter: (url: string, o?: any) => Promise<unknown>},
 *   cache: ReturnType<typeof import('./cache-donnees.js').creerCacheDonnees>,
 *   relais?: string, journal?: {avert: (m: string, msg: string, d?: unknown) => unknown},
 * }} deps
 */
export function creerSourceBatiments({ reseau, cache, relais, journal }) {
  const base = baseRelais(relais);
  let viaRelais = false;
  /** @param {string} url @returns {Promise<Uint8Array>} 404 = tuile vide. */
  const lire = async (url) => {
    try { return /** @type {Uint8Array} */ (await reseau.requeter(url, { analyse: 'octets', delaiMs: DELAI_TUILE_MS })); }
    catch (e) { if (/** @type {any} */ (e).statut === 404) return new Uint8Array(0); throw e; }
  };
  /** Direct d'abord ; si l'IGN est refusé, relais (et le reste de la session passe par lui). @param {Tuile} t */
  async function telecharger(t) {
    const direct = GABARIT_BDTOPO.replace('{z}', String(t.z)).replace('{x}', String(t.x)).replace('{y}', String(t.y)), parRelais = () => `${base}/bdtopo?z=${t.z}&x=${t.x}&y=${t.y}`;
    if (viaRelais && base) return lire(parRelais());
    try { return await lire(direct); } catch (e) {
      if (!base) throw e;
      const b = await lire(parRelais()); viaRelais = true; if (journal) journal.avert('bdtopo', 'IGN refusé : bascule sur le relais'); return b;
    }
  }
  return {
    /**
     * @param {{pos: {lat: number, lon: number}, rayonKm?: number, contourner?: boolean, quandPartiel?: (batiments: Batiment[]) => void}} p
     * @returns {Promise<{batiments: Batiment[], tuiles: number, tuilesOk: number, tuilesEchec: number, tuilesCache: number, viaRelais: boolean, nHauteur: number, n: number}>}
     */
    async charger({ pos, rayonKm = BATIMENTS_RAYON_KM, contourner, quandPartiel }) {
      const tuiles = tuilesBatiments(pos, rayonKm), batiments = /** @type {Batiment[]} */ ([]), bilan = { tuilesOk: 0, tuilesEchec: 0, tuilesCache: 0, nHauteur: 0, n: 0 };
      let i = 0;
      const ouvrier = async () => {
        while (i < tuiles.length) {
          const t = tuiles[i++];
          try {
            const r = await cache.obtenir('bd', 'bd/' + t.cle, { ttlMs: BATIMENTS_MEMOIRE_MS, binaire: true, contourner, elaguer: ['bd/', 400], charger: () => telecharger(t) });
            const d = batimentsDeTuile(r.donnees, t);
            bilan.tuilesOk++; if (r.source !== 'reseau') bilan.tuilesCache++; bilan.n += d.n; bilan.nHauteur += d.nHauteur;
            for (const b of d.batiments) batiments.push(b);
            if (quandPartiel && d.batiments.length) quandPartiel(batiments);
          } catch { bilan.tuilesEchec++; }
        }
      };
      await Promise.all(Array.from({ length: PARALLELE }, ouvrier));
      return { batiments, tuiles: tuiles.length, viaRelais, ...bilan };
    },
    /** Tuiles du rayon (pour « Télécharger cette zone »). @param {{lat: number, lon: number}} pos @param {number} [rayonKm] */
    tuilesDe: (pos, rayonKm = BATIMENTS_RAYON_KM) => tuilesBatiments(pos, rayonKm),
  };
}
