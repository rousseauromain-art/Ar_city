// @ts-check
/**
 * Axe de la rue tracé au sol (vérification après le calage sur la rue) : une ligne jaune pointillée le long du relèvement de l'axe, de 3 m à 400 m devant l'œil, posée sur le sol (plan horizontal à la hauteur de l'œil).
 * Entrées : relèvement de l'axe, hauteur de l'œil au-dessus du sol, vue de rendu. Sortie : commandes de dessin. Pur.
 * Dépend de : noyau/projection.js, noyau/commandes.js, noyau/maths.js, noyau/constantes.js.
 */
import { RAD } from '../noyau/constantes.js';
import { ecartAngle } from '../noyau/maths.js';
import { xDepuisEcart, yDepuisSite } from '../noyau/projection.js';
import { trait } from '../noyau/commandes.js';

/** Distances (m) échantillonnées le long de l'axe. */
const DISTANCES_M = [3, 5, 8, 12, 18, 27, 40, 60, 90, 130, 200, 300, 400];
/** Au-delà de cet écart au cap (°), le tracé est interrompu. */
const ECART_MAX_DEG = 80;

/**
 * @param {import('../noyau/projection.js').VueRendu} vue @param {{capDeg: number, oeilM: number}} axe
 * @returns {import('../noyau/commandes.js').Commande[]}
 */
export function commandesAxeRue(vue, { capDeg, oeilM }) {
  const ecart = ecartAngle(capDeg - vue.capDeg);
  if (Math.abs(ecart) > ECART_MAX_DEG) return [];
  const h = Math.max(1, oeilM);
  /** @type {import('../noyau/commandes.js').OperationChemin[]} */
  const chemin = DISTANCES_M.map((d, i) => /** @type {import('../noyau/commandes.js').OperationChemin} */ ([i ? 'L' : 'M', xDepuisEcart(vue, ecart), yDepuisSite(vue, -Math.atan2(h, d) / RAD)]));
  // l'axe est vertical à l'écran si l'on vise son sens ; il part du bas de l'image vers le point de fuite
  return [trait(chemin, 'rgba(14,26,43,.7)', 7, { jointure: 'round', extremite: 'round' }), trait(chemin, '#FFD23F', 3, { tirets: [10, 7], jointure: 'round', extremite: 'round' })];
}
