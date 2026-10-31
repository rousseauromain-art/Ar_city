// @ts-check
/**
 * Relief : bandes de tuiles d'altitude, altitude en un point, masque cumulé (silhouette) par relèvement.
 * Entrées : bandes de tuiles Terrarium décodées (RGBA), position de l'observateur, altitude d'œil.
 * Sorties : altitudes (m), masque `pm[relevement][k]` (angle maximal rencontré, °). Fonctions pures (v1 : bloc TERRAIN-CORE).
 * Dépend de : noyau/constantes.js.
 */
import { RAD, RAYON_EFFECTIF_M, RELIEF_MAX_KM } from '../noyau/constantes.js';

/**
 * @typedef {object} Bande
 * @property {number} z niveau de zoom @property {number} max portée (km) @property {number} ts taille d'une tuile (px)
 * @property {number} shift 9 (tuile 512) ou 8 (tuile 256) @property {boolean} garantie couverture mondiale assurée
 * @property {number} tx0 @property {number} ty0 @property {number} nx @property {number} ny
 * @property {(Uint8ClampedArray|Uint8Array|null)[]} tiles pixels RGBA (Terrarium) ou null
 * @property {Set<number>} [altIdx] indices de tuiles reconstituées depuis AWS (modèle de surface 30 m)
 */
/** @typedef {{z: number, max: number, ts: number, garantie: boolean}} ConfigBande */

/** Bandes Mapterhorn : z13 fin (non garanti), puis z12, z11 et z8 (Copernicus 30 m, garantis). */
export const BANDES_HR = Object.freeze([
  { z: 13, max: 5, ts: 512, garantie: false },
  { z: 12, max: 30, ts: 512, garantie: true },
  { z: 11, max: 60, ts: 512, garantie: true },
  { z: 8, max: RELIEF_MAX_KM, ts: 512, garantie: true },
]);
/** Bandes historiques AWS/Terrarium (repli). */
export const BANDES_AWS = Object.freeze([
  { z: 11, max: 12, ts: 256, garantie: true },
  { z: 10, max: 30, ts: 256, garantie: true },
  { z: 9, max: 60, ts: 256, garantie: true },
  { z: 8, max: RELIEF_MAX_KM, ts: 256, garantie: true },
]);
/** Pas angulaire du masque (°) et nombre de relèvements. */
export const PAS_RELEVEMENT_DEG = 0.5;
export const NB_RELEVEMENTS = 720;
/** Sous cette distance (km), la bande fine est ignorée (muret, rambarde) : on prend la bande grossière garantie. */
export const PROCHE_KM = 0.3;
/** Distances d'échantillonnage du profil (km), croissantes de 1,8 % (min 50 m). */
export const DISTANCES_KM = (() => { const a = []; let d = 0.08; while (d <= RELIEF_MAX_KM) { a.push(d); d += Math.max(0.05, d * 0.018); } return Float32Array.from(a); })();

