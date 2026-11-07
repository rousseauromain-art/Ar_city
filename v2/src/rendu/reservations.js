// @ts-check
/**
 * Réservations de place à l'écran : ce qui est déjà posé (noms, icônes, boutons) et tests de chevauchement. Fonctions pures.
 * Rectangles [x0, x1, y0, y1] ; un rectangle peut porter un polygone convexe (nom incliné) et un propriétaire. Base commune de tous les calques
 * qui posent des noms (étape 5 et suivantes). Aucune dépendance.
 */

/** @typedef {[number, number][]} Polygone */
/** Réservation : [x0, x1, y0, y1, polygone ou null, propriétaire]. @typedef {[number, number, number, number, (Polygone|null)?, unknown?]} Reservation */

/**
 * Chevauchement exact de deux polygones convexes (axes séparateurs), avec une marge `m` en pixels (v1 : `polysOverlap`).
 * Les deux premiers côtés de chaque polygone suffisent : ce sont des rectangles (éventuellement inclinés).
 * @param {Polygone} P @param {Polygone} Q @param {number} m
 */
export function polygonesSeChevauchent(P, Q, m) {
  for (const poly of [P, Q]) for (let i = 0; i < 2; i++) {
    const a = poly[i], b = poly[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L;
    let p0 = Infinity, p1 = -Infinity, q0 = Infinity, q1 = -Infinity;
    for (const [x, y] of P) { const d = x * nx + y * ny; if (d < p0) p0 = d; if (d > p1) p1 = d; }
    for (const [x, y] of Q) { const d = x * nx + y * ny; if (d < q0) q0 = d; if (d > q1) q1 = d; }
    if (p1 + m <= q0 || q1 + m <= p0) return false; // axe séparateur trouvé : pas de chevauchement
  }
  return true;
}

/**
 * Un rectangle horizontal touche-t-il ce qui est déjà posé ? `propre` : réservation du même propriétaire, ignorée (v1 : `rectHit`).
 * @param {Reservation[]} posees @param {number} x0 @param {number} x1 @param {number} y0 @param {number} y1 @param {number} marge @param {unknown} [propre]
 */
export function rectangleTouche(posees, x0, x1, y0, y1, marge, propre) {
  /** @type {Polygone | null} */
  let q = null;
  return posees.some((r) => {
    if (propre && r[5] === propre) return false;
    if (!(x0 < r[1] + marge && x1 > r[0] - marge && y0 < r[3] + marge && y1 > r[2] - marge)) return false;
    if (!r[4]) return true;
    q = q || [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    return polygonesSeChevauchent(q, r[4], marge);
  });
}

/**
 * Réservations de départ : les rectangles de l'interface (colonne d'outils, bandeau, boutons du bas) que AUCUN nom ne doit recouvrir.
 * @param {{left: number, right: number, top: number, bottom: number}[]} rectanglesInterface
 * @returns {Reservation[]}
 */
export const reservationsInterface = (rectanglesInterface) => rectanglesInterface.filter((r) => r.right > r.left && r.bottom > r.top).map((r) => /** @type {Reservation} */ ([r.left, r.right, r.top, r.bottom]));
