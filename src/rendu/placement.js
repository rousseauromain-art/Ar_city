// @ts-check
/**
 * Placement des noms à l'écran, COMMUN à tous les calques (aucun calque ne place ses noms lui-même).
 * Noms inclinés à 45° en éventail depuis une ancre, test de chevauchement EXACT sur la bande inclinée contre tout ce qui est déjà posé,
 * mémoire de la place de l'image précédente (une étiquette qui ne saute pas d'une hauteur à l'autre se retrouve mieux), côté préféré puis
 * l'autre, en montant ligne par ligne. Noms à plat à côté d'une icône. Reprend `placeSlanted` et `placeFlat` de la v1.
 * Entrées : taille de l'écran, limite haute, réservations de départ (interface), mémoire. Sorties : positions, ou null. Dépend de : reservations.js.
 */
import { RAD } from '../noyau/constantes.js';
import { polygonesSeChevauchent, rectangleTouche } from './reservations.js';

/** @typedef {import('./reservations.js').Reservation} Reservation */
/** @typedef {import('./reservations.js').Polygone} Polygone */
/** @typedef {Map<string, {side: number, k: number}>} MemoirePlacement */

/** Pas vertical (px) entre deux hauteurs essayées pour un nom incliné. */
export const PAS_LIGNE_PX = 10;
/** Nombre maximal de lignes essayées en montant. */
export const LIGNES_MAX = 60;
/** Angle des noms inclinés. */
export const ANGLE_NOM_RAD = 45 * RAD;
/** Mémoire de placement : vidée au-delà de cette taille (v1 : 3000). */
export const MEMOIRE_MAX = 3000;
const cosA = Math.cos(ANGLE_NOM_RAD), sinA = Math.sin(ANGLE_NOM_RAD);

/**
 * @typedef {object} DemandeIncline
 * @property {number} x abscisse de l'ancre @property {number} base ordonnée de l'ancre
 * @property {number} off décalage horizontal du départ @property {number} lift hauteur du départ @property {number} len longueur du texte
 * @property {number} padTop @property {number} padBot marges au-dessus et au-dessous du texte @property {number} side côté préféré (-1 gauche, 1 droite)
 * @property {unknown} [own] propriétaire (ses propres réservations sont ignorées) @property {string} [memKey] clé de la mémoire de placement
 */

/**
 * @param {{largeurPx: number, hauteurPx: number, limiteHautePx: number, reservations: Reservation[], memoire: MemoirePlacement}} p
 * `reservations` est MODIFIÉ : chaque nom placé y ajoute sa place.
 */