/** Pixel global (z, ts) d'une position. @param {number} z @param {number} lat @param {number} lon @param {number} ts @returns {[number, number]} */
export function pixelGlobal(z, lat, lon, ts) {
  const n = ts * Math.pow(2, z), s = Math.sin(lat * RAD);
  return [((lon + 180) / 360) * n, (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n];
}

/**
 * Bandes (vides) couvrant la portée autour d'un point (v1 : `bandsFor`).
 * @param {readonly ConfigBande[]} cfg @param {{lat: number, lon: number}} c
 * @returns {Bande[]}
 */
export function creerBandes(cfg, c) {
  return cfg.map((b) => {
    const dLat = b.max / 111.32, dLon = b.max / (111.32 * Math.max(0.2, Math.cos(c.lat * RAD)));
    const [x0, y0] = pixelGlobal(b.z, c.lat + dLat, c.lon - dLon, b.ts), [x1, y1] = pixelGlobal(b.z, c.lat - dLat, c.lon + dLon, b.ts);
    const tx0 = Math.floor(x0 / b.ts), ty0 = Math.floor(y0 / b.ts), tx1 = Math.floor(x1 / b.ts), ty1 = Math.floor(y1 / b.ts);
    const nx = tx1 - tx0 + 1, ny = ty1 - ty0 + 1;
    return { z: b.z, max: b.max, ts: b.ts, shift: b.ts === 512 ? 9 : 8, garantie: b.garantie, tx0, ty0, nx, ny, tiles: new Array(nx * ny).fill(null) };
  });
}

/** Altitude (m, ≥ 0 : la bathymétrie compte comme la mer) d'un pixel global, NaN si la tuile manque. @param {Bande} band @param {number} gx @param {number} gy */
export function altitudePixel(band, gx, gy) {
  const sh = band.shift, mk = (1 << sh) - 1;
  const ix = (gx >> sh) - band.tx0, iy = (gy >> sh) - band.ty0;
  if (ix < 0 || iy < 0 || ix >= band.nx || iy >= band.ny) return NaN;
  const t = band.tiles[iy * band.nx + ix];
  if (!t) return NaN;
  const i = (((gy & mk) << sh) + (gx & mk)) << 2;
  const e = t[i] * 256 + t[i + 1] + t[i + 2] / 256 - 32768;
  return e > 0 ? e : 0;
}

/**
 * Altitude (m) en un point, par interpolation bilinéaire ; cascade vers une bande plus grossière si la donnée manque (v1 : `elevAt`).
 * @param {Bande[]} bands @param {number} lat @param {number} lon @param {number} distKm @param {boolean} [sauterFine] ignorer la bande non garantie
 */
export function altitudeEn(bands, lat, lon, distKm, sauterFine) {
  let bi = 0;
  while (bi < bands.length && distKm > bands[bi].max) bi++;
  if (bi >= bands.length) return NaN;
  for (; bi < bands.length; bi++) {
    const band = bands[bi];
    if (sauterFine && !band.garantie) continue;
    const p = pixelGlobal(band.z, lat, lon, band.ts), fx = p[0] - 0.5, fy = p[1] - 0.5, x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
    const a = altitudePixel(band, x0, y0), b = altitudePixel(band, x0 + 1, y0), c = altitudePixel(band, x0, y0 + 1), d = altitudePixel(band, x0 + 1, y0 + 1);
    if (!Number.isNaN(a + b + c + d)) return (a * (1 - ax) + b * ax) * (1 - ay) + (c * (1 - ax) + d * ax) * ay;
    const n = altitudePixel(band, Math.floor(p[0]), Math.floor(p[1]));
    if (!Number.isNaN(n)) return n;
  }
  return NaN;
}

/**
 * Masque cumulé le long du relèvement `indice` (angle maximal rencontré à chaque distance). `brut` (optionnel) reçoit l'angle de chaque échantillon.
 * @param {Bande[]} bands @param {{lat: number, lon: number}} c @param {number} oeilM altitude de l'œil @param {number} indice
 * @param {Float32Array} [brut]
 */
export function masqueRelevement(bands, c, oeilM, indice, brut) {
  const b = indice * PAS_RELEVEMENT_DEG * RAD, sb = Math.sin(b), cb = Math.cos(b), cosL = Math.cos(c.lat * RAD), K = DISTANCES_KM.length;
  const row = new Float32Array(K);
  let mx = -90;
  for (let k = 0; k < K; k++) {
    const d = DISTANCES_KM[k], e = altitudeEn(bands, c.lat + (d * cb) / 111.32, c.lon + (d * sb) / (111.32 * cosL), d, d < PROCHE_KM);
    if (!Number.isNaN(e)) {
      const dm = d * 1000, a = Math.atan2(e - oeilM - (dm * dm) / (2 * RAYON_EFFECTIF_M), dm) / RAD;
      if (brut) brut[k] = a;
      if (a > mx) mx = a;
    } else if (brut) brut[k] = NaN;
    row[k] = mx;
  }
  return row;
}

/** Dernier indice k tel que DISTANCES_KM[k] < distKm, -1 si aucun. @param {number} distKm */
function indiceDistance(distKm) {
  if (DISTANCES_KM[0] >= distKm) return -1;
  let lo = 0, hi = DISTANCES_KM.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (DISTANCES_KM[m] < distKm) lo = m; else hi = m - 1; }
  return lo;
}

/**
 * Angle du masque dans une direction jusqu'à une distance, interpolé entre relèvements (v1 : `maskFrom`).
 * @param {ArrayLike<Float32Array>} pm @param {number} capDeg @param {number} distKm
 */
export function masqueDans(pm, capDeg, distKm) {
  const k = indiceDistance(distKm);
  if (k < 0) return -90;
  const f = (((capDeg % 360) + 360) % 360) / PAS_RELEVEMENT_DEG, i0 = Math.floor(f) % NB_RELEVEMENTS, i1 = (i0 + 1) % NB_RELEVEMENTS, t = f - Math.floor(f);
  return pm[i0][k] * (1 - t) + pm[i1][k] * t;
}

/**
 * Obstacle qui fixe le masque juste avant `distLimiteKm` dans un relèvement (v1 : `maskCause`). Usage ponctuel (diagnostic).
 * @param {Bande[]} bands @param {{lat: number, lon: number}} c @param {number} oeilM @param {number} capDeg @param {number} distLimiteKm
 * @returns {{d: number, e: number, angle: number} | null}
 */
export function causeMasque(bands, c, oeilM, capDeg, distLimiteKm) {
  const bi = Math.round((((capDeg % 360) + 360) % 360) / PAS_RELEVEMENT_DEG), b = bi * PAS_RELEVEMENT_DEG * RAD, sb = Math.sin(b), cb = Math.cos(b), cosL = Math.cos(c.lat * RAD);
  let mx = -90, cause = null;
  for (let k = 0; k < DISTANCES_KM.length; k++) {
    const d = DISTANCES_KM[k];
    if (d >= distLimiteKm) break;
    const e = altitudeEn(bands, c.lat + (d * cb) / 111.32, c.lon + (d * sb) / (111.32 * cosL), d, d < PROCHE_KM);
    if (!Number.isNaN(e)) { const dm = d * 1000, a = Math.atan2(e - oeilM - (dm * dm) / (2 * RAYON_EFFECTIF_M), dm) / RAD; if (a > mx) { mx = a; cause = { d, e, angle: a }; } }
  }
  return cause;
}
