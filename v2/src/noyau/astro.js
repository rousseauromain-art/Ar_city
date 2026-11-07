// @ts-check
/**
 * Astronomie : position du soleil (formules usuelles, précision ~0,01°, réfraction comprise). Fonction pure.
 * Entrée : instant (ms UTC), position. Sortie : azimut (° depuis le nord, vers l'est) et élévation apparente (°).
 * La lune sert au calage de nuit (`positionLune`). Dépend de : constantes.js.
 */
import { RAD } from './constantes.js';

/**
 * Position du soleil (v1 : `sunPos`).
 * @param {number} tMs instant en ms depuis 1970 (UTC)
 * @param {number} latDeg @param {number} lonDeg
 * @returns {{azDeg: number, elDeg: number}}
 */
export function positionSoleil(tMs, latDeg, lonDeg) {
  const d = tMs / 86400000 + 2440587.5 - 2451545.0;
  const g = (357.529 + 0.98560028 * d) * RAD, q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD, e = (23.439 - 0.00000036 * d) * RAD;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)), dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (((18.697374558 + 24.06570982441908 * d) % 24) + 24) % 24, H = (gmst * 15 + lonDeg) * RAD - ra, p = latDeg * RAD;
  const el = Math.asin(Math.sin(p) * Math.sin(dec) + Math.cos(p) * Math.cos(dec) * Math.cos(H)) / RAD;
  const az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(p) - Math.sin(p) * Math.cos(H)) / RAD;
  const refraction = el > -1.5 ? 1.02 / Math.tan((el + 10.3 / (el + 5.11)) * RAD) / 60 : 0;
  return { azDeg: (az + 360) % 360, elDeg: el + refraction };
}

/**
 * Position de la lune (topocentrique, réfraction comprise) : formules à basse précision de l'Astronomical Almanac, environ 0,3° ; la parallaxe (jusqu'à 1°, la lune est proche) est corrigée.
 * Suffisant pour chercher la tache brillante de la lune près de sa position prévue (fenêtre de plusieurs degrés). Pour le calage de nuit.
 * @param {number} tMs instant en ms depuis 1970 (UTC) @param {number} latDeg @param {number} lonDeg
 * @returns {{azDeg: number, elDeg: number}}
 */
export function positionLune(tMs, latDeg, lonDeg) {
  const d = tMs / 86400000 + 2440587.5 - 2451545.0, T = d / 36525, s = (/** @type {number} */ a) => Math.sin(a * RAD), c = (/** @type {number} */ a) => Math.cos(a * RAD);
  const lon = 218.32 + 481267.881 * T + 6.29 * s(135.0 + 477198.87 * T) - 1.27 * s(259.3 - 413335.36 * T) + 0.66 * s(235.7 + 890534.22 * T) + 0.21 * s(269.9 + 954397.74 * T) - 0.19 * s(357.5 + 35999.05 * T) - 0.11 * s(186.5 + 966404.03 * T);
  const lat = 5.13 * s(93.3 + 483202.02 * T) + 0.28 * s(228.2 + 960400.89 * T) - 0.28 * s(318.3 + 6003.15 * T) - 0.17 * s(217.6 - 407332.21 * T);
  const parallaxe = 0.9508 + 0.0518 * c(135.0 + 477198.87 * T) + 0.0095 * c(259.3 - 413335.36 * T) + 0.0078 * c(235.7 + 890534.22 * T) + 0.0028 * c(269.9 + 954397.74 * T);
  const eps = 23.439 - 0.00000036 * d; // obliquité, comme pour le soleil
  const l = lon * RAD, b = lat * RAD, e = eps * RAD;
  const x = Math.cos(b) * Math.cos(l), y = Math.cos(e) * Math.cos(b) * Math.sin(l) - Math.sin(e) * Math.sin(b), z = Math.sin(e) * Math.cos(b) * Math.sin(l) + Math.cos(e) * Math.sin(b);
  const ra = Math.atan2(y, x), dec = Math.asin(z);
  const gmst = (((18.697374558 + 24.06570982441908 * d) % 24) + 24) % 24, H = (gmst * 15 + lonDeg) * RAD - ra, p = latDeg * RAD;
  const elGeo = Math.asin(Math.sin(p) * Math.sin(dec) + Math.cos(p) * Math.cos(dec) * Math.cos(H)) / RAD;
  const az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(p) - Math.sin(p) * Math.cos(H)) / RAD;
  const el = elGeo - parallaxe * Math.cos(elGeo * RAD); // parallaxe : la lune paraît plus basse vue de la surface que du centre de la Terre
  const refraction = el > -1.5 ? 1.02 / Math.tan((el + 10.3 / (el + 5.11)) * RAD) / 60 : 0;
  return { azDeg: (az + 360) % 360, elDeg: el + refraction };
}

/**
 * Fraction éclairée du disque lunaire (0 nouvelle lune, 1 pleine lune) d'après l'élongation lune − soleil en longitude écliptique (précision de l'ordre du pour cent).
 * @param {number} tMs instant en ms depuis 1970 (UTC)
 * @returns {number}
 */
export function phaseLune(tMs) {
  const d = tMs / 86400000 + 2440587.5 - 2451545.0, T = d / 36525, s = (/** @type {number} */ a) => Math.sin(a * RAD);
  const lonLune = 218.32 + 481267.881 * T + 6.29 * s(135.0 + 477198.87 * T) - 1.27 * s(259.3 - 413335.36 * T) + 0.66 * s(235.7 + 890534.22 * T) + 0.21 * s(269.9 + 954397.74 * T) - 0.19 * s(357.5 + 35999.05 * T) - 0.11 * s(186.5 + 966404.03 * T);
  const g = 357.529 + 0.98560028 * d, lonSoleil = 280.459 + 0.98564736 * d + 1.915 * s(g) + 0.020 * s(2 * g);
  return (1 - Math.cos((lonLune - lonSoleil) * RAD)) / 2;
}
