// @ts-check
/**
 * Cap sur l'axe de la rue (calage en ville). Quand on vise « le point où se rejoignent les bords de la rue » (trottoirs, lignes des façades), la direction visée est celle de l'axe de la rue, quel que soit
 * le trottoir où l'on se trouve (viser l'immeuble du fond donnerait 2° d'erreur à 300 m quand on est à 10 m de l'axe). La rue est une portion DROITE (déviation < 3°, au moins 60 m) qui passe tout près :
 * son orientation, dans le sens le plus proche du cap affiché (écart ≤ 45°), est le cap vrai.
 * Entrées : position, cap affiché, précision du GPS, rues (donnees/rues.js). Sorties : `{ok: true, capDeg, rue, ...}`, ou `{ok: false, raison}`, ou `{ok: false, choix: [...]}` quand deux rues (ou deux sens) restent possibles : l'appelant propose des boutons.
 * Fonctions PURES. Dépend de : noyau/maths.js.
 */
import { ecartAngle, normaliserCap } from '../noyau/maths.js';

/** @typedef {{lat: number, lon: number}} Point */
/** @typedef {{nom: string, classe: string, points: Point[]}} Rue */
/** @typedef {{rue: string, capDeg: number, ecartDeg: number, distM: number}} PropositionRue */

/** Une portion est droite si chaque segment dévie de moins de 3° de sa corde. */
export const DEVIATION_MAX_DEG = 3;
/** Longueur minimale (m) d'une portion droite : en dessous, l'orientation ne vaut rien. */
export const LONGUEUR_MIN_M = 60;
/** La rue doit passer à moins de max(25 m, précision du GPS). */
export const RAYON_MIN_M = 25;
/** Écart maximal (°) entre le cap affiché et l'axe de la rue (dans le sens le plus proche). */
export const ECART_MAX_DEG = 45;
/** Deux rues dont les caps diffèrent d'au moins ce nombre de degrés sont ambiguës (carrefour) : on propose un choix. */
export const AMBIGUITE_DEG = 20;

