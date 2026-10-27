// @ts-check
/**
 * Géométrie sur la sphère : distance, cap, point d'arrivée, horizon, lecture « lat, lon ».
 * Entrées : points { lat, lon } en degrés. Sorties : km, degrés, m. Fonctions pures.
 * Dépend de : constantes.js.
 */
import { RAD, RAYON_TERRE_KM, RAYON_EFFECTIF_M, HAUTEUR_YEUX_M } from './constantes.js';

/** @typedef {{lat: number, lon: number}} Point */

/**
 * Distance orthodromique et cap initial de `a` vers `b` (v1 : `distBrg`).
 * @param {Point} a @param {Point} b
 * @returns {{distKm: number, capDeg: number}}
 */
export function distanceEtCap(a, b) {
  const la1 = a.lat * RAD, la2 = b.lat * RAD, dl = (b.lon - a.lon) * RAD;
  const y = Math.sin(dl) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dl);
  const h = Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dl / 2) ** 2;
  return { distKm: RAYON_TERRE_KM * 2 * Math.asin(Math.sqrt(h)), capDeg: (Math.atan2(y, x) / RAD + 360) % 360 };
}

/**
 * Point atteint en partant de `p` sur `distKm` au cap `capDeg` (approximation plane locale, comme les tests de la v1).
 * @param {Point} p @param {number} distKm @param {number} capDeg
 * @returns {Point}
 */
export function pointAuCap(p, distKm, capDeg) {
  const b = capDeg * RAD;
  return {
    lat: p.lat + (distKm * Math.cos(b)) / 111.32,
    lon: p.lon + (distKm * Math.sin(b)) / (111.32 * Math.cos(p.lat * RAD)),
  };
}

/**
 * Chute due à la courbure de la Terre, réfraction comprise, à `distM` : h = d² / (2·R_eff).
 * @param {number} distM
 */
export const chuteCourbureM = (distM) => (distM * distM) / (2 * RAYON_EFFECTIF_M);

/**
 * Angle sous l'horizontale de l'horizon visible depuis une hauteur d'œil (°, négatif), v1 : `hzA`.
 * @param {number} altitudeSolM altitude du sol sous l'observateur
 */
export function angleHorizonDeg(altitudeSolM) {
  const h0 = altitudeSolM + HAUTEUR_YEUX_M;
  return -Math.sqrt((2 * Math.max(0.5, h0)) / RAYON_EFFECTIF_M) / RAD;
}

/**
 * Élévation apparente (°) d'un objet de `hautM` d'altitude vu à `distKm` depuis une altitude d'œil `oeilM`, courbure comprise.
 * @param {number} hautM @param {number} oeilM @param {number} distKm
 */
export function elevationApparenteDeg(hautM, oeilM, distKm) {
  const d = distKm * 1000;
  return Math.atan2(hautM - oeilM - chuteCourbureM(d), d) / RAD;
}

/**
 * Lit « lat, lon » ou un lien Google Maps « …@lat,lon » (v1 : `parseLatLon`). Virgule décimale acceptée.
 * @param {unknown} texte
 * @returns {Point | null}
 */
export function lirePoint(texte) {
  const s = String(texte || '');
  const m = /@(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/.exec(s) || /(-?\d{1,2}(?:[.,]\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:[.,]\d+)?)/.exec(s);
  if (!m) return null;
  const lat = parseFloat(m[1].replace(',', '.')), lon = parseFloat(m[2].replace(',', '.'));
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}
