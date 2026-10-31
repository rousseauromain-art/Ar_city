// @ts-check
/**
 * Calque « avions » : classement (dans le champ, au-dessus de l'horizon, filtre par nom) des avions proches ; le regroupement des icônes, la réservation de leur place et
 * les noms sont faits par rendu/mobiles.js pour TOUS les mobiles. Fonctions pures. Entrées : mobiles proches (donnees/trafic.js, triés par distance), vue, altitude de l'œil.
 * Sortie : éléments classés (état, raison, position à l'écran). Reprend le début du bloc « mobiles » de `draw()` de la v1. Dépend de : scene/mobiles.js.
 */
import { positionnerMobile } from '../scene/mobiles.js';

/** @typedef {import('../donnees/trafic.js').Mobile} Mobile */
/** @typedef {Mobile & {x: number, y: number, ordre: number}} MobileEcran */
/** @typedef {{el: MobileEcran, etat: 'net' | 'absent', raison: string | null}} MobileClasse */

/**
 * @param {Mobile[]} mobiles liste complète (avions ET bateaux), triée par distance : `ordre` garde le rang d'origine pour fusionner avec les bateaux
 * @param {import('../noyau/projection.js').VueRendu} vue @param {{oeilM: number}} scene @param {{couche: boolean, filtre?: string}} reglages
 * @param {'plane' | 'ship'} [genre]
 * @returns {MobileClasse[]}
 */
export function classerMobiles(mobiles, vue, scene, reglages, genre = 'plane') {
  if (!reglages.couche) return [];
  /** @type {MobileClasse[]} */
  const out = [];
  mobiles.forEach((m, ordre) => {
    if (m.kind !== genre) return;
    const p = positionnerMobile(m, vue, scene.oeilM, reglages.filtre);
    out.push({ el: { ...m, x: p.x, y: p.y, ordre }, etat: p.etat, raison: p.raison });
  });
  return out;
}

/** Calque avions (interface commune, REFONTE.md §7). */
export const calque = {
  id: 'avions',
  libelle: 'Avions',
  /** @param {unknown} _zone @param {{mobiles: Mobile[]}} donnees */
  async charger(_zone, donnees) { return donnees.mobiles.filter((m) => m.kind === 'plane'); },
  classer: classerMobiles,
  preparer: (/** @type {MobileClasse[]} */ classes) => classes.filter((c) => c.etat === 'net').map((c) => c.el),
};
