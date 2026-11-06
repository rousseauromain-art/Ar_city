// @ts-check
/**
 * Test contre les coïncidences (« permutation ») pour un alignement par silhouette. Une ville de façades régulières ou de toits répétés donne plusieurs caps presque aussi bons que le bon : l'alignement n'est alors
 * pas unique et le calage serait « précis mais faux » (Turin, 26/10/2026, pour les repères : `calage/reperes.js`). On compare le meilleur alignement à TOUS les autres essayés (décalages de cap de la recherche, pas de 0,5° :
 * l'équivalent exhaustif et déterministe de décalages aléatoires de la silhouette) : si un autre, à plus de `exclusionDeg` du meilleur, a un coût presque égal, on refuse.
 * Fonction PURE.
 */

/** Écart (°) autour du meilleur cap dont les voisins ne comptent pas (ce sont des variantes du même alignement). */
export const EXCLUSION_DEG = 3;
/** Un autre alignement est « presque aussi bon » si son coût est au plus celui du meilleur × 1,25 + 0,05°. */
export const FACTEUR_COUT = 1.25, MARGE_COUT_DEG = 0.05;

/**
 * Version générale (une dimension ou plus) : les candidats à plus de `exclusion` du meilleur (selon `ecart`) dont le coût est presque égal au sien.
 * @template {{cost: number}} C @param {C[]} candidats @param {C} meilleur @param {(c: C) => number} ecart distance au meilleur @param {{exclusion: number, facteur?: number, marge?: number}} o
 * @returns {{n: number, total: number, chance: number, pire: C | null}}
 */
export function alternatifs(candidats, meilleur, ecart, { exclusion, facteur = FACTEUR_COUT, marge = MARGE_COUT_DEG }) {
  const autres = candidats.filter((c) => ecart(c) >= exclusion), proches = autres.filter((c) => c.cost <= meilleur.cost * facteur + marge);
  return { n: proches.length, total: autres.length, chance: autres.length ? proches.length / autres.length : 0, pire: proches.length ? proches.reduce((a, c) => (c.cost < a.cost ? c : a)) : null };
}

/**
 * @param {{dh: number, cost: number}[]} courbe coût de chaque cap essayé @param {{dh: number, cost: number}} meilleur @param {{exclusionDeg?: number, facteur?: number, marge?: number}} [o]
 * @returns {{n: number, total: number, chance: number, pire: {dh: number, cost: number} | null}} `chance` : part des autres alignements presque aussi bons (0 : l'alignement est unique)
 */
export function alignementsAlternatifs(courbe, meilleur, { exclusionDeg = EXCLUSION_DEG, facteur = FACTEUR_COUT, marge = MARGE_COUT_DEG } = {}) {
  return alternatifs(courbe, meilleur, (c) => Math.abs(c.dh - meilleur.dh), { exclusion: exclusionDeg, facteur, marge });
}
