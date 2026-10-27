// @ts-check
/**
 * Maths élémentaires sur les angles. Fonctions pures, sans dépendance.
 * Entrées/sorties en degrés sauf mention contraire.
 */
import { RAD } from './constantes.js';

/** Ramène un écart d'angle dans [-180, 180[ (v1 : `wrap`). @param {number} angDeg */
export const ecartAngle = (angDeg) => ((angDeg + 540) % 360) - 180;

/** Ramène un cap dans [0, 360[. @param {number} capDeg */
export const normaliserCap = (capDeg) => ((capDeg % 360) + 360) % 360;

/** @param {number} v @param {number} min @param {number} max */
export const borner = (v, min, max) => Math.max(min, Math.min(max, v));

/** @param {number} deg */
export const enRadians = (deg) => deg * RAD;

/** @param {number} rad */
export const enDegres = (rad) => rad / RAD;
