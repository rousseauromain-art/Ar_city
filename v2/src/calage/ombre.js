// @ts-check
/**
 * Cap par les OMBRES : l'utilisateur trace au doigt l'ombre d'un poteau ou d'une arête verticale, du pied vers le bout. Le trait est ramené au sol (plan horizontal à la hauteur de l'œil) avec la pose (cap affiché, inclinaison, roulis) ;
 * l'ombre pointe à l'opposé du soleil : azimut du soleil + 180°, déjà calculé. L'écart entre cette direction et celle du trait donne la correction du cap.
 * Refus : soleil à moins de 10° de hauteur (ombre trop longue et imprécise), trait trop court, trait au-dessus de l'horizon, direction incohérente avec le soleil (ciel couvert : pas d'ombre).
 * Entrées : trait en pixels, pose, champ, écran, hauteur de l'œil, soleil. Sortie : `{ok: true, dh, ...}` ou `{ok: false, message}`. Fonction PURE. Dépend de : noyau/maths.js, noyau/constantes.js.
 */
import { RAD } from '../noyau/constantes.js';
import { ecartAngle, normaliserCap } from '../noyau/maths.js';

/** Hauteur minimale (°) du soleil : plus bas, l'ombre s'allonge et se déforme. */
export const SOLEIL_MIN_DEG = 10;
/** Longueur minimale (px) du trait, et au sol (m). */
export const TRAIT_MIN_PX = 30, OMBRE_MIN_M = 0.2;
/** Correction maximale plausible (°) : au-delà, l'ombre tracée n'est pas celle du soleil (ciel couvert, lampe, reflet). */
export const CORRECTION_MAX_DEG = 100;

/**
 * Point du sol (est, nord en m depuis l'œil) vu au pixel (x, y), ou null si le rayon ne descend pas vers le sol.
 * Repère : x vers la droite, y vers le bas ; la caméra regarde vers `capDeg` et est inclinée de `inclinaisonDeg` (positif : vers le haut) ; roulis corrigé.
 * @param {number} x @param {number} y @param {{capDeg: number, inclinaisonDeg: number, roulisDeg: number}} pose @param {number} fh focale (px) @param {{largeurPx: number, hauteurPx: number}} ecran @param {number} oeilM
 * @returns {{est: number, nord: number} | null}
 */
export function pointDuSol(x, y, pose, fh, ecran, oeilM) {
  const dx = x - ecran.largeurPx / 2, dy = ecran.hauteurPx / 2 - y, r = pose.roulisDeg * RAD, u = (dx * Math.cos(r) + dy * Math.sin(r)) / fh, v = (-dx * Math.sin(r) + dy * Math.cos(r)) / fh;
  const C = pose.capDeg * RAD, E = pose.inclinaisonDeg * RAD;
  const rayEst = Math.cos(E) * Math.sin(C) + u * Math.cos(C) - v * Math.sin(E) * Math.sin(C), rayNord = Math.cos(E) * Math.cos(C) - u * Math.sin(C) - v * Math.sin(E) * Math.cos(C), rayHaut = Math.sin(E) + v * Math.cos(E);
  if (rayHaut >= -1e-3) return null;
  const t = -Math.max(0.5, oeilM) / rayHaut;
  return { est: t * rayEst, nord: t * rayNord };
}

/**
 * @param {{trait: {pied: {x: number, y: number}, bout: {x: number, y: number}}, pose: {capDeg: number, inclinaisonDeg: number, roulisDeg: number}, champDeg: number, ecran: {largeurPx: number, hauteurPx: number}, oeilM: number,
 *   soleil: {azDeg: number, elDeg: number} | null}} e
 * @returns {{ok: true, dh: number, azOmbreDeg: number, azTraceDeg: number, longueurM: number, message: string} | {ok: false, message: string}}
 */
export function capDepuisOmbre({ trait, pose, champDeg, ecran, oeilM, soleil }) {
  if (!soleil) return { ok: false, message: 'soleil inconnu (position ou heure manquante)' };
  if (soleil.elDeg < SOLEIL_MIN_DEG) return { ok: false, message: `soleil trop bas (${soleil.elDeg.toFixed(0)}° : moins de ${SOLEIL_MIN_DEG}°) : l'ombre est trop longue pour caler` };
  if (Math.hypot(trait.bout.x - trait.pied.x, trait.bout.y - trait.pied.y) < TRAIT_MIN_PX) return { ok: false, message: 'trait trop court : tracez toute l\'ombre, du pied vers le bout' };
  const fh = (ecran.largeurPx / 2) / Math.tan((champDeg / 2) * RAD), a = pointDuSol(trait.pied.x, trait.pied.y, pose, fh, ecran, oeilM), b = pointDuSol(trait.bout.x, trait.bout.y, pose, fh, ecran, oeilM);
  if (!a || !b) return { ok: false, message: 'le trait doit rester au sol : tracez l\'ombre sur le sol, pas vers le ciel' };
  const longueurM = Math.hypot(b.est - a.est, b.nord - a.nord);
  if (longueurM < OMBRE_MIN_M) return { ok: false, message: 'ombre trop courte au sol' };
  const azTraceDeg = normaliserCap((Math.atan2(b.est - a.est, b.nord - a.nord) / RAD)), azOmbreDeg = normaliserCap(soleil.azDeg + 180), dh = ecartAngle(azOmbreDeg - azTraceDeg);
  if (Math.abs(dh) > CORRECTION_MAX_DEG) return { ok: false, message: `ombre incohérente avec le soleil (${Math.round(Math.abs(dh))}° d'écart) : ciel couvert ou autre source de lumière ?` };
  return { ok: true, dh, azOmbreDeg, azTraceDeg, longueurM, message: `calé sur l'ombre (soleil ${soleil.azDeg.toFixed(0)}° / ${soleil.elDeg.toFixed(0)}°, ombre de ${longueurM.toFixed(1)} m) : cap ${dh >= 0 ? '+' : ''}${dh.toFixed(1)}°` };
}
