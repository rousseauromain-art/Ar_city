// @ts-check
/**
 * Visibilité d'un mobile (avion ou bateau) depuis l'observateur : règle COMMUNE aux calques avions et bateaux. Dans le champ (au plus 80°, ou 80 % du champ, du cap ; à 40 px
 * de l'écran), au-dessus de l'horizon que la rotondité de la Terre laisse voir. Hauteur utile : l'altitude barométrique pour un avion, 12 m de superstructure pour un navire.
 * Sortie : position à l'écran de l'icône (ordonnée bornée à [-60, H+60]) et raison d'une absence. Fonction pure (v1 : début du bloc « mobiles » de `draw()`).
 * Dépend de : noyau/constantes.js, noyau/projection.js.
 */
import { RAD, RAYON_EFFECTIF_M } from '../noyau/constantes.js';
import { ecartAngle, borner } from '../noyau/maths.js';
import { normaliser } from '../noyau/texte.js';
import { xDepuisEcart, yDepuisSite } from '../noyau/projection.js';

/** Hauteur supposée (m) de la superstructure d'un navire. */
export const HAUTEUR_NAVIRE_M = 12;

/**
 * @param {{kind: 'plane' | 'ship', name: string, dist: number, brg: number, alt: number}} m
 * @param {import('../noyau/projection.js').VueRendu} vue @param {number} oeilM altitude de l'œil (sol + 1,6 m + correction)
 * @param {string} [filtre] réglage « chercher » (nom normalisé)
 * @returns {{etat: 'net' | 'absent', raison: string | null, x: number, y: number}}
 */
export function positionnerMobile(m, vue, oeilM, filtre) {
  const hors = (/** @type {string} */ raison) => ({ etat: /** @type {const} */ ('absent'), raison, x: NaN, y: NaN });
  if (filtre && !normaliser(m.name).includes(filtre)) return hors('écarté par la recherche');
  const dB = ecartAngle(m.brg - vue.capDeg);
  if (Math.abs(dB) > Math.min(80, vue.champDeg * 0.8)) return hors('hors du champ');
  const x = xDepuisEcart(vue, dB);
  if (x < -40 || x > vue.largeurPx + 40) return hors('hors du champ');
  const Dm = m.dist * 1000, hzA = -Math.sqrt(2 * Math.max(0.5, oeilM) / RAYON_EFFECTIF_M) / RAD; // angle de l'horizon visible
  const elev = Math.atan2((m.kind === 'plane' ? m.alt : HAUTEUR_NAVIRE_M) - oeilM - (Dm * Dm) / (2 * RAYON_EFFECTIF_M), Dm) / RAD;
  if (elev < hzA) return hors('masqué par la courbure de la Terre');
  return { etat: 'net', raison: null, x, y: borner(yDepuisSite(vue, elev), -60, vue.hauteurPx + 60) };
}
