// @ts-check
/**
 * CALAGE SUR LES TOITS (cap seulement) : en ville, la limite du ciel est faite des bâtiments, pas du relief. On aligne la limite du ciel lue dans l'image sur la silhouette théorique « maximum du relief et des bâtiments » (BD TOPO),
 * par direction, au pas de 0,1° et SANS lissage ni masque du premier plan. Pour le cap, seuls les bâtiments à plus de max(60 m, 8 × précision du GPS) comptent : de près, 10 m d'erreur de position décalent de 18° un immeuble à 30 m.
 * Le coût ne dépend pas de l'horizon (résidus recentrés sur leur médiane) : seul le cap est corrigé, jamais l'horizon ni le champ. Refus : peu de bâtiments dans le champ, silhouette plate, trop peu de colonnes lues, coût élevé,
 * ou alignement non unique (façades régulières, toits répétés : test de permutation, `calage/permutation.js`).
 * Fonction asynchrone SANS effet de bord. Dépend de : calage/horizon.js, calage/permutation.js, noyau/constantes.js.
 */
import { RAD } from '../noyau/constantes.js';
import { tableRelief, elevationRelief, observerHorizon, nettoyerPointsHorizon, ajusterHorizon } from './horizon.js';
import { alignementsAlternatifs } from './permutation.js';

/** Coût maximal (°) de l'ajustement sur les toits (plus strict que le relief : 0,6°). */
export const COUT_MAX_TOITS_DEG = 0.5;
/** Part minimale des directions du champ où un bâtiment est connu, et variation minimale (°) de la silhouette. */
export const COUVERTURE_MIN = 0.3, VARIATION_MIN_DEG = 1.5;
/** Colonnes d'horizon minimales. */
export const COLONNES_MIN_TOITS = 25;
/** Largeur (px) de l'image réduite lue pour les toits : plus fine que pour le relief (320) : le cap se joue au dixième de degré. */
export const LARGEUR_LUMINANCE_PX = 480;
/** Valeur de la silhouette sans relief ni bâtiment (horizon de la mer, un peu sous 0°). */
const HORIZON_PAR_DEFAUT_DEG = -0.1;

/**
 * Table « maximum du relief et des bâtiments » au pas de la silhouette des bâtiments (3600 directions).
 * @param {Float32Array | null} reliefTab table du relief (720 directions) ou null @param {Float32Array} batiments angles bruts des bâtiments (-99 : rien) @returns {Float32Array}
 */
export function tableFusionnee(reliefTab, batiments) {
  const t = new Float32Array(batiments.length), pas = 360 / batiments.length;
  for (let i = 0; i < t.length; i++) { const r = reliefTab ? elevationRelief(reliefTab, i * pas) : HORIZON_PAR_DEFAUT_DEG; t[i] = batiments[i] > -50 && batiments[i] > r ? batiments[i] : r; }
  return t;
}

/** Part des directions du champ (± champDeg/2) où un bâtiment est connu. @param {Float32Array} batiments @param {number} capDeg @param {number} champDeg */
export function couvertureBatiments(batiments, capDeg, champDeg) {
  const pas = 360 / batiments.length, n = Math.round(champDeg / pas);
  let avec = 0;
  for (let k = 0; k < n; k++) { const b = capDeg - champDeg / 2 + k * pas, i = Math.floor((((b % 360) + 360) % 360) / pas) % batiments.length; if (batiments[i] > -50) avec++; }
  return avec / Math.max(1, n);
}

/** Plus basse et plus haute élévation de la table dans ±`demiDeg` autour du cap. @param {Float32Array} tab @param {number} capDeg @param {number} demiDeg */
function plageElevations(tab, capDeg, demiDeg) {
  let lo = 90, hi = -90;
  for (let b = -demiDeg; b <= demiDeg; b += 0.5) { const e = elevationRelief(tab, capDeg + b); lo = Math.min(lo, e); hi = Math.max(hi, e); }
  return { lo, hi };
}

/**
 * @typedef {object} ContexteToits
 * @property {{capDeg: number, inclinaisonDeg: number, roulisDeg: number}} pose @property {number} camFov @property {{largeurPx: number, hauteurPx: number}} ecran @property {(cam: number) => number} champAffiche @property {boolean} photo
 * @property {(largeurPx: number) => import('./horizon.js').Luminance | null} lireLuminance @property {(pose: any, focalePx: number) => import('../vision/silhouette-ciel.js').SilhouetteCiel | null} lireSilhouette
 * @property {() => ArrayLike<Float32Array> | null} relief masque du relief ou null @property {() => Promise<{ang: Float32Array} | null>} toits silhouette brute des bâtiments (pas de 0,1°, bâtiments proches écartés) ou null
 */

/**
 * @param {ContexteToits} c
 * @returns {Promise<{ok: true, dh: number, cost: number, chance: number, message: string, pts: import('./horizon.js').PointHorizon[]} | {ok: false, raison: string}>}
 */
export async function calerSurToits(c) {
  const bat = await c.toits();
  if (!bat) return { ok: false, raison: 'bâtiments indisponibles' };
  const P = c.pose, cam0 = c.camFov, champ = c.champAffiche(cam0), fh = (c.ecran.largeurPx / 2) / Math.tan(champ / 2 * RAD);
  if (couvertureBatiments(bat.ang, P.capDeg, champ) < COUVERTURE_MIN) return { ok: false, raison: 'peu de bâtiments connus dans le champ' };
  const pm = c.relief(), tab = tableFusionnee(pm ? tableRelief(pm) : null, bat.ang);
  const { lo, hi } = plageElevations(tab, P.capDeg, champ / 2 + 22);
  if (hi - lo < VARIATION_MIN_DEG) return { ok: false, raison: 'silhouette des toits trop plate' };
  const fr = c.lireLuminance(LARGEUR_LUMINANCE_PX);
  if (!fr) return { ok: false, raison: 'image caméra illisible' };
  const pts = nettoyerPointsHorizon(observerHorizon(fr, P, fh, lo - 4, hi + 4, c.ecran), c.lireSilhouette(P, fh), P, fh, c.ecran).pts;
  if (pts.length < COLONNES_MIN_TOITS) return { ok: false, raison: `limite du ciel peu visible (${pts.length} colonnes)` };
  const courbe = /** @type {{dh: number, cost: number}[]} */ ([]), R = ajusterHorizon(pts, P, cam0, tab, c.ecran, c.champAffiche, { champ: false, courbe });
  if (R.flat) return { ok: false, raison: 'silhouette plate : cap indéterminé' };
  if (R.cost > COUT_MAX_TOITS_DEG) return { ok: false, raison: `toits incertains (écart ${R.cost.toFixed(2)}°)` };
  const alt = alignementsAlternatifs(courbe, { dh: R.dh, cost: R.cost });
  if (alt.n > 0 && alt.pire) return { ok: false, raison: `silhouette répétitive : un autre cap (${alt.pire.dh >= 0 ? '+' : ''}${alt.pire.dh.toFixed(1)}°) s'ajuste presque aussi bien` };
  return { ok: true, dh: R.dh, cost: R.cost, chance: alt.chance, pts, message: `calé sur les toits : cap ${R.dh >= 0 ? '+' : ''}${R.dh.toFixed(1)}° · précision ±${R.cost.toFixed(2)}°` };
}
