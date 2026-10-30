// @ts-check
/**
 * Visibilité d'un élément par rapport au relief : règle COMMUNE à tous les calques (REFONTE.md §1).
 * Entrées : relief calculé (altitude d'œil + masque), élément { dist, brg, kind, dem, ele, ht, src }. Sorties : angles et verdict.
 * Les autres raisons (trop loin, plafond, toits, monument devant, photo) arrivent avec les calques qui les portent.
 * Fonctions pures (v1 : `assessPlace` et la boucle de `applyOcclusion`). Dépend de : noyau, scene/relief.js.
 */
import { RAD, RAYON_EFFECTIF_M } from '../noyau/constantes.js';
import { masqueDans, altitudeEn, PROCHE_KM } from './relief.js';

/** @typedef {import('./relief.js').Bande} Bande */
/** @typedef {{oeilM: number, pm: ArrayLike<Float32Array>}} Masque */
/**
 * @typedef {object} Element
 * @property {number} dist distance (km) @property {number} brg relèvement (°) @property {string} [kind]
 * @property {number|null} [dem] altitude du sol sous l'élément (m) @property {number|null} [ele] altitude connue (m)
 * @property {number} [ht] hauteur propre (m) @property {string} [src]
 * @typedef {{aG: number, aP: number, mask: number, hidden: boolean, unknown: boolean, low: boolean}} Verdict
 */

/** Hauteur supposée d'un élément selon son type, en m (v1 : `HT`). */
export const HAUTEUR_TYPE_M = Object.freeze(/** @type {Record<string, number>} */ ({ lighthouse: 25, peak: 4, cape: 4, island: 30, rock: 4, view: 4, heritage: 10, beach: 1 }));
/** Hauteur par défaut, en m. */
export const HAUTEUR_DEFAUT_M = 12;
/** Tolérances angulaires (°) : lieux ordinaires et sommets/caps (relief fin ~1 m ⇒ assouplies par rapport aux 0,02°/0,12° du moteur 30 m). */
const TOLERANCES = Object.freeze({ lieu: 0.18, sommet: 0.28 });
/** Une tour OSM n'est nette que si son sommet dépasse la crête d'au moins ce nombre de degrés (v1 : `TOWER_CLEAR`). */
const TOUR_DEGAGEE_DEG = 0.15;

/**
 * Angles d'un élément et verdict de visibilité (v1 : `assessPlace`).
 * @param {Masque} masque @param {Element} c @param {number} hauteurM @param {{lieu?: number, sommet?: number}} [tol]
 * @returns {{aG: number, aP: number, mask: number, hidden: boolean, unknown: boolean}}
 */
export function evaluerElement(masque, c, hauteurM, tol = TOLERANCES) {
  const sommet = c.kind === 'peak' || c.kind === 'cape';
  const connu = (/** @type {number|null|undefined} */ x) => x !== null && x !== undefined;
  /** @type {number|null|undefined} */
  let eP = c.dem;
  if (connu(c.ele) && (sommet || !connu(eP))) eP = Math.max(/** @type {number} */ (c.ele), connu(eP) ? /** @type {number} */ (eP) : -1e9);
  const unknown = !connu(eP);
  if (!connu(eP)) eP = 0;
  const sol = /** @type {number} */ (eP);
  const Dm = c.dist * 1000, chute = (Dm * Dm) / (2 * RAYON_EFFECTIF_M);
  const aG = Math.atan2(sol - masque.oeilM - chute, Dm) / RAD, aP = Math.atan2(sol + hauteurM - masque.oeilM - chute, Dm) / RAD;
  const mask = masqueDans(masque.pm, c.brg, c.dist - Math.max(0.25, c.dist * (sommet ? 0.07 : 0.03)));
  const seuil = sommet ? (tol.sommet ?? TOLERANCES.sommet) : (tol.lieu ?? TOLERANCES.lieu);
  return { aG, aP, mask, hidden: c.dist > 0.3 && aP + seuil < mask, unknown };
}

/**
 * Verdict relief d'un élément avec la règle des tours OSM (v1 : corps de la boucle de `applyOcclusion`).
 * @param {Masque} masque @param {Bande[]} bands @param {Element & {lat: number, lon: number}} c
 * @param {{lieu?: number, sommet?: number}} [tol]
 * @returns {Verdict}
 */
export function verdictRelief(masque, bands, c, tol = TOLERANCES) {
  const dem = c.dem !== undefined ? c.dem : demDe(bands, c);
  const r = evaluerElement(masque, { ...c, dem }, c.ht ?? (c.kind ? HAUTEUR_TYPE_M[c.kind] : undefined) ?? HAUTEUR_DEFAUT_M, tol);
  let { hidden } = r, low = false;
  if (c.src === 'osm' && !hidden && c.dist > PROCHE_KM && r.aP - r.mask < TOUR_DEGAGEE_DEG) { hidden = true; low = true; }
  return { ...r, hidden, low };
}

/** Altitude du sol sous un élément, null si hors couverture. @param {Bande[]} bands @param {{lat: number, lon: number, dist: number}} c */
function demDe(bands, c) {
  const e = altitudeEn(bands, c.lat, c.lon, c.dist);
  return Number.isNaN(e) ? null : e;
}
