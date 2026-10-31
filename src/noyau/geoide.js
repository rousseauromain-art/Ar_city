// @ts-check
/**
 * Géoïde : ondulation N (m) en un point, par interpolation bilinéaire de la grille EGM96 à 3° (noyau/geoide-egm96.js). Erreur de l'ordre de 1 à 2 m en Europe.
 * Sert à une seule chose : l'altitude GPS d'Android est mesurée au-dessus de l'ellipsoïde WGS84 ; le relief et la hauteur d'œil sont au niveau de la mer. En Bretagne N vaut 49 m :
 * sans cette correction, l'œil paraît 48 m trop haut. Pur : aucune horloge, aucun réseau.
 */
import { PAS_DEG, LIGNES, COLONNES, GRILLE_DM } from './geoide-egm96.js';

/** Ondulation du géoïde (m) en un point. @param {number} lat @param {number} lon */
export function ondulationGeoide(lat, lon) {
  const la = Math.max(-90, Math.min(90, lat)), lo = ((((lon + 180) % 360) + 360) % 360) - 180;
  const fy = (la + 90) / PAS_DEG, fx = (lo + 180) / PAS_DEG, y0 = Math.min(LIGNES - 2, Math.floor(fy)), x0 = Math.min(COLONNES - 2, Math.floor(fx)), ty = fy - y0, tx = fx - x0;
  const v = (/** @type {number} */ y, /** @type {number} */ x) => GRILLE_DM[y * COLONNES + x] / 10;
  return (v(y0, x0) * (1 - tx) + v(y0, x0 + 1) * tx) * (1 - ty) + (v(y0 + 1, x0) * (1 - tx) + v(y0 + 1, x0 + 1) * tx) * ty;
}
