// @ts-check
/**
 * Repères communs de la scène : ligne d'horizon pointillée et réticule au centre de la ligne d'horizon. Fonction pure.
 * Entrée : vue de rendu. Sortie : commandes de dessin (noyau/commandes.js). Dépend de : projection.js, commandes.js.
 */
import { trait } from '../noyau/commandes.js';
import { ordonneeHorizon } from '../noyau/projection.js';

/** @typedef {import('../noyau/projection.js').VueRendu} VueRendu */

/** @param {VueRendu} vue @returns {import('../noyau/commandes.js').Commande[]} */
export function commandesHorizon(vue) {
  const W = vue.largeurPx, hy = ordonneeHorizon(vue);
  return [
    trait([['M', -W, hy], ['L', 2 * W, hy]], 'rgba(255,255,255,.75)', 1, { tirets: [3, 7] }),
    trait([['M', W / 2, hy - 9], ['L', W / 2, hy + 9], ['M', W / 2 - 9, hy], ['L', W / 2 + 9, hy]], '#E0A526', 1.5),
  ];
}
