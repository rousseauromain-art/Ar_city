// @ts-check
/**
 * Silhouette du ciel lue dans l'image (photo ou caméra) : pour 160 colonnes, on descend depuis le haut jusqu'à la première limite ciel / non-ciel. Le résultat alimente la
 * « visibilité d'après la photo » (on ne nomme que ce que la caméra voit) et les traits bleus pointillés de Tout voir. À la couleur et à la luminance seulement : pas d'IA.
 * Le ciel est reconnu comme bleu, ou très clair et peu saturé (nuages, voile), ou proche d'une couleur de référence (médiane des pixels « ciel » de la bande haute) qui s'adapte.
 * Fonction pure sur des octets RGBA. Reprend `observeSkyline` de la v1 sans en changer le résultat.
 * Entrées : pixels réduits (240 px de large), taille de l'écran, pose, focale. Sortie : { ok, skyFrac, cols:[{brg, a, top}] }. Dépend de : noyau/constantes.js.
 */
import { RAD } from '../noyau/constantes.js';

/** Période de l'analyse (ms) : une image sur ~90 (v1 : `PHOTO_EVERY`). L'analyse reste valable 6 s (`ANALYSE_VALIDE_MS`, calque photo-silhouette). */
export const PERIODE_ANALYSE_MS = 3000;
/** Largeur de l'image réduite pour l'analyse (v1 : `grabFrameRGB(240)`). */
export const LARGEUR_ANALYSE_PX = 240;
/** Part minimale de pixels « ciel » dans la bande haute pour que l'analyse ait un sens. */
const CIEL_MIN_BANDE = 0.35;
/** Colonnes lues, et nombre minimal de colonnes (et part de colonnes « ciel ») pour un succès. */
const NB_COLONNES_MIN = 20, PART_COLONNES_CIEL_MIN = 0.3;

/** @typedef {import('./soleil.js').Pixels} Pixels */
/** @typedef {{brg: number, a: number, top: boolean}} ColonneLue brg : relèvement (°) ; a : angle (°) de la limite ; top : le haut de la colonne n'est déjà plus du ciel */
/** @typedef {{ok: boolean, skyFrac: number, cols: ColonneLue[]}} SilhouetteCiel */

/**
 * @param {Pixels} pixels
 * @param {{ecran: {largeurPx: number, hauteurPx: number}, pose: {capDeg: number, inclinaisonDeg: number, roulisDeg: number}, focalePx: number}} e
 * @returns {SilhouetteCiel}
 */
export function observerCiel({ d, cw, ch }, { ecran, pose, focalePx: fh }) {
  const W = ecran.largeurPx, H = ecran.hauteurPx, k = cw / W, cx = W / 2, cy = H / 2, cr = Math.cos(pose.roulisDeg * RAD), sr = Math.sin(pose.roulisDeg * RAD);
  /** Indice du pixel de l'écran (xs, ys), repère compensé du roulis ; −1 hors image. */
  const at = (/** @type {number} */ xs, /** @type {number} */ ys) => { const dx = xs - cx, dy = ys - cy, x = Math.round((cx + dx * cr - dy * sr) * k), y = Math.round((cy + dx * sr + dy * cr) * k); return (x < 0 || y < 0 || x >= cw || y >= ch) ? -1 : (y * cw + x) * 4; };
  const lum = (/** @type {number} */ i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  // couleur de référence du ciel : médiane des pixels clairs de la bande haute de l'image
  /** @type {number[]} */
  const R = [], G = [], B = [];
  let n = 0, nb = 0;
  for (let xs = W * 0.02; xs <= W * 0.98; xs += W / 80) for (let ys = H * 0.04; ys <= H * 0.12; ys += H * 0.02) {
    const i = at(xs, ys);
    if (i < 0) continue;
    n++;
    const L0 = lum(i), s0 = Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]);
    if ((d[i + 2] >= d[i] + 12 && L0 > 80) || (L0 > 165 && s0 < 45)) { nb++; R.push(d[i]); G.push(d[i + 1]); B.push(d[i + 2]); }
  }
  if (!n || nb < n * CIEL_MIN_BANDE) return { ok: false, skyFrac: n ? nb / n : 0, cols: [] };
  const med = (/** @type {number[]} */ a) => { a.sort((x, y) => x - y); return a[a.length >> 1]; }, ref0 = [med(R), med(G), med(B)];
  /** @type {ColonneLue[]} */
  const cols = [];
  let colsCiel = 0;
  for (let xs = W * 0.01; xs <= W * 0.99; xs += W / 160) {
    let ref = ref0.slice(), y = null, manque = 0, commence = false, premier = true;
    for (let ys = 0; ys < H; ys += 1 / k) {
      const i = at(xs, ys);
      if (i < 0) continue;
      const r = d[i], g = d[i + 1], b = d[i + 2], L = 0.299 * r + 0.587 * g + 0.114 * b, sat = Math.max(r, g, b) - Math.min(r, g, b);
      // ciel : bleu (b nettement > r, assez clair), ou très clair et peu saturé (nuages, voile, ciel gris), ou proche du ciel de la colonne
      const ciel = (b >= r + 12 && b >= g - 5 && L > 80) || (L > 165 && sat < 45) || Math.abs(r - ref[0]) + Math.abs(g - ref[1]) + Math.abs(b - ref[2]) < 60;
      if (premier) { premier = false; if (!ciel) { y = ys; break; } commence = true; }
      if (ciel) { manque = 0; ref = [ref[0] * 0.92 + r * 0.08, ref[1] * 0.92 + g * 0.08, ref[2] * 0.92 + b * 0.08]; }
      else if (++manque >= 2) { y = ys - 1 / k; break; }
    }
    if (y === null) continue;
    if (commence) colsCiel++;
    cols.push({ brg: (pose.capDeg + Math.atan((xs - cx) / fh) / RAD + 360) % 360, a: pose.inclinaisonDeg - Math.atan((y - cy) / fh) / RAD, top: !commence });
  }
  return { ok: cols.length >= NB_COLONNES_MIN && colsCiel >= cols.length * PART_COLONNES_CIEL_MIN, skyFrac: nb / n, cols };
}
