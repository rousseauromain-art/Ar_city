// @ts-check
/**
 * Sommets lointains (façon PeakFinder) : les grands sommets jusqu'à la portée du relief, tirés des tuiles OpenFreeMap de zoom 7 (couche mountain_peak, seuls les principaux y figurent),
 * gardées 60 jours sur l'appareil. Hors du rayon des lieux, ils ne s'affichent que s'ils sont visibles (règle du calque `lieux`). Reprend `loadFarPeaks` de la v1.
 * Entrées : position, réseau, cache de données, gabarit des tuiles. Sortie : liste de lieux `farPeak`. Dépend de : mvt.js, noyau/geo.js.
 */
import { decoderTuileMVT, pointsDeFeature, etiquettesDeFeature, localVersLonLat, tuilesDeBoite } from './mvt.js';
import { distanceEtCap } from '../noyau/geo.js';
import { RELIEF_MAX_KM } from '../noyau/constantes.js';

/** @typedef {import('./overpass.js').Lieu} Lieu */

export const SOMMET_Z = 7, SOMMET_MIN_KM = 35, SOMMET_MIN_ELE_M = 1500, MEMOIRE_SOMMETS_MS = 60 * 86400000;

/**
 * @param {{
 *   reseau: {requeter: (url: string, o?: any) => Promise<unknown>, obtenir: (url: string, o?: any) => Promise<{donnees: unknown, source: string}>},
 *   cache: ReturnType<typeof import('./cache-donnees.js').creerCacheDonnees>,
 *   openfreemap: {gabaritTuiles: () => Promise<string>},
 * }} deps
 */
export function creerSourceSommets({ reseau, cache, openfreemap }) {
  return {
    /**
     * @param {{pos: {lat: number, lon: number}}} p
     * @returns {Promise<{sommets: Lieu[], tuilesOk: number, tuilesEchec: number, tuiles: number}>}
     */
    async charger({ pos }) {
      const tpl = await openfreemap.gabaritTuiles(), R = RELIEF_MAX_KM, dLat = R / 111, dLon = R / (111 * Math.max(0.2, Math.cos((pos.lat * Math.PI) / 180)));
      const tuiles = tuilesDeBoite({ la1: pos.lat - dLat, la2: pos.lat + dLat, lo1: pos.lon - dLon, lo2: pos.lon + dLon }, SOMMET_Z);
      /** @type {Map<string, Lieu>} */
      const trouves = new Map();
      let tuilesOk = 0, tuilesEchec = 0;
      for (const t of tuiles) {
        try {
          const res = await cache.obtenir('fpk', `fpk/${t.z}/${t.x}/${t.y}`, { ttlMs: MEMOIRE_SOMMETS_MS, binaire: true, elaguer: ['fpk/', 60],
            charger: async () => /** @type {Uint8Array} */ ((await reseau.obtenir(tpl.replace('{z}', String(t.z)).replace('{x}', String(t.x)).replace('{y}', String(t.y)), { analyse: 'octets', delaiMs: 15000, tentatives: 1 })).donnees) });
          const couche = decoderTuileMVT(res.donnees, ['mountain_peak']).mountain_peak;
          tuilesOk++;
          if (!couche) continue;
          for (const f of couche.features) {
            const pts = pointsDeFeature(f);
            if (!pts.length) continue;
            const tg = etiquettesDeFeature(f, couche), name = tg['name:fr'] || tg.name, ele = parseFloat(tg.ele);
            if (!name || !(ele >= SOMMET_MIN_ELE_M)) continue;
            const ll = localVersLonLat(t.z, t.x, t.y, pts[0][0], pts[0][1], couche.extent), d = distanceEtCap(pos, ll).distKm;
            if (d < SOMMET_MIN_KM || d > R) continue;
            const cle = name + '@' + ll.lat.toFixed(3);
            if (!trouves.has(cle)) trouves.set(cle, { name, lat: ll.lat, lon: ll.lon, kind: 'peak', pop: 0, ele, farPeak: true });
          }
        } catch { tuilesEchec++; }
      }
      return { sommets: [...trouves.values()], tuilesOk, tuilesEchec, tuiles: tuiles.length };
    },
  };
}
