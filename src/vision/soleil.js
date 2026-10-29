// @ts-check
/**
 * Disque du soleil dans l'image : taches saturées (cœur blanc), seuillées sur le bleu à quatre niveaux (le cœur blanc résiste, le halo orange disparaît), regroupées en composantes
 * connexes ; une tache est « compacte » si elle ressemble à un disque. Les REFLETS (une tache claire AU-DESSUS, dans la même colonne : le soleil est au-dessus de son reflet) sont écartés.
 * Fonctions pures sur des octets RGBA. Reprend `sunAlign` de la v1 (25/10/2026), sans en changer le résultat.
 * Entrées : pixels réduits, position et pose. Sortie : taches, puis candidats {cap, site} du soleil dans la scène. Dépend de : noyau/maths.js, noyau/constantes.js.
 */
import { RAD } from '../noyau/constantes.js';
import { ecartAngle } from '../noyau/maths.js';

/** Le soleil n'est cherché que s'il doit être dans l'image à ± cette marge près (erreur de cap tolérée), en degrés (v1 : `SUN_WIN`). */
export const MARGE_SOLEIL_DEG = 25;
/** Seuils sur le bleu : le cœur blanc du disque résiste, le halo jaune-orange tombe. */
export const SEUILS_BLEU = Object.freeze([150, 185, 215, 240]);
/** Rouge et vert minimaux d'un pixel « blanc ». */
export const ROUGE_MIN = 245, VERT_MIN = 232;

/** @typedef {{d: Uint8ClampedArray | Uint8Array, cw: number, ch: number}} Pixels */
/** @typedef {{seuil: number, aire: number, cx: number, cy: number, x0: number, x1: number, y0: number, y1: number, compacte: boolean}} Tache */
/** @typedef {{capDeg: number, siteDeg: number, aire: number, seuil: number, distance: number}} Candidat */

/**
 * Toutes les taches blanches, aux quatre seuils.
 * @param {Pixels} p @returns {Tache[]}
 */
export function detecterTaches({ d, cw, ch }) {
  /** @type {Tache[]} */
  const toutes = [];
  const n = cw * ch;
  for (const seuil of SEUILS_BLEU) {
    const masque = new Uint8Array(n), vu = new Uint8Array(n);
    for (let i = 0; i < n; i++) { const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2]; if (r >= ROUGE_MIN && g >= VERT_MIN && b >= seuil) masque[i] = 1; }
    for (let s = 0; s < n; s++) {
      if (!masque[s] || vu[s]) continue;
      const pile = [s];
      vu[s] = 1;
      let a = 0, sx = 0, sy = 0, x0 = cw, x1 = 0, y0 = ch, y1 = 0;
      while (pile.length) {
        const q = /** @type {number} */ (pile.pop()), x = q % cw, y = (q / cw) | 0;
        a++; sx += x; sy += y;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        for (const nb of [q - 1, q + 1, q - cw, q + cw]) if (nb >= 0 && nb < n && !vu[nb] && masque[nb] && Math.abs((nb % cw) - x) <= 1) { vu[nb] = 1; pile.push(nb); }
      }
      const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
      toutes.push({ seuil, aire: a, cx: sx / a, cy: sy / a, x0, x1, y0, y1, compacte: a >= 3 && a <= n * 0.02 && Math.max(bw, bh) <= 2.5 * Math.min(bw, bh) && a >= 0.45 * bw * bh });
    }
  }
  return toutes;
}

/**
 * Candidats du soleil parmi les taches : compactes, hors reflets, sans doublon (même tache à un autre seuil : moins de 0,6°), position dans la scène (roulis compensé).
 * `large` : direction peu fiable (portrait) — la distance au soleil calculé pèse 0,15 sur le cap et aucune limite ne s'applique.
 * @param {Tache[]} taches @param {{pixels: {cw: number, ch: number}, ecran: {largeurPx: number, hauteurPx: number}, focalePx: number, pose: {capDeg: number, inclinaisonDeg: number, roulisDeg: number}, soleil: {azDeg: number, elDeg: number}, large: boolean}} e
 * @returns {Candidat[]}
 */
export function candidatsSoleil(taches, { pixels, ecran, focalePx: fh, pose, soleil, large }) {
  const k = pixels.cw / ecran.largeurPx, cr = Math.cos(pose.roulisDeg * RAD), sr = Math.sin(pose.roulisDeg * RAD);
  const tolColonne = Math.tan(1.5 * RAD) * fh * k;
  const reflet = (/** @type {Tache} */ o) => taches.some((q) => q !== o && q.y1 < o.y0 - 1 && Math.abs(q.cx - o.cx) < tolColonne + Math.max(2, (q.x1 - q.x0) / 2));
  /** @type {Candidat[]} */
  const candidats = [];
  for (const o of taches) {
    if (!o.compacte || reflet(o)) continue;
    const X = o.cx / k - ecran.largeurPx / 2, Y = o.cy / k - ecran.hauteurPx / 2, dxs = X * cr + Y * sr, dys = -X * sr + Y * cr; // écran → scène (roulis compensé)
    const capDeg = pose.capDeg + Math.atan(dxs / fh) / RAD, siteDeg = pose.inclinaisonDeg - Math.atan(dys / fh) / RAD;
    if (candidats.some((c) => Math.hypot(ecartAngle(c.capDeg - capDeg), c.siteDeg - siteDeg) < 0.6)) continue;
    candidats.push({ capDeg, siteDeg, aire: o.aire, seuil: o.seuil, distance: Math.hypot((large ? 0.15 : 1) * ecartAngle(capDeg - soleil.azDeg), siteDeg - soleil.elDeg) });
  }
  return candidats;
}

/** Le candidat le plus proche du soleil calculé (dans 1,5 × la marge, sans limite en mode large). @param {Candidat[]} candidats @param {boolean} large */
export const meilleurCandidat = (candidats, large) => candidats.filter((o) => large || o.distance < MARGE_SOLEIL_DEG * 1.5).sort((x, y) => x.distance - y.distance)[0] || null;
