// @ts-check
/**
 * Silhouette des bâtiments (calque « Silhouette », v1 : `urbCompute`, `urbSmooth`, `urbOccluder`). Pour chaque direction (pas de 0,5° par défaut), l'angle du bâtiment qui monte le plus haut dans le ciel
 * (sommet = hauteur − hauteur de l'œil, à la distance du pied), en 3 couches de distance (proche, moyen, lointain) puis lissée « façon skyline » (ville dessinée en blocs).
 * Entrées : bâtiments { h, pts: [lat, lon, …], z? } (donnees/bdtopo.js), position, hauteur de l'œil, relief (altitude du pied : `z`, posée par `poserSol`).
 * Sorties : profils d'angles et de distances. Fonctions PURES (exécutées dans un worker : workers/silhouette-batiments.js ; aussi utilisées par le calage sur les toits).
 * Écart voulu avec la v1 : la courbure terrestre (`courbure`, rayon effectif comme le relief de la v2) est retranchée du sommet ; `courbure: false` redonne la v1 au bit près.
 * Dépend de : noyau/constantes.js.
 */
import { RAD, RAYON_EFFECTIF_M } from '../noyau/constantes.js';

/** @typedef {{h: number, pts: Float64Array, z?: number | null}} Batiment h : hauteur (m) ; pts : [lat, lon, lat, lon, …] (anneau extérieur) ; z : altitude du pied (m) si le relief est connu */

/** Nombre de directions du profil de la silhouette dessinée (pas de 0,5°). */
export const NB_DIRECTIONS = 720;
/** Limites des 3 couches de distance (m) : proche (< 600 m), moyen (< 1,8 km), lointain. */
export const LIMITES_COUCHES_M = [600, 1800, 1e9];
/** Distance (m) à laquelle le sol de chaque couche est dessiné. */
export const SOL_COUCHES_M = [400, 1100, 2500];
/** Largeur des blocs de lissage par couche, en directions (3°, 2°, 1,5°). */
export const BLOCS_COUCHES = [6, 4, 3];
/** Rayon d'intérêt (m) : 2,5 km de tuiles + 700 m de marge (v1 : `URB_R_KM*1000+700`). */
export const RAYON_CALCUL_M = 3200;
/** Les arêtes sont découpées tous les 20 m. */
const PAS_ARETE_M = 20;
/** Premier plan masqué (m) au niveau de la rue : la façade d'en face cacherait toute la ville. */
export const PREMIER_PLAN_M = 150;
/** Marge minimale (m) du premier plan quand on est en hauteur ou que le masque est coupé. */
export const PREMIER_PLAN_MIN_M = 3;
/** Au-delà de cette hauteur d'œil (correction, m), le masque du premier plan n'a plus lieu d'être. */
const OEIL_HAUT_M = 10;
/** Valeur d'une direction sans bâtiment. */
export const VIDE = -99;

/** Distance du premier plan masqué (v1 : 150 m si `urbClip` et œil < 10 m, sinon 3 m). @param {number} correctionOeilM @param {boolean} [masquerPremierPlan] */
export const premierPlanM = (correctionOeilM, masquerPremierPlan = true) => (masquerPremierPlan !== false && correctionOeilM < OEIL_HAUT_M ? PREMIER_PLAN_M : PREMIER_PLAN_MIN_M);

/**
 * Altitude du sol au pied de chaque bâtiment (son premier point) d'après le relief ; `z` reste null si le relief ne couvre pas le point (terrain plat supposé).
 * @param {Batiment[]} batiments @param {(lat: number, lon: number, distKm: number) => number} solEn @param {{lat: number, lon: number}} pos
 */
export function poserSol(batiments, solEn, pos) {
  const kLat = 111320, kLon = 111320 * Math.cos(pos.lat * RAD);
  for (const b of batiments) {
    const p = b.pts, dk = Math.hypot((p[0] - pos.lat) * kLat, (p[1] - pos.lon) * kLon) / 1000, e = solEn(p[0], p[1], dk);
    b.z = Number.isNaN(e) ? null : e;
  }
}

/**
 * @typedef {object} Profil
 * @property {Float32Array} ang angle (°) du plus haut bâtiment, toutes couches @property {Float32Array} dist distance (m) de ce bâtiment
 * @property {Float32Array[]} la angle par couche @property {Float32Array[]} ld distance par couche
 */