/** Projection locale plane (nord, est) en mètres autour de `o`. @param {Point} o @returns {(p: Point) => [number, number]} */
const projeter = (o) => { const k = 111320 * Math.cos((o.lat * Math.PI) / 180); return (p) => [(p.lat - o.lat) * 111320, (p.lon - o.lon) * k]; };
/** Relèvement (°, 0 = nord, horaire) de a vers b. @param {[number, number]} a @param {[number, number]} b */
const relevement = (a, b) => normaliserCap((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI);
const longueur = (/** @type {[number, number]} */ a, /** @type {[number, number]} */ b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/**
 * Portions droites d'une polyligne (en mètres) : on prolonge tant que chaque segment reste à moins de 3° de la corde du début à la fin courante.
 * @param {[number, number][]} pts @returns {{pts: [number, number][], capDeg: number, longueurM: number}[]}
 */
export function portionsDroites(pts) {
  const out = [];
  let i = 0;
  while (i < pts.length - 1) {
    let j = i + 1;
    while (j < pts.length - 1 && segmentsDansLaCorde(pts, i, j + 1)) j++;
    const portion = pts.slice(i, j + 1);
    out.push({ pts: portion, capDeg: relevement(pts[i], pts[j]), longueurM: portion.slice(1).reduce((s, p, k) => s + longueur(portion[k], p), 0) });
    i = j;
  }
  return out;
}
/** Tous les segments de i à j sont-ils à moins de 3° de la corde i→j ? @param {[number, number][]} pts @param {number} i @param {number} j */
function segmentsDansLaCorde(pts, i, j) {
  const corde = relevement(pts[i], pts[j]);
  for (let k = i; k < j; k++) if (Math.abs(ecartAngle(relevement(pts[k], pts[k + 1]) - corde)) >= DEVIATION_MAX_DEG) return false;
  return true;
}

/** Distance (m) de l'origine à une polyligne en mètres. @param {[number, number][]} pts */
function distanceOrigine(pts) {
  let m = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1], dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
    m = Math.min(m, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return m;
}

/**
 * Meilleure portion droite de chaque rue passant assez près, avec son orientation (0..360, dans un sens) et la distance à la position.
 * @param {Rue[]} rues @param {Point} pos @param {number} rayonM @returns {{rue: string, capDeg: number, distM: number}[]}
 */
export function portionsProches(rues, pos, rayonM) {
  const proj = projeter(pos), out = [];
  for (const r of rues) {
    const pts = r.points.map(proj), bonnes = portionsDroites(pts).filter((p) => p.longueurM >= LONGUEUR_MIN_M).map((p) => ({ ...p, distM: distanceOrigine(p.pts) })).filter((p) => p.distM <= rayonM);
    if (bonnes.length) { const b = bonnes.reduce((a, c) => (c.distM < a.distM ? c : a)); out.push({ rue: r.nom || 'rue sans nom', capDeg: b.capDeg, distM: b.distM }); }
  }
  return out;
}

/** Sens de la rue le plus proche du cap affiché. @param {number} axeDeg @param {number} capDeg @returns {{capDeg: number, ecartDeg: number}} */
function sensLePlusProche(axeDeg, capDeg) {
  const a = normaliserCap(axeDeg), b = normaliserCap(axeDeg + 180), ea = ecartAngle(a - capDeg), eb = ecartAngle(b - capDeg);
  return Math.abs(ea) <= Math.abs(eb) ? { capDeg: a, ecartDeg: ea } : { capDeg: b, ecartDeg: eb };
}

/**
 * @param {{pos: Point, capAfficheDeg: number | null, precisionM: number, rues: Rue[], boussoleDouteuse?: boolean}} p
 *   `boussoleDouteuse` : le cap affiché ne dit rien (fer, voiture) : on propose les deux sens de la rue la plus proche.
 * @returns {{ok: true, capDeg: number, rue: string, ecartDeg: number, distM: number} | {ok: false, raison: string, choix?: PropositionRue[]}}
 */
export function capDepuisRue({ pos, capAfficheDeg, precisionM, rues, boussoleDouteuse = false }) {
  if (!rues.length) return { ok: false, raison: 'aucune rue connue ici (données des rues absentes)' };
  const rayonM = Math.max(RAYON_MIN_M, precisionM || 0), proches = portionsProches(rues, pos, rayonM);
  if (!proches.length) return { ok: false, raison: portionsProches(rues, pos, 300).length ? 'aucune rue droite à moins de ' + Math.round(rayonM) + ' m' : 'rue trop courbe : pas de portion droite de 60 m (déplacez-vous dans une rue droite)' };
  const plusProche = proches.reduce((a, c) => (c.distM < a.distM ? c : a));
  if (boussoleDouteuse || capAfficheDeg === null) return { ok: false, raison: 'boussole douteuse : choisissez le sens de la rue', choix: [0, 180].map((d) => ({ rue: plusProche.rue, capDeg: normaliserCap(plusProche.capDeg + d), ecartDeg: 0, distM: plusProche.distM })) };
  const candidats = proches.map((p) => ({ rue: p.rue, distM: p.distM, ...sensLePlusProche(p.capDeg, capAfficheDeg) })).filter((c) => Math.abs(c.ecartDeg) <= ECART_MAX_DEG);
  if (!candidats.length) return { ok: false, raison: `la rue la plus proche (${plusProche.rue}) est à plus de ${ECART_MAX_DEG}° du cap : visez le long de la rue` };
  const ordre = candidats.sort((a, b) => a.distM - b.distM), premier = ordre[0], autre = ordre.find((c) => Math.abs(ecartAngle(c.capDeg - premier.capDeg)) >= AMBIGUITE_DEG);
  if (autre) return { ok: false, raison: 'carrefour : deux rues possibles, choisissez la vôtre', choix: ordre.filter((c, i) => i === 0 || Math.abs(ecartAngle(c.capDeg - premier.capDeg)) >= AMBIGUITE_DEG).map((c) => ({ rue: c.rue, capDeg: c.capDeg, ecartDeg: c.ecartDeg, distM: c.distM })) };
  return { ok: true, capDeg: premier.capDeg, rue: premier.rue, ecartDeg: premier.ecartDeg, distM: premier.distM };
}
