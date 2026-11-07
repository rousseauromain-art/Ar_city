// @ts-check
/**
 * POSITION PAR LES TOITS (essai) : une fois le cap juste, la limite du ciel lue dans l'image est comparée à la silhouette des bâtiments vue depuis chaque position d'une grille de ±20 m (pas de 4 m) autour de la position nettoyée ;
 * celle qui s'ajuste le mieux corrige la position. Retenue seulement si le coût baisse nettement (au moins 30 %) ET si l'alignement est unique (aucune autre position à plus de 8 m presque aussi bonne : façades régulières,
 * toits répétés, test de permutation, `calage/permutation.js`). Bâtiments à moins de 500 m seulement. Fonction PURE, exécutée dans un Worker (workers/position-toits.js).
 * Dépend de : calage/horizon.js, calage/toits.js, calage/permutation.js, scene/silhouette-batiments.js.
 */
import { coutSurTable } from './horizon.js';
import { tableFusionnee } from './toits.js';
import { alternatifs } from './permutation.js';
import { silhouetteBrute } from '../scene/silhouette-batiments.js';

/** Demi-largeur de la grille (m), pas (m), rayon des bâtiments (m). */
export const GRILLE_M = 20, PAS_M = 4, RAYON_BATIMENTS_M = 500;
/** Le coût doit baisser d'au moins 30 % ; une autre position à plus de 8 m ne doit pas être presque aussi bonne. */
export const GAIN_MIN = 0.7, EXCLUSION_M = 8;

/**
 * @typedef {object} EntreePositionToits
 * @property {{lat: number, lon: number}} pos position nettoyée @property {{h: number, pts: Float64Array, z?: number | null}[]} batiments @property {number} oeilRelM @property {number | null} h0
 * @property {import('./horizon.js').PointHorizon[]} pts limite du ciel lue @property {import('./horizon.js').PoseCalage} pose cap déjà calé @property {{largeurPx: number, hauteurPx: number}} ecran @property {number} fh focale (px)
 * @property {Float32Array | null} reliefTab table du relief (720 directions) ou null
 */

/** Décalage (nord, est) en mètres → position. @param {{lat: number, lon: number}} o @param {number} n @param {number} e */
const decaler = (o, n, e) => ({ lat: o.lat + n / 111320, lon: o.lon + e / (111320 * Math.cos((o.lat * Math.PI) / 180)) });

/**
 * @param {EntreePositionToits} e
 * @returns {{ok: true, pos: {lat: number, lon: number}, ecartM: number, cout: number, cout0: number} | {ok: false, raison: string}}
 */
export function corrigerPositionParToits({ pos, batiments, oeilRelM, h0, pts, pose, ecran, fh, reliefTab }) {
  const proches = batiments.filter((b) => { const dn = (b.pts[0] - pos.lat) * 111320, de = (b.pts[1] - pos.lon) * 111320 * Math.cos((pos.lat * Math.PI) / 180); return Math.hypot(dn, de) <= RAYON_BATIMENTS_M + GRILLE_M; });
  if (proches.length < 5) return { ok: false, raison: 'trop peu de bâtiments à moins de 500 m' };
  if (pts.length < 25) return { ok: false, raison: `limite du ciel peu visible (${pts.length} colonnes)` };
  /** @type {{n: number, e: number, cost: number}[]} */
  const grille = [];
  for (let n = -GRILLE_M; n <= GRILLE_M; n += PAS_M) for (let e = -GRILLE_M; e <= GRILLE_M; e += PAS_M) {
    const g = decaler(pos, n, e), brute = silhouetteBrute(proches, { pos: g, oeilRelM, h0, courbure: true, distMinM: 3 }).ang;
    grille.push({ n, e, cost: coutSurTable(pts, pose, tableFusionnee(reliefTab, brute), ecran, fh, 0).cost });
  }
  const centre = /** @type {{cost: number}} */ (grille.find((c) => !c.n && !c.e)), meilleur = grille.reduce((a, c) => (c.cost < a.cost ? c : a));
  if (meilleur.cost > centre.cost * GAIN_MIN) return { ok: false, raison: 'la position actuelle s\'ajuste déjà aussi bien que les voisines' };
  const alt = alternatifs(grille, meilleur, (c) => Math.hypot(c.n - meilleur.n, c.e - meilleur.e), { exclusion: EXCLUSION_M });
  if (alt.n > 0) return { ok: false, raison: 'plusieurs positions s\'ajustent presque aussi bien (silhouette répétitive)' };
  return { ok: true, pos: decaler(pos, meilleur.n, meilleur.e), ecartM: Math.hypot(meilleur.n, meilleur.e), cout: meilleur.cost, cout0: centre.cost };
}