/**
 * @typedef {object} OptionsProfil
 * @property {{lat: number, lon: number}} pos @property {number} oeilRelM hauteur de l'œil au-dessus du sol (1,6 m + correction) quand le relief est inconnu
 * @property {number | null} h0 altitude de l'œil (m) si le relief est connu (alors `top = z + h − h0`), sinon null
 * @property {number} clipM distance (m) en deçà de laquelle on ignore tout @property {number} [rayonM] @property {number} [nb] nombre de directions
 * @property {number[]} [limites] limites des couches (m) @property {boolean} [courbure] retrancher la courbure terrestre (défaut : oui)
 */

/** @param {number} nb @param {number} nCouches @returns {Profil} */
function profilVide(nb, nCouches) {
  return { ang: new Float32Array(nb).fill(VIDE), dist: new Float32Array(nb), la: Array.from({ length: nCouches }, () => new Float32Array(nb).fill(VIDE)), ld: Array.from({ length: nCouches }, () => new Float32Array(nb)) };
}

/** Pose un angle `a` à la distance `dn` dans les directions [lo, hi] (°) du profil, pour toutes couches et pour la couche `li`. @param {Profil} P @param {number} li @param {number} lo @param {number} hi @param {number} a @param {number} dn @param {number} bw */
function poserAngle(P, li, lo, hi, a, dn, bw) {
  const nb = P.ang.length;
  for (let q = Math.floor(lo / bw); q <= Math.floor(hi / bw); q++) {
    const bi = ((q % nb) + nb) % nb;
    if (a > P.ang[bi]) { P.ang[bi] = a; P.dist[bi] = dn; }
    if (a > P.la[li][bi]) { P.la[li][bi] = a; P.ld[li][bi] = dn; }
  }
}

/**
 * Un sous-segment d'arête, de (n1,e1) : met à jour l'état (point précédent) et le profil.
 * @param {Profil} P @param {OptionsProfil & {kLat: number, kLon: number, top: number, bw: number, rayonEffM: number}} c
 * @param {{pd: number, pbr: number}} s état : distance et relèvement du point précédent @param {number} n2 @param {number} e2
 */
function traiterPoint(P, c, s, n2, e2) {
  const d2 = Math.hypot(n2, e2), br = Math.atan2(e2, n2) / RAD, clip = c.clipM, rayon = c.rayonM ?? RAYON_CALCUL_M;
  if (d2 < clip || d2 > rayon) { s.pd = d2; s.pbr = br; return; }
  let dd = br - s.pbr; dd = ((dd + 540) % 360) - 180;
  if (Math.abs(dd) <= 90 && s.pd >= clip) {
    const dn = Math.min(s.pd, d2), lim = c.limites ?? LIMITES_COUCHES_M, li = dn < lim[0] ? 0 : dn < lim[1] ? 1 : 2;
    const a = Math.atan2(c.top - (c.courbure === false ? 0 : (dn * dn) / (2 * c.rayonEffM)), dn) / RAD;
    poserAngle(P, Math.min(li, P.la.length - 1), Math.min(s.pbr, s.pbr + dd), Math.max(s.pbr, s.pbr + dd), a, dn, c.bw);
  }
  s.pd = d2; s.pbr = br;
}

/** Parcourt l'anneau fermé d'un bâtiment, arêtes découpées tous les 20 m. @param {Profil} P @param {Parameters<typeof traiterPoint>[1]} c @param {Float64Array} p */
function parcourirAnneau(P, c, p) {
  const n = p.length / 2, s = { pd: 0, pbr: 0 };
  let pn = 0, pe = 0;
  for (let k = 0; k <= n; k++) {
    const i = k % n, N = (p[2 * i] - c.pos.lat) * c.kLat, E = (p[2 * i + 1] - c.pos.lon) * c.kLon;
    if (k === 0) { pn = N; pe = E; s.pd = Math.hypot(N, E); s.pbr = Math.atan2(E, N) / RAD; continue; }
    const j = Math.ceil(Math.hypot(N - pn, E - pe) / PAS_ARETE_M);
    for (let m = 1; m <= j; m++) { const f = m / j; traiterPoint(P, c, s, pn + (N - pn) * f, pe + (E - pe) * f); }
    pn = N; pe = E;
  }
}

/**
 * Profil des angles par direction depuis la position (v1 : `urbCompute`). Plusieurs couches de distance : `limites` (m), la dernière retient tout le reste.
 * @param {Batiment[]} batiments @param {OptionsProfil} o @returns {Profil}
 */
