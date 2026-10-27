// @ts-check
/**
 * Astronomie : position du soleil (formules usuelles, précision ~0,01°, réfraction comprise). Fonction pure.
 * Entrée : instant (ms UTC), position. Sortie : azimut (° depuis le nord, vers l'est) et élévation apparente (°).
 * La lune viendra avec le drapeau `lune` (étape de calage de nuit). Dépend de : constantes.js.
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