export function creerPlaceur({ largeurPx: W, hauteurPx: H, limiteHautePx, reservations, memoire }) {
  if (memoire.size > MEMOIRE_MAX) memoire.clear();

  /**
   * Nom incliné à 45° en éventail. Réserve la place et renvoie { lx, ly, side }, ou null s'il n'y en a nulle part.
   * @param {DemandeIncline} o
   * @returns {{lx: number, ly: number, side: number} | null}
   */
  function placerIncline(o) {
    const { x, base, off, lift, len, padTop, padBot, own, memKey } = o;
    let sgn = o.side;
    const reach = 10 + len * cosA + padTop * sinA, tight = (/** @type {number} */ s) => (s < 0 && x - reach < 4) || (s > 0 && x + reach > W - 4);
    if (tight(sgn) && !tight(-sgn)) sgn = -sgn;
    /** @type {{lx: number, ly: number, side: number} | null} */
    let res = null;
    /** @returns {number} 1 placé, 0 occupé, -1 plus de place vers le haut */
    const essayer = (/** @type {number} */ side, /** @type {number} */ k) => {
      const lsx = x + side * off, lsy = base - lift - k * PAS_LIGNE_PX;
      /** @type {Polygone} */
      const poly = /** @type {Polygone} */ ([[0, -padTop], [side * len, -padTop], [side * len, padBot], [0, padBot]].map(([px, py]) => [lsx + px * cosA + py * side * sinA, lsy - side * px * sinA + py * cosA]));
      let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
      for (const [sx, sy] of poly) { if (sx < bx0) bx0 = sx; if (sx > bx1) bx1 = sx; if (sy < by0) by0 = sy; if (sy > by1) by1 = sy; }
      if (by0 < limiteHautePx) return -1;
      // test EXACT aussi contre les rectangles (icônes, bandeaux) : le rectangle englobant d'un nom incliné est énorme et bloquerait tout voisin
      if (reservations.some((r) => r[5] !== own && bx0 < r[1] + 6 && bx1 > r[0] - 6 && by0 < r[3] + 6 && by1 > r[2] - 6 && polygonesSeChevauchent(poly, r[4] || [[r[0], r[2]], [r[1], r[2]], [r[1], r[3]], [r[0], r[3]]], 5))) return 0;
      reservations.push([bx0, bx1, by0, by1, poly]);
      res = { lx: lsx, ly: lsy, side };
      return 1;
    };
    const mem = memKey ? memoire.get(memKey) : null;
    if (mem && !tight(mem.side) && essayer(mem.side, mem.k) === 1) return res;
    for (const side of [sgn, -sgn]) {
      if (side !== sgn && tight(side)) break;
      for (let k = 0; k < LIGNES_MAX; k++) {
        const r = essayer(side, k);
        if (r < 0) break;
        if (r === 1) { if (memKey) memoire.set(memKey, { side, k }); return res; }
      }
    }
    return null;
  }

  /**
   * Nom à plat à côté d'une icône, ligne par ligne vers le haut (dir -1) ou le bas (dir 1), du côté le plus dégagé d'abord. Réserve la place.
   * `anchorY` : fil VERTICAL de l'icône au nom, dont le couloir doit être libre et est réservé.
   * @param {{x: number, y0: number, halfW: number, w: number, size: number, own?: unknown, dir?: number, maxK?: number, anchorY?: number | null, sides?: number[]}} o
   * @returns {{x: number, y: number, side: number, w: number} | null}
   */
  function placerAPlat(o) {
    const { x, y0, halfW, w, size, own, anchorY } = o, dir = o.dir || -1, maxK = o.maxK || 12, bot = H - 8;
    const touche = (/** @type {number} */ x0, /** @type {number} */ x1, /** @type {number} */ y00, /** @type {number} */ y1, /** @type {number} */ m) => rectangleTouche(reservations, x0, x1, y00, y1, m, own);
    for (let k = 0; k < maxK; k++) {
      const fy = y0 + dir * k * (size + 6);
      if (fy - size - 2 < limiteHautePx || fy + 4 > bot) break;
      const aFil = anchorY !== undefined && anchorY !== null;
      const cy0 = !aFil ? 0 : dir > 0 ? /** @type {number} */ (anchorY) : fy + 4, cy1 = !aFil ? 0 : dir > 0 ? fy - size - 2 : /** @type {number} */ (anchorY);
      if (aFil && cy1 > cy0 && touche(x - 2, x + 2, cy0, cy1, 1)) continue; // le fil croiserait un nom déjà posé
      for (const side of (o.sides || (x < W / 2 ? [1, -1] : [-1, 1]))) {
        const fx0 = side > 0 ? x + halfW + 4 : x - halfW - 4 - w, fx1 = fx0 + w;
        if (fx0 < 4 || fx1 > W - 4) continue;
        if (!touche(fx0 - 2, fx1 + 2, fy - size - 2, fy + 4, 5)) {
          reservations.push([fx0 - 2, fx1 + 2, fy - size - 2, fy + 4]);
          if (aFil && cy1 > cy0) reservations.push([x - 2, x + 2, cy0, cy1]);
          return { x: fx0, y: fy, side, w };
        }
      }
    }
    return null;
  }

  return { placerIncline, placerAPlat, reservations, largeurPx: W, hauteurPx: H };
}
