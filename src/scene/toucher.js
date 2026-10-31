// @ts-check
/**
 * Toucher un nom : quelle zone est sous le doigt ? Toutes les zones de toucher de la scène (noms de lieux et de monuments, bande des équipements et des couches perso, avions, bateaux)
 * sont ramenées à une forme commune (polygone) ; on choisit la plus proche du doigt (à 22 px près), la plus petite d'abord. Pur : aucune horloge, aucun DOM.
 * Entrées : `bilan.zones` de moteur/scene.js, position du toucher (px de l'écran). Sortie : la zone (type, éléments, forme) ou null.
 */

/** Rayon de tolérance autour du doigt (px). */
export const RAYON_TOUCHER_PX = 22;

/**
 * @typedef {object} ZoneToucher
 * @property {'lieu' | 'monument' | 'bande' | 'avion' | 'bateau'} type @property {unknown} principal élément d'origine (le plus proche pour un groupe) @property {unknown[]} elements tous les éléments de la zone (groupe)
 * @property {number[][]} poly sommets [x, y]
 */

/** @param {number[]} r [x0, x1, y0, y1] */
const rect = (r) => [[r[0], r[2]], [r[1], r[2]], [r[1], r[3]], [r[0], r[3]]];

/**
 * Toutes les zones de la scène, en une seule liste.
 * @param {{bande?: any[], avions?: any[], bateaux?: any[], etiquettes?: any[]} | null | undefined} zones @returns {ZoneToucher[]}
 */
export function zonesTouchables(zones) {
  /** @type {ZoneToucher[]} */
  const sortie = [];
  if (!zones) return sortie;
  for (const z of zones.etiquettes || []) {
    const el = /** @type {any} */ (z.element), poly = z.poly || (z.icone ? rect(z.icone) : null);
    if (poly) sortie.push({ type: el && el.kind === 'monument' ? 'monument' : 'lieu', principal: el, elements: [el], poly });
  }
  for (const z of zones.bande || []) sortie.push({ type: 'bande', principal: z.element, elements: z.elements || [z.element], poly: rect([z.x0, z.x1, z.y0, z.y1]) });
  for (const z of zones.avions || []) { const poly = z.poly || (z.icone ? rect(z.icone) : null); if (poly) sortie.push({ type: 'avion', principal: z.avion, elements: z.avions || [z.avion], poly }); }
  for (const z of zones.bateaux || []) { const poly = z.poly || (z.icone ? rect(z.icone) : null); if (poly) sortie.push({ type: 'bateau', principal: z.bateau, elements: z.bateaux || [z.bateau], poly }); }
  return sortie;
}

/** Distance (px) d'un point à un segment. */
function distSegment(/** @type {number} */ px, /** @type {number} */ py, /** @type {number[]} */ a, /** @type {number[]} */ b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l2)) : 0;
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

/** Distance du point à un polygone : 0 s'il est dedans, sinon la distance au bord. @param {number} x @param {number} y @param {number[][]} poly */
export function distancePolygone(x, y, poly) {
  let dedans = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) if ((poly[i][1] > y) !== (poly[j][1] > y) && x < ((poly[j][0] - poly[i][0]) * (y - poly[i][1])) / (poly[j][1] - poly[i][1]) + poly[i][0]) dedans = !dedans;
  if (dedans) return 0;
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, distSegment(x, y, poly[j], poly[i]));
  return d;
}

/** Surface d'un polygone (px²), pour départager les zones. @param {number[][]} poly */
const surface = (poly) => Math.abs(poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + (p[0] * q[1] - q[0] * p[1]); }, 0)) / 2;

/**
 * La zone sous le doigt : la plus proche (0 s'il est dedans), puis la plus petite surface.
 * @param {ZoneToucher[]} zones @param {number} x @param {number} y @param {number} [rayonPx] @returns {ZoneToucher | null}
 */
export function zoneSousLeDoigt(zones, x, y, rayonPx = RAYON_TOUCHER_PX) {
  /** @type {ZoneToucher | null} */
  let meilleure = null, dMin = Infinity, sMin = Infinity;
  for (const z of zones) {
    const d = distancePolygone(x, y, z.poly);
    if (d > rayonPx) continue;
    const s = surface(z.poly);
    if (d < dMin - 0.5 || (Math.abs(d - dMin) <= 0.5 && s < sMin)) { meilleure = z; dMin = d; sMin = s; }
  }
  return meilleure;
}
