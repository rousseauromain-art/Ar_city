// @ts-check
/**
 * Repères communs de la scène : ligne d'horizon pointillée et réticule au centre de la ligne d'horizon. Fonction pure.
 * Entrée : vue de rendu. Sortie : commandes de dessin (rendu/commandes.js). Dépend de : projection.js, commandes.js.
 */
import { trait } from './commandes.js';
import { ordonneeHorizon } from './projection.js';

/** @typedef {import('./projection.js').VueRendu} VueRendu */

/** @param {VueRendu} vue @returns {import('./commandes.js').Commande[]} */
export function commandesHorizon(vue) {
  const W = vue.largeurPx, hy = ordonneeHorizon(vue);
  return [
    trait([['M', -W, hy], ['L', 2 * W, hy]], 'rgba(255,255,255,.75)', 1, { tirets: [3, 7] }),
    trait([['M', W / 2, hy - 9], ['L', W / 2, hy + 9], ['M', W / 2 - 9, hy], ['L', W / 2 + 9, hy]], '#E0A526', 1.5),
  ];
}
