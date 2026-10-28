// @ts-check
/**
 * Modèle de dessin commun : un calque ne touche JAMAIS le canvas, il renvoie une liste de commandes. Seul rendu/canvas.js les exécute.
 * Entrées : calculs des calques. Sortie : commandes sérialisables (testables sans navigateur). Fonctions pures, aucune dépendance.
 */

/**
 * Opération de chemin : ['M', x, y] déplacer, ['L', x, y] ligne, ['Q', cx, cy, x, y] courbe quadratique, ['R', x, y, l, h, rayon] rectangle arrondi.
 * @typedef {['M', number, number] | ['L', number, number] | ['Q', number, number, number, number] | ['R', number, number, number, number, number]} OperationChemin
 */
/**
 * @typedef {object} CommandeTrait
 * @property {'trait'} type @property {OperationChemin[]} chemin @property {string} couleur @property {number} largeur
 * @property {number[]} tirets @property {'miter'|'round'|'bevel'} jointure @property {'butt'|'round'|'square'} extremite
 * @typedef {object} CommandeRemplissage
 * @property {'remplissage'} type @property {OperationChemin[]} chemin @property {string} couleur
 * @typedef {object} CommandeTexte
 * @property {'texte'} type @property {string} texte @property {number} x @property {number} y @property {string} police @property {string} couleur
 * @property {'left'|'center'|'right'} alignement @property {'alphabetic'|'middle'|'top'|'bottom'} ligneDeBase
 * @typedef {CommandeTrait | CommandeRemplissage | CommandeTexte} Commande
 */

/** Réglages de trait par défaut du canvas. */
const DEFAUTS = { tirets: /** @type {number[]} */ ([]), jointure: /** @type {'miter'} */ ('miter'), extremite: /** @type {'butt'} */ ('butt') };

/**
 * @param {OperationChemin[]} chemin @param {string} couleur @param {number} largeur
 * @param {{tirets?: number[], jointure?: 'miter'|'round'|'bevel', extremite?: 'butt'|'round'|'square'}} [style]
 * @returns {CommandeTrait}
 */
export const trait = (chemin, couleur, largeur, style = {}) => ({ type: 'trait', chemin, couleur, largeur, tirets: style.tirets ?? DEFAUTS.tirets, jointure: style.jointure ?? DEFAUTS.jointure, extremite: style.extremite ?? DEFAUTS.extremite });

/** @param {OperationChemin[]} chemin @param {string} couleur @returns {CommandeRemplissage} */
export const remplissage = (chemin, couleur) => ({ type: 'remplissage', chemin, couleur });

/**
 * @param {string} texte @param {number} x @param {number} y @param {string} police @param {string} couleur
 * @param {{alignement?: 'left'|'center'|'right', ligneDeBase?: 'alphabetic'|'middle'|'top'|'bottom'}} [options]
 * @returns {CommandeTexte}
 */
export const texte = (texte, x, y, police, couleur, options = {}) => ({ type: 'texte', texte, x, y, police, couleur, alignement: options.alignement ?? 'left', ligneDeBase: options.ligneDeBase ?? 'alphabetic' });

/**
 * Courbe passant par les milieux des points (quadratiques), du point `i0` au point `i1` — celle de la silhouette et des crêtes de la v1.
 * @param {{x: number, y: number}[]} pts @param {number} [i0] @param {number} [i1]
 * @returns {OperationChemin[]}
 */
export function courbeParLesMilieux(pts, i0 = 0, i1 = pts.length - 1) {
  /** @type {OperationChemin[]} */
  const ops = [['M', pts[i0].x, pts[i0].y]];
  for (let i = i0 + 1; i < i1; i++) ops.push(['Q', pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2]);
  ops.push(['L', pts[i1].x, pts[i1].y]);
  return ops;
}
