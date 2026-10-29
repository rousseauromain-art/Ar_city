// @ts-check
/**
 * Calque « bateaux » : classement (dans le champ, au-dessus de l'horizon, filtre par nom) des navires proches ; les icônes sont regroupées et réservées, les noms disposés
 * « en escalier » par rendu/mobiles.js et rendu/escalier.js pour TOUS les mobiles. Même règle de visibilité que les avions (superstructure de 12 m). Fonctions pures.
 * Entrées : mobiles proches (donnees/trafic.js), vue, altitude de l'œil. Sortie : éléments classés. Dépend de : calques/avions.js n'est PAS importé (règle : un calque n'en importe jamais un autre).
 */
import { positionnerMobile } from '../scene/mobiles.js';

/** @typedef {import('../donnees/trafic.js').Mobile} Mobile */
/** @typedef {Mobile & {x: number, y: number, ordre: number}} MobileEcran */
/** @typedef {{el: MobileEcran, etat: 'net' | 'absent', raison: string | null}} MobileClasse */

/**
 * @param {Mobile[]} mobiles liste complète (avions ET bateaux), triée par distance @param {import('../rendu/projection.js').VueRendu} vue
 * @param {{oeilM: number}} scene @param {{couche: boolean, filtre?: string}} reglages
 * @returns {MobileClasse[]}
 */
export function classerNavires(mobiles, vue, scene, reglages) {
  if (!reglages.couche) return [];
  /** @type {MobileClasse[]} */
  const out = [];
  mobiles.forEach((m, ordre) => {
    if (m.kind !== 'ship') return;
    const p = positionnerMobile(m, vue, scene.oeilM, reglages.filtre);
    out.push({ el: { ...m, x: p.x, y: p.y, ordre }, etat: p.etat, raison: p.raison });
  });
  return out;
}

/** Calque bateaux (interface commune, REFONTE.md §7). */
export const calque = {
  id: 'bateaux',
  libelle: 'Bateaux',
  /** @param {unknown} _zone @param {{mobiles: Mobile[]}} donnees */
  async charger(_zone, donnees) { return donnees.mobiles.filter((m) => m.kind === 'ship'); },
  classer: classerNavires,
  preparer: (/** @type {MobileClasse[]} */ classes) => classes.filter((c) => c.etat === 'net').map((c) => c.el),
};
