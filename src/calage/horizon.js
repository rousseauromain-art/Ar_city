// @ts-check
/**
 * CALAGE SUR LE RELIEF : l'horizon lu dans l'image (plus forte transition clair → sombre de chaque colonne, dans la bande d'élévations où le relief calculé peut se trouver) est comparé à la
 * silhouette théorique du relief (tuiles d'altitude) ; on ajuste le cap, l'horizon et, si le relief est marqué, le champ de la caméra. Coût robuste (écart quadratique moyen sur les 70 %
 * de colonnes les mieux ajustées) : insensible aux poteaux, palmiers et reflets isolés. Quelques dizaines de ms sur un téléphone.
 * Fonctions pures. Les boucles, les pas de grille et l'ordre des calculs sont ceux de la v1 (bloc `CALAGE-CORE`) : le résultat est numériquement identique.
 * Entrées : luminance de l'image réduite, pose, focale, table du relief. Sortie : points d'horizon, puis {dh, dp, cam, cost, flat, n, relief}. Dépend de : scene/relief.js, noyau/constantes.js.
 */
import { RAD } from '../noyau/constantes.js';
import { ecartAngle } from '../noyau/maths.js';
import { masqueDans, NB_RELEVEMENTS, PAS_RELEVEMENT_DEG } from '../scene/relief.js';

/** Relief minimal dans le champ (°) pour que le CHAMP de la caméra soit cherché, et sous lequel l'horizon est « plat » (cap et champ indéterminés). */
export const RELIEF_MIN_CHAMP_DEG = 1.5, RELIEF_PLAT_DEG = 0.25;
/** Le champ n'est retenu que s'il améliore le coût d'au moins 15 %. */
const GAIN_CHAMP = 0.85;

/** @typedef {{L: Float32Array, cw: number, ch: number}} Luminance */
/** @typedef {{x: number, y: number, s: number}} PointHorizon */
/** @typedef {{capDeg: number, inclinaisonDeg: number, roulisDeg: number}} PoseCalage */
/** @typedef {{largeurPx: number, hauteurPx: number}} EcranCalage */

/**
 * Luminance (0,299 R + 0,587 G + 0,114 B) d'une image RGBA réduite (v1 : fin de `grabFrame`).
 * @param {{d: Uint8ClampedArray | Uint8Array, cw: number, ch: number}} px @returns {Luminance}
 */