export function profilBatiments(batiments, o) {
  const nb = o.nb ?? NB_DIRECTIONS, limites = o.limites ?? LIMITES_COUCHES_M, P = profilVide(nb, limites.length);
  const c = { ...o, limites, kLat: 111320, kLon: 111320 * Math.cos(o.pos.lat * RAD), bw: 360 / nb, rayonEffM: RAYON_EFFECTIF_M, top: 0 };
  for (const b of batiments) {
    c.top = o.h0 !== null && b.z !== null && b.z !== undefined ? b.z + b.h - o.h0 : b.h - o.oeilRelM;
    parcourirAnneau(P, c, b.pts);
  }
  return P;
}

/**
 * Silhouette BRUTE pour le calage : toutes couches confondues, sans lissage ni masque du premier plan, au pas de 0,1° (3600 directions) ; les bâtiments plus proches que `distMinM` sont ignorés
 * (de près, 10 m d'erreur de position décalent de 18° un immeuble situé à 30 m).
 * @param {Batiment[]} batiments @param {Omit<OptionsProfil, 'clipM' | 'nb' | 'limites'> & {distMinM: number}} o @returns {{ang: Float32Array, dist: Float32Array}}
 */
export function silhouetteBrute(batiments, o) {
  const P = profilBatiments(batiments, { ...o, clipM: o.distMinM, nb: 3600, limites: [1e9] });
  return { ang: P.ang, dist: P.dist };
}

/** Lissage « façon skyline » d'une couche (v1 : `urbSmooth`) : rues étroites comblées (dilatation de 0,5°), trous de 4° au plus interpolés, puis (w > 1) blocs à sommet plat. @param {Float32Array} a @param {number} w largeur des blocs (directions) @returns {Float32Array} */
export function lisserCouche(a, w) {
  const n = a.length, d = new Float32Array(n).fill(VIDE);
  for (let i = 0; i < n; i++) { let m = VIDE; for (let k = -1; k <= 1; k++) { const v = a[(i + k + n) % n]; if (v > m) m = v; } d[i] = m; }
  for (let i = 0; i < n; i++) {
    if (d[i] > -50) continue;
    let j = i; while (j < i + n && d[j % n] <= -50) j++;
    const len = j - i;
    if (len <= 8 && j < i + n) { const v0 = d[(i - 1 + n) % n], v1 = d[j % n]; if (v0 > -50 && v1 > -50) for (let k = 0; k < len; k++) d[(i + k) % n] = v0 + ((v1 - v0) * (k + 1)) / (len + 1); }
    i = j - 1;
  }
  return w > 1 ? enBlocs(d, w) : d;
}

/** Regroupe en blocs de `w` directions : rempli si au moins la moitié est garnie, hauteur = (moyenne + maximum) / 2 (les tours restent visibles). @param {Float32Array} d @param {number} w */
function enBlocs(d, w) {
  const o = new Float32Array(d.length).fill(VIDE);
  for (let s = 0; s + w <= d.length; s += w) {
    let sum = 0, c = 0, mx = VIDE;
    for (let k = 0; k < w; k++) { const v = d[s + k]; if (v > -50) { sum += v; c++; if (v > mx) mx = v; } }
    if (c * 2 >= w) { const v = (sum / c + mx) / 2; for (let k = 0; k < w; k++) o[s + k] = v; }
  }
  return o;
}

/** Couches lissées (ce que l'on dessine) ; `lisser: false` garde les angles bruts. @param {Float32Array[]} la @param {boolean} [lisser] */
export const lisserCouches = (la, lisser = true) => la.map((a, li) => (lisser === false ? a : lisserCouche(a, BLOCS_COUCHES[li])));

/**
 * Angle de ce qui masque un monument à une distance donnée : le plus haut bâtiment PLUS PROCHE que lui de plus de 200 m (VIDE si rien). v1 : `urbOccluder`.
 * @param {{ls: Float32Array[], ld: Float32Array[]} | null} sil @param {number} brg relèvement (°) @param {number} distM
 */
export function occulteur(sil, brg, distM) {
  if (!sil) return VIDE;
  const nb = sil.ls[0].length, bi = Math.floor((((brg % 360) + 360) % 360) / (360 / nb)) % nb;
  let m = VIDE;
  for (let li = 0; li < sil.ls.length; li++) for (let k = -1; k <= 1; k++) { const i = (bi + k + nb) % nb, a = sil.ls[li][i]; if (a > m && a > -50 && sil.ld[li][i] < distM - 200) m = a; }
  return m;
}
