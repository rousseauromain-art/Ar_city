// @ts-check
/**
 * Source de la silhouette des toits pour « Caler auto » : charge les bâtiments d'ici au besoin (même si le calque est éteint), pose le sol sous chacun (relief) et calcule la silhouette BRUTE (pas de 0,1°, sans lissage ni
 * masque du premier plan) en ne gardant que les bâtiments à plus de max(60 m, 8 × précision du GPS) : de près, 10 m d'erreur de position décalent de 18° un immeuble situé à 30 m (calage sur le cap seul).
 */
import { altitudeEn } from '../scene/relief.js';
import { poserSol, silhouetteBrute } from '../scene/silhouette-batiments.js';

/** Distance minimale (m) des bâtiments gardés pour le cap, et multiple de la précision du GPS. */
export const DISTANCE_MIN_M = 60, FACTEUR_PRECISION = 8;

/**
 * @param {{app: ReturnType<typeof import('../app/application.js').creerApplication>, S: import('../moteur/reglages.js').Reglages, precisionM: () => number}} p
 * @returns {() => Promise<{ang: Float32Array} | null>}
 */
export function sourceToits({ app, S, precisionM }) {
  return async () => {
    const bats = await app.assurerBatiments(), d = app.donnees();
    if (!d.pos || !bats.length) return null;
    const terrain = d.terrain;
    if (terrain) poserSol(bats, (lat, lon, dk) => altitudeEn(terrain.bands, lat, lon, dk), d.pos);
    return silhouetteBrute(bats, { pos: d.pos, oeilRelM: 1.6 + (S.obsHeight || 0), h0: terrain ? terrain.h0 : null, courbure: true, distMinM: Math.max(DISTANCE_MIN_M, FACTEUR_PRECISION * (precisionM() || 0)) });
  };
}