export function luminance({ d, cw, ch }) {
  const L = new Float32Array(cw * ch);
  for (let i = 0, j = 0; j < L.length; i += 4, j++) L[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  return { L, cw, ch };
}

/** Table du relief : l'angle de la silhouette pour chacun des 720 relèvements (v1 : `skyTable`). @param {ArrayLike<Float32Array>} pm */
export function tableRelief(pm) { const t = new Float32Array(NB_RELEVEMENTS); for (let i = 0; i < NB_RELEVEMENTS; i++) t[i] = masqueDans(pm, i * PAS_RELEVEMENT_DEG, 1e9); return t; }
/** Angle du relief dans une direction, interpolé (v1 : `skyAtT`). @param {Float32Array} t @param {number} b */
export function elevationRelief(t, b) { const f = (((b % 360) + 360) % 360) / PAS_RELEVEMENT_DEG, i = Math.floor(f) % NB_RELEVEMENTS, u = f - Math.floor(f); return t[i] * (1 - u) + t[(i + 1) % NB_RELEVEMENTS] * u; }

/**
 * Points de l'horizon lus dans l'image : par colonne, la plus forte transition clair → sombre dans la bande d'élévations [eMin, eMax].
 * @param {Luminance} fr @param {PoseCalage} P @param {number} fh focale (px d'écran) @param {number} eMin @param {number} eMax @param {EcranCalage} ecran
 * @returns {PointHorizon[]}
 */
export function observerHorizon(fr, P, fh, eMin, eMax, ecran) {
  const { L, cw, ch } = fr, W = ecran.largeurPx, H = ecran.hauteurPx, k = cw / W, cx = W / 2, cy = H / 2, cr = Math.cos(P.roulisDeg * RAD), sr = Math.sin(P.roulisDeg * RAD);
  const y0 = cy + fh * Math.tan((P.inclinaisonDeg - eMax) * RAD), y1 = cy + fh * Math.tan((P.inclinaisonDeg - eMin) * RAD), step = 1 / k;
  /** @type {PointHorizon[]} */
  const pts = [];
  const lum = (/** @type {number} */ xs, /** @type {number} */ ys) => { // point du repère de la scène → écran (roulis) → pixel capturé
    const dx = xs - cx, dy = ys - cy, px = Math.round((cx + dx * cr - dy * sr) * k), py = Math.round((cy + dx * sr + dy * cr) * k);
    return (px < 0 || py < 0 || px >= cw || py >= ch) ? NaN : L[py * cw + px];
  };
  for (let xs = W * 0.03; xs <= W * 0.97; xs += W / 110) {
    /** @type {number[]} */
    const prof = [];
    for (let ys = y0; ys <= y1; ys += step) prof.push(lum(xs, ys));
    let best = -1, bi = -1;
    for (let i = 3; i < prof.length - 3; i++) {
      const a = (prof[i - 3] + prof[i - 2] + prof[i - 1]) / 3, b = (prof[i + 1] + prof[i + 2] + prof[i + 3]) / 3, s = a - b;
      if (s === s && s > best) { best = s; bi = i; }
    }
    if (best >= 8 && bi > 4 && bi < prof.length - 5) pts.push({ x: xs, y: y0 + bi * step, s: best });
  }
  return pts;
}

/**
 * Écarte les colonnes où l'image montre un objet non-ciel PLUS HAUT que le bord lu (parasols, passants, mâts) : on compare à la silhouette du ciel (vision/silhouette-ciel.js).
 * Au moins 25 points sinon le filtre est ignoré. @param {PointHorizon[]} pts @param {{ok: boolean, cols: {brg: number, a: number}[]} | null} silhouette
 * @param {PoseCalage} P @param {number} fh @param {EcranCalage} ecran @returns {{pts: PointHorizon[], dropped: number}}
 */
export function nettoyerPointsHorizon(pts, silhouette, P, fh, ecran) {
  if (!silhouette || !silhouette.ok || !silhouette.cols.length) return { pts, dropped: 0 };
  const cols = silhouette.cols.map((c) => ({ dd: ecartAngle(c.brg - P.capDeg), a: c.a })).sort((x, y) => x.dd - y.dd);
  const out = pts.filter((p) => {
    const dd = Math.atan((p.x - ecran.largeurPx / 2) / fh) / RAD, e = P.inclinaisonDeg - Math.atan((p.y - ecran.hauteurPx / 2) / fh) / RAD;
    /** @type {{dd: number, a: number} | null} */
    let best = null;
    for (const c of cols) { if (!best || Math.abs(c.dd - dd) < Math.abs(best.dd - dd)) best = c; }
    return !best || Math.abs(best.dd - dd) > 1 || best.a <= e + 0.7;
  });
  return { pts: out.length >= 25 ? out : pts, dropped: out.length >= 25 ? pts.length - out.length : 0 };
}

/**
 * @param {PointHorizon[]} pts @param {PoseCalage} P @param {number} cam0 champ du capteur (réglage) @param {Float32Array} tab table du relief
 * @param {EcranCalage} ecran @param {(cam: number) => number} champAffiche champ affiché pour un champ de capteur (recadrage compris)
 * @returns {{dh: number, dp: number, cam: number, cost: number, flat: boolean, n: number, relief: number, base?: number}}
 */
export function ajusterHorizon(pts, P, cam0, tab, ecran, champAffiche) {
  const cx = ecran.largeurPx / 2, cy = ecran.hauteurPx / 2, r = new Float64Array(pts.length), dev = new Float64Array(pts.length);
  function cost(/** @type {number} */ dh, /** @type {number} */ cam) {
    const fh = (ecran.largeurPx / 2) / Math.tan(champAffiche(cam) / 2 * RAD);
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      r[i] = elevationRelief(tab, P.capDeg + dh + Math.atan((p.x - cx) / fh) / RAD) - (P.inclinaisonDeg - Math.atan((p.y - cy) / fh) / RAD);
    }
    // écart quadratique moyen sur les 70 % de colonnes les mieux ajustées : robuste aux poteaux, reflets et palmiers (30 % écartés)
    const s = Float64Array.from(r).sort(), med = s[s.length >> 1];
    for (let i = 0; i < s.length; i++) dev[i] = (s[i] - med) * (s[i] - med);
    const d = Float64Array.from(dev).sort(), m = Math.max(3, Math.floor(d.length * 0.7));
    let acc = 0, sum = 0;
    for (let i = 0; i < m; i++) { acc += d[i]; }
    // horizon : moyenne des résidus de ces mêmes colonnes (plus précise que la médiane seule)
    /** @type {number[]} */
    const keep = [];
    for (let i = 0; i < s.length; i++) if ((s[i] - med) * (s[i] - med) <= d[m - 1]) keep.push(s[i]);
    for (const v of keep) sum += v;
    return { cost: Math.sqrt(acc / m), dp: sum / keep.length };
  }
  // relief présent dans le champ ? sans relief (mer seule), le cap et le champ sont indéterminés
  const half = champAffiche(cam0) / 2 + 20;
  let lo = 90, hi = -90;
  for (let b = -half; b <= half; b += 1) { const e = elevationRelief(tab, P.capDeg + b); if (e < lo) lo = e; if (e > hi) hi = e; }
  const relief = hi - lo, base = cost(0, cam0);
  if (relief < RELIEF_PLAT_DEG) return { dh: 0, dp: base.dp, cam: cam0, cost: base.cost, flat: true, n: pts.length, relief };
  // seuls le cap et l'horizon sont ajustés : sur une seule image, le champ de la caméra n'est pas mesurable de façon fiable
  /** @type {{cost: number, dp: number, dh: number}} */
  let b = { cost: Infinity, dp: 0, dh: 0 };
  for (let dh = -20; dh <= 20; dh += 0.5) { const c = cost(dh, cam0); if (c.cost < b.cost) b = { ...c, dh }; }
  const c0 = b.dh;
  for (let dh = c0 - 0.75; dh <= c0 + 0.75; dh += 0.05) { const c = cost(dh, cam0); if (c.cost < b.cost) b = { ...c, dh }; }
  // le champ (zoom) n'est cherché que si le relief est marqué (montagnes) et retenu seulement s'il améliore nettement l'ajustement
  let cam = cam0;
  if (relief >= RELIEF_MIN_CHAMP_DEG) {
    /** @type {{cost: number, dp?: number, dh?: number, cm?: number}} */
    let bc = { cost: b.cost };
    for (let cm = Math.max(20, cam0 - 12); cm <= Math.min(110, cam0 + 12); cm += 1) for (let dh = b.dh - 4; dh <= b.dh + 4; dh += 0.25) { const c = cost(dh, cm); if (c.cost < bc.cost) bc = { ...c, dh, cm }; }
    if (bc.cm !== undefined) { const c1 = bc.cm, d1 = /** @type {number} */ (bc.dh); for (let cm = c1 - 1; cm <= c1 + 1; cm += 0.5) for (let dh = d1 - 0.3; dh <= d1 + 0.3; dh += 0.05) { const c = cost(dh, cm); if (c.cost < bc.cost) bc = { ...c, dh, cm }; } }
    if (bc.cm !== undefined && bc.cost < b.cost * GAIN_CHAMP) { b = { cost: bc.cost, dp: /** @type {number} */ (bc.dp), dh: /** @type {number} */ (bc.dh) }; cam = bc.cm; }
  }
  return { dh: b.dh, dp: b.dp, cam, cost: b.cost, flat: false, n: pts.length, relief, base: base.cost };
}
