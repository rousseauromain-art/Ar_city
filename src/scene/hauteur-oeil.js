// @ts-check
/**
 * Hauteur d'œil : altitude du sol sous l'observateur, lue dans le relief.
 * Entrées : bandes de relief, position. Sorties : altitude du sol (m) et origine de l'estimation. Fonctions pures (v1 : `fineGround`,
 * `localGroundElev`, et le bloc « sol » de `computeTerrain`).
 * Dépend de : noyau/constantes.js, scene/relief.js.
 */
import { RAD, HAUTEUR_YEUX_M } from '../noyau/constantes.js';
import { pixelGlobal, altitudePixel, altitudeEn } from './relief.js';

/** @typedef {import('./relief.js').Bande} Bande */
/** @typedef {{lat: number, lon: number}} Point */

/** Origines possibles de l'estimation (textes affichés dans le détail de la hauteur d'œil). */
export const ORIGINE_SOL = Object.freeze({
  fin: 'données fines (modèle de terrain)',
  finRelu: 'relief fin : modèle de terrain sous vos pieds',
  surface: 'modèle 30 m (surface) : niveau de la rue estimé (bas des valeurs sur 150 m)',
  modele30: 'modèle 30 m',
});

/** @param {number[]} v tableau trié @returns {number} médiane (élément central) */
const mediane = (v) => v[v.length >> 1];

/**
 * Sol médian sur 5 points autour (~15 m), toutes bandes confondues ; NaN si rien.
 * @param {Bande[]} bands @param {Point} c
 */
export function solLocal(bands, c) {
  const dLat = 15 / 111320, dLon = dLat / Math.max(0.2, Math.cos(c.lat * RAD));
  const vals = [];
  for (const [oLat, oLon] of [[0, 0], [dLat, 0], [-dLat, 0], [0, dLon], [0, -dLon]]) {
    const e = altitudeEn(bands, c.lat + oLat, c.lon + oLon, 0);
    if (!Number.isNaN(e)) vals.push(e);
  }
  if (!vals.length) return NaN;
  vals.sort((a, b) => a - b);
  return vals[Math.floor(vals.length / 2)];
}

/**
 * Sol sous les pieds dans le relief FIN seulement (modèle de terrain IGN ~1 m, sans toits ni arbres) : médiane de 9 points à ~5 m.
 * NaN sans donnée fine réelle (les tuiles reconstituées depuis AWS, `altIdx`, sont un modèle de surface 30 m et sont écartées).
 * @param {Bande[]} bands @param {Point} c
 */
export function solFin(bands, c) {
  const b = bands.find((x) => !x.garantie);
  if (!b) return NaN;
  const st = 5 / 111320, sl = st / Math.max(0.2, Math.cos(c.lat * RAD)), v = [], full = b.ts * b.ts * 4;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const p = pixelGlobal(b.z, c.lat + i * st, c.lon + j * sl, b.ts), gx = Math.floor(p[0]), gy = Math.floor(p[1]);
    const ix = (gx >> b.shift) - b.tx0, iy = (gy >> b.shift) - b.ty0, k = iy * b.nx + ix;
    if (ix < 0 || iy < 0 || ix >= b.nx || iy >= b.ny) continue;
    const t = b.tiles[k];
    if (!t || t.length < full || (b.altIdx && b.altIdx.has(k))) continue;
    const e = altitudePixel(b, gx, gy);
    if (!Number.isNaN(e)) v.push(e);
  }
  if (v.length < 5) return NaN;
  v.sort((a, b2) => a - b2);
  return mediane(v);
}

/**
 * Estimation du sol avant le relief fin (1re passe) : donnée fine sous les pieds si elle existe, sinon bas des valeurs
 * (15e centile) du modèle de surface 30 m dans un disque de ~150 m, la mer (0 m) exclue quand il y a assez de terre autour.
 * @param {Bande[]} bands @param {Point} c
 * @returns {{solM: number, origine: string}} solM peut être NaN (l'appelant retombe sur 0)
 */
export function estimerSol(bands, c) {
  let e0 = solLocal(bands, c);
  /** @type {string} */
  let origine = ORIGINE_SOL.fin;
  const b0 = bands[0], p = !b0.garantie ? pixelGlobal(b0.z, c.lat, c.lon, b0.ts) : null;
  const fin = p ? altitudePixel(b0, Math.floor(p[0]), Math.floor(p[1])) : NaN;
  if (Number.isNaN(fin)) {
    /** @type {number[]} */
    let v = [];
    const st = 50 / 111320, sl = st / Math.max(0.2, Math.cos(c.lat * RAD));
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
      if (i * i + j * j > 9) continue;
      const e = altitudeEn(bands, c.lat + i * st, c.lon + j * sl, 0.2, true);
      if (!Number.isNaN(e)) v.push(e);
    }
    const terre = v.filter((e) => e > 0.5);
    if (terre.length >= 8) v = terre;
    if (v.length >= 8) {
      v.sort((a, b) => a - b);
      const bas = v[Math.floor(v.length * 0.15)];
      if (Number.isNaN(e0) || bas < e0) e0 = bas;
      origine = ORIGINE_SOL.surface;
    } else origine = ORIGINE_SOL.modele30;
  }
  return { solM: e0, origine };
}

/**
 * Altitude de l'œil : sol + 1,6 m + correction manuelle, jamais sous 1 m (v1 : `h0`).
 * @param {number} solM sol sous les pieds (NaN → 0) @param {number} [correctionM] correction manuelle (balcon +, sol surestimé -)
 */
export const altitudeOeil = (solM, correctionM = 0) => Math.max(1, (Number.isNaN(solM) ? 0 : solM) + HAUTEUR_YEUX_M + correctionM);
