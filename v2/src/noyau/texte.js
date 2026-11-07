// @ts-check
/**
 * Texte : normalisation pour comparer des noms (minuscules, sans accents). Fonction pure, aucune dépendance.
 */

/** Minuscules sans accents (v1 : `norm`). @param {string} t */
export const normaliser = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
