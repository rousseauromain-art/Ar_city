// @ts-check
/**
 * Silhouette et crêtes intérieures du relief, déduites du masque cumulé (relief multi-plans, façon PeakFinder).
 * Le masque `pm[relevement][k]` contient déjà toutes les crêtes : le terrain n'est vu que là où il MONTE. Une montée, un palier (terrain caché
 * derrière), puis une nouvelle montée nettement plus loin = une crête qui se détache d'un plan plus lointain.
 * Entrées : masque `pm` et angles bruts `pm.raw`. Sorties : angles, distances, lignes de crêtes. Fonctions pures (v1 : `skylineElevAt`,
 * `skylineDistAt`, `ridgePoints`, `ridgeLines`). Dépend de : noyau/constantes.js, scene/relief.js.
 */
import { RAD, CRETE_MONTEE_MIN_DEG, CRETE_DIST_MIN_KM, CRETE_ECART_PLAN, CRETE_ECART_SILHOUETTE_DEG } from '../noyau/constantes.js';
import { masqueDans, DISTANCES_KM, NB_RELEVEMENTS, PAS_RELEVEMENT_DEG } from './relief.js';

/** @typedef {import('./masque.js').Masque} Masque */
/** @typedef {{i: number, a: number, d: number, g: number, drop: number}} PointCrete i : indice de relèvement, a : angle (°), d : distance (km), g : rapport au plan suivant, drop : dénivelé caché (m) */
/** @typedef {{pts: PointCrete[], d: number, g: number, drop: number, len: number}} LigneCrete len : étendue en degrés de relèvement */

/** Angle de la silhouette (°) dans une direction : masque cumulé sur toute la portée. @param {Masque} pm @param {number} capDeg */
export const angleSilhouette = (pm, capDeg) => masqueDans(pm, capDeg, 1e9);

/**
 * Distance (km) du relief qui dessine la silhouette, par relèvement : premier échantillon où le masque atteint sa valeur finale.
 * Sert à graduer le trait (proche = net, lointain = fin et transparent).
 * @param {Masque} pm
 * @returns {Float32Array}
 */
export function distancesSilhouette(pm) {
  const K = DISTANCES_KM.length, out = new Float32Array(NB_RELEVEMENTS);
  for (let i = 0; i < NB_RELEVEMENTS; i++) {
    const row = pm[i], fin = row[K - 1];
    let k = 0;
    while (k < K - 1 && row[k] < fin - 1e-4) k++;
    out[i] = DISTANCES_KM[k];
  }
  return out;
}

/** Distance de la silhouette dans une direction. @param {Float32Array} distances résultat de distancesSilhouette @param {number} capDeg */
export const distanceSilhouette = (distances, capDeg) => distances[Math.round((((capDeg % 360) + 360) % 360) / PAS_RELEVEMENT_DEG) % NB_RELEVEMENTS];

/**
 * Fins de montée suivies d'un plan plus lointain, pour un relèvement ; la dernière (silhouette finale) est exclue (v1 : `ridgePoints`).
 * @param {Float32Array} row masque cumulé du relèvement @param {Float32Array} [brut] angles bruts (sinon dénivelé supposé infini)
 * @returns {{a: number, d: number, g: number, drop: number, ligne?: {pts: PointCrete[]}}[]}
 */
export function pointsDeCretes(row, brut) {
  const K = row.length, out = [], monte = (/** @type {number} */ k) => row[k] > row[k - 1] + CRETE_MONTEE_MIN_DEG, ciel = row[K - 1];
  let k = 1;
  while (k < K) {
    while (k < K && !monte(k)) k++;
    if (k >= K) break;
    while (k < K && monte(k)) k++;
    const ke = k - 1;
    let kn = k;
    while (kn < K && !monte(kn)) kn++;
    if (kn >= K) break;
    const d = DISTANCES_KM[ke], dn = DISTANCES_KM[kn];
    if (d >= CRETE_DIST_MIN_KM && dn >= d * CRETE_ECART_PLAN && ciel - row[ke] >= CRETE_ECART_SILHOUETTE_DEG) {
      let drop = brut ? 0 : 1e9;
      const ar = row[ke] * RAD;
      if (brut) for (let j = ke + 1; j < kn; j++) { const r = brut[j]; if (!Number.isNaN(r)) { const m = (ar - r * RAD) * DISTANCES_KM[j] * 1000; if (m > drop) drop = m; } }
      out.push({ a: row[ke], d, g: dn / d, drop });
    }
    k = kn;
  }
  return out;
}

/** @param {number[]} v @returns {number} médiane (élément central) */
const mediane = (v) => { const s = v.slice().sort((x, y) => x - y); return s[s.length >> 1]; };

/**
 * Lignes de crêtes : les points de chaque relèvement sont chaînés au relèvement précédent (même distance à ±18 %, même angle à ±0,8°),
 * puis seules les lignes d'au moins 3 relèvements sont gardées, de la plus lointaine à la plus proche (v1 : `ridgeLines`).
 * @param {Masque} pm
 * @returns {LigneCrete[]}
 */
export function lignesDeCretes(pm) {
  const brut = pm.raw;
  /** @type {(ReturnType<typeof pointsDeCretes>[number] & {taken?: boolean})[][]} */
  const P = new Array(NB_RELEVEMENTS);
  for (let i = 0; i < NB_RELEVEMENTS; i++) P[i] = pointsDeCretes(pm[i], brut && brut[i]);
  /** @type {{pts: PointCrete[]}[]} */
  const lignes = [];
  for (let i = 0; i < NB_RELEVEMENTS; i++) {
    const prev = i ? P[i - 1] : [];
    for (const p of P[i]) {
      /** @type {(typeof prev)[number] | null} */
      let best = null, bs = 1e9;
      for (const q of prev) {
        if (q.taken) continue;
        const dl = Math.abs(Math.log(p.d / q.d)), da = Math.abs(p.a - q.a);
        if (dl < 0.18 && da < 0.8) { const s = dl * 4 + da; if (s < bs) { bs = s; best = q; } }
      }
      if (best) { best.taken = true; p.ligne = best.ligne; } else { p.ligne = { pts: [] }; lignes.push(p.ligne); }
      /** @type {{pts: PointCrete[]}} */ (p.ligne).pts.push({ i, a: p.a, d: p.d, g: p.g, drop: p.drop });
    }
  }
  /** @type {LigneCrete[]} */
  const res = lignes.map((L) => ({ pts: L.pts, d: mediane(L.pts.map((p) => p.d)), g: mediane(L.pts.map((p) => p.g)), drop: mediane(L.pts.map((p) => p.drop)), len: L.pts.length * PAS_RELEVEMENT_DEG }));
  return res.filter((L) => L.pts.length >= 3).sort((x, y) => y.d - x.d);
}
