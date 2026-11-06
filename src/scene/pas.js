// @ts-check
/**
 * Garder la position corrigée (rue, toits, plaque) en marchant : les pas sont comptés par l'accéléromètre (pic de la norme de l'accélération au-dessus de la gravité), chaque pas fait avancer la position corrigée de
 * 0,7 m (réglable) dans la direction du cap fusionné. Le GPS ne reprend la main que s'il s'écarte de la position corrigée de plus de 2 fois sa précision pendant 20 s (une correction fausse ou périmée ne s'accroche pas).
 * Entrées : échantillons d'accélération { x, y, z, t }, cap, longueur de pas, fix GPS. Sorties : pas détectés, position corrigée, reprise par le GPS. Fonctions PURES (l'état est rendu, jamais modifié).
 */

/** Pic d'accélération dynamique (m/s²) au-dessus de la gravité pour compter un pas ; réarmement sous 0,3 m/s². */
export const SEUIL_PAS = 1.2, SEUIL_REARMEMENT = 0.3;
/** Intervalle (ms) minimal entre deux pas (4 pas/s au plus). */
export const INTERVALLE_MIN_MS = 250;
/** Longueur d'un pas (m) par défaut. */
export const LONGUEUR_PAS_M = 0.7;
/** Le GPS reprend la main s'il s'écarte de plus de 2 × sa précision pendant 20 s. */
export const FACTEUR_ECART = 2, DUREE_ECART_MS = 20000;
/** Lissage de la gravité (moyenne glissante exponentielle). */
const ALPHA_GRAVITE = 0.05;

/** @typedef {{lat: number, lon: number}} Point */
/** @typedef {{base: number, arme: boolean, derniereMs: number}} EtatPas */

/** @returns {EtatPas} */
export const etatPasInitial = () => ({ base: 9.81, arme: true, derniereMs: -Infinity });

/**
 * Un échantillon d'accélération (avec gravité) : y a-t-il un pas ?
 * @param {EtatPas} etat @param {{x: number, y: number, z: number, t: number}} a @returns {{etat: EtatPas, pas: boolean}}
 */
export function detecterPas(etat, a) {
  const m = Math.hypot(a.x, a.y, a.z), base = etat.base + (m - etat.base) * ALPHA_GRAVITE, dyn = m - base;
  if (etat.arme && dyn > SEUIL_PAS && a.t - etat.derniereMs >= INTERVALLE_MIN_MS) return { etat: { base, arme: false, derniereMs: a.t }, pas: true };
  return { etat: { base, arme: etat.arme || dyn < SEUIL_REARMEMENT, derniereMs: etat.derniereMs }, pas: false };
}

/** Position avancée de `n` pas de `longueurM` mètres dans la direction `capDeg`. @param {Point} pos @param {number} capDeg @param {number} longueurM @param {number} [n] @returns {Point} */
export function avancer(pos, capDeg, longueurM, n = 1) {
  const d = longueurM * n, c = (capDeg * Math.PI) / 180;
  return { lat: pos.lat + (d * Math.cos(c)) / 111320, lon: pos.lon + (d * Math.sin(c)) / (111320 * Math.cos((pos.lat * Math.PI) / 180)) };
}

/** @typedef {{pos: Point, ecartDepuisMs: number | null, pas: number}} Correction */
/** Une position vient d'être corrigée (rue, toits, plaque). @param {Point} pos @returns {Correction} */
export const poserCorrection = (pos) => ({ pos: { lat: pos.lat, lon: pos.lon }, ecartDepuisMs: null, pas: 0 });
/** Un pas : la position corrigée avance. @param {Correction} corr @param {number} capDeg @param {number} longueurM @returns {Correction} */
export const surPas = (corr, capDeg, longueurM) => ({ ...corr, pos: avancer(corr.pos, capDeg, longueurM), pas: corr.pas + 1 });

/** Distance (m) entre deux points proches. @param {Point} a @param {Point} b */
const distanceM = (a, b) => Math.hypot((b.lat - a.lat) * 111320, (b.lon - a.lon) * 111320 * Math.cos((a.lat * Math.PI) / 180));

/**
 * Un fix GPS : la correction tient tant que le GPS reste à moins de 2 × sa précision ; au-delà pendant 20 s, le GPS reprend la main (`corr` devient null).
 * @param {Correction} corr @param {{pos: Point, precisionM: number, t: number}} gps @returns {{corr: Correction | null, reprise: boolean}}
 */
export function surGps(corr, gps) {
  if (distanceM(corr.pos, gps.pos) <= FACTEUR_ECART * Math.max(1, gps.precisionM)) return { corr: { ...corr, ecartDepuisMs: null }, reprise: false };
  const depuis = corr.ecartDepuisMs ?? gps.t;
  if (gps.t - depuis >= DUREE_ECART_MS) return { corr: null, reprise: true };
  return { corr: { ...corr, ecartDepuisMs: depuis }, reprise: false };
}
